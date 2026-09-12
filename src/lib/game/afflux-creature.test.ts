// Afflux X en forme CRÉATURE : gagne X mana ce tour, à l'entrée en jeu par
// défaut, ou sur tout déclencheur curé (ici : fin de tour et activation).
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { getCapabilities } from "./capability-adapter";
import { CURATED_KEYWORD_MODES } from "../card-engine/constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Keyword, KeywordInstance } from "./types";

function afflux(x: number, mode?: KeywordInstance["mode"]) {
  return mkInstance(mkCard({
    name: "Puits", mana_cost: 2, attack: 1, health: 3,
    keywords: ["afflux"] as unknown as Keyword[],
    keyword_instances: [{ id: "afflux" as Keyword, x, ...(mode ? { mode } : {}) }],
  }));
}

describe("Afflux — forme créature", () => {
  it("est déclarée sur les 7 modes de la forge", () => {
    const modes = CURATED_KEYWORD_MODES["Afflux X"];
    expect(modes).toBeDefined();
    for (const m of ["tap", "death", "return", "end_of_turn", "attack", "draw", "low_hp"]) expect(modes.has(m as never), m).toBe(true);
  });

  it("à l'entrée en jeu : le mana gagné compense le coût", () => {
    const s = mkState();
    s.players[0].mana = 5;
    const ci = afflux(3);
    s.players[0].hand.push(ci);
    initRNG(1);
    const next = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId });
    expect(next.players[0].board.map(c => c.card.name)).toEqual(["Puits"]);
    expect(next.players[0].mana).toBe(5 - 2 + 3);
  });

  it("en mode fin de tour, rien à l'entrée", () => {
    const s = mkState();
    s.players[0].mana = 5;
    const ci = afflux(3, "end_of_turn");
    s.players[0].hand.push(ci);
    initRNG(1);
    const next = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId });
    expect(next.players[0].mana).toBe(3);
    expect(getCapabilities(ci.card).find(c => c.abilityId === "afflux")?.trigger).toBe("on_end_of_turn");
  });

  it("au tap : gagne X mana et engage la créature", () => {
    const s = mkState();
    s.players[0].mana = 2;
    const ci = afflux(2, "tap");
    ci.hasSummoningSickness = false;
    s.players[0].board.push(ci);
    initRNG(1);
    const next = applyAction(s, { type: "tap_activate", sourceInstanceId: ci.instanceId, instanceIdx: 0 });
    expect(next.players[0].mana).toBe(4);
    expect(next.players[0].board[0].tapped).toBe(true);
  });
});
