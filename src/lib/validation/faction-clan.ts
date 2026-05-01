import { FACTIONS } from '@/lib/card-engine/constants';

export type FactionClanResult =
  | { ok: true; faction: string | null; clan: string | null }
  | { ok: false; error: string };

export function validateFactionClan(
  faction: unknown,
  clan: unknown,
): FactionClanResult {
  let f: string | null = null;
  if (typeof faction === 'string' && faction.trim()) {
    if (!(faction in FACTIONS)) return { ok: false, error: 'Faction invalide' };
    f = faction;
  } else if (faction === null) {
    f = null;
  }
  let c: string | null = null;
  if (typeof clan === 'string' && clan.trim()) {
    if (!f) return { ok: false, error: 'Clan sans faction' };
    const def = FACTIONS[f];
    if (def.clans && !def.clans.names.includes(clan)) {
      return { ok: false, error: 'Clan invalide pour cette faction' };
    }
    c = clan;
  } else if (clan === null) {
    c = null;
  }
  return { ok: true, faction: f, clan: c };
}

export type RaceResult =
  | { ok: true; race: string | null }
  | { ok: false; error: string };

// Validates a race against the granular race list of the chosen faction.
// If no faction is provided, the race must belong to at least one faction.
export function validateRace(race: unknown, faction: string | null): RaceResult {
  if (race === null || race === undefined || (typeof race === 'string' && !race.trim())) {
    return { ok: true, race: null };
  }
  if (typeof race !== 'string') {
    return { ok: false, error: 'Race invalide' };
  }
  if (faction) {
    const def = FACTIONS[faction];
    if (!def?.races.includes(race)) {
      return { ok: false, error: 'Race invalide pour cette faction' };
    }
    return { ok: true, race };
  }
  const allRaces = new Set(Object.values(FACTIONS).flatMap((f) => f.races));
  if (!allRaces.has(race)) return { ok: false, error: 'Race inconnue' };
  return { ok: true, race };
}
