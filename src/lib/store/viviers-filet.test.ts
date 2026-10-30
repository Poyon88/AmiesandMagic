// Filet de sécurité des VIVIERS : un état qui arrive sans pools de cartes les
// retrouve. Sans eux, Sélections et Invocations ne produisent plus rien, en
// silence, jusqu'à la fin de la partie (Parchemin Retrouvé, Vœu de protection).
import { describe, expect, it, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";

describe("viviers perdus en cours de partie", () => {
  it("un état sans viviers les retrouve, et l'Invocation suivante fonctionne", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const avec = mkState();
    const garde = mkCard({ id: 7001, name: "Garde", attack: 1, health: 3, mana_cost: 2, rarity: "Commune", keywords: ["taunt"] });
    avec.factionCardPool = [garde];
    avec.allSpellsPool = [];
    useGameStore.setState({ gameState: avec });

    const sans = structuredClone({ ...avec, factionCardPool: undefined, allSpellsPool: undefined });
    useGameStore.setState({ gameState: sans });
    expect(useGameStore.getState().gameState!.factionCardPool).toEqual([garde]);
    expect(warn).toHaveBeenCalled();

    // Le prochain sort d'invocation tire bien dans le vivier ré-attaché.
    const s = useGameStore.getState().gameState!;
    s.players[0].mana = 10;
    const voeu = mkInstance(mkCard({
      name: "Vœu", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{ uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "invocation", pool: { keywordId: "taunt" }, magnitude: { x: 4, minX: 2, randomX: true } } }] as never,
    }));
    s.players[0].hand.push(voeu);
    vi.useFakeTimers();
    useGameStore.setState({ isAnimating: false, localPlayerId: s.players[0].id });
    useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: voeu.instanceId });
    vi.runAllTimers();
    vi.useRealTimers();
    expect(useGameStore.getState().gameState!.players[0].board.map(c => c.card.name)).toContain("Garde");
    warn.mockRestore();
  });
});
