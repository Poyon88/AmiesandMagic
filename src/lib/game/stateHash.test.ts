// Anti-desync reconciliation: the hash must ignore client-local noise
// (turnStartedAt, transient animation hints, static pools) yet flag any real
// gameplay divergence, and the verdict must heal only confirmed mismatches.
import { describe, expect, it } from "vitest";
import { syncHash, reconcileVerdict } from "./stateHash";
import type { GameState } from "./types";

function baseState(over: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "p1", heroHealth: 30, mana: 3, hand: [], board: [], deck: [], graveyard: [] },
      { id: "p2", heroHealth: 28, mana: 2, hand: [], board: [], deck: [], graveyard: [] },
    ],
    currentPlayerIndex: 0,
    turnNumber: 4,
    turnStartedAt: 1_000_000,
    phase: "playing",
    winner: null,
    lastAction: null,
    mulliganReady: [true, true],
    rngState: 123456,
    ...over,
  } as unknown as GameState;
}

describe("syncHash", () => {
  it("is stable for structurally equal states", () => {
    expect(syncHash(baseState())).toBe(syncHash(baseState()));
  });

  it("ignores turnStartedAt (per-client wall clock)", () => {
    expect(syncHash(baseState({ turnStartedAt: 1 }))).toBe(
      syncHash(baseState({ turnStartedAt: 999_999_999 }))
    );
  });

  it("ignores the static card pools and transient animation hints", () => {
    const withNoise = baseState({
      factionCardPool: [{ id: 1 }, { id: 2 }] as unknown as GameState["factionCardPool"],
      allSpellsPool: [{ id: 9 }] as unknown as GameState["allSpellsPool"],
      tokenTemplates: [{ id: 5 }] as unknown as GameState["tokenTemplates"],
      fureurStrikes: [{ attackerInstanceId: "a", victimInstanceId: "b" }],
      onAttackWave: { intermediate: baseState() },
    });
    expect(syncHash(withNoise)).toBe(syncHash(baseState()));
  });

  it("is insensitive to object key order", () => {
    const a = baseState({ winner: null, phase: "playing" });
    const b = baseState();
    // Rebuild b's top object with reversed key insertion order.
    const reordered = Object.fromEntries(
      Object.entries(b as unknown as Record<string, unknown>).reverse()
    ) as unknown as GameState;
    expect(syncHash(reordered)).toBe(syncHash(a));
  });

  it("changes when hero health diverges", () => {
    const a = baseState();
    const b = baseState({
      players: [
        { id: "p1", heroHealth: 22, mana: 3, hand: [], board: [], deck: [], graveyard: [] },
        { id: "p2", heroHealth: 28, mana: 2, hand: [], board: [], deck: [], graveyard: [] },
      ] as unknown as GameState["players"],
    });
    expect(syncHash(a)).not.toBe(syncHash(b));
  });

  it("changes when a creature is present on one side only", () => {
    const a = baseState();
    const b = baseState({
      players: [
        {
          id: "p1", heroHealth: 30, mana: 3, hand: [], deck: [], graveyard: [],
          board: [{ instanceId: "x", currentAttack: 2, currentHealth: 2 }],
        },
        { id: "p2", heroHealth: 28, mana: 2, hand: [], board: [], deck: [], graveyard: [] },
      ] as unknown as GameState["players"],
    });
    expect(syncHash(a)).not.toBe(syncHash(b));
  });

  it("changes when the RNG stream diverges", () => {
    expect(syncHash(baseState({ rngState: 1 }))).not.toBe(
      syncHash(baseState({ rngState: 2 }))
    );
  });

  it("array order is significant (board ordering matters)", () => {
    const board = (ids: string[]) =>
      ids.map((i) => ({ instanceId: i, currentAttack: 1, currentHealth: 1 }));
    const mk = (ids: string[]) =>
      baseState({
        players: [
          { id: "p1", heroHealth: 30, mana: 3, hand: [], deck: [], graveyard: [], board: board(ids) },
          { id: "p2", heroHealth: 28, mana: 2, hand: [], board: [], deck: [], graveyard: [] },
        ] as unknown as GameState["players"],
      });
    expect(syncHash(mk(["a", "b"]))).not.toBe(syncHash(mk(["b", "a"])));
  });
});

describe("reconcileVerdict", () => {
  const C = { checkpointSeq: 10, checkpointHash: "H", isAnimating: false };

  it("waits while animating", () => {
    expect(reconcileVerdict({ ...C, localSeq: 10, localHash: "H", isAnimating: true, snapSeq: 10 })).toBe("wait");
  });

  it("waits when no local state is available", () => {
    expect(reconcileVerdict({ ...C, localSeq: 10, localHash: null, snapSeq: 10 })).toBe("wait");
  });

  it("waits when behind the checkpoint seq", () => {
    expect(reconcileVerdict({ ...C, localSeq: 8, localHash: "H", snapSeq: 8 })).toBe("wait");
  });

  it("discards a checkpoint we've already moved past", () => {
    expect(reconcileVerdict({ ...C, localSeq: 12, localHash: "H", snapSeq: 12 })).toBe("stale");
  });

  it("is ok when aligned and hashes match", () => {
    expect(reconcileVerdict({ ...C, localSeq: 10, localHash: "H", snapSeq: 10 })).toBe("ok");
  });

  it("adopts when aligned, diverged, and the snapshot matches the seq", () => {
    expect(reconcileVerdict({ ...C, localSeq: 10, localHash: "X", snapSeq: 10 })).toBe("adopt");
  });

  it("refetches when diverged but the snapshot lags or is unread", () => {
    expect(reconcileVerdict({ ...C, localSeq: 10, localHash: "X", snapSeq: null })).toBe("refetch");
    expect(reconcileVerdict({ ...C, localSeq: 10, localHash: "X", snapSeq: 9 })).toBe("refetch");
  });

  it("does not adopt a mismatched seq when the sender already advanced", () => {
    expect(reconcileVerdict({ ...C, localSeq: 10, localHash: "X", snapSeq: 11 })).toBe("stale");
  });
});
