"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Card, Keyword, CardSet, GameFormat, FormatSet } from "@/lib/game/types";
import { getFormatFilter } from "@/lib/game/format-legality";
import { isCardOwned } from "@/lib/game/collection";
import GameCard from "./GameCard";

interface OwnedPrint {
  id: number;
  card_id: number;
  print_number: number;
  max_prints: number;
}

interface CollectionViewProps {
  cards: Card[];
  sets: CardSet[];
  formats: GameFormat[];
  formatSets: FormatSet[];
  collectedCardIds: number[];
  isTester: boolean;
  ownedPrints?: OwnedPrint[];
}

import { ALL_KEYWORDS, KEYWORD_LABELS } from "@/lib/game/keyword-labels";
const KEYWORDS = [...ALL_KEYWORDS].sort((a, b) => KEYWORD_LABELS[a].localeCompare(KEYWORD_LABELS[b], "fr"));

const RARITIES = ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"];
const RARITY_COLORS: Record<string, string> = {
  "Commune": "#aaaaaa",
  "Peu Commune": "#4caf50",
  "Rare": "#4fc3f7",
  "Épique": "#ce93d8",
  "Légendaire": "#ffd54f",
};

export default function CollectionView({ cards, sets, formats, formatSets, collectedCardIds, isTester, ownedPrints = [] }: CollectionViewProps) {
  const ownedSet = useMemo(() => new Set(collectedCardIds), [collectedCardIds]);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [manaCostFilter, setManaCostFilter] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<"creature" | "spell" | null>(null);
  const [keywordFilter, setKeywordFilter] = useState<Keyword | null>(null);
  const [factionFilter, setFactionFilter] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [raceFilter, setRaceFilter] = useState<string | null>(null);
  const [clanFilter, setClanFilter] = useState<string | null>(null);
  const [filterSet, setFilterSet] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("");

  // Extract unique factions, races, clans from cards
  const factions = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => { if (c.faction) set.add(c.faction); });
    return Array.from(set).sort();
  }, [cards]);

  const races = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => { if (c.race) set.add(c.race); });
    return Array.from(set).sort();
  }, [cards]);

  const clans = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => { if (c.clan) set.add(c.clan); });
    return Array.from(set).sort();
  }, [cards]);

  const years = useMemo(() => {
    return [...new Set(cards.filter(c => c.card_year).map(c => String(c.card_year)))].sort();
  }, [cards]);

  const selectedFormat = useMemo(() => {
    if (!formatFilter) return null;
    return formats.find(f => String(f.id) === formatFilter) ?? null;
  }, [formatFilter, formats]);

  const formatPredicate = useMemo(() => {
    if (!selectedFormat) return null;
    return getFormatFilter(selectedFormat, sets, formatSets);
  }, [selectedFormat, sets, formatSets]);

  // Build a map of prints per card_id for normal players
  const printsByCard = useMemo(() => {
    const map = new Map<number, OwnedPrint[]>();
    for (const p of ownedPrints) {
      const list = map.get(p.card_id) ?? [];
      list.push(p);
      map.set(p.card_id, list);
    }
    return map;
  }, [ownedPrints]);

  const isNormalPlayer = !isTester && ownedPrints.length > 0;

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (!isCardOwned(card, ownedSet, isTester)) return false;
      if (formatPredicate && !formatPredicate(card)) return false;
      if (search && !card.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (manaCostFilter !== null && card.mana_cost !== manaCostFilter)
        return false;
      if (typeFilter !== null && card.card_type !== typeFilter) return false;
      if (keywordFilter !== null && !card.keywords.includes(keywordFilter))
        return false;
      if (factionFilter !== null && card.faction !== factionFilter)
        return false;
      if (rarityFilter !== null && card.rarity !== rarityFilter)
        return false;
      if (raceFilter !== null && card.race !== raceFilter)
        return false;
      if (clanFilter !== null && card.clan !== clanFilter)
        return false;
      if (filterSet && card.set_id !== parseInt(filterSet))
        return false;
      if (filterYear && String(card.card_year) !== filterYear)
        return false;
      return true;
    });
  }, [cards, ownedSet, isTester, formatPredicate, search, manaCostFilter, typeFilter, keywordFilter, factionFilter, rarityFilter, raceFilter, clanFilter, filterSet, filterYear]);

  // For normal players: expand cards to show each print separately
  const displayItems = useMemo(() => {
    if (!isNormalPlayer) {
      // Admin/testeur: one card each, no print numbers
      return filteredCards.map(card => ({ card, printNumber: undefined as number | undefined, maxPrints: undefined as number | undefined, key: `card-${card.id}` }));
    }
    const items: { card: Card; printNumber: number | undefined; maxPrints: number | undefined; key: string }[] = [];
    for (const card of filteredCards) {
      const prints = printsByCard.get(card.id);
      if (prints && prints.length > 0) {
        // Show each print as a separate card
        for (const p of prints) {
          items.push({ card, printNumber: p.print_number, maxPrints: p.max_prints, key: `print-${p.id}` });
        }
      } else {
        // Card from user_collections (no prints) — show once without number
        items.push({ card, printNumber: undefined, maxPrints: undefined, key: `card-${card.id}` });
      }
    }
    return items;
  }, [filteredCards, isNormalPlayer, printsByCard]);

  function resetFilters() {
    setSearch("");
    setManaCostFilter(null);
    setTypeFilter(null);
    setKeywordFilter(null);
    setFactionFilter(null);
    setRarityFilter(null);
    setRaceFilter(null);
    setClanFilter(null);
    setFilterSet("");
    setFilterYear("");
    setFormatFilter("");
  }

  const hasActiveFilters =
    search || manaCostFilter !== null || typeFilter !== null || keywordFilter !== null || factionFilter !== null || rarityFilter !== null || raceFilter !== null || clanFilter !== null || filterSet !== "" || filterYear !== "" || formatFilter !== "";

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Card Collection</h1>
          <p className="text-foreground/50 text-sm mt-1">
            {displayItems.length} carte{displayItems.length > 1 ? "s" : ""}{isNormalPlayer ? "" : ` sur ${cards.length}`}
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-secondary border border-card-border rounded-lg text-foreground/60 hover:text-foreground hover:border-primary/40 transition-colors"
        >
          Back to Menu
        </button>
      </div>

      {/* Filters */}
      <div className="bg-secondary rounded-xl border border-card-border p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="px-4 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors w-64"
          />

          {/* Mana cost filter */}
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Mana:</span>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((cost) => (
              <button
                key={cost}
                onClick={() =>
                  setManaCostFilter(manaCostFilter === cost ? null : cost)
                }
                className={`w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                  manaCostFilter === cost
                    ? "bg-mana-blue text-white"
                    : "bg-background border border-card-border text-foreground/50 hover:border-mana-blue/50"
                }`}
              >
                {cost}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div className="flex gap-1">
            <button
              onClick={() =>
                setTypeFilter(typeFilter === "creature" ? null : "creature")
              }
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                typeFilter === "creature"
                  ? "bg-primary text-background"
                  : "bg-background border border-card-border text-foreground/50 hover:border-primary/50"
              }`}
            >
              Creatures
            </button>
            <button
              onClick={() =>
                setTypeFilter(typeFilter === "spell" ? null : "spell")
              }
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                typeFilter === "spell"
                  ? "bg-purple-600 text-white"
                  : "bg-background border border-card-border text-foreground/50 hover:border-purple-500/50"
              }`}
            >
              Spells
            </button>
          </div>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 text-sm text-accent hover:text-accent/80 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Second row: Faction, Rarity, Keyword */}
        <div className="flex flex-wrap gap-4 items-center mt-3 pt-3 border-t border-card-border/30">
          {/* Faction filter */}
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Faction:</span>
            <select
              value={factionFilter ?? ""}
              onChange={(e) => setFactionFilter(e.target.value || null)}
              className="px-3 py-1.5 bg-background border border-card-border rounded-lg text-foreground/70 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Toutes</option>
              {factions.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Rarity filter */}
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Rareté:</span>
            <div className="flex gap-1">
              {RARITIES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRarityFilter(rarityFilter === r ? null : r)}
                  style={{
                    borderColor: rarityFilter === r ? RARITY_COLORS[r] : undefined,
                    color: rarityFilter === r ? RARITY_COLORS[r] : undefined,
                    backgroundColor: rarityFilter === r ? `${RARITY_COLORS[r]}15` : undefined,
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                    rarityFilter === r
                      ? "border"
                      : "bg-background border border-card-border text-foreground/50 hover:border-primary/50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Keyword filter */}
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Capacité:</span>
            <select
              value={keywordFilter ?? ""}
              onChange={(e) =>
                setKeywordFilter(e.target.value ? (e.target.value as Keyword) : null)
              }
              className="px-3 py-1.5 bg-background border border-card-border rounded-lg text-foreground/70 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Toutes</option>
              {KEYWORDS.map((kw) => (
                <option key={kw} value={kw}>
                  {KEYWORD_LABELS[kw]}
                </option>
              ))}
            </select>
          </div>

          {/* Race filter */}
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Race:</span>
            <select
              value={raceFilter ?? ""}
              onChange={(e) => setRaceFilter(e.target.value || null)}
              className="px-3 py-1.5 bg-background border border-card-border rounded-lg text-foreground/70 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Toutes</option>
              {races.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Clan filter */}
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Clan:</span>
            <select
              value={clanFilter ?? ""}
              onChange={(e) => setClanFilter(e.target.value || null)}
              className="px-3 py-1.5 bg-background border border-card-border rounded-lg text-foreground/70 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Tous</option>
              {clans.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Format filter */}
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Format:</span>
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              className="px-3 py-1.5 bg-background border border-card-border rounded-lg text-foreground/70 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Tous</option>
              {formats.map((f) => (
                <option key={f.id} value={String(f.id)}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Set filter */}
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Set:</span>
            <select
              value={filterSet}
              onChange={(e) => setFilterSet(e.target.value)}
              className="px-3 py-1.5 bg-background border border-card-border rounded-lg text-foreground/70 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Tous</option>
              {sets.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.icon} {s.name}</option>
              ))}
            </select>
          </div>

          {/* Year filter */}
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Année:</span>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-3 py-1.5 bg-background border border-card-border rounded-lg text-foreground/70 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Toutes</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Card Grid */}
      {displayItems.length === 0 ? (
        <div className="text-center py-20 text-foreground/40">
          Aucune carte ne correspond à vos filtres
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 justify-items-center">
          {displayItems.map((item) => (
            <GameCard
              key={item.key}
              card={item.card}
              size="md"
              printNumber={item.printNumber}
              maxPrints={item.maxPrints}
            />
          ))}
        </div>
      )}
    </div>
  );
}
