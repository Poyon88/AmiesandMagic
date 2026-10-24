// Souffle de feu frappe AVANT l'échange de combat. Vu en partie : le Jeune
// Dragon de l'Aube (5/5, Souffle de feu 2) attaque la Phalange des Sept
// Serments (Bouclier divin) — le Bouclier absorbait l'attaque, et le souffle
// ne faisait que le retirer ensuite.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

const dragon = () => mkInstance(mkCard({
  name: "Dragon", attack: 5, health: 5, mana_cost: 6,
  keywords: ["souffle_de_feu"] as never,
  keyword_instances: [{ id: "souffle_de_feu", x: 2 }] as never,
}));

describe("Souffle de feu avant le combat", () => {
  it("retire le Bouclier divin avant les dégâts d'attaque", () => {
    const s = mkState();
    const d = dragon();
    s.players[0].board.push(d);
    const phalange = mkInstance(mkCard({ name: "Phalange", attack: 8, health: 9, keywords: ["divine_shield"] as never }));
    phalange.hasDivineShield = true;
    s.players[1].board.push(phalange);

    const next = applyAction(s, { type: "attack", attackerInstanceId: d.instanceId, targetInstanceId: phalange.instanceId });
    const p = next.players[1].board.find((c) => c.instanceId === phalange.instanceId)!;
    expect(p.hasDivineShield).toBe(false);
    expect(p.currentHealth).toBe(9 - 5); // souffle absorbé par le Bouclier, attaque entière
  });

  it("cible abattue par le souffle : pas d'échange, pas de riposte", () => {
    const s = mkState();
    const d = dragon();
    s.players[0].board.push(d);
    const fragile = mkInstance(mkCard({ name: "Fragile", attack: 4, health: 2 }));
    s.players[1].board.push(fragile);

    const next = applyAction(s, { type: "attack", attackerInstanceId: d.instanceId, targetInstanceId: fragile.instanceId });
    expect(next.players[1].board.some((c) => c.instanceId === fragile.instanceId)).toBe(false);
    expect(next.players[0].board.find((c) => c.instanceId === d.instanceId)!.currentHealth).toBe(5);
  });
});
