// Déclencheur « SOUS 15 PV » (mode "low_hp" / trigger on_low_hp).
//
// Sémantique retenue : la capacité appartient à une carte EN JEU et part quand
// son CONTRÔLEUR passe strictement sous LOW_HP_TRIGGER_THRESHOLD PV — une
// seule fois par instance, jamais réarmée (même resoignée au-dessus du seuil).
// Une carte posée alors que son contrôleur est déjà sous le seuil part
// immédiatement. Toute baisse de PV compte (dégâts, coût en vie, fatigue).
//
// Deux propriétés structurantes sont verrouillées ici :
//   1. le déclenchement est un BALAYAGE idempotent (flag one-shot par
//      instance), pas une détection de front — d'où l'arrivée en jeu sous le
//      seuil qui déclenche, et l'absence de re-fire tant que le flag est posé ;
//   2. le ciblage suit la règle commune : tour du contrôleur → choix différé,
//      tour adverse → cible aléatoire (rng semée), sans jamais bloquer.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { LOW_HP_TRIGGER_THRESHOLD } from "./constants";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, GameState } from "./types";

/** Capacité COMPOSÉE déclenchée sous 15 PV. */
function capLowHp(composed: ComposedEffect): Capability {
  return { uid: "c0", trigger: "on_low_hp", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** Créature dont l'effet composé part quand son contrôleur passe sous 15 PV :
 *  3 dégâts au héros ENNEMI (aucun choix requis → résolution silencieuse). */
function sentinelle(nom = "Sentinelle") {
  return mkInstance(mkCard({
    name: nom, mana_cost: 3, attack: 2, health: 2,
    capabilities: [capLowHp({ content: "deal_damage", magnitude: { x: 3 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } })],
  }));
}

/** Sort infligeant `x` dégâts au héros ennemi (l'outil de mise sous le seuil). */
function sortDegats(x: number, nom = "Éclair") {
  return mkInstance(mkCard({
    name: nom, card_type: "spell", mana_cost: 1, attack: null, health: null,
    capabilities: [{ uid: "s0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [], composed: { content: "deal_damage", magnitude: { x }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } } }],
  }));
}

function lance(s: GameState, instanceId: string): GameState {
  return applyAction(s, { type: "play_card", cardInstanceId: instanceId });
}

describe("sous 15 PV — franchissement du seuil", () => {
  it("part quand le contrôleur passe de 16 à 14 (dégâts adverses), résolution auto sans pause", () => {
    const s = mkState();
    s.players[1].hero.hp = 16;
    s.players[1].board = [sentinelle()];
    const sort = sortDegats(2);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].hero.hp).toBe(14);
    // La Sentinelle de P2 a rendu 3 dégâts au héros de P1.
    expect(st.players[0].hero.hp).toBe(30 - 3);
    expect(st.players[1].board[0].lowHpTriggerFired).toBe(true);
    // Tour de P1, carte de P2 → jamais de pause (ni pile suspendue ni pending).
    expect(st.pendingTriggers ?? []).toEqual([]);
    expect(st.effectStack ?? []).toEqual([]);
  });

  it("15 PV exactement ne déclenche PAS (« < » strict) ; 14 déclenche", () => {
    const s = mkState();
    s.players[1].hero.hp = LOW_HP_TRIGGER_THRESHOLD + 1; // 16
    s.players[1].board = [sentinelle()];
    const a = sortDegats(1, "A"), b = sortDegats(1, "B");
    s.players[0].hand = [a, b];

    let st = lance(s, a.instanceId); // 16 → 15
    expect(st.players[1].hero.hp).toBe(15);
    expect(st.players[0].hero.hp).toBe(30);
    expect(st.players[1].board[0].lowHpTriggerFired ?? false).toBe(false);

    st = lance(st, st.players[0].hand[0].instanceId); // 15 → 14
    expect(st.players[1].hero.hp).toBe(14);
    expect(st.players[0].hero.hp).toBe(27);
    expect(st.players[1].board[0].lowHpTriggerFired).toBe(true);
  });

  it("l'armure qui absorbe tout ne déclenche rien (les PV n'ont pas bougé)", () => {
    const s = mkState();
    s.players[1].hero.hp = 16;
    s.players[1].hero.armor = 5;
    s.players[1].board = [sentinelle()];
    const sort = sortDegats(4);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].hero.hp).toBe(16);
    expect(st.players[0].hero.hp).toBe(30);
    expect(st.players[1].board[0].lowHpTriggerFired ?? false).toBe(false);
  });

  it("la fatigue (pioche à vide) peut faire franchir le seuil", () => {
    const s = mkState();
    s.players[1].hero.hp = LOW_HP_TRIGGER_THRESHOLD; // 15 — la fatigue mord 1
    s.players[1].deck = [];
    s.players[1].board = [sentinelle()];

    const st = applyAction(s, { type: "end_turn" }); // P2 pioche à vide

    expect(st.players[1].hero.hp).toBe(14);
    expect(st.players[0].hero.hp).toBe(27);
    expect(st.players[1].board[0].lowHpTriggerFired).toBe(true);
  });
});

describe("sous 15 PV — one-shot", () => {
  it("jamais réarmé : soigné au-dessus du seuil puis re-blessé, l'effet ne repart pas", () => {
    const s = mkState();
    s.players[1].hero.hp = 16;
    s.players[1].board = [sentinelle()];
    const a = sortDegats(2, "A"), b = sortDegats(6, "B");
    s.players[0].hand = [a, b];

    let st = lance(s, a.instanceId); // 16 → 14 : déclenche
    expect(st.players[0].hero.hp).toBe(27);

    st.players[1].hero.hp = 20; // soin hors-bande (l'action suivante clone l'état)
    st = lance(st, st.players[0].hand[0].instanceId); // 20 → 14 : rien

    expect(st.players[1].hero.hp).toBe(14);
    expect(st.players[0].hero.hp).toBe(27); // pas de second tir
    expect(st.players[1].board[0].lowHpTriggerFired).toBe(true);
  });

  it("un simple état durable sous le seuil ne re-déclenche pas au fil des actions", () => {
    // Le balayage tourne à CHAQUE action : sans flag, une Sentinelle repartirait
    // à chaque end_turn tant que le héros reste sous 15.
    const s = mkState();
    s.players[1].hero.hp = 10;
    s.players[1].deck = [mkInstance(mkCard({ name: "X" })), mkInstance(mkCard({ name: "Y" }))];
    s.players[0].deck = [mkInstance(mkCard({ name: "Z" }))];
    s.players[1].board = [sentinelle()];

    let st = applyAction(s, { type: "end_turn" }); // déclenche (P2 déjà sous 15)
    expect(st.players[0].hero.hp).toBe(27);
    st = applyAction(st, { type: "end_turn" });
    st = applyAction(st, { type: "end_turn" });
    expect(st.players[0].hero.hp).toBe(27); // toujours un seul tir
  });
});

describe("sous 15 PV — arrivée en jeu et coût en vie", () => {
  it("posée alors que le contrôleur est DÉJÀ sous 15 → part immédiatement", () => {
    const s = mkState();
    s.players[0].hero.hp = 10;
    const carte = sentinelle();
    s.players[0].hand = [carte];

    const st = lance(s, carte.instanceId);

    expect(st.players[1].hero.hp).toBe(27);
    expect(st.players[0].board[0].lowHpTriggerFired).toBe(true);
  });

  it("posée au-dessus du seuil → rien (le on_play n'existe pas pour on_low_hp)", () => {
    const s = mkState();
    const carte = sentinelle();
    s.players[0].hand = [carte];

    const st = lance(s, carte.instanceId);

    expect(st.players[1].hero.hp).toBe(30);
    expect(st.players[0].board[0].lowHpTriggerFired ?? false).toBe(false);
  });

  it("un COÛT EN VIE qui fait franchir le seuil déclenche — y compris la carte payée elle-même", () => {
    const s = mkState();
    s.players[0].hero.hp = 16;
    const carte = sentinelle();
    carte.card = { ...carte.card, life_cost: 2 };
    s.players[0].hand = [carte];

    const st = lance(s, carte.instanceId);

    expect(st.players[0].hero.hp).toBe(14);
    expect(st.players[1].hero.hp).toBe(27); // la carte fraîchement posée a tiré
    expect(st.players[0].board[0].lowHpTriggerFired).toBe(true);
  });
});

describe("sous 15 PV — ciblage", () => {
  const choixCible = () => capLowHp({ content: "deal_damage", magnitude: { x: 2 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" } });

  it("tour du CONTRÔLEUR : un effet « au choix » suspend la pile (choix au joueur)", () => {
    const s = mkState();
    s.players[0].hero.hp = 16;
    s.players[0].board = [mkInstance(mkCard({ name: "Choisisseuse", capabilities: [choixCible()] }))];
    s.players[1].board = [mkInstance(mkCard({ name: "CibleA", attack: 1, health: 9 })), mkInstance(mkCard({ name: "CibleB", attack: 1, health: 9 }))];
    const carte = mkInstance(mkCard({ name: "Payeuse", life_cost: 2, attack: 1, health: 1 }));
    s.players[0].hand = [carte];

    const st = lance(s, carte.instanceId); // 16 → 14 pendant le tour de P1

    // La pile est suspendue en attente du choix — rien n'a encore frappé.
    expect(st.effectStack?.some(f => f.awaitingChoice && f.trigger === "on_low_hp")).toBe(true);
    expect(st.players[1].board.every(c => c.currentHealth === 9)).toBe(true);
  });

  it("tour ADVERSE : le même effet « au choix » se résout seul, cible aléatoire", () => {
    const s = mkState();
    initRNG(42);
    s.players[1].hero.hp = 16;
    s.players[1].board = [mkInstance(mkCard({ name: "Choisisseuse", capabilities: [choixCible()] }))];
    s.players[0].board = [mkInstance(mkCard({ name: "CibleA", attack: 1, health: 9 })), mkInstance(mkCard({ name: "CibleB", attack: 1, health: 9 }))];
    const sort = sortDegats(2);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.effectStack ?? []).toEqual([]);
    expect(st.pendingTriggers ?? []).toEqual([]);
    // Exactement une des deux unités de P1 a pris les 2 dégâts.
    const degats = st.players[0].board.map(c => 9 - c.currentHealth);
    expect(degats.filter(d => d === 2)).toHaveLength(1);
    expect(degats.filter(d => d === 0)).toHaveLength(1);
  });

  it("est DÉTERMINISTE : même graine ⇒ même cible", () => {
    // Garantie anti-désync : les deux clients rejouent la même résolution.
    // (Comparaison par valeurs extraites — les instanceIds du harnais de test
    // sont issus d'un compteur global, un syncHash différerait toujours.)
    const resoudre = () => {
      const s = mkState();
      initRNG(1234);
      s.players[1].hero.hp = 16;
      s.players[1].board = [mkInstance(mkCard({ name: "Choisisseuse", capabilities: [choixCible()] }))];
      s.players[0].board = [mkInstance(mkCard({ name: "A", attack: 1, health: 9 })), mkInstance(mkCard({ name: "B", attack: 1, health: 9 }))];
      const sort = sortDegats(2);
      s.players[0].hand = [sort];
      const st = lance(s, sort.instanceId);
      return st.players[0].board.map(c => c.currentHealth).join("/");
    };
    expect(resoudre()).toBe(resoudre());
  });
});

describe("sous 15 PV — plateau multiple et cascades", () => {
  it("deux cartes déclenchables → les deux partent (une fois chacune)", () => {
    const s = mkState();
    s.players[1].hero.hp = 16;
    s.players[1].board = [sentinelle("S1"), sentinelle("S2")];
    const sort = sortDegats(2);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[0].hero.hp).toBe(30 - 3 - 3);
    expect(st.players[1].board.every(c => c.lowHpTriggerFired)).toBe(true);
  });

  it("un effet qui blesse son PROPRE héros ne se re-déclenche pas et termine", () => {
    // Auto-morsure : l'effet inflige 2 au héros allié — sans flag posé AVANT
    // résolution, le balayage de drainStack relancerait l'effet sans fin.
    const s = mkState();
    s.players[1].hero.hp = 16;
    s.players[1].board = [mkInstance(mkCard({
      name: "Masochiste",
      capabilities: [capLowHp({ content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", count: 1, side: "ally", location: "board", designation: "random" } })],
    }))];
    const sort = sortDegats(2);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].hero.hp).toBe(16 - 2 - 2); // sort + une seule morsure
    expect(st.players[1].board[0].lowHpTriggerFired).toBe(true);
  });

  it("en cascade, la carte de l'AUTRE camp déclenchée par l'effet part aussi", () => {
    // La Sentinelle de P2 rend 3 dégâts à P1 (17 → 14)… ce qui déclenche la
    // Sentinelle de P1 : le balayage de drainStack couvre les DEUX camps.
    const s = mkState();
    s.players[0].hero.hp = 17;
    s.players[0].board = [sentinelle("Riposte")];
    s.players[1].hero.hp = 16;
    s.players[1].board = [sentinelle("Première")];
    const sort = sortDegats(2);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    // P2 : 16−2 (sort) −3 (Riposte de P1) = 11 ; P1 : 17−3 (Première) = 14.
    expect(st.players[0].hero.hp).toBe(14);
    expect(st.players[1].hero.hp).toBe(11);
    expect(st.players[0].board[0].lowHpTriggerFired).toBe(true);
    expect(st.players[1].board[0].lowHpTriggerFired).toBe(true);
  });
});

describe("sous 15 PV — mort du héros et fin de partie", () => {
  it("un héros tué net (au-dessus → ≤ 0) ne déclenche RIEN : la partie est finie", () => {
    const s = mkState();
    s.players[1].hero.hp = 18;
    s.players[1].board = [sentinelle()];
    const sort = sortDegats(20);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.winner).toBe("P1");
    expect(st.players[0].hero.hp).toBe(30); // pas de « dernier souffle »
    expect(st.players[1].board[0].lowHpTriggerFired ?? false).toBe(false);
  });

  it("un effet sous 15 PV qui tue le héros adverse donne bien la victoire", () => {
    // L'effet part APRÈS le handler (drainStack final d'applyAction) : la
    // vérification de victoire doit être rejouée après le drain.
    const s = mkState();
    s.players[1].hero.hp = 16;
    s.players[1].board = [sentinelle()];
    s.players[0].hero.hp = 3; // les 3 dégâts de la Sentinelle sont létaux
    const sort = sortDegats(2);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[0].hero.hp).toBe(0);
    expect(st.winner).toBe("P2");
    expect(st.phase).toBe("finished");
  });
});

describe("sous 15 PV — synchro", () => {
  it("le flag one-shot entre dans le hash de synchro", () => {
    const a = mkState();
    a.players[0].board = [sentinelle()];
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    b.players[0].board[0].lowHpTriggerFired = true;
    expect(syncHash(a)).not.toBe(syncHash(b));
  });
});
