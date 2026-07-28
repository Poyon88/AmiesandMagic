// Provocation + Ombre sur la même créature : situation de blocage.
//
// Tapie dans l'ombre, elle est INTARGETABLE — mais sa Provocation couvrait
// quand même le reste du plateau et le héros. Résultat : plus aucune attaque
// possible, ni sur elle, ni ailleurs. Sa Provocation ne s'applique donc plus
// tant qu'elle n'est pas révélée (elle se révèle en attaquant).
import { describe, expect, it } from "vitest";
import { applyAction, getValidTargets } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

function shadowTaunt(revealed: boolean): CardInstance {
  const c = mkInstance(mkCard({ name: "Sentinelle Tapie", attack: 2, health: 4, keywords: ["taunt", "ombre"] as never }));
  c.ombreRevealed = revealed;
  return c;
}

function attacker(): CardInstance {
  const c = mkInstance(mkCard({ name: "Assaillant", attack: 2, health: 4 }));
  c.hasSummoningSickness = false;
  return c;
}

const hp = (s: GameState, side: 0 | 1) => s.players[side].hero.hp;

describe("Provocation tapie dans l'ombre", () => {
  it("ne bloque plus l'attaque du héros", () => {
    const s = mkState();
    const a = attacker();
    s.players[0].board.push(a);
    s.players[1].board.push(shadowTaunt(false));

    const before = hp(s, 1);
    const next = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: "enemy_hero" });

    expect(hp(next, 1)).toBe(before - 2);
  });

  it("laisse attaquer une AUTRE créature ennemie", () => {
    const s = mkState();
    const a = attacker();
    s.players[0].board.push(a);
    const victim = mkInstance(mkCard({ name: "Cible", attack: 0, health: 5 }));
    s.players[1].board.push(shadowTaunt(false), victim);

    const next = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: victim.instanceId });

    expect(next.players[1].board.find((c) => c.card.name === "Cible")!.currentHealth).toBe(3);
  });

  it("les cibles proposées ne sont pas vides (le blocage se voyait ici)", () => {
    const s = mkState();
    const a = attacker();
    s.players[0].board.push(a);
    s.players[1].board.push(shadowTaunt(false), mkInstance(mkCard({ name: "Cible", attack: 0, health: 5 })));

    const targets = getValidTargets(s, a.instanceId);

    expect(targets.length).toBeGreaterThan(0);
    // La tapie reste hors d'atteinte tant qu'elle n'est pas révélée.
    expect(targets).not.toContain(s.players[1].board[0].instanceId);
  });

  it("une fois RÉVÉLÉE, sa provocation redevient contraignante", () => {
    const s = mkState();
    const a = attacker();
    s.players[0].board.push(a);
    const taunt = shadowTaunt(true);
    const victim = mkInstance(mkCard({ name: "Cible", attack: 0, health: 5 }));
    s.players[1].board.push(taunt, victim);

    // Les cibles se limitent à la provocation.
    expect(getValidTargets(s, a.instanceId)).toEqual([taunt.instanceId]);

    // Et frapper ailleurs reste refusé.
    const next = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: victim.instanceId });
    expect(next.players[1].board.find((c) => c.card.name === "Cible")!.currentHealth).toBe(5);
  });
});
