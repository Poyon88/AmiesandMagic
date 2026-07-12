"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Card, Keyword, CardSet, GameFormat } from "@/lib/game/types";
import { getFormatFilter } from "@/lib/game/format-legality";
import { isCardOwned } from "@/lib/game/collection";
import { useVocab } from "@/i18n/useVocab";
import GameCard from "./GameCard";
import ExpertCardFrame from "./ExpertCardFrame";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import { AmButton } from "@/components/ui/AmButton";

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

// Shared classes for the gilded select inputs in the filter bar.
const SELECT_CLS =
  "am-gild-border rounded-lg bg-am-bg-2 px-3 py-1.5 text-[16px] sm:text-sm text-am-ink-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0";
const FILTER_LABEL_CLS =
  "mr-1 font-[family-name:var(--font-crimson),serif] text-sm italic text-am-ink-faint";

export default function CollectionView({ cards, sets, formats, collectedCardIds, isTester, ownedPrints = [] }: CollectionViewProps) {
  const ownedSet = useMemo(() => new Set(collectedCardIds), [collectedCardIds]);
  const vocab = useVocab();
  const t = useTranslations("deck");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [manaCostFilter, setManaCostFilter] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<"creature" | "spell" | null>(null);
  const [keywordFilter, setKeywordFilter] = useState<Keyword | null>(null);
  const [factionFilter, setFactionFilter] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [expertOnly, setExpertOnly] = useState(false);
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
    return getFormatFilter(selectedFormat);
  }, [selectedFormat]);

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
      if (keywordFilter !== null) {
        // Keywords live in two places: `keywords` text[] and `spell_keywords`
        // jsonb[] (id-tagged). Renfort Royal on a spell sits in the latter,
        // so the filter must consider both.
        const inKeywords = card.keywords.includes(keywordFilter);
        const inSpellKeywords = Array.isArray(card.spell_keywords)
          && card.spell_keywords.some((sk) => sk?.id === keywordFilter);
        if (!inKeywords && !inSpellKeywords) return false;
      }
      if (factionFilter !== null && card.faction !== factionFilter)
        return false;
      if (rarityFilter !== null && card.rarity !== rarityFilter)
        return false;
      if (expertOnly && (card.rarity ?? "Commune") === "Commune")
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
  }, [cards, ownedSet, isTester, formatPredicate, search, manaCostFilter, typeFilter, keywordFilter, factionFilter, rarityFilter, expertOnly, raceFilter, clanFilter, filterSet, filterYear]);

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
    setExpertOnly(false);
    setRaceFilter(null);
    setClanFilter(null);
    setFilterSet("");
    setFilterYear("");
    setFormatFilter("");
  }

  const hasActiveFilters =
    search || manaCostFilter !== null || typeFilter !== null || keywordFilter !== null || factionFilter !== null || rarityFilter !== null || expertOnly || raceFilter !== null || clanFilter !== null || filterSet !== "" || filterYear !== "" || formatFilter !== "";

  return (
    <div className="relative min-h-screen bg-am-bg-0 px-5 py-8 sm:px-8 sm:py-10">
      <AmAtmosphere />

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="am-animate-rise flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-[family-name:var(--font-cinzel),serif] text-xs font-bold uppercase tracking-[0.32em] text-am-arcane-bright">
              {t("admire_your_armies")}
            </p>
            <h1 className="am-foil-text mt-2 font-[family-name:var(--font-cinzel),serif] text-4xl font-bold sm:text-5xl">
              {t("card_collection")}
            </h1>
            <p className="mt-2 font-[family-name:var(--font-crimson),serif] text-sm italic text-am-ink-soft">
              {t("cards_count", { count: displayItems.length })}{isNormalPlayer ? "" : t("cards_of_total", { total: cards.length })}
            </p>
          </div>
          <AmButton
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
          >
            {t("back_to_menu")}
          </AmButton>
        </div>

        <div className="am-rule-diamond am-animate-fade my-8" style={{ animationDelay: "0.1s" }} />

        {/* Filters */}
        <div className="am-glass am-animate-rise mb-8 p-5" style={{ animationDelay: "0.12s" }}>
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search_by_name")}
              className="am-gild-border w-64 rounded-lg bg-am-bg-2 px-4 py-2 text-[16px] text-am-ink placeholder:text-am-ink-faint transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0"
            />

            {/* Mana cost filter */}
            <div className="flex items-center gap-1">
              <span className={FILTER_LABEL_CLS}>{t("mana_label")}</span>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((cost) => (
                <button
                  key={cost}
                  onClick={() =>
                    setManaCostFilter(manaCostFilter === cost ? null : cost)
                  }
                  className={`h-7 w-7 rounded-full text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-arcane focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                    manaCostFilter === cost
                      ? "border border-am-arcane bg-am-arcane/20 text-am-arcane-bright"
                      : "am-gild-border bg-am-bg-2 text-am-ink-soft hover:text-am-ink"
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
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                  typeFilter === "creature"
                    ? "border border-am-gold/60 bg-am-gold/15 text-am-gold-bright"
                    : "am-gild-border bg-am-bg-2 text-am-ink-soft hover:text-am-ink"
                }`}
              >
                {t("creatures")}
              </button>
              <button
                onClick={() =>
                  setTypeFilter(typeFilter === "spell" ? null : "spell")
                }
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-arcane focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                  typeFilter === "spell"
                    ? "border border-am-arcane bg-am-arcane/20 text-am-arcane-bright"
                    : "am-gild-border bg-am-bg-2 text-am-ink-soft hover:text-am-ink"
                }`}
              >
                {t("spells")}
              </button>
            </div>

            {/* Reset */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="rounded-lg px-3 py-1.5 font-[family-name:var(--font-crimson),serif] text-sm italic text-am-ember transition-colors hover:text-am-ember/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-ember focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0"
              >
                {t("reset_filters")}
              </button>
            )}
          </div>

          {/* Second row: Faction, Rarity, Keyword */}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-am-gold/15 pt-4">
            {/* Faction filter */}
            <div className="flex items-center gap-1">
              <span className={FILTER_LABEL_CLS}>{t("faction_label")}</span>
              <select
                value={factionFilter ?? ""}
                onChange={(e) => setFactionFilter(e.target.value || null)}
                className={SELECT_CLS}
              >
                <option value="">{t("all_fem")}</option>
                {factions.map((f) => (
                  <option key={f} value={f}>{vocab.factionName(f)}</option>
                ))}
              </select>
            </div>

            {/* Rarity filter */}
            <div className="flex items-center gap-1">
              <span className={FILTER_LABEL_CLS}>{t("rarity_label")}</span>
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
                    className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                      rarityFilter === r
                        ? "border"
                        : "am-gild-border bg-am-bg-2 text-am-ink-soft hover:text-am-ink"
                    }`}
                  >
                    {vocab.rarityLabel(r)}
                  </button>
                ))}
              </div>
            </div>

            {/* Expert mode filter — shows only non-Commune cards */}
            <button
              onClick={() => setExpertOnly((v) => !v)}
              title={t("expert_only_title")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                expertOnly
                  ? "border border-am-gold/60 bg-am-gold/15 text-am-gold-bright"
                  : "am-gild-border bg-am-bg-2 text-am-ink-soft hover:text-am-ink"
              }`}
            >
              {t("expert_only")}
            </button>

            {/* Keyword filter */}
            <div className="flex items-center gap-1">
              <span className={FILTER_LABEL_CLS}>{t("capability_label")}</span>
              <select
                value={keywordFilter ?? ""}
                onChange={(e) =>
                  setKeywordFilter(e.target.value ? (e.target.value as Keyword) : null)
                }
                className={SELECT_CLS}
              >
                <option value="">{t("all_fem")}</option>
                {KEYWORDS.map((kw) => (
                  <option key={kw} value={kw}>
                    {vocab.keywordLabel(kw)}
                  </option>
                ))}
              </select>
            </div>

            {/* Race filter */}
            <div className="flex items-center gap-1">
              <span className={FILTER_LABEL_CLS}>{t("race_label")}</span>
              <select
                value={raceFilter ?? ""}
                onChange={(e) => setRaceFilter(e.target.value || null)}
                className={SELECT_CLS}
              >
                <option value="">{t("all_fem")}</option>
                {races.map((r) => (
                  <option key={r} value={r}>{vocab.raceName(r)}</option>
                ))}
              </select>
            </div>

            {/* Clan filter */}
            <div className="flex items-center gap-1">
              <span className={FILTER_LABEL_CLS}>{t("clan_label")}</span>
              <select
                value={clanFilter ?? ""}
                onChange={(e) => setClanFilter(e.target.value || null)}
                className={SELECT_CLS}
              >
                <option value="">{t("all_masc")}</option>
                {clans.map((c) => (
                  <option key={c} value={c}>{vocab.clanName(c)}</option>
                ))}
              </select>
            </div>

            {/* Format filter */}
            <div className="flex items-center gap-1">
              <span className={FILTER_LABEL_CLS}>{t("format_label")}</span>
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">{t("all_masc")}</option>
                {formats.map((f) => (
                  <option key={f.id} value={String(f.id)}>{vocab.formatName(f.code, f.name)}</option>
                ))}
              </select>
            </div>

            {/* Set filter */}
            <div className="flex items-center gap-1">
              <span className={FILTER_LABEL_CLS}>{t("set_label")}</span>
              <select
                value={filterSet}
                onChange={(e) => setFilterSet(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">{t("all_masc")}</option>
                {sets.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.icon} {vocab.setName(s.code, s.name)}</option>
                ))}
              </select>
            </div>

            {/* Year filter */}
            <div className="flex items-center gap-1">
              <span className={FILTER_LABEL_CLS}>{t("year_label")}</span>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">{t("all_fem")}</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Card Grid */}
        {displayItems.length === 0 ? (
          <div className="am-glass am-animate-rise px-6 py-20 text-center font-[family-name:var(--font-crimson),serif] text-xl italic text-am-ink-soft">
            {t("no_cards_match")}
          </div>
        ) : (
          <div className="grid grid-cols-1 justify-items-center gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((item, i) => {
              const rarity = item.card.rarity ?? "Commune";
              const isExpert = rarity !== "Commune";
              // Lift the whole cell above its neighbours on hover so the
              // 1.5× zoom renders in front of adjacent cards instead of
              // being clipped by later ones in DOM order. `relative` makes
              // the z-index actually apply; the inner GameCard's own zoom
              // z-index is trapped inside this cell otherwise.
              const hoverLift = "relative z-0 hover:z-30";
              const animProps =
                i < 24
                  ? {
                      className: `${hoverLift} am-animate-rise`,
                      style: { animationDelay: `${0.02 * i + 0.05}s` } as const,
                    }
                  : { className: hoverLift };
              if (isExpert) {
                return (
                  <div key={item.key} {...animProps}>
                    <ExpertCardFrame rarity={rarity}>
                      <GameCard
                        card={item.card}
                        size="md"
                        printNumber={item.printNumber}
                        maxPrints={item.maxPrints}
                        disableHoverZoom
                      />
                    </ExpertCardFrame>
                  </div>
                );
              }
              return (
                <div key={item.key} {...animProps}>
                  <GameCard
                    card={item.card}
                    size="md"
                    printNumber={item.printNumber}
                    maxPrints={item.maxPrints}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
