// ESPRIT DE CORPS — +1 ATK ou +1 PV au hasard, une fois par Esprit de corps que
// le contrôleur a DÉJÀ déclenché pendant la partie (toutes porteuses, tous
// déclencheurs confondus, gain nul compris).
//
// À verrouiller :
//   1. Le compteur est celui des DÉCLENCHEMENTS, pas des créatures jouées : une
//      porteuse posée sans se déclencher (mode mort) ne compte pas ; une même
//      porteuse qui se déclenche chaque fin de tour compte à chaque fois.
//   2. C'est un HISTORIQUE : il ne redescend jamais.
//   3. Le CONTRAT RNG : exactement N tirages pour N points, 0 pour 0.
//   4. Le déclenchement en cours ne se compte pas lui-même (le 1er gagne 0).
import { describe, expect, it } from "vitest";
import { applyAction, espritDeCorpsPoints, recalculateAuras } from "./engine";
import { syncHash } from "./stateHash";
import { describeKeyword } from "./keyword-display";
import { mkCard, mkInstance, mkPlayer, mkState } from "./test-harness";
import type { Card, GameAction, GameState, KeywordInstance } from "./types";

const CLAN = "Cohortes Sanglantes";
const AUTRE_CLAN = "Combe Verte";

type Mode = "death" | "attack" | "tap" | "end_of_turn" | "return" | "draw" | "low_hp";

/** Une porteuse d'Esprit de corps. `mode` absent ⇒ entrée en jeu. */
function porteuse(opts: {
  name?: string; clan?: string | null; mode?: Mode;
  attack?: number; health?: number; mana_cost?: number;
} = {}) {
  const { name = "Légionnaire", clan = CLAN, mode, attack = 2, health = 2, mana_cost = 1 } = opts;
  return mkInstance(mkCard({
    name, mana_cost, attack, health,
    ...(clan ? { clan } : {}),
    keywords: ["esprit_de_corps"] as never,
    keyword_instances: [{ id: "esprit_de_corps", ...(mode ? { mode } : {}) }] as KeywordInstance[],
  } as Partial<Card>));
}

/** Une créature nue — elle ne doit rien nourrir. */
function figurante(clan: string | null = CLAN, name = "Figurante") {
  return mkInstance(mkCard({ name, mana_cost: 1, attack: 1, health: 1, ...(clan ? { clan } : {}) } as Partial<Card>));
}

function play(state: GameState, ci: ReturnType<typeof mkInstance>, playerIdx = 0): GameAction {
  state.players[playerIdx].hand.push(ci);
  state.currentPlayerIndex = playerIdx as 0 | 1;
  return { type: "play_card", cardInstanceId: ci.instanceId };
}

/** Pose n porteuses (entrée en jeu) à la suite et renvoie l'état après la dernière. */
function poseSuccessive(n: number, s = mkState()): { state: GameState; noms: string[] } {
  let state = s;
  const noms: string[] = [];
  for (let i = 0; i < n; i++) {
    const nom = `Légionnaire ${i + 1}`;
    noms.push(nom);
    state = applyAction(state, play(state, porteuse({ name: nom })));
  }
  return { state, noms };
}

const compteur = (state: GameState, idx = 0) => state.players[idx].espritDeCorpsDeclenchements ?? 0;

const surPlateau = (state: GameState, nom: string, idx = 0) =>
  state.players[idx].board.find(c => c.card.name === nom)!;

/** Gain total constaté sur une créature de base 2/2. */
const gain = (c: ReturnType<typeof mkInstance>) =>
  (c.currentAttack - 2) + (c.maxHealth - 2);

/** mulberry32 avance sa graine d'un pas FIXE par appel. */
const avance = (seed: number, appels: number) => (seed + appels * 0x6d2b79f5) | 0;

// ───────────────────────────────────────────────────────────────────────────

describe("le compteur de déclenchements", () => {
  it("chaque déclenchement incrémente le compteur, gain nul compris", () => {
    const s = mkState();
    expect(compteur(applyAction(s, play(s, porteuse())))).toBe(1);
    expect(compteur(poseSuccessive(3).state)).toBe(3);
  });

  it("une porteuse posée SANS se déclencher (mode mort) ne compte pas", () => {
    const s = poseSuccessive(2).state;
    const st = applyAction(s, play(s, porteuse({ name: "Patiente", mode: "death" })));
    expect(gain(surPlateau(st, "Patiente"))).toBe(0);
    expect(compteur(st)).toBe(2);
  });

  it("une créature sans le mot-clé ne nourrit rien", () => {
    const s = mkState();
    expect(compteur(applyAction(s, play(s, figurante())))).toBe(0);
  });

  it("toutes porteuses confondues, clans et sans clan compris", () => {
    let s = mkState();
    s = applyAction(s, play(s, porteuse({ name: "Errante", clan: null })));
    s = applyAction(s, play(s, porteuse({ name: "Étrangère", clan: AUTRE_CLAN })));
    s = applyAction(s, play(s, porteuse({ name: "Locale" })));
    expect(gain(surPlateau(s, "Locale"))).toBe(2);
  });

  it("les joueurs sont cloisonnés : le compteur adverse ne profite à personne", () => {
    let s = mkState();
    s = applyAction(s, play(s, porteuse({ name: "Ennemie 1" }), 1));
    s = applyAction(s, play(s, porteuse({ name: "Ennemie 2" }), 1));
    s = applyAction(s, play(s, porteuse({ name: "Mienne" }), 0));
    expect(compteur(s, 1)).toBe(2);
    expect(compteur(s, 0)).toBe(1);
    expect(gain(surPlateau(s, "Mienne", 0))).toBe(0);
  });

  it("le compteur NE REDESCEND PAS quand la porteuse meurt", () => {
    let s = mkState();
    s = applyAction(s, play(s, porteuse({ name: "Martyre", health: 1 })));
    const bourreau = mkInstance(mkCard({ name: "Bourreau", mana_cost: 5, attack: 9, health: 9 }));
    s.players[1].board.push(bourreau);
    s.currentPlayerIndex = 1;
    const st = applyAction(s, {
      type: "attack", attackerInstanceId: bourreau.instanceId, targetInstanceId: surPlateau(s, "Martyre").instanceId,
    });
    expect(st.players[0].board.some(u => u.card.name === "Martyre")).toBe(false);
    expect(compteur(st)).toBe(1);
  });
});

describe("l'amorçage : le premier déclenchement ne rapporte rien", () => {
  it("1ʳᵉ posée ⇒ 0 point ; 2ᵉ ⇒ 1 ; 3ᵉ ⇒ 2", () => {
    const { state } = poseSuccessive(3);
    expect(state.players[0].board.map(gain)).toEqual([0, 1, 2]);
  });

  it("le point tombe TOUJOURS soit en ATK soit en PV, jamais les deux", () => {
    const c = surPlateau(poseSuccessive(2).state, "Légionnaire 2");
    expect([c.currentAttack - 2, c.maxHealth - 2].sort()).toEqual([0, 1]);
    expect(c.currentHealth).toBe(c.maxHealth);
  });

  it("le gain est cuit dans la carte, comme Renforcement", () => {
    const c = surPlateau(poseSuccessive(2).state, "Légionnaire 2");
    expect((c.card.attack ?? 0) + (c.card.health ?? 0)).toBe(5);
  });

  it("une porteuse seule en fin de tour : 0 au 1er tour, 1 au suivant", () => {
    const s = mkState();
    const st0 = applyAction(s, play(s, porteuse({ name: "Solitaire", mode: "end_of_turn" })));
    expect(compteur(st0)).toBe(0);
    let st = applyAction(st0, { type: "end_turn" });
    expect(gain(surPlateau(st, "Solitaire"))).toBe(0);
    expect(st.rngState).toBe(st0.rngState);
    expect(compteur(st)).toBe(1);
    st = applyAction(applyAction(st, { type: "end_turn" }), { type: "end_turn" });
    expect(gain(surPlateau(st, "Solitaire"))).toBe(1);
    expect(compteur(st)).toBe(2);
  });
});

describe("le contrat RNG", () => {
  it("0 point ⇒ AUCUN tirage consommé", () => {
    const s = mkState();
    s.rngState = 4242;
    expect(applyAction(s, play(s, porteuse())).rngState).toBe(4242);
  });

  it("une créature sans le mot-clé ne consomme rien non plus", () => {
    const s = mkState();
    s.rngState = 4242;
    expect(applyAction(s, play(s, figurante())).rngState).toBe(4242);
  });

  it("N points ⇒ EXACTEMENT N tirages", () => {
    const s = poseSuccessive(2).state;
    const avant = s.rngState!;
    const apres = applyAction(s, play(s, porteuse({ name: "C" })));
    expect(apres.rngState).toBe(avance(avant, 2));
  });

  it("même graine ⇒ même répartition", () => {
    const rep = (seed: number) => {
      const s = mkState();
      s.rngState = seed;
      return poseSuccessive(4, s).state.players[0].board.map(c => [c.currentAttack, c.maxHealth]);
    };
    expect(rep(777)).toEqual(rep(777));
  });

  it("des graines différentes finissent par donner des répartitions différentes", () => {
    const rep = (seed: number) => {
      const s = mkState();
      s.rngState = seed;
      return JSON.stringify(poseSuccessive(4, s).state.players[0].board.map(c => c.currentAttack));
    };
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(rep)).size).toBeGreaterThan(1);
  });

  it("quelle que soit la graine, le TOTAL distribué reste exact", () => {
    for (const seed of [1, 99, 12345, 0x7fffffff]) {
      const s = mkState();
      s.rngState = seed;
      expect(poseSuccessive(4, s).state.players[0].board.map(gain)).toEqual([0, 1, 2, 3]);
    }
  });
});

describe("tous les déclencheurs", () => {
  it("À L'ATTAQUE", () => {
    const s = mkState();
    const src = porteuse({ name: "Assaillante", mode: "attack", attack: 3, health: 5 });
    src.hasSummoningSickness = false;
    s.players[0].board.push(src);
    s.players[0].espritDeCorpsDeclenchements = 2;
    const st = applyAction(s, { type: "attack", attackerInstanceId: src.instanceId, targetInstanceId: "enemy_hero" });
    const c = surPlateau(st, "Assaillante");
    expect((c.currentAttack - 3) + (c.maxHealth - 5)).toBe(2);
    expect(compteur(st)).toBe(3);
  });

  it("EN FIN DE TOUR", () => {
    const s = mkState();
    s.players[0].board.push(porteuse({ name: "Vétérane", mode: "end_of_turn" }));
    s.players[0].espritDeCorpsDeclenchements = 2;
    const st = applyAction(s, { type: "end_turn" });
    expect(gain(surPlateau(st, "Vétérane"))).toBe(2);
  });

  it("À LA MORT — le compteur reste exact même quand la source quitte le plateau", () => {
    const s = mkState();
    const src = porteuse({ name: "Sacrifiée", mode: "death", health: 1 });
    s.players[0].board.push(src);
    s.players[0].espritDeCorpsDeclenchements = 2;
    const bourreau = mkInstance(mkCard({ name: "Bourreau", mana_cost: 5, attack: 9, health: 9 }));
    s.players[1].board.push(bourreau);
    s.currentPlayerIndex = 1;
    const st = applyAction(s, { type: "attack", attackerInstanceId: bourreau.instanceId, targetInstanceId: src.instanceId });
    const morte = st.players[0].graveyard.find(c => c.card.name === "Sacrifiée")!;
    expect(((morte.card.attack ?? 0) - 2) + ((morte.card.health ?? 0) - 1)).toBe(2);
    expect(compteur(st)).toBe(3);
  });
});

describe("le gain est DÉFINITIF — ce n'est pas une aura", () => {
  it("survit aux recalculs d'auras, sans s'empiler", () => {
    // Le piège serait de l'implémenter dans recalculateAuras comme les quatre
    // capacités conditionnelles (Pureté, Force des ancêtres, Seuils).
    const { state } = poseSuccessive(3);
    const c = surPlateau(state, "Légionnaire 3");
    const avant = [c.currentAttack, c.maxHealth];
    for (let i = 0; i < 5; i++) recalculateAuras(state.players[0], state.players[1]);
    expect([c.currentAttack, c.maxHealth]).toEqual(avant);
  });

  it("la fin de tour rejoue le bonus À CHAQUE tour — l'empilement est voulu", () => {
    // Verrouillé exprès : un futur « garde-fou une seule fois par créature »
    // ferait tomber ce test, et ce serait un changement de règle, pas un fix.
    let s = mkState();
    s.players[0].board.push(porteuse({ name: "Increvable", mode: "end_of_turn" }));
    s.players[0].espritDeCorpsDeclenchements = 2;

    // `end_turn` alterne les joueurs : seule une fin de tour SUR DEUX est
    // celle du contrôleur, et c'est la seule qui déclenche.
    s = applyAction(s, { type: "end_turn" });
    expect(gain(surPlateau(s, "Increvable"))).toBe(2);
    s = applyAction(s, { type: "end_turn" }); // tour adverse : rien
    expect(gain(surPlateau(s, "Increvable"))).toBe(2);
    s = applyAction(s, { type: "end_turn" });
    s = applyAction(s, { type: "end_turn" });
    s = applyAction(s, { type: "end_turn" });
    // Trois fins de tour du contrôleur : 2, puis 3, puis 4 — chaque
    // déclenchement précédent, le sien compris, grossit le suivant.
    expect(gain(surPlateau(s, "Increvable"))).toBe(9);
  });
});

describe("espritDeCorpsPoints — la source unique du moteur ET de l'affichage", () => {
  it("vaut le nombre de déclenchements passés du joueur", () => {
    const p = mkPlayer("P1");
    p.espritDeCorpsDeclenchements = 3;
    expect(espritDeCorpsPoints(p)).toBe(3);
  });

  it("compteur absent (snapshot d'avant l'ajout du champ) : zéro, pas une erreur", () => {
    expect(espritDeCorpsPoints(mkPlayer("P1"))).toBe(0);
  });

  it("l'ancien compteur de créatures jouées n'est plus lu", () => {
    const p = mkPlayer("P1");
    p.espritDeCorpsPlayed = { [CLAN]: 4 };
    expect(espritDeCorpsPoints(p)).toBe(0);
  });
});

describe("la description affichée", () => {
  // Le clan doit être un clan RÉEL : `getClanForm` retombe sur son nom brut
  // pour un clan inventé, ce qui masquerait une régression de fléchissement.
  const CLAN_REEL = "Les Sylvains";
  const carte = { clan: CLAN_REEL };

  it("hors partie (forge, collection) : la forme générique, sans compteur", () => {
    const d = describeKeyword("esprit_de_corps", { card: carte })!;
    expect(d).not.toContain("Sylvains");
    // « +1 » appartient à la phrase ; c'est le « N fois » du compteur qui doit
    // rester absent hors partie.
    expect(d).not.toContain("fois");
  });

  it("en partie : le TOTAL est écrit en toutes lettres, pas à calculer", () => {
    const d = describeKeyword("esprit_de_corps", { card: carte, espritCount: 2 })!;
    expect(d).toContain("2 fois");
    expect(d).not.toContain("Sylvains");
    expect(d).not.toContain("{");
  });

  it("0 point retombe sur la forme générique — jamais « 0 fois »", () => {
    const d = describeKeyword("esprit_de_corps", { card: carte, espritCount: 0 })!;
    expect(d).toBe(describeKeyword("esprit_de_corps", { card: carte }));
  });

  it("sans clan, la description reste lisible", () => {
    const d = describeKeyword("esprit_de_corps", { card: { clan: undefined }, espritCount: 3 })!;
    expect(d).toContain("3 fois");
    expect(d).not.toContain("{");
  });

  it("le nombre affiché est celui que le moteur distribuera", () => {
    // Le vrai risque : deux calculs parallèles qui divergent. Les deux passent
    // par espritDeCorpsPoints, ce test le verrouille bout à bout.
    const s = poseSuccessive(2).state;
    const points = espritDeCorpsPoints(s.players[0]);
    const st = applyAction(s, play(s, porteuse({ name: "Troisième" })));
    expect(points).toBe(gain(surPlateau(st, "Troisième")));
  });
});

describe("l'animation : un point à la fois", () => {
  // Le store ne sait découper une action que par un diff d'états : sans ce
  // canal, trois points appliqués dans la même action se fondraient en un seul
  // popup « +3 ». Le joueur ne verrait ni la troupe se renforcer cran par cran,
  // ni sur quelle stat chaque tirage est tombé.
  //
  // ⚠️ Le moteur ACCUMULE `sequentialHits` d'une action à l'autre (`[...anciens,
  // ...nouveaux]`) ; c'est le STORE qui vide la liste après l'avoir planifiée.
  // Un test qui ne la remet pas à zéro compte donc le cumul de toute la partie.
  const raz = (s: GameState): GameState => { s.sequentialHits = undefined; return s; };
  const points = (s: GameState) => (s.sequentialHits ?? []).filter(h => h.type === "buff");

  it("N points gagnés ⇒ N annonces séquentielles, toutes sur la porteuse", () => {
    const s = raz(poseSuccessive(2).state);
    const st = applyAction(s, play(s, porteuse({ name: "Troisième" })));
    const cible = surPlateau(st, "Troisième");
    const annonces = points(st);
    expect(annonces).toHaveLength(2);
    expect(annonces.every(h => h.targetInstanceId === cible.instanceId)).toBe(true);
  });

  it("les libellés disent CE qui a été gagné, et collent au gain réel", () => {
    const s = raz(poseSuccessive(3).state);
    const st = applyAction(s, play(s, porteuse({ name: "Quatrième" })));
    const cible = surPlateau(st, "Quatrième");
    const annonces = points(st);
    expect(annonces).toHaveLength(3);
    const enATK = annonces.filter(h => h.label === "+1 ⚔").length;
    const enPV = annonces.filter(h => h.label === "+1 ❤").length;
    expect(enATK).toBe(cible.currentAttack - 2);
    expect(enPV).toBe(cible.maxHealth - 2);
    expect(enATK + enPV).toBe(3);
  });

  it("0 point ⇒ AUCUNE annonce (pas de popup fantôme)", () => {
    const s = mkState();
    const st = applyAction(s, play(s, porteuse({ name: "Première" })));
    expect(points(st)).toHaveLength(0);
  });

  it("les annonces sortent aussi des déclencheurs tardifs", () => {
    const s = raz(mkState());
    const src = porteuse({ name: "Vétérane", mode: "end_of_turn" });
    s.players[0].board.push(src);
    s.players[0].espritDeCorpsDeclenchements = 2;
    const st = applyAction(s, { type: "end_turn" });
    expect(points(st)).toHaveLength(2);
    expect(points(st).every(h => h.targetInstanceId === src.instanceId)).toBe(true);
  });

  it("c'est un indice d'ANIMATION : hors du hash de synchro", () => {
    // Le canal ne doit jamais faire diverger les deux clients — sinon un simple
    // décalage d'affichage déclencherait une fausse désync.
    const { state } = poseSuccessive(3);
    expect(syncHash(state)).toBe(syncHash({ ...state, sequentialHits: undefined }));
  });

  it("le gain total est INCHANGÉ par le découpage", () => {
    // Appliquer 3 fois +1 ou 1 fois +3 donne exactement le même état : le
    // découpage est un choix d'ANIMATION, jamais une règle.
    const { state } = poseSuccessive(3);
    expect(state.players[0].board.map(gain)).toEqual([0, 1, 2]);
  });
});
