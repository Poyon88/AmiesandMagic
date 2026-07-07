// Ordre STRICT gauche→droite des effets de fin de tour, TOUS RÉGIMES CONFONDUS.
// Un effet automatique d'une créature à droite ne doit se résoudre qu'APRÈS un
// effet interactif d'une créature située à sa gauche (avant, la séquence était
// scindée : tous les automatiques d'abord, puis les interactifs).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import type { Capability, ComposedEffect } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function composedCap(trigger: Capability["trigger"], composed: ComposedEffect): Capability {
  return { uid: `cap_${trigger}_${composed.content}`, trigger, effectKind: "immediate", abilityId: "_composed", composed };
}

// Effet INTERACTIF : inflige 3 à une unité ennemie AU CHOIX.
const CHOICE_DMG: ComposedEffect = {
  content: "deal_damage", magnitude: { x: 3 },
  target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
};
// Effet AUTOMATIQUE : +1/+1 sur soi.
const SELF_BUFF: ComposedEffect = {
  content: "buff", magnitude: { x: 1, y: 1 },
  target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" },
};

describe("Fin de tour — ordre strict gauche→droite tous régimes confondus", () => {
  it("l'automatique d'une créature à droite attend la résolution de l'interactif à gauche", () => {
    const s = mkState();
    // Plateau P0 : [0] interactif (choix), [1] automatique (self-buff).
    const interactif = mkInstance(mkCard({ name: "Choix", attack: 1, health: 1,
      capabilities: [composedCap("on_end_of_turn", CHOICE_DMG)] }));
    const automatique = mkInstance(mkCard({ name: "Auto", attack: 2, health: 2,
      capabilities: [composedCap("on_end_of_turn", SELF_BUFF)] }));
    s.players[0].board.push(interactif, automatique);
    // Cible ennemie pour l'effet interactif.
    const victim = mkInstance(mkCard({ name: "Cible", attack: 0, health: 5 }));
    s.players[1].board.push(victim);

    // 1) Fin de tour : pause sur l'interactif (créature 0). L'AUTO de la
    //    créature 1 NE DOIT PAS encore s'être appliqué (ordre strict).
    const paused = applyAction(s, { type: "end_turn" });
    expect(paused.endTurnPending).toBe(true);
    expect(paused.pendingTriggers?.length).toBe(1);
    const autoPaused = paused.players[0].board.find((c) => c.instanceId === automatique.instanceId)!;
    expect(autoPaused.currentAttack).toBe(2); // PAS encore buffé
    expect(autoPaused.maxHealth).toBe(2);

    // 2) Résolution de l'interactif → l'effet AUTO de la créature à droite
    //    s'applique ensuite, puis le tour bascule.
    const triggerId = paused.pendingTriggers![0].id;
    const resolved = applyAction(paused, { type: "resolve_pending_trigger", triggerId, targetInstanceId: victim.instanceId });

    const hitVictim = resolved.players[1].board.find((c) => c.instanceId === victim.instanceId)!;
    expect(hitVictim.currentHealth).toBe(2); // 5 - 3 (interactif appliqué)
    const autoAfter = resolved.players[0].board.find((c) => c.instanceId === automatique.instanceId)!;
    expect(autoAfter.currentAttack).toBe(3); // 2 + 1 (auto appliqué APRÈS)
    expect(autoAfter.maxHealth).toBe(3);
    expect(resolved.currentPlayerIndex).toBe(1); // tour basculé
    expect(resolved.endTurnPending ?? false).toBe(false);
  });

  it("deux interactifs : résolus un par un dans l'ordre du plateau (un seul en file à la fois)", () => {
    const s = mkState();
    const gauche = mkInstance(mkCard({ name: "Gauche", attack: 1, health: 1,
      capabilities: [composedCap("on_end_of_turn", CHOICE_DMG)] }));
    const droite = mkInstance(mkCard({ name: "Droite", attack: 1, health: 1,
      capabilities: [composedCap("on_end_of_turn", CHOICE_DMG)] }));
    s.players[0].board.push(gauche, droite);
    const a = mkInstance(mkCard({ name: "A", attack: 0, health: 5 }));
    const b = mkInstance(mkCard({ name: "B", attack: 0, health: 5 }));
    s.players[1].board.push(a, b);

    // Pause 1 : un seul pending, porté par la créature de GAUCHE.
    const p1 = applyAction(s, { type: "end_turn" });
    expect(p1.pendingTriggers?.length).toBe(1);
    expect(p1.pendingTriggers![0].sourceInstanceId).toBe(gauche.instanceId);

    // Résout gauche (frappe A) → pause 2 sur la créature de DROITE.
    const p2 = applyAction(p1, { type: "resolve_pending_trigger", triggerId: p1.pendingTriggers![0].id, targetInstanceId: a.instanceId });
    expect(p2.endTurnPending).toBe(true);
    expect(p2.pendingTriggers?.length).toBe(1);
    expect(p2.pendingTriggers![0].sourceInstanceId).toBe(droite.instanceId);

    // Résout droite (frappe B) → bascule.
    const p3 = applyAction(p2, { type: "resolve_pending_trigger", triggerId: p2.pendingTriggers![0].id, targetInstanceId: b.instanceId });
    expect(p3.players[1].board.find((c) => c.instanceId === a.instanceId)!.currentHealth).toBe(2);
    expect(p3.players[1].board.find((c) => c.instanceId === b.instanceId)!.currentHealth).toBe(2);
    expect(p3.currentPlayerIndex).toBe(1);
    expect(p3.endTurnPending ?? false).toBe(false);
  });
});
