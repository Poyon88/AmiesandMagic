// INSTALLATION D'UNE PARTIE — tout ce que `initializeGame` consomme, rassemblé
// en un seul endroit pour que le SERVEUR puisse reconstruire une partie à
// l'identique de ce qu'ont bâti les deux clients, puis la rejouer depuis
// `match_actions` (cf. replay.ts).
//
// Le rejeu n'est fidèle que si les entrées sont strictement les mêmes que chez
// les clients : mêmes decks, mêmes héros, MÊMES POOLS dans le même ordre. Les
// règles de construction des pools (factions par alignement, renfort neutre,
// cartes liées, filtres) sont donc ici, en fonctions pures, et la page de
// match les appelle aussi — deux copies divergeraient en silence.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, FormatCode, GameState, HeroDefinition, HeroPowerEffect, Race, TokenTemplate } from "./types";
import { FACTIONS } from "@/lib/card-engine/constants";
import { MANA_SPARK_NAMES } from "./mana-spark";
import { INVENTION_SET_NAME } from "./constants";
import { excludeSpecialSets, excludeNonDiscoverable, onlyPlayable } from "./deck-rules";
import { designatedCardIds } from "./tuteur";
import { effetsDuPouvoir } from "./hero-power";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import { firstPlayerIndexForMatch, seedForMatch } from "./first-player";
import { initializeGame } from "./engine";
import { regleDecouverteActivee } from "./decouverte";

// Colonnes de `cards` réellement consommées par le moteur en partie. Projection
// explicite (au lieu de select("*")) pour réduire l'egress : le pool de sorts +
// cartes de faction est chargé par match ET par client. On écarte
// `illustration_prompt` (long prompt de génération, jamais lu en jeu) et
// `created_at`. Miroir de la liste de api/cards/save (moins illustration_prompt).
export const GAME_CARD_COLUMNS =
  "id, name, mana_cost, card_type, attack, health, effect_text, flavor_text, " +
  "keywords, keyword_instances, spell_keywords, spell_effects, capabilities, " +
  "image_url, faction, race, race2, clan, rarity, card_alignment, convocation_token_id, " +
  "convocation_tokens, lycanthropie_token_id, entraide_race, set_id, card_year, " +
  "card_month, sfx_play_url, sfx_death_url, sfx_exile_url, life_cost, discard_cost, sacrifice_cost, exile_cost, topdeck_cost, retreat_cost, eveil_cost, equip_cost, discoverable, status";

/** Colonnes des cartes LIÉES : celles de la route /api/cards/by-ids qu'appelle
 *  la page de match (+ status_reason). Les objets doivent être identiques au
 *  champ près, ils finissent dans l'état de jeu (et dans son hash). */
export const LINKED_CARD_COLUMNS = `${GAME_CARD_COLUMNS}, status_reason`;

export interface HeroRow {
  id: number;
  name: string;
  race: string;
  faction?: string | null;
  clan?: string | null;
  power_name: string;
  power_cost: number;
  power_effect: HeroPowerEffect;
  power_description: string;
  power_usage_limit?: number | null;
  starting_hp?: number | null;
  glb_url?: string | null;
  thumbnail_url?: string | null;
  power_image_url?: string | null;
  power_sfx_url?: string | null;
  rarity?: string | null;
}

export function mapHeroRow(row: HeroRow | null): HeroDefinition | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    race: row.race as Race,
    faction: row.faction ?? null,
    clan: row.clan ?? null,
    powerName: row.power_name,
    powerCost: row.power_cost,
    powerEffect: row.power_effect,
    powerDescription: row.power_description,
    powerUsageLimit: row.power_usage_limit ?? null,
    startingHp: row.starting_hp ?? null,
    glbUrl: row.glb_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    rarity: row.rarity ?? null,
    powerImageUrl: row.power_image_url ?? null,
    powerSfxUrl: row.power_sfx_url ?? null,
  };
}

export type DeckEntry = { card: Card; quantity: number };

/** Lignes deck_cards → entrées du moteur, triées par card_id : les deux
 *  clients (et le serveur) doivent produire EXACTEMENT le même ordre. */
export function toDeckEntries(rows: { card_id: number; quantity: number; cards: unknown }[]): DeckEntry[] {
  return [...rows]
    .sort((a, b) => a.card_id - b.card_id)
    .map((dc) => ({ card: dc.cards as Card, quantity: dc.quantity }));
}

/** Factions dont les cartes alimentent le pool de Sélection & co.
 *
 *  Sélection X propose des communes de TOUTES les factions du même ALIGNEMENT
 *  que les decks ; les alignements tranchés (bon, maléfique) reçoivent en
 *  renfort le pool NEUTRE. Sans cet élargissement, un joueur mono-faction ne se
 *  verrait proposer que sa propre faction. */
export function selectionFactionsFor(decks: DeckEntry[]): string[] {
  const deckFactions = new Set(decks.map((c) => c.card.faction).filter(Boolean) as string[]);
  deckFactions.add("Mercenaires");
  const deckAlignments = new Set<string>();
  for (const f of deckFactions) {
    const al = FACTIONS[f]?.alignment;
    if (al && al !== "spéciale") deckAlignments.add(al);
  }
  const renfortNeutre = deckAlignments.has("bon") || deckAlignments.has("maléfique");
  const out = new Set(deckFactions);
  for (const [factionId, def] of Object.entries(FACTIONS)) {
    if (def.alignment === "spéciale") continue;
    if (deckAlignments.has(def.alignment) || (renfortNeutre && def.alignment === "neutre")) out.add(factionId);
  }
  return Array.from(out);
}

/** Ids des cartes LIÉES (Compagnons, Tuteur, Transformation, Invocation
 *  désignée, pouvoirs de héros composés) qui ne sont pas déjà en mémoire —
 *  triés, pour un chargement déterministe. */
export function missingLinkedCardIds(
  decks: DeckEntry[],
  factionCards: Card[],
  allSpells: Card[],
  heroes: (HeroDefinition | null)[],
): number[] {
  const linkedIds = new Set<number>();
  const collect = (c: Card) => {
    for (const inst of c.keyword_instances ?? []) {
      if (inst.id === "compagnons" || inst.id === "tuteur" || inst.id === "transformation") for (const id of inst.linkedCardIds ?? []) linkedIds.add(id);
    }
    for (const sk of c.spell_keywords ?? []) {
      if (sk.id === "compagnons" || sk.id === "tuteur") for (const id of sk.linkedCardIds ?? []) linkedIds.add(id);
    }
    for (const cap of c.capabilities ?? []) {
      if (cap.abilityId === "compagnons" || cap.abilityId === "tuteur" || cap.abilityId === "transformation") for (const id of cap.linkedCardIds ?? []) linkedIds.add(id);
      for (const id of designatedCardIds(cap.composed)) linkedIds.add(id);
    }
  };
  decks.forEach(({ card }) => collect(card));
  factionCards.forEach(collect);
  allSpells.forEach(collect);
  for (const h of heroes) {
    for (const e of effetsDuPouvoir(h)) {
      if (e.mode === "composed") for (const id of designatedCardIds(e.composed)) linkedIds.add(id);
    }
  }
  const loaded = new Set([...factionCards, ...allSpells].map((c) => c.id));
  return Array.from(linkedIds).filter((id) => !loaded.has(id)).sort((a, b) => a - b);
}

/** MUTATION X — vivier de TOUTES les créatures communes, toutes factions et
 *  tous alignements (le pool de faction, lui, s'arrête à l'alignement des
 *  decks). Chargé à CHAQUE partie : une carte à Mutation peut arriver en cours
 *  de partie par Sélection, Découverte, vol… Filtré côté base (créature,
 *  commune, jouable, découvrable) pour limiter l'egress, puis par les mêmes
 *  filtres purs que les autres pools ; trié par id pour que les deux clients et
 *  le rejeu serveur bâtissent EXACTEMENT le même vivier. */
export function fetchMutationPoolRows(db: SupabaseClient): Promise<Card[]> {
  return fetchAllRows<Card>(
    (from, to) => db.from("cards").select(GAME_CARD_COLUMNS)
      .eq("card_type", "creature").eq("rarity", "Commune").eq("status", "playable").eq("discoverable", true)
      .order("id").range(from, to).returns<Card[]>(),
    { label: "Vivier de Mutation" },
  );
}

export function buildMutationPool(rows: Card[], specialSetIds: ReadonlySet<number>): Card[] {
  return onlyPlayable(excludeNonDiscoverable(excludeSpecialSets(rows, specialSetIds as Set<number>)))
    .filter((c) => c.card_type === "creature" && (c.rarity ?? "Commune") === "Commune")
    .sort((a, b) => a.id - b.id);
}

/** Pools de tirage filtrés, Étincelle de Mana garantie dans le pool de faction. */
export function buildPools(
  factionCardsData: Card[],
  allSpellsData: Card[],
  manaSpark: Card | undefined,
  specialSetIds: Set<number>,
): { factionCards: Card[]; allSpells: Card[] } {
  const factionCards = onlyPlayable(excludeNonDiscoverable(excludeSpecialSets(factionCardsData, specialSetIds)));
  if (manaSpark && !factionCards.find((c) => c.id === manaSpark.id)) factionCards.push(manaSpark);
  const allSpells = onlyPlayable(excludeNonDiscoverable(excludeSpecialSets(allSpellsData, specialSetIds)));
  return { factionCards, allSpells };
}

export interface MatchRow {
  id: string;
  player1_id: string;
  player2_id: string;
  player1_deck_id: number;
  player2_deck_id: number;
}

/** Tout ce qu'il faut pour `initializeGame`, et rien de cosmétique. */
export interface MatchSetup {
  match: MatchRow;
  p1Cards: DeckEntry[];
  p2Cards: DeckEntry[];
  p1Hero: HeroDefinition | null;
  p2Hero: HeroDefinition | null;
  factionCards: Card[];
  allSpells: Card[];
  /** Vivier de Mutation X (cf. buildMutationPool). */
  mutationPool: Card[];
  tokenTemplates: TokenTemplate[];
  machineTemplates: Card[];
  p1OwnedLimitedIds: number[];
  p2OwnedLimitedIds: number[];
  formatCode: FormatCode | null;
  /** Cartes liées ajoutées au pool de faction (colonnes LINKED_CARD_COLUMNS). */
  linkedCardIds: number[];
}

/** Charge l'installation d'une partie avec un client SERVICE ROLE (pas de RLS :
 *  il voit les cartes et exemplaires des deux joueurs, comme les routes que la
 *  page de match appelle pour la même raison). */
export async function loadMatchSetup(db: SupabaseClient, match: MatchRow): Promise<MatchSetup> {
  const [p1DeckCards, p2DeckCards, p1DeckData, p2DeckData, tokenRes, p1Prints, p2Prints] = await Promise.all([
    db.from("deck_cards").select("card_id, quantity, cards(*)").eq("deck_id", match.player1_deck_id),
    db.from("deck_cards").select("card_id, quantity, cards(*)").eq("deck_id", match.player2_deck_id),
    db.from("decks").select("hero_id, format_id, heroes(*)").eq("id", match.player1_deck_id).single(),
    db.from("decks").select("hero_id, format_id, heroes(*)").eq("id", match.player2_deck_id).single(),
    db.from("token_templates").select("*").order("race"),
    db.from("card_prints").select("card_id").eq("owner_id", match.player1_id),
    db.from("card_prints").select("card_id").eq("owner_id", match.player2_id),
  ]);
  for (const r of [p1DeckCards, p2DeckCards, p1DeckData, p2DeckData, tokenRes]) {
    if (r.error) throw new Error(`[match-setup] ${r.error.message}`);
  }

  const p1Cards = toDeckEntries(p1DeckCards.data ?? []);
  const p2Cards = toDeckEntries(p2DeckCards.data ?? []);

  const formatId =
    (p1DeckData.data as { format_id?: number | null } | null)?.format_id
    ?? (p2DeckData.data as { format_id?: number | null } | null)?.format_id
    ?? null;
  let formatCode: FormatCode | null = null;
  if (formatId != null) {
    const { data } = await db.from("formats").select("code").eq("id", formatId).maybeSingle();
    formatCode = (data?.code as FormatCode | undefined) ?? null;
  }

  const p1Hero = mapHeroRow((p1DeckData.data?.heroes as unknown as HeroRow) ?? null);
  const p2Hero = mapHeroRow((p2DeckData.data?.heroes as unknown as HeroRow) ?? null);

  const factions = selectionFactionsFor([...p1Cards, ...p2Cards]);
  const [factionCardsData, manaSparkRes, allSpellsData, specialSetsRes, machineTemplates, mutationRows] = await Promise.all([
    fetchAllRows<Card>(
      (from, to) => db.from("cards").select(GAME_CARD_COLUMNS).in("faction", factions).order("id").range(from, to).returns<Card[]>(),
      { label: "Pool des factions du match (serveur)" },
    ),
    db.from("cards").select(GAME_CARD_COLUMNS).in("name", MANA_SPARK_NAMES as unknown as string[]).eq("card_type", "spell").limit(1).returns<Card[]>(),
    fetchAllRows<Card>(
      (from, to) => db.from("cards").select(GAME_CARD_COLUMNS).eq("card_type", "spell").order("id").range(from, to).returns<Card[]>(),
      { label: "Pool des sorts du match (serveur)" },
    ),
    db.from("sets").select("id").eq("type", "special").returns<{ id: number }[]>(),
    (async (): Promise<Card[]> => {
      const { data: set } = await db.from("sets").select("id").eq("name", INVENTION_SET_NAME).order("id").limit(1).maybeSingle<{ id: number }>();
      if (!set) return [];
      const { data } = await db.from("cards").select(GAME_CARD_COLUMNS).eq("set_id", set.id).eq("card_type", "creature").order("id").returns<Card[]>();
      return data ?? [];
    })(),
    fetchMutationPoolRows(db),
  ]);

  const specialSetIds = new Set((specialSetsRes.data ?? []).map((r) => r.id));
  const { factionCards, allSpells } = buildPools(factionCardsData, allSpellsData, manaSparkRes.data?.[0], specialSetIds);
  const mutationPool = buildMutationPool(mutationRows, specialSetIds);

  const missing = missingLinkedCardIds([...p1Cards, ...p2Cards], factionCards, allSpells, [p1Hero, p2Hero]);
  const linkedCardIds: number[] = [];
  if (missing.length > 0) {
    const { data, error } = await db.from("cards").select(LINKED_CARD_COLUMNS).in("id", missing).order("id").returns<Card[]>();
    if (error) throw new Error(`[match-setup] cartes liées : ${error.message}`);
    factionCards.push(...(data ?? []));
    linkedCardIds.push(...(data ?? []).map((c) => c.id));
  }

  const limitedIds = (rows: { card_id: number }[] | null) => Array.from(new Set((rows ?? []).map((r) => r.card_id)));

  return {
    match,
    p1Cards,
    p2Cards,
    p1Hero,
    p2Hero,
    factionCards,
    allSpells,
    mutationPool,
    tokenTemplates: (tokenRes.data ?? []) as TokenTemplate[],
    machineTemplates,
    p1OwnedLimitedIds: limitedIds(p1Prints.data),
    p2OwnedLimitedIds: limitedIds(p2Prints.data),
    formatCode,
    linkedCardIds,
  };
}

/** État initial, construit EXACTEMENT comme `gameStore.initGame` + l'appel
 *  `setOwnedLimitedCardIds` de la page de match. */
export function initialStateFromSetup(setup: MatchSetup, decouverteAlternee = regleDecouverteActivee()): GameState {
  const { match } = setup;
  const state = initializeGame(
    match.player1_id,
    match.player2_id,
    setup.p1Cards,
    setup.p2Cards,
    firstPlayerIndexForMatch(match.id),
    seedForMatch(match.id),
    setup.p1Hero,
    setup.p2Hero,
    setup.factionCards,
    setup.allSpells,
    setup.formatCode,
    decouverteAlternee ? { decouverteAlternee: true } : undefined,
  );
  state.tokenTemplates = setup.tokenTemplates;
  state.machineTemplates = setup.machineTemplates;
  state.mutationPool = setup.mutationPool;
  state.players[0].ownedLimitedCardIds = setup.p1OwnedLimitedIds;
  state.players[1].ownedLimitedCardIds = setup.p2OwnedLimitedIds;
  return state;
}

// ─── Configuration FIGÉE au lancement ───────────────────────────────────────
// Les decks et les cartes changent (éditions admin, decks retouchés) : rejouer
// une partie avec les données du moment de la fin n'est fidèle que si rien n'a
// bougé. On capture donc au lancement ce qui est petit (decks, héros, jetons,
// exemplaires possédés, format, règles) en entier, et les pools — trop gros —
// sous forme d'ids ordonnés, avec l'instant de capture : une carte de pool
// modifiée depuis rend le rejeu douteux, et on le SAIT au lieu de le subir.

export interface MatchSetupSnapshot {
  version: 1;
  capturedAt: string;
  match: MatchRow;
  p1Cards: DeckEntry[];
  p2Cards: DeckEntry[];
  p1Hero: HeroDefinition | null;
  p2Hero: HeroDefinition | null;
  tokenTemplates: TokenTemplate[];
  factionCardIds: number[];
  allSpellIds: number[];
  /** Absent des captures d'avant Mutation X : vivier vide au rejeu. */
  mutationCardIds?: number[];
  machineTemplateIds: number[];
  linkedCardIds: number[];
  p1OwnedLimitedIds: number[];
  p2OwnedLimitedIds: number[];
  formatCode: FormatCode | null;
  decouverteAlternee: boolean;
}

export function snapshotSetup(setup: MatchSetup, capturedAt = new Date()): MatchSetupSnapshot {
  return {
    version: 1,
    capturedAt: capturedAt.toISOString(),
    match: setup.match,
    p1Cards: setup.p1Cards,
    p2Cards: setup.p2Cards,
    p1Hero: setup.p1Hero,
    p2Hero: setup.p2Hero,
    tokenTemplates: setup.tokenTemplates,
    factionCardIds: setup.factionCards.map((c) => c.id),
    allSpellIds: setup.allSpells.map((c) => c.id),
    mutationCardIds: setup.mutationPool.map((c) => c.id),
    machineTemplateIds: setup.machineTemplates.map((c) => c.id),
    linkedCardIds: setup.linkedCardIds,
    p1OwnedLimitedIds: setup.p1OwnedLimitedIds,
    p2OwnedLimitedIds: setup.p2OwnedLimitedIds,
    formatCode: setup.formatCode,
    decouverteAlternee: regleDecouverteActivee(),
  };
}

/** Recharge les cartes des pools par id, dans l'ORDRE capturé, et signale
 *  celles modifiées après la capture (rejeu alors non garanti). */
export async function setupFromSnapshot(
  db: SupabaseClient,
  snap: MatchSetupSnapshot,
): Promise<{ setup: MatchSetup; changedCardIds: number[]; missingCardIds: number[] }> {
  const ids = Array.from(new Set([...snap.factionCardIds, ...snap.allSpellIds, ...(snap.mutationCardIds ?? []), ...snap.machineTemplateIds]));
  const byId = new Map<number, Card & { updated_at?: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const lot = ids.slice(i, i + 300);
    const { data, error } = await db
      .from("cards")
      .select(`${LINKED_CARD_COLUMNS}, updated_at`)
      .in("id", lot)
      .returns<(Card & { updated_at?: string | null })[]>();
    if (error) throw new Error(`[match-setup] pools : ${error.message}`);
    for (const c of data ?? []) byId.set(c.id, c);
  }
  const captured = Date.parse(snap.capturedAt);
  const changedCardIds: number[] = [];
  const missingCardIds: number[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) missingCardIds.push(id);
    else if (c.updated_at && Date.parse(c.updated_at) > captured) changedCardIds.push(id);
  }
  // `status_reason` n'existe que sur les cartes liées (cf. LINKED_CARD_COLUMNS).
  const linked = new Set(snap.linkedCardIds ?? []);
  const strip = (c: Card & { updated_at?: string | null; status_reason?: unknown }): Card => {
    const { updated_at: _u, status_reason, ...rest } = c;
    void _u;
    return (linked.has(c.id) ? { ...rest, status_reason } : rest) as Card;
  };
  const pick = (list: number[]) => list.map((id) => byId.get(id)).filter(Boolean).map((c) => strip(c!));
  return {
    setup: {
      match: snap.match,
      p1Cards: snap.p1Cards,
      p2Cards: snap.p2Cards,
      p1Hero: snap.p1Hero,
      p2Hero: snap.p2Hero,
      factionCards: pick(snap.factionCardIds),
      allSpells: pick(snap.allSpellIds),
      mutationPool: pick(snap.mutationCardIds ?? []),
      tokenTemplates: snap.tokenTemplates,
      machineTemplates: pick(snap.machineTemplateIds),
      p1OwnedLimitedIds: snap.p1OwnedLimitedIds,
      p2OwnedLimitedIds: snap.p2OwnedLimitedIds,
      formatCode: snap.formatCode,
      linkedCardIds: snap.linkedCardIds ?? [],
    },
    changedCardIds,
    missingCardIds,
  };
}
