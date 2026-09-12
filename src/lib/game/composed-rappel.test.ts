// Rappel : (1) contenu COMPOSÉ « cimetière → main » avec filtre de nature
// (`target.cardKind` : unités / sorts) ; (2) forme SORT du mot-clé ouverte aux
// sorts du cimetière (elle ne proposait et ne rendait que des créatures).
import { describe, expect, it } from "vitest";
import { applyAction, getComposedGraveyardTargets, getSpellTargets, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameState, SpellKeywordInstance, TargetSpec } from "./types";

const unite = (name: string, cost = 1) => mkInstance(mkCard({ name, mana_cost: cost, attack: 1, health: 1 }));
const sort = (name: string, cost = 1) => mkInstance(mkCard({ name, mana_cost: cost, card_type: "spell", attack: null, health: null }));

function sortRappelCompose(target: Partial<TargetSpec> = {}): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "rappel", target: { entity: "unit", count: 1, side: "ally", location: "graveyard", designation: "choice", ...target } },
  }];
  return mkInstance(mkCard({ name: "Écho du passé", card_type: "spell", attack: null, health: null, capabilities: caps as never }));
}
function cimetiere(s: GameState, ...cartes: CardInstance[]) { s.players[0].graveyard.push(...cartes); return s; }
const main = (s: GameState) => s.players[0].hand.map(c => c.card.name).sort();
const noms = (s: GameState, ids: string[]) => ids.map(id => s.players[0].graveyard.find(c => c.instanceId === id)!.card.name).sort();

describe("Rappel composé", () => {
  it("le picker propose sorts ET unités sans filtre, et filtre par nature", () => {
    const s = cimetiere(mkState(), unite("Garde"), sort("Éclair"));
    const tout = sortRappelCompose();
    expect(noms(s, getComposedGraveyardTargets(s, tout.card, "cx_0"))).toEqual(["Garde", "Éclair"].sort());
    expect(noms(s, getComposedGraveyardTargets(s, sortRappelCompose({ cardKind: "spell" }).card, "cx_0"))).toEqual(["Éclair"]);
    expect(noms(s, getComposedGraveyardTargets(s, sortRappelCompose({ cardKind: "creature" }).card, "cx_0"))).toEqual(["Garde"]);
  });

  it("la carte désignée — un SORT — revient en main", () => {
    const eclair = sort("Éclair");
    const s = cimetiere(mkState(), unite("Garde"), eclair);
    const ci = sortRappelCompose({ cardKind: "spell" });
    s.players[0].hand.push(ci);
    initRNG(1);
    const next = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, targetMap: { cx_0: eclair.instanceId } });
    expect(main(next)).toEqual(["Éclair"]);
    expect(next.players[0].graveyard.map(c => c.card.name)).toEqual(["Garde", "Écho du passé"]);
  });

  it("désignation automatique (sans choix) : repli déterministe sur la plus récente du pool", () => {
    const s = cimetiere(mkState(), sort("Vieux sort"), unite("Garde récente"), sort("Sort récent"));
    const ci = sortRappelCompose({ cardKind: "spell", designation: "automatic" });
    s.players[0].hand.push(ci);
    initRNG(1);
    const next = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId });
    expect(main(next)).toEqual(["Sort récent"]);
    const u = sortRappelCompose({ cardKind: "creature", designation: "automatic" });
    const t = cimetiere(mkState(), unite("Vieille garde"), sort("Sort récent"), unite("Garde récente"));
    t.players[0].hand.push(u);
    expect(main(applyAction(t, { type: "play_card", cardInstanceId: u.instanceId }))).toEqual(["Garde récente"]);
  });

  it("count 2 : deux cartes choisies reviennent, la main pleine arrête", () => {
    const a = sort("A"), b = sort("B");
    const s = cimetiere(mkState(), a, b, unite("Garde"));
    const ci = sortRappelCompose({ count: 2 });
    s.players[0].hand.push(ci);
    initRNG(1);
    const next = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, targetMap: { "cx_0#0": a.instanceId, "cx_0#1": b.instanceId } });
    expect(main(next)).toEqual(["A", "B"]);
  });
});

describe("Rappel — forme SORT du mot-clé, ouverte aux sorts", () => {
  function sortRappel() {
    return mkInstance(mkCard({ name: "Souvenir", card_type: "spell", attack: null, health: null, spell_keywords: [{ id: "rappel" }] as SpellKeywordInstance[] }));
  }
  it("le picker propose aussi les sorts du cimetière", () => {
    const s = cimetiere(mkState(), unite("Garde"), sort("Éclair"));
    expect(noms(s, getSpellTargets(s, sortRappel().card, "friendly_graveyard"))).toEqual(["Garde", "Éclair"].sort());
  });
  it("un sort désigné revient en main", () => {
    const eclair = sort("Éclair");
    const s = cimetiere(mkState(), unite("Garde"), eclair);
    const ci = sortRappel();
    s.players[0].hand.push(ci);
    initRNG(1);
    const next = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, targetMap: { kw_0: eclair.instanceId } });
    expect(main(next)).toEqual(["Éclair"]);
  });
});
