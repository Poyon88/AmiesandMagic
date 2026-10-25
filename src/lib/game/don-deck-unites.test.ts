// « Consécration des armes » : conférer Pureté +5/+5 aux unités d'un clan dans
// le DECK. Deux défauts corrigés le 2026-10-25 :
//   • hors plateau, la cible « Unité » ramenait aussi les ACTIONS du deck ;
//   • le Y d'un don sans instance (grantedKeywordY) n'était pas peint.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { valeursAffichees } from "./keyword-labels";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameAction, Keyword } from "./types";

const CLAN = "L'Ordre de l'Aube";

const consecration = () => mkInstance(mkCard({
  name: "Consécration", card_type: "spell", mana_cost: 0, keywords: [],
  capabilities: [{
    uid: "cx_0", trigger: "spell_resolution", abilityId: "_composed", effectKind: "immediate",
    composed: {
      content: "grant_keyword", grantAbilityId: "purete", magnitude: { x: 5, y: 5 },
      target: { side: "ally", count: "all", entity: "unit", location: "deck", membership: { clan: [CLAN] }, designation: "automatic" },
    },
  } as Capability],
}));

describe("Don composé vers le deck", () => {
  it("ne confère qu'aux créatures du clan, pas aux actions", () => {
    const s = mkState();
    const creature = mkInstance(mkCard({ name: "Sœur", attack: 1, health: 1, clan: CLAN }));
    const action = mkInstance(mkCard({ name: "Réprimande", card_type: "spell", clan: CLAN }));
    const horsClan = mkInstance(mkCard({ name: "Étrangère", attack: 1, health: 1, clan: "Autre" }));
    s.players[0].deck = [creature, action, horsClan];
    const sort = consecration();
    s.players[0].hand.push(sort);
    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
    const deck = st.players[0].deck;
    const sœur = deck.find(c => c.card.name === "Sœur")!;
    expect(sœur.card.keywords).toContain("purete");
    expect(sœur.grantedKeywordX.purete).toBe(5);
    expect(sœur.grantedKeywordY?.purete).toBe(5);
    expect(deck.find(c => c.card.name === "Réprimande")!.card.keywords).not.toContain("purete");
    expect(deck.find(c => c.card.name === "Étrangère")!.card.keywords).not.toContain("purete");
  });
});

describe("valeursAffichees", () => {
  const kw = "purete" as Keyword;
  it("un don sans instance peint X et Y conférés", () => {
    const v = valeursAffichees(kw, undefined, undefined, { purete: 5 }, { purete: 5 });
    expect(v.x).toBe(5);
    expect(v.instance?.y).toBe(5);
  });
  it("la valeur écrite sur la carte reste prioritaire", () => {
    const v = valeursAffichees(kw, 2, { id: kw, x: 2, y: 3 }, { purete: 5 }, { purete: 5 });
    expect(v.x).toBe(2);
    expect(v.instance?.y).toBe(3);
  });
});
