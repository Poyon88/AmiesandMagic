// Corruption, forme SORT : le sort convertit lui-même l'unité ennemie CIBLÉE,
// il ne confère pas le mot-clé.
//
// Différence avec Domination : le contrôle est TEMPORAIRE. `originalOwnerId`
// fait repartir l'unité chez son propriétaire au début de son tour, là où
// Domination ne pose que `trueOwnerId` et la garde définitivement.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

function corruptionSpell(): CardInstance {
  return mkInstance(mkCard({
    name: "Chant Corrupteur", card_type: "spell", attack: null, health: null, mana_cost: 6,
    spell_keywords: [{ id: "corruption" }] as never,
  }));
}

const boardNames = (s: GameState, side: 0 | 1) => s.players[side].board.map((c) => c.card.name);

function cast(s: GameState, spell: CardInstance, targetInstanceId?: string): GameState {
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId, targetInstanceId });
}

describe("Corruption — forme sort", () => {
  it("convertit la créature ennemie CIBLÉE", () => {
    const s = mkState();
    const wanted = mkInstance(mkCard({ name: "Veilleur", attack: 3, health: 4 }));
    const other = mkInstance(mkCard({ name: "Figurant", attack: 1, health: 1 }));
    s.players[1].board.push(other, wanted);

    const next = cast(s, corruptionSpell(), wanted.instanceId);

    expect(boardNames(next, 0)).toContain("Veilleur");
    expect(boardNames(next, 1)).toEqual(["Figurant"]);
  });

  it("la convertie peut attaquer tout de suite (Traque accordée)", () => {
    const s = mkState();
    const wanted = mkInstance(mkCard({ name: "Veilleur", attack: 3, health: 4 }));
    wanted.hasSummoningSickness = true;
    s.players[1].board.push(wanted);

    const next = cast(s, corruptionSpell(), wanted.instanceId);

    const stolen = next.players[0].board.find((c) => c.card.name === "Veilleur")!;
    expect(stolen.hasSummoningSickness).toBe(false);
    expect(stolen.card.keywords as unknown as string[]).toContain("charge");
  });

  it("le contrôle est TEMPORAIRE : elle repart au tour de son propriétaire", () => {
    const s = mkState();
    const wanted = mkInstance(mkCard({ name: "Veilleur", attack: 3, health: 4 }));
    s.players[1].board.push(wanted);

    const stolen = cast(s, corruptionSpell(), wanted.instanceId);
    expect(boardNames(stolen, 0)).toContain("Veilleur");
    // originalOwnerId est le marqueur du retour (cf. startTurn).
    expect(stolen.players[0].board.find((c) => c.card.name === "Veilleur")!.originalOwnerId)
      .toBe(stolen.players[1].id);

    // Fin de tour → le propriétaire d'origine récupère son unité.
    const next = applyAction(stolen, { type: "end_turn" });
    expect(boardNames(next, 1)).toContain("Veilleur");
    expect(boardNames(next, 0)).not.toContain("Veilleur");
  });

  it("plateau du lanceur plein : rien ne bouge", () => {
    const s = mkState();
    for (let i = 0; i < 8; i++) s.players[0].board.push(mkInstance(mkCard({ name: `Occupant${i}` })));
    const wanted = mkInstance(mkCard({ name: "Veilleur", attack: 3, health: 4 }));
    s.players[1].board.push(wanted);

    const next = cast(s, corruptionSpell(), wanted.instanceId);

    expect(boardNames(next, 1)).toEqual(["Veilleur"]);
  });
});
