// PRÉSAGE — révèle les 3 premières cartes du deck DANS LE DÉSORDRE ; le joueur
// désigne celle qu'il croit être au sommet, la gagne s'il vise juste, puis le
// deck entier est remélangé.
//
// Quatre choses à verrouiller, par ordre d'importance :
//
//   1. **Le dessein de la capacité** : ce n'est pas une loterie. Une Divination
//      jouée avant a remonté une carte CHOISIE sur le dessus — le joueur la
//      reconnaît alors parmi les trois et gagne à coup sûr. Le test qui enchaîne
//      un Devin puis un Oracle (DEUX cartes distinctes) est celui qui porte
//      toute la capacité ; s'il tombe, Présage n'a plus de raison d'être.
//   2. **L'indice 0 est la bonne réponse.** Le mélange que voit le joueur est un
//      habillage CLIENT ; le moteur ne connaît que l'ordre réel. Un défaut à 0
//      là où il faudrait tirer au sort ferait donc réussir Présage à tous les
//      coups, sans que personne n'ait rien deviné.
//   3. **Le contrat RNG** : deck vide ⇒ zéro tirage consommé. Le flux aléatoire
//      est partagé et sérialisé ; un appel de plus d'un côté décalerait les deux
//      clients pour tout le reste de la partie.
//   4. **Le remélange** porte sur le deck ENTIER, après remise des révélées.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameState, KeywordInstance, SpellKeywordInstance } from "./types";
import { MAX_HAND_SIZE } from "./constants";

type Mode = "death" | "attack" | "tap" | "end_of_turn" | "return" | "draw" | "low_hp";

/** Une créature porteuse de Présage. `mode` absent ⇒ entrée en jeu. */
function porteuse(opts: { name?: string; mode?: Mode; autres?: string[] } = {}) {
  const { name = "Oracle", mode, autres = [] } = opts;
  return mkInstance(mkCard({
    name, mana_cost: 1, attack: 2, health: 2,
    keywords: ["presage", ...autres] as never,
    keyword_instances: [{ id: "presage", ...(mode ? { mode } : {}) }] as KeywordInstance[],
  } as Partial<Card>));
}

/** Un sort Présage. */
function sortPresage(name = "Lecture des augures") {
  return mkInstance(mkCard({
    name, card_type: "spell", mana_cost: 1, attack: null, health: null,
    spell_keywords: [{ id: "presage" }] as SpellKeywordInstance[],
  } as Partial<Card>));
}

/** Un deck nommé, du dessus vers le fond. */
function deck(noms: string[]) {
  return noms.map(n => mkInstance(mkCard({ name: n, mana_cost: 1, attack: 1, health: 1 })));
}

function etat(noms: string[], rngState = 12345): GameState {
  const s = mkState();
  s.players[0].deck = deck(noms);
  s.rngState = rngState;
  return s;
}

function jouer(s: GameState, ci: ReturnType<typeof mkInstance>, choix?: number) {
  s.players[0].hand.push(ci);
  return applyAction(s, {
    type: "play_card",
    cardInstanceId: ci.instanceId,
    ...(choix != null ? { divinationChoiceIndex: choix } : {}),
  });
}

const enMain = (s: GameState) => s.players[0].hand.map(c => c.card.name).sort();
const enDeck = (s: GameState) => s.players[0].deck.map(c => c.card.name).sort();

/** mulberry32 avance sa graine d'un pas FIXE par appel : le nombre exact de
 *  tirages consommés est donc lisible dans l'état, sans instrumenter le moteur. */
const avance = (seed: number, appels: number) => (seed + appels * 0x6d2b79f5) | 0;

// ───────────────────────────────────────────────────────────────────────────

describe("désigner juste, désigner faux", () => {
  it("index 0 = la carte du dessus ⇒ elle part en main", () => {
    const s = etat(["A", "B", "C", "D", "E"]);
    const st = jouer(s, porteuse(), 0);
    expect(enMain(st)).toEqual(["A"]);
    expect(st.players[0].deck).toHaveLength(4);
  });

  it("index 1 ou 2 ⇒ rien en main, tout retourne au deck", () => {
    for (const faux of [1, 2]) {
      const st = jouer(etat(["A", "B", "C", "D", "E"]), porteuse(), faux);
      expect(enMain(st)).toEqual([]);
      expect(st.players[0].deck).toHaveLength(5);
      expect(enDeck(st)).toEqual(["A", "B", "C", "D", "E"]);
    }
  });

  it("seules les 3 PREMIÈRES sont en jeu — la 4e ne peut jamais être gagnée", () => {
    // Le moteur ne révèle que PRESAGE_REVEAL_COUNT cartes : un index hors
    // tranche est écrêté, il ne doit pas atteindre la 4e carte.
    const st = jouer(etat(["A", "B", "C", "D"]), porteuse(), 9);
    expect(enMain(st)).toEqual([]);
    expect(enDeck(st)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("le remélange", () => {
  it("porte sur le deck ENTIER, pas seulement sur les cartes révélées", () => {
    // 20 cartes : si seules les révélées bougeaient, le fond resterait dans son
    // ordre initial. On exige que l'ordre global ait changé.
    const noms = Array.from({ length: 20 }, (_, i) => `C${i}`);
    const st = jouer(etat(noms), porteuse(), 1);
    const apres = st.players[0].deck.map(c => c.card.name);
    expect(apres.slice().sort()).toEqual(noms.slice().sort()); // rien de perdu
    expect(apres).not.toEqual(noms);                            // et tout a bougé
  });

  it("ne perd ni ne duplique aucune carte, réussite ou échec", () => {
    const noms = ["A", "B", "C", "D", "E", "F"];
    for (const choix of [0, 1, 2]) {
      const st = jouer(etat(noms), porteuse(), choix);
      const total = [...st.players[0].deck, ...st.players[0].hand].map(c => c.card.name).sort();
      expect(total).toEqual(noms.slice().sort());
    }
  });
});

describe("les cas limites du deck", () => {
  it("deck VIDE ⇒ no-op complet, et AUCUN tirage consommé", () => {
    const s = etat([], 4242);
    const st = jouer(s, porteuse(), 0);
    expect(st.rngState).toBe(4242);
    expect(enMain(st)).toEqual([]);
  });

  it("deck d'UNE carte ⇒ la désignation est forcément juste", () => {
    const st = jouer(etat(["A"]), porteuse(), 0);
    expect(enMain(st)).toEqual(["A"]);
    expect(st.players[0].deck).toHaveLength(0);
  });

  it("deck de DEUX cartes ⇒ on ne révèle que ce qu'il y a", () => {
    const st = jouer(etat(["A", "B"]), porteuse(), 1);
    expect(enMain(st)).toEqual([]);
    expect(enDeck(st)).toEqual(["A", "B"]);
  });

  it("main PLEINE ⇒ la carte reste dans le deck, aucune perte silencieuse", () => {
    const s = etat(["A", "B", "C"]);
    for (let i = 0; i < MAX_HAND_SIZE; i++) {
      s.players[0].hand.push(mkInstance(mkCard({ name: `M${i}`, mana_cost: 0 })));
    }
    const ci = porteuse();
    s.players[0].hand.push(ci);
    const st = applyAction(s, {
      type: "play_card", cardInstanceId: ci.instanceId, divinationChoiceIndex: 0,
    });
    expect(enDeck(st)).toEqual(["A", "B", "C"]);
  });
});

describe("sans fenêtre de choix, le moteur désigne AU HASARD", () => {
  /** Une porteuse déjà en jeu, réglée sur un déclencheur non interactif. */
  function surPlateau(mode: Mode, noms: string[], rngState: number) {
    const s = etat(noms, rngState);
    const src = porteuse({ mode });
    src.hasSummoningSickness = false;
    s.players[0].board.push(src);
    return { s, src };
  }

  it("à la FIN DE TOUR : le résultat dépend de la graine, pas d'un défaut à 0", () => {
    // LE test qui compte : un défaut à 0 ferait réussir Présage à tous les
    // coups, puisque 0 est justement la bonne réponse. On exige donc qu'au
    // moins une graine échoue sur un échantillon.
    const gagne = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => {
      const { s } = surPlateau("end_of_turn", ["A", "B", "C", "D"], seed);
      const st = applyAction(s, { type: "end_turn" });
      return st.players[0].hand.length > 0;
    });
    expect(gagne).toContain(true);
    expect(gagne).toContain(false);
  });

  it("est DÉTERMINISTE : même graine, même issue", () => {
    const rejouer = () => {
      const { s } = surPlateau("end_of_turn", ["A", "B", "C", "D", "E"], 777);
      const st = applyAction(s, { type: "end_turn" });
      return [st.players[0].hand.map(c => c.card.name), st.players[0].deck.map(c => c.card.name)];
    };
    expect(rejouer()).toEqual(rejouer());
  });

  it("À L'ATTAQUE : le flux synchrone résout quand même Présage", () => {
    const { s, src } = surPlateau("attack", ["A", "B", "C", "D"], 3);
    const avantDeck = s.players[0].deck.map(c => c.card.name);
    const st = applyAction(s, {
      type: "attack", attackerInstanceId: src.instanceId, targetInstanceId: "enemy_hero",
    });
    // Quoi qu'il arrive, le deck a été remanié : la capacité n'est pas inerte.
    const apres = [...st.players[0].deck, ...st.players[0].hand].map(c => c.card.name);
    expect(apres.slice().sort()).toEqual(avantDeck.slice().sort());
    expect(st.players[0].deck.map(c => c.card.name)).not.toEqual(avantDeck);
  });
});

describe("Présage AU TAP — le joueur désigne", () => {
  it("l'index explicite pilote le résultat", () => {
    const juste = (() => {
      const s = etat(["A", "B", "C", "D"]);
      const src = porteuse({ mode: "tap" });
      src.hasSummoningSickness = false;
      s.players[0].board.push(src);
      return applyAction(s, {
        type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
        divinationChoiceIndex: 0,
      });
    })();
    expect(enMain(juste)).toEqual(["A"]);
    expect(juste.players[0].board[0].tapped).toBe(true);

    const faux = (() => {
      const s = etat(["A", "B", "C", "D"]);
      const src = porteuse({ mode: "tap" });
      src.hasSummoningSickness = false;
      s.players[0].board.push(src);
      return applyAction(s, {
        type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
        divinationChoiceIndex: 2,
      });
    })();
    expect(enMain(faux)).toEqual([]);
  });
});

describe("face SORT", () => {
  it("résout pour le lanceur, avec l'index désigné", () => {
    const st = jouer(etat(["A", "B", "C", "D"]), sortPresage(), 0);
    expect(st.players[0].hand.map(c => c.card.name)).toEqual(["A"]);
  });

  it("une désignation fausse ne donne rien", () => {
    const st = jouer(etat(["A", "B", "C", "D"]), sortPresage(), 2);
    expect(st.players[0].hand.filter(c => c.card.card_type !== "spell")).toHaveLength(0);
  });

  it("sans slot (sort RELANCÉ), il résout au hasard au lieu de disparaître", () => {
    // Sélection a dû se faire ajouter un pré-tirage pour ne pas s'évaporer en
    // silence quand personne n'est là pour choisir. Présage n'en a pas besoin :
    // son repli est déjà le tirage au sort. Ce test verrouille ce repli.
    const gagne = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const s = etat(["A", "B", "C", "D"], seed);
      const ci = sortPresage();
      s.players[0].hand.push(ci);
      const st = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId });
      const avantDeck = ["A", "B", "C", "D"];
      // La capacité a bien agi : le deck a été remélangé dans tous les cas.
      expect(st.players[0].deck.map(c => c.card.name)).not.toEqual(avantDeck);
      return st.players[0].hand.some(c => avantDeck.includes(c.card.name));
    });
    expect(gagne).toContain(true);
    expect(gagne).toContain(false);
  });
});

describe("LE DESSEIN — Divination prépare, Présage encaisse", () => {
  it("une carte remontée par Divination est ensuite gagnée À COUP SÛR", () => {
    // C'est la raison d'être de la capacité, et le scénario RÉEL : deux cartes
    // distinctes, l'une qui prépare, l'autre qui encaisse.
    const s = etat(["A", "B", "C", "D", "E", "F"]);

    // 1) Un Devin remonte « C » (indice 2 de la tranche révélée) sur le dessus.
    const devin = mkInstance(mkCard({
      name: "Devin", mana_cost: 1, attack: 2, health: 2,
      keywords: ["divination"] as never,
    } as Partial<Card>));
    const apresDivination = jouer(s, devin, 2);
    expect(apresDivination.players[0].deck[0].card.name).toBe("C");

    // 2) L'Oracle révèle 3 cartes. Le joueur SAIT que « C » est au sommet : il
    //    la reconnaît dans le désordre et la désigne — indice réel 0.
    const st = jouer(apresDivination, porteuse(), 0);
    expect(st.players[0].hand.map(c => c.card.name)).toEqual(["C"]);
  });

  it("sans préparation, la désignation n'est juste qu'une fois sur trois", () => {
    // Le contraste qui donne son sens à la capacité : la certitude vient de la
    // PRÉPARATION, jamais de Présage lui-même.
    const gagne = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => {
      const s = etat(["A", "B", "C", "D"], seed);
      const src = porteuse({ mode: "end_of_turn" });
      src.hasSummoningSickness = false;
      s.players[0].board.push(src);
      return applyAction(s, { type: "end_turn" }).players[0].hand.length > 0;
    });
    const reussites = gagne.filter(Boolean).length;
    expect(reussites).toBeGreaterThan(0);
    expect(reussites).toBeLessThan(gagne.length);
  });

  it("Divination ET Présage sur UNE MÊME carte : la désignation est toujours juste", () => {
    // ⚠️ Conséquence CONNUE, verrouillée ici pour qu'elle ne soit pas prise pour
    // un bug plus tard. Les deux capacités partagent le champ d'action
    // `divinationChoiceIndex` : le joueur ne fait qu'UN choix, appliqué aux
    // deux. Divination remonte donc la carte d'indice k, et Présage désigne
    // ce même indice k — or après le remontage, la carte visée est en 0.
    //
    // Avec k = 0 les deux coïncident et Présage réussit à coup sûr ; avec k > 0
    // Divination remonte bien la carte, mais Présage désigne un indice devenu
    // faux. Une carte cumulant les deux est donc soit un gain garanti, soit un
    // échec garanti — jamais une devinette. Séparer les deux choix demanderait
    // un champ d'action propre à Présage et un enchaînement de deux modales.
    const s = etat(["A", "B", "C", "D", "E", "F"]);
    const cumul = mkInstance(mkCard({
      name: "Devin-Oracle", mana_cost: 1, attack: 2, health: 2,
      keywords: ["divination", "presage"] as never,
    } as Partial<Card>));
    const st = jouer(s, cumul, 0);
    expect(st.players[0].hand.map(c => c.card.name)).toEqual(["A"]);
  });
});

describe("le contrat RNG", () => {
  it("un deck de N cartes consomme EXACTEMENT N−1 tirages (le mélange)", () => {
    // Le mélange est un Fisher-Yates : un appel par carte moins une. La
    // désignation étant fournie, elle n'en consomme aucun.
    const s = etat(["A", "B", "C", "D", "E"], 999);
    const st = jouer(s, porteuse(), 1);
    expect(st.rngState).toBe(avance(999, 5 - 1));
  });

  it("sans désignation, un tirage de PLUS est consommé", () => {
    const s = etat(["A", "B", "C", "D", "E"], 999);
    const src = porteuse({ mode: "end_of_turn" });
    src.hasSummoningSickness = false;
    s.players[0].board.push(src);
    const st = applyAction(s, { type: "end_turn" });
    // 1 pour la désignation + (N−1) pour le mélange. La carte gagnée sort du
    // deck AVANT le mélange, d'où un mélange sur 4 ou 5 cartes selon l'issue.
    const gagne = st.players[0].hand.length > 0;
    expect(st.rngState).toBe(avance(999, 1 + (gagne ? 4 - 1 : 5 - 1)));
  });
});
