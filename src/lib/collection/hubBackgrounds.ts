import type { SupabaseClient } from "@supabase/supabase-js";
import { RARITIES } from "@/lib/card-engine/constants";

/**
 * Per-category image pools for the "Ma collection" hub tiles. Each pool holds
 * the image URLs of the highest rarity the player owns in that category; the
 * client picks one at random (and freezes it for the session). Empty pool ⇒
 * the tile keeps its glyph.
 */
export interface HubBgCandidates {
  cards: string[];
  heroes: string[];
  cardBacks: string[];
  boards: string[];
}

const RARITY_TIER: Record<string, number> = Object.fromEntries(
  RARITIES.map((r) => [r.id, r.tier])
);

// next/image is configured (next.config.ts remotePatterns) to optimize only
// public Supabase storage URLs, so candidates are restricted to that prefix —
// this both guarantees next/image never throws on a disallowed host and keeps
// egress low (optimized, edge-cached thumbnails).
const PUBLIC_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/`;

// Bound the payload sent to the client; the final random pick happens there.
const MAX_CANDIDATES = 24;

type OwnedItem = { rarity: string | null; image: string | null };

function topRarityImages(items: OwnedItem[]): string[] {
  let bestTier = -1;
  const byTier = new Map<number, string[]>();
  for (const it of items) {
    if (!it.image || !it.image.startsWith(PUBLIC_PREFIX)) continue;
    const tier = RARITY_TIER[it.rarity ?? "Commune"] ?? 0;
    const arr = byTier.get(tier) ?? [];
    arr.push(it.image);
    byTier.set(tier, arr);
    if (tier > bestTier) bestTier = tier;
  }
  if (bestTier < 0) return [];
  const unique = Array.from(new Set(byTier.get(bestTier) ?? []));
  if (unique.length <= MAX_CANDIDATES) return unique;
  // Partial Fisher–Yates: random sample of MAX_CANDIDATES without copying all.
  for (let i = 0; i < MAX_CANDIDATES; i++) {
    const j = i + Math.floor(Math.random() * (unique.length - i));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, MAX_CANDIDATES);
}

/**
 * Resolve the highest-rarity owned image pool for each collection category.
 * Ownership mirrors the dedicated collection pages:
 *  - cards: free released-set cards (`set_id != null`) + collected/printed
 *  - heroes/backs/boards: free Commons + owned prints
 */
export async function getHubBgCandidates(
  supabase: SupabaseClient,
  userId: string
): Promise<HubBgCandidates> {
  const [
    cardsRes,
    userColRes,
    cardPrintsRes,
    heroCommonRes,
    heroOwnedRes,
    backsRes,
    backPrintsRes,
    boardsRes,
    boardPrintsRes,
  ] = await Promise.all([
    supabase.from("cards").select("id, rarity, image_url, set_id"),
    supabase.from("user_collections").select("card_id").eq("user_id", userId),
    supabase.from("card_prints").select("card_id").eq("owner_id", userId),
    supabase.from("heroes").select("id, rarity, thumbnail_url").eq("is_active", true).eq("rarity", "Commune"),
    supabase.from("user_hero_prints").select("hero:heroes(id, rarity, thumbnail_url)").eq("user_id", userId),
    supabase.from("card_backs").select("id, rarity, image_url").eq("is_active", true),
    supabase.from("user_card_back_prints").select("card_back_id").eq("owner_id", userId),
    supabase.from("game_boards").select("id, rarity, image_url").eq("is_active", true),
    supabase.from("user_board_prints").select("board_id").eq("owner_id", userId),
  ]);

  // Cards — owned = free set card OR collected/printed (per user choice: whole collection)
  const collectedCardIds = new Set<number>([
    ...((userColRes.data ?? []) as { card_id: number }[]).map((r) => r.card_id),
    ...((cardPrintsRes.data ?? []) as { card_id: number }[]).map((r) => r.card_id),
  ]);
  const cardItems: OwnedItem[] = (
    (cardsRes.data ?? []) as { id: number; rarity: string | null; image_url: string | null; set_id: number | null }[]
  )
    .filter((c) => c.set_id != null || collectedCardIds.has(c.id))
    .map((c) => ({ rarity: c.rarity, image: c.image_url }));

  // Heroes — free Commons + owned prints
  const heroItems: OwnedItem[] = [];
  for (const h of (heroCommonRes.data ?? []) as { rarity: string | null; thumbnail_url: string | null }[]) {
    heroItems.push({ rarity: h.rarity, image: h.thumbnail_url });
  }
  // Supabase types the to-one embed as an array; at runtime it is a single
  // object (same as the /api/heroes/owned route), hence the cast via unknown.
  for (const row of (heroOwnedRes.data ?? []) as unknown as { hero: { rarity: string | null; thumbnail_url: string | null } | null }[]) {
    if (row.hero) heroItems.push({ rarity: row.hero.rarity, image: row.hero.thumbnail_url });
  }

  // Card backs — owned = Commune/null OR in prints
  const ownedBackIds = new Set<number>(
    ((backPrintsRes.data ?? []) as { card_back_id: number }[]).map((r) => r.card_back_id)
  );
  const backItems: OwnedItem[] = (
    (backsRes.data ?? []) as { id: number; rarity: string | null; image_url: string | null }[]
  )
    .filter((b) => b.rarity == null || b.rarity === "Commune" || ownedBackIds.has(b.id))
    .map((b) => ({ rarity: b.rarity, image: b.image_url }));

  // Boards — same pattern
  const ownedBoardIds = new Set<number>(
    ((boardPrintsRes.data ?? []) as { board_id: number }[]).map((r) => r.board_id)
  );
  const boardItems: OwnedItem[] = (
    (boardsRes.data ?? []) as { id: number; rarity: string | null; image_url: string | null }[]
  )
    .filter((b) => b.rarity == null || b.rarity === "Commune" || ownedBoardIds.has(b.id))
    .map((b) => ({ rarity: b.rarity, image: b.image_url }));

  return {
    cards: topRarityImages(cardItems),
    heroes: topRarityImages(heroItems),
    cardBacks: topRarityImages(backItems),
    boards: topRarityImages(boardItems),
  };
}
