// powerStrikes : le moteur enregistre chaque dégât de pouvoir DÉCLENCHÉ
// {source, cible, mode} pour que le store trace une flèche colorée par mode.
// Tap / on-play sont EXCLUS (couverts autrement / sans couleur).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import type { Capability, ComposedEffect } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function composedCap(trigger: Capability["trigger"], composed: ComposedEffect): Capability {
  return { uid: `cap_${Math.random().toString(36).slice(2, 8)}`, trigger, effectKind: "immediate", abilityId: "_composed", composed };
}
const dmg1ToEnemyUnit: ComposedEffect = {
  content: "deal_damage", magnitude: { x: 1 },
  target: { entity: "unit", side: "enemy", count: 1, location: "board", designation: "random" },
};

describe("powerStrikes — enregistrement par mode", () => {
  it("un dégât composé on_end_of_turn enregistre une frappe mode end_of_turn", () => {
    const s = mkState();
    s.players[1].deck.push(mkInstance(mkCard({})));
    const pinger = mkInstance(mkCard({ name: "Pinger", attack: 1, health: 3, capabilities: [composedCap("on_end_of_turn", dmg1ToEnemyUnit)] }));
    const victim = mkInstance(mkCard({ name: "Victime", attack: 1, health: 3 }));
    s.players[0].board.push(pinger);
    s.players[1].board.push(victim);

    const next = applyAction(s, { type: "end_turn" });
    const strikes = next.powerStrikes ?? [];
    expect(strikes.length).toBe(1);
    expect(strikes[0]).toMatchObject({ sourceId: pinger.instanceId, targetId: victim.instanceId, mode: "end_of_turn" });
  });

  it("un dégât composé on_death enregistre une frappe mode death", () => {
    const s = mkState();
    s.players[0].deck.push(mkInstance(mkCard({})));
    // Bombe : à sa mort, inflige 1 dégât à une unité ennemie.
    const bomb = mkInstance(mkCard({ name: "Bombe", attack: 1, health: 1, capabilities: [composedCap("on_death", dmg1ToEnemyUnit)] }));
    const victim = mkInstance(mkCard({ name: "Victime", attack: 1, health: 3 }));
    s.players[0].board.push(bomb);
    s.players[1].board.push(victim);
    // Un sort qui tue la bombe : plus simple = on la met à 0 PV via un ping ennemi.
    // Ici on la tue en la faisant attaquer une grosse créature ? Simplest: baisse PV et clean via une action.
    // On force la mort en jouant une carte adverse qui la tue serait lourd → on triche : PV=0 avant une action neutre.
    bomb.currentHealth = 0;
    const next = applyAction(s, { type: "end_turn" }); // end_turn nettoie les morts → déclenche on_death
    const strikes = (next.powerStrikes ?? []).filter(st => st.mode === "death");
    expect(strikes.length).toBe(1);
    expect(strikes[0]).toMatchObject({ sourceId: bomb.instanceId, targetId: victim.instanceId, mode: "death" });
  });

  it("un dégât d'ENTRÉE (on_play) n'enregistre AUCUNE frappe (pas de mode couleur)", () => {
    const s = mkState();
    s.players[0].deck.push(mkInstance(mkCard({})));
    const battlecry = mkInstance(mkCard({ name: "Cri", attack: 1, health: 1, capabilities: [composedCap("on_play", dmg1ToEnemyUnit)] }));
    battlecry.hasSummoningSickness = true;
    s.players[0].hand.push(battlecry);
    const victim = mkInstance(mkCard({ name: "Victime", attack: 1, health: 3 }));
    s.players[1].board.push(victim);

    const next = applyAction(s, { type: "play_card", cardInstanceId: battlecry.instanceId });
    expect((next.powerStrikes ?? []).length).toBe(0);
  });
});
