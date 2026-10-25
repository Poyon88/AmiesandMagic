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

  it("portée « toutes alliées » : soigne chaque unité alliée, jamais l'ennemie", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ name: "Allié A", attack: 2, health: 5 }));
    const b = mkInstance(mkCard({ name: "Allié B", attack: 2, health: 4 }));
    const e = mkInstance(mkCard({ name: "Ennemi", attack: 2, health: 5 }));
    a.currentHealth = 1; b.currentHealth = 2; b.isPoisoned = true; e.currentHealth = 1;
    s.players[0].board.push(a, b);
    s.players[1].board.push(e);
    const p = mkInstance(mkCard({
      name: "Lumière", card_type: "spell", attack: null, health: null, mana_cost: 0,
      spell_keywords: [{ id: "benediction", targetScope: "all_allies" } as SpellKeywordInstance],
    }));
    s.players[0].hand.push(p);
    const st = applyAction(s, { type: "play_card", cardInstanceId: p.instanceId } as GameAction);
    const pv = (i: 0 | 1, n: string) => st.players[i].board.find(c => c.card.name === n)!;
    expect(pv(0, "Allié A").currentHealth).toBe(5);
    expect(pv(0, "Allié B").currentHealth).toBe(4);
    expect(pv(0, "Allié B").isPoisoned).toBe(false);
    expect(pv(1, "Ennemi").currentHealth).toBe(1);
  });

  it("texte : unité, et « toutes les unités alliées » en portée toutes", () => {
    expect(getSpellKeywordDesc({ id: "benediction" } as SpellKeywordInstance))
      .toBe("Soigne complètement une unité alliée ciblée.");
    expect(getSpellKeywordDesc({ id: "benediction", targetScope: "all_allies" } as SpellKeywordInstance))
      .toBe("Soigne complètement toutes les unités alliées.");
  });
});
