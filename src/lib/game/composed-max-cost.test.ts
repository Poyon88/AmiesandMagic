// Plafond de COÛT des cibles d'un effet composé (`TargetSpec.maxCost`).
//
// Le bloc CIBLES savait filtrer par appartenance (race / clan / faction) mais
// pas par coût : « renvoie en main une créature de coût 3 ou moins » n'était pas
// exprimable. L'amplitude X, elle, ne sert à rien sur un `bounce` (le moteur
// l'ignore) — d'où un critère de cible à part entière, cumulatif avec
// l'appartenance, et pas un détournement de l'amplitude.
//
// Trois points sont gardés ici :
//   • le pool de RÉSOLUTION (composedTargetPool) applique le plafond ;
//   • `maxCost: 0` est un filtre LÉGITIME (les seules cartes à coût nul) et non
//     un « pas de plafond » — le test sur la fausseté du nombre est le piège ;
//   • le PICKER d'un sort composé n'offre plus que ce que la résolution
//     accepte, sans quoi le clic fizzlait en silence.
import { describe, expect, it } from "vitest";
import { applyAction, getSpellSlotTargets, getSpellTargetSlots } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, TargetSpec } from "./types";

const cap = (composed: ComposedEffect, trigger: Capability["trigger"] = "on_end_of_turn"): Capability =>
  ({ uid: "cx_0", trigger, effectKind: "immediate", abilityId: "_composed", composed });

/** Porteur dont la capacité part à la fin du tour de son contrôleur. */
function porteur(composed: ComposedEffect) {
  return mkInstance(mkCard({ name: "Porteur", mana_cost: 3, attack: 1, health: 5, capabilities: [cap(composed)] }));
}

/** P1 aligne trois unités de coûts 1 / 3 / 7. */
function plateauAdverse() {
  const s = mkState();
  const petite = mkInstance(mkCard({ name: "Petite", mana_cost: 1, attack: 1, health: 1 }));
  const moyenne = mkInstance(mkCard({ name: "Moyenne", mana_cost: 3, attack: 3, health: 3 }));
  const grosse = mkInstance(mkCard({ name: "Grosse", mana_cost: 7, attack: 7, health: 7 }));
  s.players[1].board.push(petite, moyenne, grosse);
  return { s, petite, moyenne, grosse };
}

const cible = (over: Partial<TargetSpec> = {}): TargetSpec => ({
  entity: "unit", side: "enemy", count: "all", location: "board", designation: "automatic", ...over,
});

describe("maxCost — pool de résolution", () => {
  it("ne renvoie en main que les unités de coût ≤ au plafond", () => {
    const { s, petite, moyenne, grosse } = plateauAdverse();
    s.players[0].board.push(porteur({ content: "bounce", target: cible({ maxCost: 3 }) }));

    const next = applyAction(s, { type: "end_turn" });
    const restants = next.players[1].board.map((c) => c.instanceId);

    expect(restants).toEqual([grosse.instanceId]);
    expect(next.players[1].hand.map((c) => c.instanceId).sort())
      .toEqual([petite.instanceId, moyenne.instanceId].sort());
  });

  it("plafond absent ⇒ aucun filtre (tout le plateau part)", () => {
    const { s } = plateauAdverse();
    s.players[0].board.push(porteur({ content: "bounce", target: cible() }));

    expect(applyAction(s, { type: "end_turn" }).players[1].board).toHaveLength(0);
  });

  it("maxCost 0 est un VRAI plafond, pas un « pas de plafond »", () => {
    const { s, moyenne, grosse } = plateauAdverse();
    const jeton = mkInstance(mkCard({ name: "Jeton", mana_cost: 0, attack: 1, health: 1 }));
    s.players[1].board.push(jeton);
    s.players[0].board.push(porteur({ content: "bounce", target: cible({ maxCost: 0 }) }));

    const next = applyAction(s, { type: "end_turn" });
    expect(next.players[1].hand.map((c) => c.instanceId)).toEqual([jeton.instanceId]);
    expect(next.players[1].board.map((c) => c.instanceId)).toContain(moyenne.instanceId);
    expect(next.players[1].board.map((c) => c.instanceId)).toContain(grosse.instanceId);
  });

  it("se cumule avec l'appartenance (ET logique)", () => {
    const { s } = plateauAdverse();
    const nain = mkInstance(mkCard({ name: "Nain", mana_cost: 2, attack: 1, health: 1, race: "Nains" }));
    s.players[1].board.push(nain);
    s.players[0].board.push(porteur({
      content: "bounce",
      target: cible({ maxCost: 3, membership: { race: ["Nains"] } }),
    }));

    const next = applyAction(s, { type: "end_turn" });
    // Le Nain satisfait les DEUX critères ; les autres échouent sur l'un ou l'autre.
    expect(next.players[1].hand.map((c) => c.instanceId)).toEqual([nain.instanceId]);
  });
});

describe("maxCost — picker d'un sort composé", () => {
  /** Sort « renvoie en main une créature ennemie au choix », plafonné. */
  function sort(maxCost?: number) {
    return mkCard({
      name: "Reflux",
      card_type: "spell",
      mana_cost: 2,
      attack: null,
      health: null,
      capabilities: [cap(
        { content: "bounce", target: cible({ count: 1, designation: "choice", maxCost }) },
        "spell_resolution",
      )],
    });
  }

  it("n'offre que les cibles que la résolution accepterait", () => {
    const { s, petite, moyenne, grosse } = plateauAdverse();
    const carte = sort(3);
    const creneau = getSpellTargetSlots(carte).find((sl) => sl.slot.startsWith("cx_0#"))!;

    const ids = getSpellSlotTargets(s, carte, creneau);
    expect(ids).toContain(petite.instanceId);
    expect(ids).toContain(moyenne.instanceId);
    expect(ids).not.toContain(grosse.instanceId);
  });

  it("sans plafond, le picker reste inchangé", () => {
    const { s, petite, moyenne, grosse } = plateauAdverse();
    const carte = sort();
    const creneau = getSpellTargetSlots(carte).find((sl) => sl.slot.startsWith("cx_0#"))!;

    expect(getSpellSlotTargets(s, carte, creneau).sort())
      .toEqual([petite.instanceId, moyenne.instanceId, grosse.instanceId].sort());
  });
});

describe("maxCost — texte de carte", () => {
  it("s'écrit dans la description de l'effet", () => {
    const texte = describeComposedCap(cap({
      content: "bounce",
      target: cible({ count: 1, designation: "choice", maxCost: 3 }),
    }));
    expect(texte).toContain("de coût 3 ou moins");
  });
});
