// Déclencheur « fin de tour » (on_end_of_turn) : les effets composés se
// déclenchent à la fin du tour du CONTRÔLEUR de l'unité, à chaque tour. Les
// cibles « au choix » mettent le tour en pause (pendingTrigger) jusqu'à
// résolution. Voir endTurn / finishEndTurn / resolvePendingTrigger.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import type { Capability, ComposedEffect } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function composedCap(trigger: Capability["trigger"], composed: ComposedEffect): Capability {
  return { uid: `cap_${Math.random().toString(36).slice(2, 8)}`, trigger, effectKind: "immediate", abilityId: "_composed", composed };
}

const SELF_BUFF: ComposedEffect = {
  content: "buff", magnitude: { x: 1, y: 1 }, target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" },
};

describe("Déclencheur fin de tour — non interactif", () => {
  it("applique l'effet à la fin du tour du contrôleur puis bascule", () => {
    const s = mkState();
    const c = mkInstance(mkCard({ attack: 2, health: 2, capabilities: [composedCap("on_end_of_turn", SELF_BUFF)] }));
    s.players[0].board.push(c);

    const next = applyAction(s, { type: "end_turn" });

    const after = next.players[0].board.find((x) => x.instanceId === c.instanceId)!;
    expect(after.currentAttack).toBe(3); // 2 + 1
    expect(after.maxHealth).toBe(3);     // 2 + 1
    expect(next.currentPlayerIndex).toBe(1); // tour basculé
    expect(next.endTurnPending ?? false).toBe(false);
  });

  it("frappe une cible automatique (héros adverse)", () => {
    const s = mkState();
    // Deck non vide pour le joueur entrant → pas de dégâts de fatigue au startTurn
    // qui fausseraient le total.
    s.players[1].deck.push(mkInstance(mkCard({})));
    const hpBefore = s.players[1].hero.hp;
    const c = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_end_of_turn", {
      content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" },
    })] }));
    s.players[0].board.push(c);

    const next = applyAction(s, { type: "end_turn" });
    expect(next.players[1].hero.hp).toBe(hpBefore - 2);
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe("Déclencheur fin de tour — récurrence & contrôleur", () => {
  it("se déclenche à CHAQUE tour du contrôleur, jamais au tour adverse", () => {
    const s = mkState();
    const c = mkInstance(mkCard({ attack: 2, health: 2, capabilities: [composedCap("on_end_of_turn", SELF_BUFF)] }));
    s.players[0].board.push(c);

    const s1 = applyAction(s, { type: "end_turn" });   // fin tour P0 → +1/+1, → P1
    const find = (st: typeof s1) => st.players[0].board.find((x) => x.instanceId === c.instanceId)!;
    expect(find(s1).currentAttack).toBe(3);

    const s2 = applyAction(s1, { type: "end_turn" });  // fin tour P1 → l'unité P0 NE déclenche PAS
    expect(find(s2).currentAttack).toBe(3);

    const s3 = applyAction(s2, { type: "end_turn" });  // fin tour P0 → +1/+1 à nouveau
    expect(find(s3).currentAttack).toBe(4);
  });
});

describe("Déclencheur fin de tour — ciblage interactif", () => {
  it("met le tour en pause puis résout sur la cible choisie", () => {
    const s = mkState();
    const src = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_end_of_turn", {
      content: "deal_damage", magnitude: { x: 3 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
    })] }));
    s.players[0].board.push(src);
    const victim = mkInstance(mkCard({ name: "Cible", attack: 4, health: 5 }));
    const bystander = mkInstance(mkCard({ name: "Autre", attack: 4, health: 5 }));
    s.players[1].board.push(victim, bystander);

    // 1) Fin de tour : le tour NE bascule PAS, un déclencheur est en attente.
    const paused = applyAction(s, { type: "end_turn" });
    expect(paused.currentPlayerIndex).toBe(0);
    expect(paused.endTurnPending).toBe(true);
    expect(paused.pendingTriggers?.length).toBe(1);

    // 2) Le joueur choisit une cible → effet appliqué, puis bascule.
    const triggerId = paused.pendingTriggers![0].id;
    const resolved = applyAction(paused, { type: "resolve_pending_trigger", triggerId, targetInstanceId: victim.instanceId });

    const hitVictim = resolved.players[1].board.find((x) => x.instanceId === victim.instanceId)!;
    const safeBystander = resolved.players[1].board.find((x) => x.instanceId === bystander.instanceId)!;
    expect(hitVictim.currentHealth).toBe(2); // 5 - 3
    expect(safeBystander.currentHealth).toBe(5); // intact
    expect(resolved.currentPlayerIndex).toBe(1); // tour basculé après résolution
    expect(resolved.endTurnPending ?? false).toBe(false);
    expect(resolved.pendingTriggers?.length ?? 0).toBe(0);
  });
});
