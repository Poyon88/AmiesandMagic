// Contenu composé « Empoisonner » : pose l'ÉTAT empoisonné sur la cible (−1 PV
// à chaque fin de tour), à distinguer du DON du mot-clé Poison via
// grant_keyword — celui-ci rendrait la cible empoisonneuse au lieu de la
// faire souffrir. C'est l'équivalent composé du mot-clé de sort `poison`.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, GameState, TargetSpec } from "./types";

function poisonSpell(target: TargetSpec, content: "poison" | "grant_keyword" = "poison"): CardInstance {
  const composed: ComposedEffect = content === "poison"
    ? { content: "poison", target }
    : { content: "grant_keyword", grantAbilityId: "poison", target };
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed,
  }];
  return mkInstance(mkCard({ name: "Miasme", card_type: "spell", attack: null, health: null, capabilities: caps as never }));
}

const enemyBoard = (over: Partial<TargetSpec> = {}): TargetSpec =>
  ({ entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic", ...over });

function cast(s: GameState, spell: CardInstance, targetMap?: Record<string, string>): GameState {
  initRNG(7);
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId, targetMap });
}

describe("Empoisonner (contenu composé)", () => {
  it("pose l'état empoisonné sur toutes les créatures adverses", () => {
    const s = mkState();
    s.players[1].board = [mkInstance(mkCard({ name: "A", health: 3 })), mkInstance(mkCard({ name: "B", health: 3 }))];
    s.players[0].board = [mkInstance(mkCard({ name: "Alliée", health: 3 }))];

    const next = cast(s, poisonSpell(enemyBoard()));

    expect(next.players[1].board.every((c) => c.isPoisoned)).toBe(true);
    expect(next.players[0].board.some((c) => c.isPoisoned)).toBe(false);
    // L'état n'ajoute PAS le mot-clé : la cible subit le poison, elle ne le porte pas.
    expect(next.players[1].board.some((c) => (c.card.keywords as unknown as string[]).includes("poison"))).toBe(false);
  });

  it("se distingue du DON du mot-clé Poison", () => {
    const s = mkState();
    s.players[1].board = [mkInstance(mkCard({ name: "A", health: 3 }))];

    const next = cast(s, poisonSpell(enemyBoard(), "grant_keyword"));
    const a = next.players[1].board[0];
    // Le don rend la cible empoisonneuse, sans l'empoisonner elle-même.
    expect((a.card.keywords as unknown as string[]).includes("poison")).toBe(true);
    expect(a.isPoisoned).toBe(false);
  });

  it("la créature empoisonnée perd 1 PV à la fin du tour", () => {
    const s = mkState();
    const victim = mkInstance(mkCard({ name: "A", attack: 1, health: 3 }));
    s.players[1].board = [victim];

    const poisoned = cast(s, poisonSpell(enemyBoard()));
    expect(poisoned.players[1].board[0].currentHealth).toBe(3);

    // Le tic de poison tombe au changement de tour.
    const afterTurn = applyAction(poisoned, { type: "end_turn" });
    expect(afterTurn.players[1].board[0].currentHealth).toBe(2);
  });
});
