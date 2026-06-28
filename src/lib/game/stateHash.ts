import type { GameState } from "./types";

/**
 * Anti-desync reconciliation helpers.
 *
 * The action log + seq numbering keeps two clients in step as long as every
 * action is applied identically on both sides. But a single non-deterministic
 * branch in the engine, or a lost action that slips past gap-recovery, leaves
 * the two clients silently diverged AT THE SAME seq — a state the snapshot
 * adoption never repairs (it only triggers when `snapSeq > lastSeq`).
 *
 * To close that hole, the acting client broadcasts a cheap hash of its
 * post-action state alongside each snapshot; the peer compares it once it has
 * applied the same seq and, on mismatch, adopts the authoritative snapshot.
 * `syncHash` is that hash; `reconcileVerdict` is the (pure, unit-tested)
 * decision of what to do when a checkpoint arrives.
 */

// Fields excluded from the hash:
//  - factionCardPool / allSpellsPool / tokenTemplates : static, stripped from
//    the snapshot too; each client re-attaches its own copy.
//  - turnStartedAt : a wall-clock Date.now() stamped per client in startTurn;
//    legitimately differs between clients and never affects gameplay.
//  - fureurStrikes / onAttackWave : transient animation hints, cleared by the
//    store after scheduling; not part of the durable game truth.
const VOLATILE_KEYS = new Set([
  "factionCardPool",
  "allSpellsPool",
  "tokenTemplates",
  "turnStartedAt",
  "fureurStrikes",
  "onAttackWave",
]);

// Deterministic JSON: object keys emitted in sorted order so two structurally
// equal states always stringify identically regardless of key insertion order.
// Arrays keep their order (gameplay order is significant and must match).
function stableStringify(value: unknown, dropTopLevelVolatile = false): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => stableStringify(v)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    if (dropTopLevelVolatile && VOLATILE_KEYS.has(k)) continue;
    if (obj[k] === undefined) continue;
    parts.push(JSON.stringify(k) + ":" + stableStringify(obj[k]));
  }
  return "{" + parts.join(",") + "}";
}

// cyrb53 — fast, well-distributed 53-bit string hash. Returned as a base-36
// string to keep broadcast payloads tiny.
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hi = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hi.toString(36);
}

/** Stable hash of the gameplay-relevant portion of a GameState. Two clients in
 *  sync produce the same hash; any divergence (board, HP, mana, RNG, pending
 *  triggers, …) changes it. */
export function syncHash(state: GameState): string {
  return cyrb53(stableStringify(state, true));
}

export type ReconcileVerdict =
  | "ok" // hashes match — in sync, nothing to do
  | "wait" // not aligned/settled yet — re-check after we catch up or animation ends
  | "stale" // checkpoint is for a seq we've already moved past — discard
  | "adopt" // diverged at this seq and the snapshot for it is ready — adopt it
  | "refetch"; // diverged but the snapshot hasn't caught up — retry shortly

/**
 * Decide what a client should do with an incoming checkpoint {seq, hash}.
 * Pure so it can be unit-tested exhaustively.
 *
 * @param localSeq        the highest seq this client has applied (lastSeqRef)
 * @param localHash       syncHash of this client's current state, or null if it
 *                        can't be compared yet (no state)
 * @param checkpointSeq   the seq the checkpoint describes
 * @param checkpointHash  the authoritative hash for that seq
 * @param isAnimating     true while the animation pipeline is mid-flight
 * @param snapSeq         seq of the currently-stored server snapshot, or null
 *                        if not yet fetched (pass null before the snapshot read)
 */
export function reconcileVerdict(args: {
  localSeq: number;
  localHash: string | null;
  checkpointSeq: number;
  checkpointHash: string;
  isAnimating: boolean;
  snapSeq: number | null;
}): ReconcileVerdict {
  const { localSeq, localHash, checkpointSeq, checkpointHash, isAnimating, snapSeq } = args;
  // Can't compare while an animation is committing state, or with no state.
  if (isAnimating || localHash === null) return "wait";
  // We've already advanced past this checkpoint — it can't describe our state.
  if (localSeq > checkpointSeq) return "stale";
  // We haven't reached this seq yet — let the in-order/gap path catch us up.
  if (localSeq < checkpointSeq) return "wait";
  // Aligned (localSeq === checkpointSeq): compare.
  if (localHash === checkpointHash) return "ok";
  // Diverged. Adopt only the snapshot that matches this exact seq.
  if (snapSeq === null || snapSeq < checkpointSeq) return "refetch";
  if (snapSeq === checkpointSeq) return "adopt";
  // snapSeq > checkpointSeq: the sender already advanced; the log replay that
  // brings us to snapSeq will realign us, so don't adopt a mismatched seq.
  return "stale";
}
