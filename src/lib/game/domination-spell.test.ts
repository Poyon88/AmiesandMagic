// Domination, forme SORT : le sort PREND lui-même le contrôle d'une créature
// ennemie CIBLÉE — il ne confère pas le mot-clé à un allié.
//
// Avant, « domination » n'existait que côté créature (contrôle d'une unité
// ennemie au hasard À SON INVOCATION). Un sort le portant devenait un DON à une
// créature alliée : cible impossible à désigner sur le plateau adverse, et don
// sans effet puisque l'invocation de l'allié était déjà passée.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

function dominationSpell(): CardInstance {
  return mkInstance(mkCard({
    name: "Décret de Conquête", card_type: "spell", attack: null, health: null, mana_cost: 8,
    spell_keywords: [{ id: "domination" }] as never,
  }));
}

const boardNames = (s: GameState, side: 0 | 1) => s.players[side].board.map((c) => c.card.name);

function cast(s: GameState, spell: CardInstance, targetInstanceId?: string): GameState {
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId, targetInstanceId });
}

describe("Domination — forme sort", () => {
  it("prend le contrôle de la créature ennemie CIBLÉE", () => {
    const s = mkState();
    const wanted = mkInstance(mkCard({ name: "Veilleur", attack: 6, health: 7 }));
    const other = mkInstance(mkCard({ name: "Figurant", attack: 1, health: 1 }));
    s.players[1].board.push(other, wanted);

    const next = cast(s, dominationSpell(), wanted.instanceId);

    expect(boardNames(next, 0)).toContain("Veilleur");
    expect(boardNames(next, 1)).toEqual(["Figurant"]);
  });

  it("la créature volée arrive avec le mal d'invocation et garde son propriétaire d'origine", () => {
    const s = mkState();
    const wanted = mkInstance(mkCard({ name: "Veilleur", attack: 6, health: 7 }));
    wanted.hasSummoningSickness = false;
    s.players[1].board.push(wanted);

    const next = cast(s, dominationSpell(), wanted.instanceId);

    const stolen = next.players[0].board.find((c) => c.card.name === "Veilleur")!;
    expect(stolen.hasSummoningSickness).toBe(true);
    // trueOwnerId : Remontée doit la renvoyer dans la main de son vrai
    // propriétaire, pas dans celle du voleur.
    expect(stolen.trueOwnerId).toBe(next.players[1].id);
  });

  it("plateau du lanceur plein : rien ne bouge", () => {
    const s = mkState();
    for (let i = 0; i < 8; i++) s.players[0].board.push(mkInstance(mkCard({ name: `Occupant${i}` })));
    const wanted = mkInstance(mkCard({ name: "Veilleur", attack: 6, health: 7 }));
    s.players[1].board.push(wanted);

    const next = cast(s, dominationSpell(), wanted.instanceId);

    expect(boardNames(next, 1)).toEqual(["Veilleur"]);
  });

  it("aucune créature ennemie : le sort se résout sans rien voler", () => {
    const s = mkState();
    const next = cast(s, dominationSpell());
    expect(next.players[0].board).toHaveLength(0);
  });
});
