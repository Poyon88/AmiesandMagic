// Chargement SERVEUR (service role) de ce qu'il faut pour simuler sur decks
// existants : les decks des comptes admin / testeur, figés, et le catalogue.
// Utilisé par /api/admin/sim/catalogue et par scripts/sim/run-batch.ts.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INVENTION_SET_NAME } from "@/lib/game/constants";
import type { Card, FormatCode, HeroDefinition, HeroPowerEffect, Race, TokenTemplate } from "@/lib/game/types";
import type { CatalogueSim, DeckFige } from "./deck-test";

/** Rôles dont les decks servent aux simulations (arbitrage auteur 2026-10-13). */
export const ROLES_DECKS_SIM = ["admin", "testeur"] as const;

// Miroir de GAME_CARD_COLUMNS (page de match), plus le statut pour les filtres.
const COLONNES_JEU =
  "id, name, mana_cost, card_type, attack, health, effect_text, keywords, keyword_instances, spell_keywords, spell_effects, capabilities, " +
  "faction, race, clan, rarity, card_alignment, convocation_token_id, convocation_tokens, lycanthropie_token_id, entraide_race, set_id, " +
  "card_year, card_month, life_cost, discard_cost, sacrifice_cost, exile_cost, topdeck_cost, eveil_cost, equip_cost, discoverable, status";

interface HeroRow {
  id: number; name: string; race: string; faction?: string | null; clan?: string | null;
  power_name: string; power_cost: number; power_effect: HeroPowerEffect; power_description: string; power_usage_limit?: number | null;
}

/** Même correspondance que mapHeroRow (page de match), sans les médias. */
export function heroDepuisLigne(r: HeroRow | null): HeroDefinition | null {
  if (!r) return null;
  return {
    id: r.id, name: r.name, race: r.race as Race, faction: r.faction ?? null, clan: r.clan ?? null,
    powerName: r.power_name, powerCost: r.power_cost, powerEffect: r.power_effect, powerDescription: r.power_description,
    powerUsageLimit: r.power_usage_limit ?? null, glbUrl: null, thumbnailUrl: null, powerImageUrl: null, powerSfxUrl: null,
  };
}

async function tout<T>(sb: SupabaseClient, table: string, cols: string, filtre: (q: any) => any = (q) => q): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filtre(sb.from(table).select(cols)).order("id").range(from, from + 999);
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...(data as T[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

/** Empreinte des colonnes de JEU du catalogue : si elle change, une partie
 *  rejouée depuis sa graine peut ne plus être la même. */
export function empreinteCatalogue(cards: Card[]): string {
  const h = createHash("sha256");
  for (const c of [...cards].sort((a, b) => a.id - b.id)) h.update(JSON.stringify(c));
  return h.digest("hex").slice(0, 16);
}

export interface ChargementSim { catalogue: CatalogueSim; decks: DeckFige[]; empreinte: string }

export async function chargerSim(sb: SupabaseClient): Promise<ChargementSim> {
  const [cards, tokens, sets, profils, formats] = await Promise.all([
    tout<Card>(sb, "cards", COLONNES_JEU),
    tout<TokenTemplate>(sb, "token_templates", "*"),
    tout<{ id: number; name: string; type: string | null }>(sb, "sets", "id, name, type"),
    tout<{ id: string; username: string | null; role: string }>(sb, "profiles", "id, username, role", (q) => q.in("role", ROLES_DECKS_SIM as unknown as string[])),
    tout<{ id: number; code: string }>(sb, "formats", "id, code"),
  ]);
  const invention = sets.find((s) => s.name === INVENTION_SET_NAME);
  const machines = invention ? cards.filter((c) => c.set_id === invention.id && c.card_type === "creature") : [];
  const proprio = new Map(profils.map((p) => [p.id, p.username ?? "?"]));
  const codeFormat = new Map(formats.map((f) => [f.id, f.code as FormatCode]));

  const lignes = profils.length
    ? await tout<{ id: number; name: string; user_id: string; format_id: number | null; heroes: HeroRow | null }>(
      sb, "decks", "id, name, user_id, format_id, heroes(*)", (q) => q.in("user_id", profils.map((p) => p.id)))
    : [];
  const contenu = lignes.length
    ? await tout<{ id: number; deck_id: number; card_id: number; quantity: number }>(
      sb, "deck_cards", "id, deck_id, card_id, quantity", (q) => q.in("deck_id", lignes.map((d) => d.id)))
    : [];
  const parId = new Map(cards.map((c) => [c.id, c]));

  const decks: DeckFige[] = lignes.map((d) => {
    const cs = contenu.filter((x) => x.deck_id === d.id).sort((a, b) => a.card_id - b.card_id).map((x) => ({ card_id: x.card_id, quantity: x.quantity }));
    const factions = new Map<string, number>();
    const clans = new Set<string>();
    for (const x of cs) {
      const c = parId.get(x.card_id);
      if (c?.faction) factions.set(c.faction, (factions.get(c.faction) ?? 0) + x.quantity);
      if (c?.clan) clans.add(c.clan);
    }
    const hero = heroDepuisLigne(d.heroes);
    const faction = hero?.faction ?? [...factions].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      id: d.id, name: d.name, owner: proprio.get(d.user_id) ?? "?", faction, clans: [...clans].sort(),
      hero, formatCode: d.format_id != null ? codeFormat.get(d.format_id) ?? null : null, cards: cs,
    };
  }).filter((d) => d.cards.reduce((s, c) => s + c.quantity, 0) > 0)
    .sort((a, b) => (a.faction ?? "").localeCompare(b.faction ?? "", "fr") || a.name.localeCompare(b.name, "fr"));

  return {
    catalogue: { cards, tokens, machines, specialSetIds: sets.filter((s) => s.type === "special").map((s) => s.id) },
    decks,
    empreinte: empreinteCatalogue(cards),
  };
}
