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

// ─── Révélation par le POUVOIR (et pas seulement par l'attaque) ─────────────
// Le libellé du mot-clé dit « tant qu'elle n'a pas effectué une action (attaque
// OU capacité) », mais seule l'attaque révélait. Vu avec « Flûtiste des Vents
// Sacrés » (Convocation simple au tap) : elle activait son pouvoir tour après
// tour en restant intouchable.
describe("Ombre révélée en activant son pouvoir", () => {
  /** Créature Ombre avec un pouvoir activable au tap (mode "tap"). */
  function shadowTapper(): CardInstance {
    const c = mkInstance(mkCard({
      name: "Flûtiste des Vents Sacrés", mana_cost: 3, attack: 1, health: 3,
      keywords: ["convocation_simple", "ombre"] as never,
      keyword_instances: [{ id: "convocation_simple", mode: "tap" }] as never,
    }));
    c.hasSummoningSickness = false;
    return c;
  }

  it("activer son pouvoir la révèle — elle devient ciblable", () => {
    const s = mkState();
    const flutiste = shadowTapper();
    s.players[0].board.push(flutiste);
    expect(flutiste.ombreRevealed).toBe(false);

    const next = applyAction(s, {
      type: "tap_activate", sourceInstanceId: flutiste.instanceId, instanceIdx: 0,
    });

    const after = next.players[0].board.find(c => c.card.name === "Flûtiste des Vents Sacrés")!;
    expect(after.ombreRevealed).toBe(true);
    expect(after.tapped).toBe(true);
    // Elle entre bien dans les cibles d'attaque offertes à l'adversaire
    // (getValidTargets raisonne depuis currentPlayerIndex : on bascule le POV).
    const foe = attacker();
    next.players[1].board.push(foe);
    const advPov = { ...next, currentPlayerIndex: 1 as const };
    expect(getValidTargets(advPov, foe.instanceId)).toContain(after.instanceId);
  });

  it("une activation REFUSÉE ne révèle rien (déjà tapée)", () => {
    const s = mkState();
    const flutiste = shadowTapper();
    flutiste.tapped = true; // la garde `if (source.tapped) return state`
    s.players[0].board.push(flutiste);

    const next = applyAction(s, {
      type: "tap_activate", sourceInstanceId: flutiste.instanceId, instanceIdx: 0,
    });

    expect(next.players[0].board[0].ombreRevealed).toBe(false);
    const foe2 = attacker();
    next.players[1].board.push(foe2);
    const advPov2 = { ...next, currentPlayerIndex: 1 as const };
    expect(getValidTargets(advPov2, foe2.instanceId)).not.toContain(flutiste.instanceId);
  });

  it("paralysée : l'activation échoue, l'Ombre tient toujours", () => {
    const s = mkState();
    const flutiste = shadowTapper();
    flutiste.isParalyzed = true;
    s.players[0].board.push(flutiste);

    const next = applyAction(s, {
      type: "tap_activate", sourceInstanceId: flutiste.instanceId, instanceIdx: 0,
    });

    expect(next.players[0].board[0].ombreRevealed).toBe(false);
  });
});
