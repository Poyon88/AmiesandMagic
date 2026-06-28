import { SupabaseClient } from '@supabase/supabase-js';

export type Period = '7d' | '30d' | '90d' | 'all';

export function periodStart(period: Period): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export interface EntityStat {
  key: string;
  label: string;
  wins: number;
  losses: number;
  winrate: number;
  games_count: number;
  copies_total: number;
  image_url?: string | null;
}

export interface DeckSnapshot {
  id: number;
  match_id: string;
  player_id: string;
  deck_id: string | null;
  hero_id: string | null;
  is_winner: boolean;
  cards: Array<{ card_id: number; copies: number }>;
  primary_faction: string | null;
  created_at: string;
}

export interface CardRow {
  id: number;
  name: string;
  faction: string | null;
  race: string | null;
  clan: string | null;
  keywords: string[] | null;
  spell_keywords: Array<{ keyword: string }> | null;
  image_url: string | null;
}

export interface HeroRow {
  id: string;
  name: string;
  faction: string | null;
  race: string | null;
  clan: string | null;
  thumbnail_url?: string | null;
}

export async function fetchSnapshots(
  supabase: SupabaseClient,
  period: Period
): Promise<DeckSnapshot[]> {
  const start = periodStart(period);
  let q = supabase.from('match_deck_snapshots').select('*');
  if (start) q = q.gte('created_at', start);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as DeckSnapshot[];
}

export async function fetchCards(supabase: SupabaseClient): Promise<Map<number, CardRow>> {
  const { data, error } = await supabase
    .from('cards')
    .select('id, name, faction, race, clan, keywords, spell_keywords, image_url');
  if (error) throw new Error(error.message);
  const map = new Map<number, CardRow>();
  for (const c of (data ?? []) as CardRow[]) map.set(c.id, c);
  return map;
}

export async function fetchHeroes(supabase: SupabaseClient): Promise<Map<string, HeroRow>> {
  const { data, error } = await supabase
    .from('heroes')
    .select('id, name, faction, race, clan, thumbnail_url');
  if (error) throw new Error(error.message);
  const map = new Map<string, HeroRow>();
  for (const h of (data ?? []) as HeroRow[]) map.set(h.id, h);
  return map;
}

function finalize(map: Map<string, EntityStat>, minGames: number): EntityStat[] {
  const arr = Array.from(map.values()).filter((s) => s.games_count >= minGames);
  for (const s of arr) {
    const total = s.wins + s.losses;
    s.winrate = total > 0 ? s.wins / total : 0;
  }
  return arr.sort((a, b) => b.winrate - a.winrate);
}

/** Bucket cards by faction / race / clan and compute weighted winrates. */
export function aggregateByCardAttribute(
  snapshots: DeckSnapshot[],
  cards: Map<number, CardRow>,
  attribute: 'faction' | 'race' | 'clan',
  minGames: number
): EntityStat[] {
  const map = new Map<string, EntityStat>();
  for (const snap of snapshots) {
    const seenInThisDeck = new Set<string>();
    for (const entry of snap.cards) {
      const card = cards.get(entry.card_id);
      if (!card) continue;
      const value = card[attribute];
      if (!value) continue;
      let stat = map.get(value);
      if (!stat) {
        stat = { key: value, label: value, wins: 0, losses: 0, winrate: 0, games_count: 0, copies_total: 0 };
        map.set(value, stat);
      }
      stat.copies_total += entry.copies;
      if (snap.is_winner) stat.wins += entry.copies;
      else stat.losses += entry.copies;
      seenInThisDeck.add(value);
    }
    for (const value of seenInThisDeck) {
      map.get(value)!.games_count += 1;
    }
  }
  return finalize(map, minGames);
}

/** Per-card winrate. */
export function aggregateByCard(
  snapshots: DeckSnapshot[],
  cards: Map<number, CardRow>,
  minGames: number
): EntityStat[] {
  const map = new Map<string, EntityStat>();
  for (const snap of snapshots) {
    for (const entry of snap.cards) {
      const card = cards.get(entry.card_id);
      if (!card) continue;
      const key = String(card.id);
      let stat = map.get(key);
      if (!stat) {
        stat = {
          key,
          label: card.name,
          wins: 0,
          losses: 0,
          winrate: 0,
          games_count: 0,
          copies_total: 0,
          image_url: card.image_url,
        };
        map.set(key, stat);
      }
      stat.copies_total += entry.copies;
      stat.games_count += 1;
      if (snap.is_winner) stat.wins += entry.copies;
      else stat.losses += entry.copies;
    }
  }
  return finalize(map, minGames);
}

/** Per-hero winrate. */
export function aggregateByHero(
  snapshots: DeckSnapshot[],
  heroes: Map<string, HeroRow>,
  minGames: number
): EntityStat[] {
  const map = new Map<string, EntityStat>();
  for (const snap of snapshots) {
    if (!snap.hero_id) continue;
    const hero = heroes.get(snap.hero_id);
    if (!hero) continue;
    let stat = map.get(snap.hero_id);
    if (!stat) {
      stat = {
        key: snap.hero_id,
        label: hero.name,
        wins: 0,
        losses: 0,
        winrate: 0,
        games_count: 0,
        copies_total: 0,
        image_url: hero.thumbnail_url ?? null,
      };
      map.set(snap.hero_id, stat);
    }
    stat.copies_total += 1;
    stat.games_count += 1;
    if (snap.is_winner) stat.wins += 1;
    else stat.losses += 1;
  }
  return finalize(map, minGames);
}

/** Per-ability/keyword winrate. Counts both `keywords` array and `spell_keywords[].keyword`. */
export function aggregateByAbility(
  snapshots: DeckSnapshot[],
  cards: Map<number, CardRow>,
  minGames: number
): EntityStat[] {
  const map = new Map<string, EntityStat>();
  for (const snap of snapshots) {
    const seenInDeck = new Set<string>();
    for (const entry of snap.cards) {
      const card = cards.get(entry.card_id);
      if (!card) continue;
      const keywords = new Set<string>();
      for (const k of card.keywords ?? []) if (k) keywords.add(k);
      for (const sk of card.spell_keywords ?? []) if (sk?.keyword) keywords.add(sk.keyword);
      for (const k of keywords) {
        let stat = map.get(k);
        if (!stat) {
          stat = { key: k, label: k, wins: 0, losses: 0, winrate: 0, games_count: 0, copies_total: 0 };
          map.set(k, stat);
        }
        stat.copies_total += entry.copies;
        if (snap.is_winner) stat.wins += entry.copies;
        else stat.losses += entry.copies;
        seenInDeck.add(k);
      }
    }
    for (const k of seenInDeck) map.get(k)!.games_count += 1;
  }
  return finalize(map, minGames);
}

export interface MatchupCell {
  faction_a: string;
  faction_b: string;
  wins_a: number;
  total: number;
  winrate_a: number;
}

/**
 * Clé principale (faction/race/clan le plus représenté en copies) d'un snapshot,
 * dérivée de ses cartes. Reproduit la logique SQL de `primary_faction`
 * (somme des quantités, on garde le plus présent) pour les attributs non stockés.
 */
export function primaryAttributeOf(
  snap: DeckSnapshot,
  cards: Map<number, CardRow>,
  attribute: 'faction' | 'race' | 'clan'
): string | null {
  const counts = new Map<string, number>();
  for (const e of snap.cards) {
    const value = cards.get(e.card_id)?.[attribute];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + e.copies);
  }
  let best: string | null = null;
  let max = 0;
  for (const [value, n] of counts) {
    if (n > max) { max = n; best = value; }
  }
  return best;
}

/**
 * Heatmap : pour chaque paire (clé A, clé B), winrate de A face à B.
 * `keyOf` extrait la clé de regroupement d'un snapshot (faction stockée par défaut,
 * ou clan/race dérivés via {@link primaryAttributeOf}).
 */
export function aggregateMatchups(
  snapshots: DeckSnapshot[],
  keyOf: (s: DeckSnapshot) => string | null = (s) => s.primary_faction
): MatchupCell[] {
  const byMatch = new Map<string, DeckSnapshot[]>();
  for (const s of snapshots) {
    const arr = byMatch.get(s.match_id) ?? [];
    arr.push(s);
    byMatch.set(s.match_id, arr);
  }
  const key = (a: string, b: string) => `${a}__VS__${b}`;
  const map = new Map<string, MatchupCell>();
  for (const [, pair] of byMatch) {
    if (pair.length !== 2) continue;
    const [p, q] = pair;
    const winner = p.is_winner ? p : q;
    const loser = p.is_winner ? q : p;
    const fa = keyOf(winner);
    const fb = keyOf(loser);
    if (!fa || !fb) continue;
    // Cell (fa, fb) : fa a gagné
    const k1 = key(fa, fb);
    let c1 = map.get(k1);
    if (!c1) { c1 = { faction_a: fa, faction_b: fb, wins_a: 0, total: 0, winrate_a: 0 }; map.set(k1, c1); }
    c1.wins_a += 1;
    c1.total += 1;
    // Cell symétrique (fb, fa) : fb a perdu (donc 0 win sur 1 game)
    if (fa !== fb) {
      const k2 = key(fb, fa);
      let c2 = map.get(k2);
      if (!c2) { c2 = { faction_a: fb, faction_b: fa, wins_a: 0, total: 0, winrate_a: 0 }; map.set(k2, c2); }
      c2.total += 1;
    }
  }
  const arr = Array.from(map.values());
  for (const c of arr) c.winrate_a = c.total > 0 ? c.wins_a / c.total : 0;
  return arr;
}

/** Évolution temporelle d'une entité : bucket par semaine. */
export function evolutionFor(
  snapshots: DeckSnapshot[],
  cards: Map<number, CardRow>,
  heroes: Map<string, HeroRow>,
  entityType: 'card' | 'hero' | 'faction' | 'race' | 'clan' | 'ability',
  entityKey: string
): Array<{ week: string; wins: number; losses: number; winrate: number; games: number }> {
  const buckets = new Map<string, { wins: number; losses: number; games: number }>();
  for (const snap of snapshots) {
    const week = isoWeek(new Date(snap.created_at));
    let contribution = 0;
    let appears = false;
    if (entityType === 'card') {
      const id = Number(entityKey);
      for (const e of snap.cards) {
        if (e.card_id === id) { contribution += e.copies; appears = true; }
      }
    } else if (entityType === 'hero') {
      if (snap.hero_id === entityKey) { contribution = 1; appears = true; }
    } else if (entityType === 'faction' || entityType === 'race' || entityType === 'clan') {
      for (const e of snap.cards) {
        const card = cards.get(e.card_id);
        if (card && card[entityType] === entityKey) {
          contribution += e.copies;
          appears = true;
        }
      }
    } else if (entityType === 'ability') {
      for (const e of snap.cards) {
        const card = cards.get(e.card_id);
        if (!card) continue;
        const set = new Set<string>();
        for (const k of card.keywords ?? []) if (k) set.add(k);
        for (const sk of card.spell_keywords ?? []) if (sk?.keyword) set.add(sk.keyword);
        if (set.has(entityKey)) { contribution += e.copies; appears = true; }
      }
    }
    if (!appears) continue;
    let bucket = buckets.get(week);
    if (!bucket) { bucket = { wins: 0, losses: 0, games: 0 }; buckets.set(week, bucket); }
    if (snap.is_winner) bucket.wins += contribution;
    else bucket.losses += contribution;
    bucket.games += 1;
  }
  // void heroes (unused param ok)
  void heroes;
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, b]) => ({
      week,
      wins: b.wins,
      losses: b.losses,
      games: b.games,
      winrate: b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0,
    }));
}

function isoWeek(d: Date): string {
  // YYYY-Www
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
