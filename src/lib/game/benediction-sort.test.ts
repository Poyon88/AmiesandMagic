// Bénédiction en forme SORT : soigne complètement une créature alliée ciblée
// (PV au maximum, poison retiré) — même effet que la capacité de créature.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { getSpellKeywordDesc, spellKeywordNeedsTarget, getSpellKeywordTargetType } from "./spell-keywords";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, SpellKeywordInstance } from "./types";

const sort = () => mkInstance(mkCard({
  name: "Prière de l'Aube", card_type: "spell", attack: null, health: null, mana_cost: 0,
  spell_keywords: [{ id: "benediction" } as SpellKeywordInstance],
}));

describe("Bénédiction — forme sort", () => {
  it("demande une créature alliée", () => {
    expect(spellKeywordNeedsTarget("benediction")).toBe(true);
    expect(getSpellKeywordTargetType("benediction")).toBe("friendly_creature");
    expect(getSpellKeywordDesc({ id: "benediction" } as SpellKeywordInstance)).toMatch(/Soigne complètement/);
  });

  it("remet la cible à ses PV max et retire le poison", () => {
    const s = mkState();
    const blesse = mkInstance(mkCard({ name: "Blessé", attack: 2, health: 6 }));
    blesse.currentHealth = 1;
    blesse.isPoisoned = true;
    s.players[0].board.push(blesse);
    const p = sort();
    s.players[0].hand.push(p);
    const st = applyAction(s, {
      type: "play_card", cardInstanceId: p.instanceId, targetInstanceId: blesse.instanceId,
      targetMap: { kw_0: blesse.instanceId },
    } as GameAction);
    const apres = st.players[0].board.find(c => c.card.name === "Blessé")!;
    expect(apres.currentHealth).toBe(6);
    expect(apres.isPoisoned).toBe(false);
  });
});
