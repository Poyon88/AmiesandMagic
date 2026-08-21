// ESPRIT DE CORPS — +1 ATK ou +1 PV au hasard, une fois par AUTRE créature
// Esprit de corps du même clan déjà posée depuis la main par le contrôleur.
//
// Quatre choses à verrouiller, par ordre d'importance :
//
//   1. Le compteur est un HISTORIQUE, pas un décompte de plateau. Il ne
//      redescend jamais : tuer les porteurs ne réduit rien. C'est ce qui sépare
//      Esprit de corps de Loyauté (alliés de même race EN JEU) et de Fierté du
//      clan (aura). Le piège serait de l'implémenter en lisant `board`.
//   2. « Jouée » = POSÉE DEPUIS LA MAIN. Seconde vie (depuis le cimetière),
//      Appel du clan, Invocation X, Résurrection, tokens : rien de tout cela ne
//      compte. Le moteur distingue déjà « jouée » de « mise en jeu ».
//   3. Le CONTRAT RNG. Le flux aléatoire est partagé et sérialisé dans l'état :
//      un appel de plus d'un côté décale les deux clients pour tout le reste de
//      la partie. On vérifie donc le nombre EXACT d'appels, pas seulement le
//      résultat — 0 point doit consommer 0 tirage.
//   4. La créature ne se compte JAMAIS elle-même, quel que soit son
//      déclencheur. Sans ça la règle se contredirait entre l'entrée en jeu et
//      la mort, et la toute première porteuse gagnerait 1 au lieu de 0.
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

/** Une créature nue du même clan — elle ne doit rien nourrir. */
function figurante(clan: string | null = CLAN, name = "Figurante") {
  return mkInstance(mkCard({ name, mana_cost: 1, attack: 1, health: 1, ...(clan ? { clan } : {}) } as Partial<Card>));
}

function play(state: GameState, ci: ReturnType<typeof mkInstance>, playerIdx = 0): GameAction {
  state.players[playerIdx].hand.push(ci);
  // `play_card` ne joue que pour le joueur COURANT : sans cette bascule,
  // poser une carte pour P2 est un no-op silencieux et le test passe à vide.
  state.currentPlayerIndex = playerIdx as 0 | 1;
  return { type: "play_card", cardInstanceId: ci.instanceId };
}

/** Pose n porteuses à la suite et renvoie l'état après la dernière. */
function poseSuccessive(n: number, s = mkState()): { state: GameState; noms: string[] } {
  let state = s;
  const noms: string[] = [];
  for (let i = 0; i < n; i++) {
    const nom = `Légionnaire ${i + 1}`;
    noms.push(nom);
    const ci = porteuse({ name: nom });
    state = applyAction(state, play(state, ci));
  }
  return { state, noms };
}

const compteur = (state: GameState, clan = CLAN, idx = 0) =>
  state.players[idx].espritDeCorpsPlayed?.[clan] ?? 0;

const surPlateau = (state: GameState, nom: string, idx = 0) =>
  state.players[idx].board.find(c => c.card.name === nom)!;

/** Gain total constaté sur une créature de base 2/2. */
const gain = (c: ReturnType<typeof mkInstance>) =>
  (c.currentAttack - 2) + (c.maxHealth - 2);

/** mulberry32 avance sa graine d'un pas FIXE par appel. Le nombre exact de
 *  tirages consommés est donc lisible dans l'état, sans instrumenter le
 *  moteur. C'est ce qui permet de tester le contrat RNG et pas juste l'effet. */
const avance = (seed: number, appels: number) => (seed + appels * 0x6d2b79f5) | 0;

// ───────────────────────────────────────────────────────────────────────────

describe("le compteur d'historique", () => {
  it("une pose depuis la main incrémente le compteur du clan", () => {
    const s = mkState();
    const st = applyAction(s, play(s, porteuse()));
    expect(compteur(st)).toBe(1);
  });

  it("trois poses ⇒ trois", () => {
    expect(compteur(poseSuccessive(3).state)).toBe(3);
  });

  it("Seconde vie — posée depuis le CIMETIÈRE — ne compte pas", () => {
    const s = mkState();
    const c = mkInstance(mkCard({
      name: "Revenant", mana_cost: 1, attack: 2, health: 2, clan: CLAN,
      keywords: ["esprit_de_corps", "seconde_vie"] as never,
      keyword_instances: [{ id: "esprit_de_corps" }, { id: "seconde_vie", x: 1 }] as KeywordInstance[],
    } as Partial<Card>));
    s.players[0].graveyard.push(c);

    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, fromGraveyard: true });
    expect(st.players[0].board.some(u => u.card.name === "Revenant")).toBe(true);
    expect(compteur(st)).toBe(0);
  });

  it("Appel du clan — mise en jeu depuis le DECK — ne compte pas", () => {
    const s = mkState();
    // Le renfort porte Esprit de corps mais arrive gratuitement : il ne
    // grossit pas la troupe au sens de la règle.
    s.players[0].deck.push(porteuse({ name: "Renfort" }));
    const heraut = mkInstance(mkCard({
      name: "Héraut", mana_cost: 5, attack: 3, health: 3, clan: CLAN,
      keywords: ["appel_du_clan"] as never, effect_text: "Appel du clan 3",
    } as Partial<Card>));

    const st = applyAction(s, play(s, heraut));
    expect(st.players[0].board.some(u => u.card.name === "Renfort")).toBe(true);
    expect(compteur(st)).toBe(0);
  });

  it("une créature du même clan SANS le mot-clé ne nourrit rien", () => {
    const s = mkState();
    const st = applyAction(s, play(s, figurante()));
    expect(compteur(st)).toBe(0);
  });

  it("une porteuse SANS CLAN n'est comptée nulle part", () => {
    const s = mkState();
    const st = applyAction(s, play(s, porteuse({ clan: null, name: "Errante" })));
    expect(st.players[0].espritDeCorpsPlayed ?? {}).toEqual({});
  });

  it("les clans sont cloisonnés", () => {
    let s = mkState();
    s = applyAction(s, play(s, porteuse({ name: "A" })));
    s = applyAction(s, play(s, porteuse({ name: "B", clan: AUTRE_CLAN })));
    expect(compteur(s, CLAN)).toBe(1);
    expect(compteur(s, AUTRE_CLAN)).toBe(1);
  });

  it("les joueurs sont cloisonnés", () => {
    let s = mkState();
    s = applyAction(s, play(s, porteuse({ name: "A" })));
    s = applyAction(s, play(s, porteuse({ name: "B" }), 1));
    expect(compteur(s, CLAN, 0)).toBe(1);
    expect(compteur(s, CLAN, 1)).toBe(1);
  });

  it("le compteur NE REDESCEND PAS quand la porteuse meurt", () => {
    // C'est le point qui sépare Esprit de corps de Loyauté et Fierté du clan :
    // implémenté en lisant `board`, ce test tomberait.
    let s = mkState();
    s = applyAction(s, play(s, porteuse({ name: "Martyre", health: 1 })));
    const bourreau = mkInstance(mkCard({ name: "Bourreau", mana_cost: 5, attack: 9, health: 9 }));
    s.players[1].board.push(bourreau);
    s.currentPlayerIndex = 1;

    const cible = surPlateau(s, "Martyre");
    const st = applyAction(s, {
      type: "attack", attackerInstanceId: bourreau.instanceId, targetInstanceId: cible.instanceId,
    });
    expect(st.players[0].board.some(u => u.card.name === "Martyre")).toBe(false);
    expect(compteur(st)).toBe(1);
  });
});

describe("l'amorçage : la première porteuse ne gagne rien", () => {
  it("1ʳᵉ posée ⇒ 0 point, aucune stat ne bouge", () => {
    const { state } = poseSuccessive(1);
    const c = surPlateau(state, "Légionnaire 1");
    expect([c.currentAttack, c.currentHealth, c.maxHealth]).toEqual([2, 2, 2]);
  });

  it("2ᵉ posée ⇒ exactement 1 point, 3ᵉ ⇒ exactement 2", () => {
    const { state } = poseSuccessive(3);
    expect(gain(surPlateau(state, "Légionnaire 1"))).toBe(0);
    expect(gain(surPlateau(state, "Légionnaire 2"))).toBe(1);
    expect(gain(surPlateau(state, "Légionnaire 3"))).toBe(2);
  });

  it("le point tombe TOUJOURS soit en ATK soit en PV, jamais les deux", () => {
    const { state } = poseSuccessive(2);
    const c = surPlateau(state, "Légionnaire 2");
    const dATK = c.currentAttack - 2;
    const dPV = c.maxHealth - 2;
    expect([dATK, dPV].sort()).toEqual([0, 1]);
    // Les PV COURANTS suivent les PV max — la créature n'arrive pas blessée.
    expect(c.currentHealth).toBe(c.maxHealth);
  });

  it("le gain est cuit dans la carte, comme Renforcement", () => {
    const { state } = poseSuccessive(2);
    const c = surPlateau(state, "Légionnaire 2");
    expect((c.card.attack ?? 0) + (c.card.health ?? 0)).toBe(5); // 2/2 + 1 point
  });

  it("une porteuse d'un AUTRE clan ne fait pas grossir la troupe", () => {
    let s = mkState();
    s = applyAction(s, play(s, porteuse({ name: "Étrangère", clan: AUTRE_CLAN })));
    s = applyAction(s, play(s, porteuse({ name: "Locale" })));
    expect(gain(surPlateau(s, "Locale"))).toBe(0);
  });

  it("une créature du même clan sans le mot-clé ne fait pas grossir la troupe", () => {
    let s = mkState();
    s = applyAction(s, play(s, figurante()));
    s = applyAction(s, play(s, porteuse({ name: "Seule" })));
    expect(gain(surPlateau(s, "Seule"))).toBe(0);
  });

  it("le compteur de l'ADVERSAIRE ne profite à personne", () => {
    let s = mkState();
    s = applyAction(s, play(s, porteuse({ name: "Ennemie 1" }), 1));
    s = applyAction(s, play(s, porteuse({ name: "Ennemie 2" }), 1));
    s = applyAction(s, play(s, porteuse({ name: "Mienne" }), 0));
    expect(gain(surPlateau(s, "Mienne", 0))).toBe(0);
  });
});

describe("le contrat RNG", () => {
  it("0 point ⇒ AUCUN tirage consommé", () => {
    const s = mkState();
    s.rngState = 4242;
    const st = applyAction(s, play(s, porteuse()));
    expect(st.rngState).toBe(4242);
  });

  it("une créature sans le mot-clé ne consomme rien non plus", () => {
    const s = mkState();
    s.rngState = 4242;
    const st = applyAction(s, play(s, figurante()));
    expect(st.rngState).toBe(4242);
  });

  it("N points ⇒ EXACTEMENT N tirages", () => {
    // Le vrai risque d'une capacité aléatoire : consommer un nombre d'appels
    // qui dépend d'autre chose que N. Le flux étant partagé, les deux clients
    // se décaleraient pour tout le reste de la partie.
    let s = mkState();
    s = applyAction(s, play(s, porteuse({ name: "A" }))); // 0 point
    s = applyAction(s, play(s, porteuse({ name: "B" }))); // 1 point
    const avant = s.rngState!;
    const apres = applyAction(s, play(s, porteuse({ name: "C" }))); // 2 points
    expect(apres.rngState).toBe(avance(avant, 2));
  });

  it("même graine ⇒ même répartition", () => {
    const rep = (seed: number) => {
      const s = mkState();
      s.rngState = seed;
      const { state } = poseSuccessive(4, s);
      return state.players[0].board.map(c => [c.currentAttack, c.maxHealth]);
    };
    expect(rep(777)).toEqual(rep(777));
  });

  it("des graines différentes finissent par donner des répartitions différentes", () => {
    // On ne teste pas « ça change à chaque graine » (une pièce peut retomber
    // du même côté) mais « ça n'est pas figé » : sur un échantillon de graines,
    // au moins deux répartitions doivent différer.
    const rep = (seed: number) => {
      const s = mkState();
      s.rngState = seed;
      const { state } = poseSuccessive(4, s);
      return JSON.stringify(state.players[0].board.map(c => c.currentAttack));
    };
    const vues = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(rep));
    expect(vues.size).toBeGreaterThan(1);
  });

  it("quelle que soit la graine, le TOTAL distribué reste exact", () => {
    for (const seed of [1, 99, 12345, 0x7fffffff]) {
      const s = mkState();
      s.rngState = seed;
      const { state } = poseSuccessive(4, s);
      expect(state.players[0].board.map(gain)).toEqual([0, 1, 2, 3]);
    }
  });
});

describe("tous les déclencheurs", () => {
  /** Deux porteuses déjà jouées, pour que la troisième ait 2 points à gagner. */
  function troupeDeDeux(): GameState {
    return poseSuccessive(2).state;
  }

  it("À L'ATTAQUE", () => {
    // Posée plus tôt dans la partie : `playCard` REPOSE toujours le mal
    // d'invocation, on la met donc directement en jeu, déjà comptée.
    const s = troupeDeDeux();
    const src = porteuse({ name: "Assaillante", mode: "attack", attack: 3, health: 5 });
    src.hasSummoningSickness = false;
    src.espritDeCorpsCounted = true;
    s.players[0].board.push(src);
    s.players[0].espritDeCorpsPlayed = { [CLAN]: 3 };

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: src.instanceId, targetInstanceId: "enemy_hero",
    });
    const c = surPlateau(st, "Assaillante");
    // 3 posées − elle-même = 2 points.
    expect((c.currentAttack - 3) + (c.maxHealth - 5)).toBe(2);
  });

  it("EN FIN DE TOUR", () => {
    const s = troupeDeDeux();
    const src = porteuse({ name: "Vétérane", mode: "end_of_turn" });
    s.players[0].board.push(src);
    src.espritDeCorpsCounted = true; // posée plus tôt dans la partie
    s.players[0].espritDeCorpsPlayed = { [CLAN]: 3 };

    const st = applyAction(s, { type: "end_turn" });
    expect(gain(surPlateau(st, "Vétérane"))).toBe(2);
  });

  it("À LA MORT — le compteur reste exact même quand la source quitte le plateau", () => {
    // Différence assumée avec Discipline et Renforcement : leur condition lit
    // le PLATEAU, donc le mode mort les dégrade. Ici le compteur est un
    // historique du JOUEUR, il ne bouge pas quand la source meurt.
    const s = troupeDeDeux();
    const src = porteuse({ name: "Sacrifiée", mode: "death", health: 1 });
    src.espritDeCorpsCounted = true;
    s.players[0].board.push(src);
    s.players[0].espritDeCorpsPlayed = { [CLAN]: 3 };

    const bourreau = mkInstance(mkCard({ name: "Bourreau", mana_cost: 5, attack: 9, health: 9 }));
    s.players[1].board.push(bourreau);
    s.currentPlayerIndex = 1;

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: bourreau.instanceId, targetInstanceId: src.instanceId,
    });
    const morte = st.players[0].graveyard.find(c => c.card.name === "Sacrifiée")!;
    // 3 posées − elle-même = 2 points, gagnés en mourant (et emportés au
    // cimetière avec elle, comme Renforcement).
    expect((morte.card.attack ?? 0) - 2).toBeGreaterThanOrEqual(0);
    expect(((morte.card.attack ?? 0) - 2) + ((morte.card.health ?? 0) - 1)).toBe(2);
  });

  it("une instance en mode MORT ne se déclenche pas à la pose", () => {
    const s = troupeDeDeux();
    const st = applyAction(s, play(s, porteuse({ name: "Patiente", mode: "death" })));
    expect(gain(surPlateau(st, "Patiente"))).toBe(0);
    // …mais elle a bien grossi la troupe en arrivant.
    expect(compteur(st)).toBe(3);
  });
});

describe("la porteuse ne se compte jamais elle-même", () => {
  it("à l'entrée en jeu, la toute première gagne 0", () => {
    expect(gain(surPlateau(poseSuccessive(1).state, "Légionnaire 1"))).toBe(0);
  });

  it("à la FIN DE TOUR aussi, la toute première gagne 0", () => {
    // Le cas qui exige le drapeau : au moment du déclenchement tardif, le
    // compteur vaut déjà 1 — c'est elle. Sans le drapeau elle gagnerait 1.
    const s = mkState();
    const st0 = applyAction(s, play(s, porteuse({ name: "Solitaire", mode: "end_of_turn" })));
    expect(compteur(st0)).toBe(1);
    const st = applyAction(st0, { type: "end_turn" });
    expect(gain(surPlateau(st, "Solitaire"))).toBe(0);
    expect(st.rngState).toBe(st0.rngState); // et ne consomme aucun tirage
  });

  it("une porteuse MISE EN JEU (non comptée) ne se retranche pas", () => {
    // Symétrie du drapeau : arrivée par Appel du clan, elle n'a rien
    // incrémenté, donc elle profite du compteur en entier.
    const s = mkState();
    s.players[0].espritDeCorpsPlayed = { [CLAN]: 2 };
    const invoquee = porteuse({ name: "Invoquée" });
    expect(espritDeCorpsPoints(s.players[0], invoquee.card, invoquee)).toBe(2);
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
    let s = poseSuccessive(2).state;
    const src = porteuse({ name: "Increvable", mode: "end_of_turn" });
    src.espritDeCorpsCounted = true;
    s.players[0].board.push(src);
    s.players[0].espritDeCorpsPlayed = { [CLAN]: 3 };

    // `end_turn` alterne les joueurs : seule une fin de tour SUR DEUX est
    // celle du contrôleur, et c'est la seule qui déclenche.
    s = applyAction(s, { type: "end_turn" });
    expect(gain(surPlateau(s, "Increvable"))).toBe(2);
    s = applyAction(s, { type: "end_turn" }); // tour adverse : rien
    expect(gain(surPlateau(s, "Increvable"))).toBe(2);
    s = applyAction(s, { type: "end_turn" });
    s = applyAction(s, { type: "end_turn" });
    s = applyAction(s, { type: "end_turn" });
    expect(gain(surPlateau(s, "Increvable"))).toBe(6);
  });
});

describe("espritDeCorpsPoints — la source unique du moteur ET de l'affichage", () => {
  it("en main : le total complet, soit ce que la carte gagnera en arrivant", () => {
    const p = mkPlayer("P1");
    p.espritDeCorpsPlayed = { [CLAN]: 2 };
    const enMain = porteuse({ name: "En main" });
    expect(espritDeCorpsPoints(p, enMain.card, enMain)).toBe(2);
  });

  it("sur le plateau : un de moins, la carte s'étant comptée", () => {
    const p = mkPlayer("P1");
    p.espritDeCorpsPlayed = { [CLAN]: 2 };
    const posee = porteuse({ name: "Posée" });
    posee.espritDeCorpsCounted = true;
    expect(espritDeCorpsPoints(p, posee.card, posee)).toBe(1);
  });

  it("sans clan : zéro, quoi qu'il arrive", () => {
    const p = mkPlayer("P1");
    p.espritDeCorpsPlayed = { [CLAN]: 5 };
    expect(espritDeCorpsPoints(p, { clan: undefined })).toBe(0);
  });

  it("compteur absent (snapshot d'avant l'ajout du champ) : zéro, pas une erreur", () => {
    expect(espritDeCorpsPoints(mkPlayer("P1"), { clan: CLAN })).toBe(0);
  });

  it("ne descend jamais sous zéro", () => {
    const p = mkPlayer("P1");
    const orpheline = porteuse();
    orpheline.espritDeCorpsCounted = true;
    expect(espritDeCorpsPoints(p, orpheline.card, orpheline)).toBe(0);
  });
});

describe("la description affichée", () => {
  // Le clan doit être un clan RÉEL : `getClanForm` retombe sur son nom brut
  // pour un clan inventé, ce qui masquerait une régression de fléchissement.
  const CLAN_REEL = "Les Sylvains";
  const carte = { clan: CLAN_REEL };

  it("hors partie (forge, collection) : la forme générique, sans compteur", () => {
    const d = describeKeyword("esprit_de_corps", { card: carte })!;
    expect(d).toContain("des Sylvains");
    // « +1 » appartient à la phrase ; c'est le « N fois » du compteur qui doit
    // rester absent hors partie.
    expect(d).not.toContain("fois");
  });

  it("en partie : le TOTAL est écrit en toutes lettres, pas à calculer", () => {
    const d = describeKeyword("esprit_de_corps", { card: carte, espritCount: 2 })!;
    expect(d).toContain("2 fois");
    expect(d).toContain("des Sylvains");
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
    const { state } = poseSuccessive(3);
    const enJeu = surPlateau(state, "Légionnaire 3");
    const points = espritDeCorpsPoints(state.players[0], enJeu.card, enJeu);
    expect(points).toBe(gain(enJeu));
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
    const s = raz(poseSuccessive(2).state);
    const src = porteuse({ name: "Vétérane", mode: "end_of_turn" });
    src.espritDeCorpsCounted = true;
    s.players[0].board.push(src);
    s.players[0].espritDeCorpsPlayed = { [CLAN]: 3 };
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
