// Don composé (`grant_keyword`) vers le camp ADVERSE.
//
// Le picker « Conférer » historique est structurellement limité aux alliés
// (`grantScope` ne connaît que "target"/"all_allies", et applyGrantCapability ne
// parcourt que owner.board). Le chemin composé, lui, passe par un TargetSpec
// générique sans restriction de bord — c'est ce qui permet « donne Poison à
// toutes les créatures adverses ». Ce comportement n'était couvert par aucun
// test : ces cas le verrouillent avant qu'on en fasse le chemin officiel.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, GameState, TargetSpec } from "./types";

const CAP_UID = "cx_0";

function poisonSpell(target: TargetSpec): CardInstance {
  const composed: ComposedEffect = { content: "grant_keyword", grantAbilityId: "poison", target };
  const caps: Capability[] = [{
    uid: CAP_UID, trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed,
  }];
  return mkInstance(mkCard({
    name: "Nuée toxique", card_type: "spell", attack: null, health: null,
    capabilities: caps as never,
  }));
}

function creature(name: string, race?: string): CardInstance {
  return mkInstance(mkCard({ name, attack: 1, health: 3, ...(race ? { race } : {}) }));
}

function cast(s: GameState, spell: CardInstance, targetMap?: Record<string, string>): GameState {
  initRNG(42);
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId, targetMap });
}

const hasPoison = (c: CardInstance) => (c.card.keywords as unknown as string[]).includes("poison");

describe("Conférer composé — portée adverse", () => {
  it("toutes les créatures adverses (le cas demandé)", () => {
    const s0 = mkState();
    s0.players[1].board = [creature("Ennemie A"), creature("Ennemie B")];
    s0.players[0].board = [creature("Alliée")];

    const s = cast(s0, poisonSpell({ entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" }));

    expect(s.players[1].board.every(hasPoison)).toBe(true);
    // Le camp du lanceur ne doit pas être touché.
    expect(s.players[0].board.some(hasPoison)).toBe(false);
  });

  it("une créature adverse au choix", () => {
    const s0 = mkState();
    const [a, b] = [creature("Ennemie A"), creature("Ennemie B")];
    s0.players[1].board = [a, b];

    const s = cast(
      s0,
      poisonSpell({ entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" }),
      { [CAP_UID]: b.instanceId },
    );

    expect(s.players[1].board.find((c) => c.instanceId === b.instanceId)).toSatisfy(hasPoison);
    expect(s.players[1].board.find((c) => c.instanceId === a.instanceId)).not.toSatisfy(hasPoison);
  });

  it("les deux camps", () => {
    const s0 = mkState();
    s0.players[0].board = [creature("Alliée")];
    s0.players[1].board = [creature("Ennemie")];

    const s = cast(s0, poisonSpell({ entity: "unit", count: "all", side: "any", location: "board", designation: "automatic" }));

    expect(s.players[0].board.every(hasPoison)).toBe(true);
    expect(s.players[1].board.every(hasPoison)).toBe(true);
  });

  it("restreint par appartenance (race) côté adverse", () => {
    const s0 = mkState();
    s0.players[1].board = [creature("Loup", "Hommes-Bêtes"), creature("Nain", "Nains")];

    const s = cast(s0, poisonSpell({
      entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic",
      membership: { race: ["Hommes-Bêtes"] },
    }));

    expect(s.players[1].board.find((c) => c.card.name === "Loup")).toSatisfy(hasPoison);
    expect(s.players[1].board.find((c) => c.card.name === "Nain")).not.toSatisfy(hasPoison);
  });
});
