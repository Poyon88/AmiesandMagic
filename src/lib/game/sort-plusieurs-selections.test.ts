// Sort à PLUSIEURS Sélections (« Sentence des Trois Vérités » : Silence ·
// Sélection 3 · Sélection magique 3) : une carte PAR Sélection, chacune lue
// dans son créneau `<mot-clé>_0`. Le résolveur retombait sur `selection_0`
// pour la Sélection magique ⇒ la carte choisie arrivait deux fois.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState } from "./types";

function preparer(spellKeywords: { id: string; amount?: number }[]) {
  const s: GameState = mkState();
  initRNG(7);
  const creature = mkCard({ id: 501, name: "Créature offerte", mana_cost: 2 });
  const action = mkCard({ id: 502, name: "Action offerte", card_type: "spell", mana_cost: 2 });
  s.factionCardPool = [creature];
  s.allSpellsPool = [action];
  const sort = mkInstance(mkCard({
    id: 900, name: "Sort test", card_type: "spell", mana_cost: 1,
    spell_keywords: spellKeywords as never,
  }));
  s.players[0].hand = [sort];
  return { s, sort };
}

describe("sort à plusieurs Sélections", () => {
  it("donne UNE carte par Sélection, chacune depuis son créneau", () => {
    const { s, sort } = preparer([{ id: "selection", amount: 3 }, { id: "selection_magique", amount: 3 }]);
    const next = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId,
      targetMap: { selection_0: "501", selection_magique_0: "502" },
    });
    expect(next.players[0].hand.map((c) => c.card.id).sort()).toEqual([501, 502]);
  });

  it("ne rejoue pas le choix d'une Sélection pour une autre que le sort porte", () => {
    const { s, sort } = preparer([{ id: "selection", amount: 3 }, { id: "selection_magique", amount: 3 }]);
    const next = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId,
      targetMap: { selection_0: "501" },
    });
    expect(next.players[0].hand.map((c) => c.card.id)).toEqual([501]);
  });

  it("ancien client : `selection_0` reste lu pour une Sélection magique seule", () => {
    const { s, sort } = preparer([{ id: "selection_magique", amount: 3 }]);
    const next = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId,
      targetMap: { selection_0: "502" },
    });
    expect(next.players[0].hand.map((c) => c.card.id)).toEqual([502]);
  });
});
