// state.sequentialHits : chaque point de dégât/soin SÉQUENTIEL (scatter, Tempête)
// est enregistré un à un, dans l'ordre, pour que le store anime un popup + un
// burst VFX par point. On vérifie la couche moteur (RNG seedé via state.rngState,
// rejouée à l'identique par applyAction). La couche store/animation (traduction
// sentinel, delayMs, scheduling) dépend du DOM/setTimeout → vérif manuelle.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction } from "./types";

// Sort à effet composé "scatter" (deal_damage ou heal) ciblant un côté/entité.
function scatterSpell(points: number, content: "deal_damage" | "heal", side: "enemy" | "ally", entity: "unit" | "hero") {
  const caps = [{
    uid: "sk_0", trigger: "spell_resolution", abilityId: "_composed", effectKind: "immediate",
    composed: {
      target: { side, count: 1, entity, location: "board", designation: "scatter" },
      content, magnitude: { x: points },
    },
  }];
  return mkInstance(mkCard({
    name: "Scatter", mana_cost: 1, card_type: "spell", attack: null, health: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    capabilities: caps as any,
  }));
}

function play(s: ReturnType<typeof mkState>, spell: ReturnType<typeof mkInstance>): GameAction {
  s.players[0].hand.push(spell);
  return { type: "play_card", cardInstanceId: spell.instanceId };
}

describe("sequentialHits — scatter (effets composés point par point)", () => {
  it("un point par dégât, dans l'ordre ; la somme par cible = PV perdus", () => {
    const s = mkState();
    s.rngState = 12345;
    // 3 ennemis assez gros pour qu'aucun ne meure (pas de redistribution).
    const enemies = [10, 10, 10].map((hp, i) =>
      mkInstance(mkCard({ name: `E${i}`, attack: 0, health: hp })));
    enemies.forEach((e) => s.players[1].board.push(e));
    const spell = scatterSpell(5, "deal_damage", "enemy", "unit");

    const next = applyAction(s, play(s, spell));

    expect(next.sequentialHits).toBeDefined();
    expect(next.sequentialHits!.length).toBe(5);
    expect(next.sequentialHits!.every((h) => h.type === "damage")).toBe(true);
    // Chaque entrée vise un ennemi valide.
    const ids = new Set(enemies.map((e) => e.instanceId));
    expect(next.sequentialHits!.every((h) => ids.has(h.targetInstanceId))).toBe(true);
    // Croisement fort : nb de points par cible == PV réellement perdus.
    for (const e of enemies) {
      const hits = next.sequentialHits!.filter((h) => h.targetInstanceId === e.instanceId).length;
      const after = next.players[1].board.find((c) => c.instanceId === e.instanceId)!;
      expect(10 - after.currentHealth).toBe(hits);
    }
  });

  it("déterministe : même seed → même séquence de points", () => {
    const build = () => {
      const s = mkState();
      s.rngState = 999;
      [5, 5, 5].forEach((hp, i) => s.players[1].board.push(mkInstance(mkCard({ name: `E${i}`, attack: 0, health: hp }))));
      return s;
    };
    const sA = build();
    const a = applyAction(sA, play(sA, scatterSpell(4, "deal_damage", "enemy", "unit")));
    // Rejoue sur un état frais identique (même seed) avec un sort équivalent.
    const s2 = build();
    // Aligne les instanceId des ennemis pour comparer les cibles.
    s2.players[1].board.forEach((e, i) => { e.instanceId = a.players[1].board[i].instanceId; });
    const b = applyAction(s2, play(s2, scatterSpell(4, "deal_damage", "enemy", "unit")));
    expect(b.sequentialHits).toEqual(a.sequentialHits);
  });

  it("cible tuée en cours de boucle : retirée du pool, pas de point gaspillé dessus", () => {
    const s = mkState();
    s.rngState = 7;
    // Une cible 1 PV + une grosse : la 1 PV ne peut recevoir qu'UN point.
    const fragile = mkInstance(mkCard({ name: "Fragile", attack: 0, health: 1 }));
    const tank = mkInstance(mkCard({ name: "Tank", attack: 0, health: 20 }));
    s.players[1].board.push(fragile, tank);
    const next = applyAction(s, play(s, scatterSpell(6, "deal_damage", "enemy", "unit")));

    const fragileHits = next.sequentialHits!.filter((h) => h.targetInstanceId === fragile.instanceId).length;
    expect(fragileHits).toBeLessThanOrEqual(1); // jamais frappée après sa mort
    // Tous les points sont placés (aucune cible vivante restante → pas de break tant que tank vit).
    expect(next.sequentialHits!.length).toBe(6);
  });

  it("scatter de SOIN : type 'heal'", () => {
    const s = mkState();
    s.rngState = 42;
    const ally = mkInstance(mkCard({ name: "Allié", attack: 1, health: 10 }));
    ally.currentHealth = 3;
    s.players[0].board.push(ally);
    const next = applyAction(s, play(s, scatterSpell(2, "heal", "ally", "unit")));
    expect(next.sequentialHits!.length).toBe(2);
    expect(next.sequentialHits!.every((h) => h.type === "heal")).toBe(true);
  });

  it("scatter sur le HÉROS ennemi : sentinel __hero_<idx>__ avec le bon index", () => {
    const s = mkState();
    s.rngState = 3;
    // Board ennemi vide + entity hero → tous les points vont au héros (index 1).
    const next = applyAction(s, play(s, scatterSpell(3, "deal_damage", "enemy", "hero")));
    expect(next.sequentialHits!.length).toBe(3);
    expect(next.sequentialHits!.every((h) => h.targetInstanceId === "__hero_1__")).toBe(true);
  });
});

describe("sequentialHits — Tempête (sort)", () => {
  function tempeteSpell(amount: number) {
    return mkInstance(mkCard({
      name: "Tempête", mana_cost: 1, card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "tempete", amount }],
    }));
  }

  it("un point par drop, tous 'damage', sur le board ennemi", () => {
    const s = mkState();
    s.rngState = 555;
    [8, 8].forEach((hp, i) => s.players[1].board.push(mkInstance(mkCard({ name: `E${i}`, attack: 0, health: hp }))));
    const next = applyAction(s, play(s, tempeteSpell(4)));
    expect(next.sequentialHits!.length).toBe(4);
    expect(next.sequentialHits!.every((h) => h.type === "damage")).toBe(true);
  });

  it("plafonne quand le board ennemi se vide", () => {
    const s = mkState();
    s.rngState = 1;
    // Un seul ennemi 2 PV, 10 points demandés → 2 points puis board vide → break.
    s.players[1].board.push(mkInstance(mkCard({ name: "Solo", attack: 0, health: 2 })));
    const next = applyAction(s, play(s, tempeteSpell(10)));
    expect(next.sequentialHits!.length).toBe(2);
  });
});

describe("sequentialHits — exclu du hash d'état", () => {
  it("deux états ne différant que par sequentialHits hashent identique", () => {
    const a = mkState();
    const b = mkState();
    b.sequentialHits = [{ targetInstanceId: "x", type: "damage" }];
    expect(syncHash(a)).toBe(syncHash(b));
  });
});
