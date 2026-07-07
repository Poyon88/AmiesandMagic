// Repro : Piétinement (trample). Vérifie que SEUL le surplus (dégâts au-delà des
// PV restants de la cible) est reporté sur le héros adverse, jamais l'attaque
// entière. Le héros de départ = HERO_MAX_HP (30).
import { describe, expect, it } from "vitest";
import { attack } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

function attacker(name: string, atk: number, keywords: string[] = ["pietinement"]) {
  const c = mkInstance(mkCard({ name, attack: atk, health: 10, keywords: keywords as never }));
  c.hasSummoningSickness = false;
  return c;
}

describe("Piétinement — surplus uniquement au héros", () => {
  it("ATK 6 vs cible 2 PV → héros perd 4 (le surplus), pas 6", () => {
    const s = mkState();
    const a = attacker("Piétineur", 6);
    const target = mkInstance(mkCard({ name: "Cible", attack: 0, health: 2 }));
    s.players[0].board.push(a);
    s.players[1].board.push(target);

    const hpBefore = s.players[1].hero.hp; // 30
    const next = attack(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: target.instanceId });

    // La cible meurt.
    expect(next.players[1].board.find((c) => c.instanceId === target.instanceId)).toBeUndefined();
    // Le héros ne perd QUE le surplus = 6 - 2 = 4.
    expect(hpBefore - next.players[1].hero.hp).toBe(4);
  });

  it("kill exact (ATK 3 vs 3 PV) → aucun surplus → héros intact", () => {
    const s = mkState();
    const a = attacker("Piétineur", 3);
    const target = mkInstance(mkCard({ name: "Cible", attack: 0, health: 3 }));
    s.players[0].board.push(a);
    s.players[1].board.push(target);

    const hpBefore = s.players[1].hero.hp;
    const next = attack(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: target.instanceId });
    expect(hpBefore - next.players[1].hero.hp).toBe(0);
  });

  it("gros surplus : ATK 10 vs 1 PV → héros perd 9", () => {
    const s = mkState();
    const a = attacker("Piétineur", 10);
    const target = mkInstance(mkCard({ name: "Cible", attack: 0, health: 1 }));
    s.players[0].board.push(a);
    s.players[1].board.push(target);

    const hpBefore = s.players[1].hero.hp;
    const next = attack(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: target.instanceId });
    expect(hpBefore - next.players[1].hero.hp).toBe(9);
  });

  it("SANS Piétinement : le surplus est perdu, héros intact", () => {
    const s = mkState();
    const a = attacker("Normal", 6, []); // pas de keyword
    const target = mkInstance(mkCard({ name: "Cible", attack: 0, health: 2 }));
    s.players[0].board.push(a);
    s.players[1].board.push(target);

    const hpBefore = s.players[1].hero.hp;
    const next = attack(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: target.instanceId });
    expect(hpBefore - next.players[1].hero.hp).toBe(0);
  });

  it("cible avec Armure (dégâts /2) : surplus calculé sur les dégâts réduits", () => {
    const s = mkState();
    const a = attacker("Piétineur", 6);
    // Armure : 6 → ceil(6/2)=3 dégâts. Cible 2 PV → surplus = 3-2 = 1.
    const target = mkInstance(mkCard({ name: "Blindé", attack: 0, health: 2, keywords: ["armure"] as never }));
    s.players[0].board.push(a);
    s.players[1].board.push(target);

    const hpBefore = s.players[1].hero.hp;
    const next = attack(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: target.instanceId });
    expect(hpBefore - next.players[1].hero.hp).toBe(1);
  });
});
