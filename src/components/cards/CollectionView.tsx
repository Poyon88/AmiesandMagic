"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Card, Keyword, CardSet } from "@/lib/game/types";
import GameCard from "./GameCard";

interface CollectionViewProps {
  cards: Card[];
  sets: CardSet[];
}

import { ALL_KEYWORDS, KEYWORD_LABELS } from "@/lib/game/keyword-labels";
const KEYWORDS = ALL_KEYWORDS;

const RARITIES = ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"];
const RARITY_COLORS: Record<string, string> = {
  "Commune": "#aaaaaa",
  "Peu Commune": "#4caf50",
  "Rare": "#4fc3f7",
  "Épique": "#ce93d8",
  "Légendaire": "#ffd54f",
};

export default function CollectionView({ cards, sets }: CollectionViewProps) {
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

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
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
  }, [cards, search, manaCostFilter, typeFilter, keywordFilter, factionFilter, rarityFilter, raceFilter, clanFilter, filterSet, filterYear]);

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
  }

  const hasActiveFilters =
    search || manaCostFilter !== null || typeFilter !== null || keywordFilter !== null || factionFilter !== null || rarityFilter !== null || raceFilter !== null || clanFilter !== null || filterSet !== "" || filterYear !== "";

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Card Collection</h1>
          <p className="text-foreground/50 text-sm mt-1">
            {filteredCards.length} of {cards.length} cards
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
      {filteredCards.length === 0 ? (
        <div className="text-center py-20 text-foreground/40">
          No cards match your filters
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-5 justify-items-center">
          {filteredCards.map((card) => (
            <GameCard key={card.id} card={card} size="sm" />
          ))}
        </div>
      )}
    </div>
  );
}
