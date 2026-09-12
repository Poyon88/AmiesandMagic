// Divination — forme SORT : même modale de deck que Creuser et Présage, résolue
// pour le lanceur ; l'index désigné voyage dans deckChoiceIndices / le repli
// historique divinationChoiceIndex, converti en targetMap["divination_0"].
import { describe, expect, it } from "vitest";
import { applyAction, onPlayDeckPickers } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState, SpellKeywordInstance } from "./types";

function sortDivination() {
  return mkInstance(mkCard({
    name: "Lecture des runes", card_type: "spell", mana_cost: 1, attack: null, health: null,
    spell_keywords: [{ id: "divination" }] as SpellKeywordInstance[],
  }));
}
function etat(noms: string[], rngState = 12345): GameState {
  const s = mkState();
  s.players[0].deck = noms.map(n => mkInstance(mkCard({ name: n, mana_cost: 1, attack: 1, health: 1 })));
  s.rngState = rngState;
  return s;
}
const deckDe = (s: GameState) => s.players[0].deck.map(c => c.card.name);

describe("Divination — forme sort", () => {
  it("le client sait qu'un sort Divination ouvre la modale de deck", () => {
    expect(onPlayDeckPickers(sortDivination().card)).toEqual(["divination"]);
  });

  it("la carte désignée reste sur le dessus, les deux autres passent au fond", () => {
    const s = etat(["A", "B", "C", "D"]);
    const ci = sortDivination();
    s.players[0].hand.push(ci);
    const st = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, deckChoiceIndices: { divination: 2 } });
    expect(deckDe(st)).toEqual(["C", "D", "A", "B"]);
    expect(st.players[0].graveyard.map(c => c.card.name)).toContain("Lecture des runes");
  });

  it("accepte aussi le champ historique divinationChoiceIndex", () => {
    const s = etat(["A", "B", "C", "D"]);
    const ci = sortDivination();
    s.players[0].hand.push(ci);
    const st = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, divinationChoiceIndex: 1 });
    expect(deckDe(st)).toEqual(["B", "D", "A", "C"]);
  });

  it("sans index (sort RELANCÉ), désigne au hasard au lieu de toujours garder la première", () => {
    const sommets = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const s = etat(["A", "B", "C", "D"], seed);
      const ci = sortDivination();
      s.players[0].hand.push(ci);
      return deckDe(applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId }))[0];
    }));
    expect(sommets.size).toBeGreaterThan(1);
  });

  it("deck de 2 cartes : la désignée dessus, l'autre dessous ; deck vide : rien", () => {
    const s = etat(["A", "B"]);
    const ci = sortDivination();
    s.players[0].hand.push(ci);
    expect(deckDe(applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, deckChoiceIndices: { divination: 1 } }))).toEqual(["B", "A"]);
    const v = etat([]);
    const ci2 = sortDivination();
    v.players[0].hand.push(ci2);
    expect(deckDe(applyAction(v, { type: "play_card", cardInstanceId: ci2.instanceId }))).toEqual([]);
  });
});
