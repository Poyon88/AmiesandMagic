// EXHUMATION composée sur le cimetière choisi. Arbitrages de l'auteur
// (2026-11-07) : l'unité revient sous le contrôle du lanceur, retourne dans le
// cimetière adverse à sa mort, et garde ses bonus permanents.
import { describe, expect, it } from "vitest";
import { applyAction, getComposedGraveyardTargets, getSpellSlotTargets, getSpellTargetSlots } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, GameAction, GameState, TargetSpec } from "./types";

const cible = (t: Partial<TargetSpec> = {}): TargetSpec =>
  ({ entity: "unit", count: 1, side: "enemy", location: "graveyard", designation: "choice", ...t }) as TargetSpec;
const effet = (t: Partial<TargetSpec> = {}, x?: number): ComposedEffect =>
  ({ content: "exhumation", magnitude: x == null ? {} : { x }, target: cible(t) });
const cap = (composed: ComposedEffect): Capability =>
  ({ uid: "e0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [], composed });
const sort = (composed: ComposedEffect) => mkCard({
  name: "Sort", card_type: "spell", mana_cost: 0, attack: null, health: null, capabilities: [cap(composed)],
});
const morte = (name: string, extra: Record<string, unknown> = {}) =>
  mkInstance(mkCard({ name, mana_cost: 3, attack: 2, health: 4, ...extra }));

function etat(miennes: CardInstance[], siennes: CardInstance[]): GameState {
  const s = mkState();
  s.players[0].graveyard = miennes;
  s.players[1].graveyard = siennes;
  return s;
}
function lancer(s: GameState, card: ReturnType<typeof sort>, targetMap?: Record<string, string>): GameState {
  const i = mkInstance(card);
  s.players[0].hand.push(i);
  return applyAction(s, { type: "play_card", cardInstanceId: i.instanceId, targetMap } as GameAction);
}
const noms = (l: CardInstance[]) => l.map((c) => c.card.name).sort();

describe("cimetière visé", () => {
  it("Ennemi au choix : la créature désignée passe sur mon plateau", () => {
    const b = morte("B");
    const st = lancer(etat([morte("Mienne")], [morte("A"), b]), sort(effet()), { "e0#0": b.instanceId });
    expect(noms(st.players[0].board)).toEqual(["B"]);
    expect(noms(st.players[1].graveyard)).toEqual(["A"]);
    expect(noms(st.players[0].graveyard)).toContain("Mienne");
  });

  it("N au choix : le créneau est ouvert et propose le seul cimetière ennemi", () => {
    const b = morte("B");
    const s = etat([morte("Mienne")], [b]);
    const card = sort(effet({ count: 2 }));
    const slots = getSpellTargetSlots(card);
    expect(slots).toHaveLength(2);
    expect(getSpellSlotTargets(s, card, slots[0])).toEqual([b.instanceId]);
  });

  it("Indifférent : les deux cimetières sont proposés", () => {
    const a = morte("A");
    const b = morte("B");
    const s = etat([a], [b]);
    expect(getComposedGraveyardTargets(s, sort(effet({ side: "any" })), "e0").sort()).toEqual([a.instanceId, b.instanceId].sort());
  });

  it("Allié : mon cimetière seulement, comme avant", () => {
    const st = lancer(etat([morte("Mienne")], [morte("A")]), sort(effet({ side: "ally", designation: "automatic" })));
    expect(noms(st.players[0].board)).toEqual(["Mienne"]);
    expect(noms(st.players[1].graveyard)).toEqual(["A"]);
  });
});

describe("filtres et désignation", () => {
  it("race, mot-clé et coût max s'appliquent au sélecteur et à la résolution", () => {
    const elfe = morte("Elfe", { race: "Elfes" });
    const nain = morte("Nain", { race: "Nains" });
    const c = sort(effet({ membership: { race: ["Elfes"] } }));
    expect(getComposedGraveyardTargets(etat([], [elfe, nain]), c, "e0")).toEqual([elfe.instanceId]);
    const st = lancer(etat([], [elfe, nain]), c, { "e0#0": nain.instanceId });
    expect(noms(st.players[0].board)).toEqual(["Elfe"]);
    const chere = sort(effet({ maxCost: 2, count: "all", designation: "automatic" }));
    expect(lancer(etat([], [morte("C")]), chere).players[0].board).toHaveLength(0);
  });

  it("X reste un plafond, et « tout coût » propose vraiment tout coût", () => {
    const d = morte("Dragon", { mana_cost: 8 });
    expect(getComposedGraveyardTargets(etat([], [d]), sort(effet()), "e0")).toEqual([d.instanceId]);
    expect(getComposedGraveyardTargets(etat([], [d]), sort(effet({}, 5)), "e0")).toEqual([]);
  });

  it("au hasard : un tirage, pas systématiquement la plus chère", () => {
    const vues = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const s = etat([], [morte("Chere", { mana_cost: 9 }), morte("Petite", { mana_cost: 1 })]);
      s.rngState = i + 1;
      const st = lancer(s, sort(effet({ designation: "random" })));
      vues.add(st.players[0].board[0].card.name);
    }
    expect(vues.size).toBe(2);
  });

  it("automatique N : les plus chères d'abord, dans la limite des places", () => {
    const s = etat([], [morte("Une", { mana_cost: 1 }), morte("Neuf", { mana_cost: 9 }), morte("Cinq", { mana_cost: 5 })]);
    for (let i = 0; i < 7; i++) s.players[0].board.push(morte(`O${i}`));
    const st = lancer(s, sort(effet({ count: 2, designation: "automatic" })));
    expect(noms(st.players[0].board.slice(7))).toEqual(["Neuf"]);
    expect(st.players[1].graveyard).toHaveLength(2);
  });

  it("les actions du cimetière ne sont jamais ressuscitées", () => {
    const action = mkInstance(mkCard({ name: "Action", card_type: "spell", attack: null, health: null }));
    const st = lancer(etat([], [action]), sort(effet({ count: "all", designation: "automatic" })));
    expect(st.players[0].board).toHaveLength(0);
  });
});

describe("après la résurrection", () => {
  it("contrôle mien, bonus permanents gardés", () => {
    const a = morte("A");
    a.devorationATKBonus = 5;
    const st = lancer(etat([], [a]), sort(effet()), { "e0#0": a.instanceId });
    const u = st.players[0].board[0];
    expect(u.currentAttack).toBe(7);
    expect(u.trueOwnerId).toBe(st.players[1].id);
    expect(u.hasSummoningSickness).toBe(true);
  });

  it("à sa mort, elle retourne dans le cimetière adverse, et le marqueur disparaît", () => {
    const a = morte("A");
    let st = lancer(etat([], [a]), sort(effet()), { "e0#0": a.instanceId });
    st = lancer(st, sort({ content: "destroy", target: { ...cible({ side: "ally", location: "board", designation: "automatic", count: "all" }) } }));
    expect(st.players[0].board).toHaveLength(0);
    expect(noms(st.players[1].graveyard)).toEqual(["A"]);
    expect(st.players[1].graveyard[0].trueOwnerId).toBeNull();
    expect(noms(st.players[0].graveyard)).not.toContain("A");
  });

  it("ma propre créature ressuscitée meurt dans mon cimetière", () => {
    let st = lancer(etat([morte("Mienne")], []), sort(effet({ side: "ally", designation: "automatic" })));
    st = lancer(st, sort({ content: "destroy", target: cible({ side: "ally", location: "board", designation: "automatic", count: "all" }) }));
    expect(noms(st.players[0].graveyard)).toContain("Mienne");
  });
});

describe("texte", () => {
  it("affiche le coût max", () => {
    expect(describeComposedCap(cap(effet({ maxCost: 4 })))).toContain("4");
  });

  it("annonce le cimetière et le contrôle", () => {
    const e = describeComposedCap(cap(effet()));
    expect(e).toContain("sous votre contrôle");
    expect(e).toContain("cimetière adverse");
    expect(describeComposedCap(cap(effet({ side: "any" })))).toContain("n'importe quel cimetière");
    expect(describeComposedCap(cap(effet({ side: "ally" })))).toContain("votre cimetière");
  });
});
