"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Card, Keyword } from "@/lib/game/types";
import { DECK_SIZE } from "@/lib/game/constants";
import { FACTIONS, ALIGNMENTS } from "@/lib/card-engine/constants";
import type { Alignment } from "@/lib/card-engine/constants";
import GameCard from "@/components/cards/GameCard";

interface HeroRow {
  id: number;
  name: string;
  race: string;
  power_name: string;
  power_type: string;
  power_cost: number;
  power_effect: unknown;
  power_description: string;
}

interface DeckEntry {
  card: Card;
  quantity: number;
}

interface DeckBuilderProps {
  cards: Card[];
  heroes: HeroRow[];
  userId: string;
  existingDeck: { id: number; name: string; hero_id: number | null } | null;
  existingDeckCards: { card_id: number; quantity: number }[];
}

const RACE_ICONS: Record<string, string> = {
  elves: "\uD83C\uDFF9",
  dwarves: "\u2692\uFE0F",
  halflings: "\uD83C\uDF40",
  humans: "\u2694\uFE0F",
  beastmen: "\uD83D\uDC3A",
  giants: "\uD83D\uDDFB",
  dark_elves: "\uD83D\uDD2E",
  orcs_goblins: "\uD83D\uDDE1\uFE0F",
  undead: "\uD83D\uDC80",
};

import { ALL_KEYWORDS, KEYWORD_LABELS } from "@/lib/game/keyword-labels";
const KEYWORDS = ALL_KEYWORDS;

export default function DeckBuilder({
  cards,
  heroes,
  userId,
  existingDeck,
  existingDeckCards,
}: DeckBuilderProps) {
  const router = useRouter();
  const supabase = createClient();

  const [deckName, setDeckName] = useState(existingDeck?.name ?? "");
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(
    existingDeck?.hero_id ?? null
  );
  const [deckCards, setDeckCards] = useState<Map<number, DeckEntry>>(() => {
    const map = new Map<number, DeckEntry>();
    existingDeckCards.forEach((dc) => {
      const card = cards.find((c) => c.id === dc.card_id);
      if (card) map.set(card.id, { card, quantity: dc.quantity });
    });
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [manaCostFilter, setManaCostFilter] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<"creature" | "spell" | null>(null);
  const [keywordFilter, setKeywordFilter] = useState<Keyword | null>(null);
  const [factionFilter, setFactionFilter] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);

  const factions = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => { if (c.faction) set.add(c.faction); });
    return Array.from(set).sort();
  }, [cards]);

  const totalCards = useMemo(() => {
    let total = 0;
    deckCards.forEach((entry) => (total += entry.quantity));
    return total;
  }, [deckCards]);

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
      return true;
    });
  }, [cards, search, manaCostFilter, typeFilter, keywordFilter, factionFilter, rarityFilter]);

  const sortedDeckEntries = useMemo(() => {
    return Array.from(deckCards.values()).sort(
      (a, b) => a.card.mana_cost - b.card.mana_cost || a.card.name.localeCompare(b.card.name)
    );
  }, [deckCards]);

  // ── Slot system ──
  const RARITY_HIERARCHY = ["Légendaire", "Épique", "Rare", "Peu Commune", "Commune"] as const;
  const SLOT_COUNTS: Record<string, number> = { "Légendaire": 1, "Épique": 2, "Rare": 4, "Peu Commune": 8, "Commune": 35 };
  const RARITY_COLORS: Record<string, string> = { "Légendaire": "#ffd54f", "Épique": "#ce93d8", "Rare": "#4fc3f7", "Peu Commune": "#4caf50", "Commune": "#aaaaaa" };
  const RARITY_EMOJI: Record<string, string> = { "Légendaire": "🟡", "Épique": "🟣", "Rare": "🔵", "Peu Commune": "🟢", "Commune": "⚪" };

  function rarityIndex(r: string): number {
    return RARITY_HIERARCHY.indexOf(r as typeof RARITY_HIERARCHY[number]);
  }

  // Allocate all deck cards to slots (greedy: highest rarity cards fill their own tier first)
  const slotAllocation = useMemo(() => {
    type SlotEntry = { card: Card; quantity: number; substituted: boolean };
    const slots: Record<string, SlotEntry[]> = {};
    for (const r of RARITY_HIERARCHY) slots[r] = [];

    // Flatten all cards with quantity, sorted by rarity (highest first), then mana
    const allCards: { card: Card; qty: number }[] = [];
    deckCards.forEach(({ card, quantity }) => {
      for (let i = 0; i < quantity; i++) allCards.push({ card, qty: 1 });
    });
    allCards.sort((a, b) => rarityIndex(a.card.rarity || "Commune") - rarityIndex(b.card.rarity || "Commune") || a.card.mana_cost - b.card.mana_cost);

    // Assign each card to its own rarity slot first, then overflow to higher slots
    for (const { card } of allCards) {
      const cardRarIdx = rarityIndex(card.rarity || "Commune");
      let placed = false;

      // Try own tier first, then go upward
      for (let i = cardRarIdx; i >= 0; i--) {
        const tier = RARITY_HIERARCHY[i];
        if (slots[tier].length < SLOT_COUNTS[tier]) {
          // Check if already has this card — increment quantity
          const existing = slots[tier].find(e => e.card.id === card.id);
          if (existing) {
            existing.quantity++;
          } else {
            slots[tier].push({ card, quantity: 1, substituted: i < cardRarIdx });
          }
          placed = true;
          break;
        }
      }

      // If not placed upward, try downward (shouldn't happen with correct limits, but safety)
      if (!placed) {
        for (let i = cardRarIdx + 1; i < RARITY_HIERARCHY.length; i++) {
          const tier = RARITY_HIERARCHY[i];
          if (slots[tier].length < SLOT_COUNTS[tier]) {
            slots[tier].push({ card, quantity: 1, substituted: false });
            placed = true;
            break;
          }
        }
      }
    }

    return slots;
  }, [deckCards]);

  const slotCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of RARITY_HIERARCHY) {
      counts[r] = slotAllocation[r].reduce((sum, e) => sum + e.quantity, 0);
    }
    return counts;
  }, [slotAllocation]);

  // Deck restrictions (alignment + faction only, rarity handled by slots)
  const deckStats = useMemo(() => {
    const factionSet = new Set<string>();
    const allFactions = new Set<string>();
    const alignmentSet = new Set<Alignment>();

    deckCards.forEach(({ card }) => {
      if (card.faction) {
        allFactions.add(card.faction);
        if (card.faction !== "Mercenaires") factionSet.add(card.faction);
        const fac = FACTIONS[card.faction];
        if (fac) alignmentSet.add(fac.alignment);
      }
    });

    const alignmentConflict = alignmentSet.has("bon") && alignmentSet.has("maléfique");
    const violations: string[] = [];
    if (alignmentConflict) violations.push("Alignement Bon et Maléfique incompatibles");
    if (factionSet.size > 2) violations.push(`Max 2 factions (actuellement ${factionSet.size})`);

    return { factions: factionSet, allFactions, alignments: alignmentSet, violations, alignmentConflict };
  }, [deckCards]);

  function canAddCard(card: Card): string | null {
    if (totalCards >= DECK_SIZE) return "Deck plein";
    const existing = deckCards.get(card.id);
    if (existing && existing.quantity >= 4) return "Max 4 copies";

    // Alignment
    if (card.faction) {
      const a = FACTIONS[card.faction]?.alignment;
      if (a === "bon" && deckStats.alignments.has("maléfique")) return "Conflit d'alignement";
      if (a === "maléfique" && deckStats.alignments.has("bon")) return "Conflit d'alignement";
    }

    // Faction limit
    if (card.faction && card.faction !== "Mercenaires" && !deckStats.factions.has(card.faction) && deckStats.factions.size >= 2) return "Max 2 factions";

    // Slot availability: check if there's a slot for this card's rarity (or higher)
    const cardRarIdx = rarityIndex(card.rarity || "Commune");
    let hasSlot = false;
    for (let i = cardRarIdx; i >= 0; i--) {
      const tier = RARITY_HIERARCHY[i];
      if (slotCounts[tier] < SLOT_COUNTS[tier]) { hasSlot = true; break; }
    }
    if (!hasSlot) return "Plus de slot disponible";

    return null;
  }

  function addCard(card: Card) {
    const reason = canAddCard(card);
    if (reason) return;
    const newMap = new Map(deckCards);
    const existing = newMap.get(card.id);
    if (existing) {
      newMap.set(card.id, { ...existing, quantity: existing.quantity + 1 });
    } else {
      newMap.set(card.id, { card, quantity: 1 });
    }
    setDeckCards(newMap);
  }

  function removeCard(cardId: number) {
    const newMap = new Map(deckCards);
    const existing = newMap.get(cardId);
    if (existing) {
      if (existing.quantity > 1) {
        newMap.set(cardId, { ...existing, quantity: existing.quantity - 1 });
      } else {
        newMap.delete(cardId);
      }
    }
    setDeckCards(newMap);
  }

  async function saveDeck() {
    if (!deckName.trim()) {
      setError("Please enter a deck name");
      return;
    }
    if (!selectedHeroId) {
      setError("Please select a hero");
      return;
    }
    if (totalCards !== DECK_SIZE) {
      setError(`Le deck doit contenir exactement ${DECK_SIZE} cartes (actuellement ${totalCards})`);
      return;
    }
    if (deckStats.violations.length > 0) {
      setError(deckStats.violations.join(", "));
      return;
    }

    setSaving(true);
    setError("");

    try {
      let deckId = existingDeck?.id;

      if (deckId) {
        // Update existing deck
        await supabase
          .from("decks")
          .update({ name: deckName.trim(), hero_id: selectedHeroId, updated_at: new Date().toISOString() })
          .eq("id", deckId);

        // Delete old cards and re-insert
        await supabase.from("deck_cards").delete().eq("deck_id", deckId);
      } else {
        // Create new deck
        const { data, error } = await supabase
          .from("decks")
          .insert({ user_id: userId, name: deckName.trim(), hero_id: selectedHeroId })
          .select("id")
          .single();

        if (error) throw error;
        deckId = data.id;
      }

      // Insert deck cards
      const deckCardsToInsert = Array.from(deckCards.values()).map((entry) => ({
        deck_id: deckId!,
        card_id: entry.card.id,
        quantity: entry.quantity,
      }));

      const { error: insertError } = await supabase
        .from("deck_cards")
        .insert(deckCardsToInsert);

      if (insertError) throw insertError;

      router.push("/decks");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save deck");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }} className="bg-background">
      {/* Left: Card Collection */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">Card Collection</h2>
          <button
            onClick={() => router.push("/decks")}
            className="px-3 py-1.5 bg-secondary border border-card-border rounded-lg text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="px-3 py-1.5 bg-secondary border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary w-48"
          />
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((cost) => (
              <button
                key={cost}
                onClick={() =>
                  setManaCostFilter(manaCostFilter === cost ? null : cost)
                }
                className={`w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${
                  manaCostFilter === cost
                    ? "bg-mana-blue text-white"
                    : "bg-secondary border border-card-border text-foreground/50 hover:border-mana-blue/50"
                }`}
              >
                {cost}
              </button>
            ))}
          </div>
          <button
            onClick={() =>
              setTypeFilter(typeFilter === "creature" ? null : "creature")
            }
            className={`px-2 py-1 rounded text-xs transition-colors ${
              typeFilter === "creature"
                ? "bg-primary text-background"
                : "bg-secondary border border-card-border text-foreground/50"
            }`}
          >
            Creatures
          </button>
          <button
            onClick={() =>
              setTypeFilter(typeFilter === "spell" ? null : "spell")
            }
            className={`px-2 py-1 rounded text-xs transition-colors ${
              typeFilter === "spell"
                ? "bg-purple-600 text-white"
                : "bg-secondary border border-card-border text-foreground/50"
            }`}
          >
            Spells
          </button>
          <select
            value={keywordFilter ?? ""}
            onChange={(e) =>
              setKeywordFilter(
                e.target.value ? (e.target.value as Keyword) : null
              )
            }
            className="px-2 py-1 bg-secondary border border-card-border rounded text-xs text-foreground/70 focus:outline-none"
          >
            <option value="">Keywords</option>
            {KEYWORDS.map((kw) => (
              <option key={kw} value={kw}>
                {KEYWORD_LABELS[kw]}
              </option>
            ))}
          </select>
          <select
            value={factionFilter ?? ""}
            onChange={(e) => setFactionFilter(e.target.value || null)}
            className="px-2 py-1 bg-secondary border border-card-border rounded text-xs text-foreground/70 focus:outline-none"
          >
            <option value="">Factions</option>
            {factions.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <div className="flex gap-0.5">
            {["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"].map((r) => (
              <button
                key={r}
                onClick={() => setRarityFilter(rarityFilter === r ? null : r)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  rarityFilter === r
                    ? "bg-primary text-background"
                    : "bg-secondary border border-card-border text-foreground/50"
                }`}
              >
                {r === "Peu Commune" ? "PC" : r === "Légendaire" ? "Lég." : r}
              </button>
            ))}
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCards.map((card) => {
            const inDeck = deckCards.get(card.id);
            return (
              <GameCard
                key={card.id}
                card={card}
                size="md"
                onClick={() => addCard(card)}
                disabled={!!canAddCard(card) && !inDeck}
                count={inDeck?.quantity}
              />
            );
          })}
        </div>
      </div>

      {/* Right: Current Deck (fixed) */}
      <div style={{ width: 320, flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column" }} className="bg-secondary border-l border-card-border">
        {/* Hero selection */}
        <div className="p-4 border-b border-card-border">
          <h3 className="text-sm font-bold text-foreground mb-2">Choose Your Hero</h3>
          <div className="grid grid-cols-5 gap-1.5">
            {heroes.map((hero) => (
              <button
                key={hero.id}
                onClick={() => setSelectedHeroId(hero.id)}
                className={`
                  relative flex flex-col items-center p-1.5 rounded-lg border-2 transition-all text-center
                  ${selectedHeroId === hero.id
                    ? "border-primary bg-primary/20 shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                    : "border-card-border/50 bg-background hover:border-card-border hover:bg-card-border/20"
                  }
                `}
              >
                <span className="text-lg">{RACE_ICONS[hero.race] ?? "\u2B50"}</span>
                <span className="text-[9px] text-foreground/70 leading-tight mt-0.5 truncate w-full">
                  {hero.name.split(" ").pop()}
                </span>
              </button>
            ))}
          </div>
          {selectedHeroId && (() => {
            const hero = heroes.find((h) => h.id === selectedHeroId);
            if (!hero) return null;
            return (
              <div className="mt-2 p-2 bg-background rounded-lg border border-card-border/50">
                <div className="text-xs font-bold text-foreground">{hero.name}</div>
                <div className="text-[10px] text-primary font-medium">{hero.power_name}</div>
                <div className="text-[10px] text-foreground/60">{hero.power_description}</div>
                {hero.power_type === "passive" && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 bg-purple-600/20 text-purple-400 text-[9px] font-bold rounded">
                    PASSIVE
                  </span>
                )}
                {hero.power_type === "active" && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 bg-mana-blue/20 text-mana-blue text-[9px] font-bold rounded">
                    {hero.power_cost} MANA
                  </span>
                )}
              </div>
            );
          })()}
        </div>

        {/* Deck header */}
        <div className="p-4 border-b border-card-border">
          <input
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="Deck name..."
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-primary mb-3"
          />
          <div className="flex items-center justify-between">
            <span
              className={`font-bold text-lg ${
                totalCards === DECK_SIZE ? "text-success" : "text-foreground"
              }`}
            >
              {totalCards}/{DECK_SIZE}
            </span>
            {/* Mana curve mini */}
            <div className="flex gap-0.5 items-end h-6">
              {Array.from({ length: 11 }, (_, cost) => {
                const count = sortedDeckEntries
                  .filter((e) => e.card.mana_cost === cost)
                  .reduce((s, e) => s + e.quantity, 0);
                const maxHeight = 24;
                const height = count > 0 ? Math.max(4, (count / 8) * maxHeight) : 0;
                return (
                  <div
                    key={cost}
                    className="w-2 bg-mana-blue/60 rounded-t"
                    style={{ height: `${height}px` }}
                    title={`${cost} mana: ${count} cards`}
                  />
                );
              })}
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-background rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                totalCards === DECK_SIZE ? "bg-success" : "bg-primary"
              }`}
              style={{ width: `${(totalCards / DECK_SIZE) * 100}%` }}
            />
          </div>
        </div>

        {/* Deck restrictions info */}
        <div className="px-4 py-2 border-b border-card-border/30">
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="text-foreground/40">Factions: {deckStats.factions.size}/2</span>
            {Array.from(deckStats.allFactions).map(f => {
              const fac = FACTIONS[f];
              const align = ALIGNMENTS.find(a => a.id === fac?.alignment);
              return <span key={f} style={{ color: fac?.color }}>{fac?.emoji} {f} <span style={{ color: align?.color }}>{align?.emoji}</span></span>;
            })}
          </div>
          {deckStats.violations.length > 0 && (
            <div className="mt-1.5">
              {deckStats.violations.map((v, i) => (
                <div key={i} className="text-[10px] text-accent">{"⚠"} {v}</div>
              ))}
            </div>
          )}
        </div>

        {/* Slot sections */}
        <div className="flex-1 overflow-y-auto">
          {totalCards === 0 && (
            <p className="text-center text-foreground/30 mt-8 text-sm">
              Cliquez sur les cartes pour les ajouter
            </p>
          )}
          {RARITY_HIERARCHY.map(tier => {
            const maxSlots = SLOT_COUNTS[tier];
            const entries = slotAllocation[tier];
            const used = entries.reduce((s, e) => s + e.quantity, 0);
            const emptySlots = Math.max(0, maxSlots - used);
            const color = RARITY_COLORS[tier];
            const emoji = RARITY_EMOJI[tier];
            const isCommon = tier === "Commune";

            return (
              <div key={tier} style={{ borderLeft: `3px solid ${color}` }}>
                {/* Section header */}
                <div
                  className="px-3 py-1.5 flex items-center justify-between"
                  style={{ background: `${color}11` }}
                >
                  <span className="text-[10px] font-bold" style={{ color }}>{emoji} {tier.toUpperCase()}</span>
                  <span className="text-[10px]" style={{ color: used > maxSlots ? "#e74c3c" : "#666" }}>{used}/{maxSlots}</span>
                </div>

                {/* Cards in this slot */}
                <div className="px-2 py-1">
                  {entries.map(entry => (
                    <div
                      key={entry.card.id}
                      onClick={() => removeCard(entry.card.id)}
                      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-card-border/30 transition-colors group"
                    >
                      <span className="w-4 h-4 rounded-full bg-mana-blue flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                        {entry.card.mana_cost}
                      </span>
                      <span className="text-[11px] text-foreground flex-1 truncate">
                        {entry.card.name}
                      </span>
                      {entry.substituted && (
                        <span className="text-[8px] px-1 rounded" style={{ background: `${RARITY_COLORS[entry.card.rarity || "Commune"]}33`, color: RARITY_COLORS[entry.card.rarity || "Commune"] }}>
                          {entry.card.rarity?.[0] || "C"}
                        </span>
                      )}
                      {entry.quantity > 1 && (
                        <span className="text-[10px] text-foreground/40">x{entry.quantity}</span>
                      )}
                      <span className="text-[10px] text-foreground/20 group-hover:text-accent transition-colors">{"✕"}</span>
                    </div>
                  ))}

                  {/* Empty slot indicators (only for non-Commune rarities) */}
                  {!isCommon && emptySlots > 0 && Array.from({ length: Math.min(emptySlots, 4) }).map((_, i) => (
                    <div key={`empty-${i}`} className="flex items-center gap-2 px-2 py-1 opacity-20">
                      <span className="w-4 h-4 rounded-full border border-dashed flex-shrink-0" style={{ borderColor: color }} />
                      <span className="text-[10px]" style={{ color }}>emplacement libre</span>
                    </div>
                  ))}
                  {!isCommon && emptySlots > 4 && (
                    <div className="px-2 py-0.5 text-[9px] opacity-20" style={{ color }}>+{emptySlots - 4} emplacements</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save button */}
        <div className="p-4 border-t border-card-border">
          {error && (
            <p className="text-accent text-xs mb-2">{error}</p>
          )}
          <button
            onClick={saveDeck}
            disabled={saving}
            className="w-full py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : existingDeck
              ? "Save Changes"
              : "Create Deck"}
          </button>
        </div>
      </div>
    </div>
  );
}
