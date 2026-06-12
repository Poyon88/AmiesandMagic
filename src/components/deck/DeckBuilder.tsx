"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Card, Keyword, CardSet, GameFormat, DeckMode, DeckExtent } from "@/lib/game/types";
import { getFormatFilter, parseFormatCode } from "@/lib/game/format-legality";
import { isCardOwned } from "@/lib/game/collection";
import { DECK_SIZE } from "@/lib/game/constants";
import { FACTIONS, ALIGNMENTS, getFactionDisplayName, getFactionForRace } from "@/lib/card-engine/constants";
import type { Alignment } from "@/lib/card-engine/constants";
import GameCard from "@/components/cards/GameCard";

interface HeroRow {
  id: number;
  name: string;
  race: string;
  faction: string | null;
  power_name: string;
  power_type: string;
  power_cost: number;
  power_effect: unknown;
  power_description: string;
  thumbnail_url: string | null;
  power_image_url: string | null;
}

interface DeckEntry {
  card: Card;
  quantity: number;
}

// Faction d'un héros : champ explicite, avec repli sur la race (français) si besoin.
// Les héros ont tous une faction en base, ce repli n'est qu'une sécurité.
function heroFactionOf(h: HeroRow): string | null {
  return h.faction ?? getFactionForRace(h.race);
}

interface BoardRow {
  id: number;
  name: string;
  image_url: string;
  rarity: string | null;
  max_prints: number | null;
  is_default: boolean;
  faction: string | null;
}

interface OwnedBoardPrint {
  id: number;
  board_id: number;
  print_number: number;
  max_prints: number;
}

interface CardBackRow {
  id: number;
  name: string;
  image_url: string;
  rarity: string | null;
  max_prints: number | null;
  is_default: boolean;
  faction: string | null;
}

interface OwnedCardBackPrint {
  id: number;
  card_back_id: number;
  print_number: number;
  max_prints: number;
}

interface DeckBuilderProps {
  cards: Card[];
  heroes: HeroRow[];
  userId: string;
  existingDeck: { id: number; name: string; hero_id: number | null; format_id: number | null; board_id: number | null; card_back_id: number | null } | null;
  existingDeckCards: { card_id: number; quantity: number }[];
  sets: CardSet[];
  formats: GameFormat[];
  collectedCardIds: number[];
  isTester: boolean;
  boards: BoardRow[];
  ownedBoardPrints: OwnedBoardPrint[];
  cardBacks: CardBackRow[];
  ownedCardBackPrints: OwnedCardBackPrint[];
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
const KEYWORDS = [...ALL_KEYWORDS].sort((a, b) => KEYWORD_LABELS[a].localeCompare(KEYWORD_LABELS[b], "fr"));

export default function DeckBuilder({
  cards,
  heroes,
  userId,
  existingDeck,
  existingDeckCards,
  sets,
  formats,
  collectedCardIds,
  isTester,
  boards,
  ownedBoardPrints,
  cardBacks,
  ownedCardBackPrints,
}: DeckBuilderProps) {
  const router = useRouter();
  const supabase = createClient();
  const ownedSet = useMemo(() => new Set(collectedCardIds), [collectedCardIds]);

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
  const [selectedFormatId, setSelectedFormatId] = useState<number | null>(
    existingDeck?.format_id ?? null
  );

  // Faction du deck (déclarée tôt : pilote héros/plateaux/dos/cartes).
  // Liste des factions sélectionnables (hors Mercenaires, complément cross-faction).
  const FACTION_OPTIONS = useMemo(() => Object.keys(FACTIONS).filter((f) => f !== "Mercenaires"), []);
  // Dérivée à l'édition de l'héros existant, sinon de la 1ʳᵉ carte non-Mercenaires.
  const [selectedFaction, setSelectedFaction] = useState<string | null>(() => {
    if (existingDeck?.hero_id != null) {
      const h = heroes.find((x) => x.id === existingDeck.hero_id);
      if (h) return heroFactionOf(h);
    }
    for (const dc of existingDeckCards) {
      const c = cards.find((x) => x.id === dc.card_id);
      if (c?.faction && c.faction !== "Mercenaires") return c.faction;
    }
    return null;
  });

  const defaultBoardId = useMemo(() => boards.find((b) => b.is_default)?.id ?? null, [boards]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(
    existingDeck?.board_id ?? defaultBoardId
  );
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const ownedBoardIds = useMemo(() => new Set(ownedBoardPrints.map((p) => p.board_id)), [ownedBoardPrints]);
  const accessibleBoards = useMemo(
    () => boards.filter((b) =>
      selectedFaction != null && b.faction === selectedFaction &&
      ((b.rarity ?? "Commune") === "Commune" || ownedBoardIds.has(b.id))),
    [boards, ownedBoardIds, selectedFaction],
  );
  const selectedBoard = useMemo(() => boards.find((b) => b.id === selectedBoardId) ?? null, [boards, selectedBoardId]);

  const defaultCardBackId = useMemo(() => cardBacks.find((cb) => cb.is_default)?.id ?? null, [cardBacks]);
  const [selectedCardBackId, setSelectedCardBackId] = useState<number | null>(
    existingDeck?.card_back_id ?? defaultCardBackId
  );
  const [cardBackPickerOpen, setCardBackPickerOpen] = useState(false);
  const ownedCardBackIds = useMemo(() => new Set(ownedCardBackPrints.map((p) => p.card_back_id)), [ownedCardBackPrints]);
  const accessibleCardBacks = useMemo(
    () => cardBacks.filter((cb) =>
      selectedFaction != null && cb.faction === selectedFaction &&
      ((cb.rarity ?? "Commune") === "Commune" || ownedCardBackIds.has(cb.id))),
    [cardBacks, ownedCardBackIds, selectedFaction],
  );
  const selectedCardBack = useMemo(() => cardBacks.find((cb) => cb.id === selectedCardBackId) ?? null, [cardBacks, selectedCardBackId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Onglets ──
  const [tab, setTab] = useState<1 | 2 | 3>(1);

  // Popover « pouvoir du héros » ouvert au clic droit sur une vignette de héros.
  const [powerPopup, setPowerPopup] = useState<{ hero: HeroRow; x: number; y: number } | null>(null);

  // Changer de faction vide les cartes/héros/plateau/dos incompatibles.
  function changeFaction(faction: string | null) {
    setSelectedFaction(faction);
    if (!faction) return;
    setDeckCards((prev) => {
      const next = new Map<number, DeckEntry>();
      prev.forEach((entry, id) => {
        const f = entry.card.faction;
        if (!f || f === faction || f === "Mercenaires") next.set(id, entry);
      });
      return next;
    });
    setSelectedHeroId((id) => {
      const h = heroes.find((x) => x.id === id);
      return h && heroFactionOf(h) === faction ? id : null;
    });
    setSelectedBoardId((id) => {
      const b = boards.find((x) => x.id === id);
      return b && b.faction === faction ? id : null;
    });
    setSelectedCardBackId((id) => {
      const cb = cardBacks.find((x) => x.id === id);
      return cb && cb.faction === faction ? id : null;
    });
  }

  // Héros de la faction choisie (filtrage strict).
  const factionHeroes = useMemo(
    () => heroes.filter((h) => selectedFaction != null && heroFactionOf(h) === selectedFaction),
    [heroes, selectedFaction],
  );

  // Filters
  const [search, setSearch] = useState("");
  const [manaCostFilter, setManaCostFilter] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<"creature" | "spell" | null>(null);
  const [keywordFilter, setKeywordFilter] = useState<Keyword | null>(null);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [expertOnly, setExpertOnly] = useState(false);
  const [raceFilter, setRaceFilter] = useState<string | null>(null);
  const [clanFilter, setClanFilter] = useState<string | null>(null);
  const [filterSet, setFilterSet] = useState("");
  const [filterYear, setFilterYear] = useState("");

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

  const totalCards = useMemo(() => {
    let total = 0;
    deckCards.forEach((entry) => (total += entry.quantity));
    return total;
  }, [deckCards]);

  const selectedFormat = useMemo(() => {
    if (!selectedFormatId) return null;
    return formats.find(f => f.id === selectedFormatId) ?? null;
  }, [selectedFormatId, formats]);

  const formatPredicate = useMemo(() => {
    if (!selectedFormat) return null;
    return getFormatFilter(selectedFormat);
  }, [selectedFormat]);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
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
      // Pool verrouillé sur la faction choisie + Mercenaires.
      if (selectedFaction) {
        const f = card.faction;
        if (f && f !== selectedFaction && f !== "Mercenaires") return false;
      }
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
  }, [cards, formatPredicate, search, manaCostFilter, typeFilter, keywordFilter, selectedFaction, rarityFilter, expertOnly, raceFilter, clanFilter, filterSet, filterYear]);

  const sortedDeckEntries = useMemo(() => {
    return Array.from(deckCards.values()).sort(
      (a, b) => a.card.mana_cost - b.card.mana_cost || a.card.name.localeCompare(b.card.name)
    );
  }, [deckCards]);

  // Mana curve : nombre de cartes par coût (0..7+). Tout ce qui coûte 7 ou
  // plus est agrégé dans la dernière colonne pour garder la courbe compacte
  // et lisible — au-delà de 7 il y a très peu de cartes en pratique.
  const manaCurve = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0]; // index 7 = 7+
    deckCards.forEach(({ card, quantity }) => {
      const i = Math.min(7, Math.max(0, card.mana_cost));
      buckets[i] += quantity;
    });
    const max = Math.max(1, ...buckets);
    return { buckets, max };
  }, [deckCards]);

  // ── Slot system ──
  const RARITY_HIERARCHY = ["Légendaire", "Épique", "Rare", "Peu Commune", "Commune"] as const;
  // Axes du format sélectionné (vides tant qu'aucun format n'est choisi).
  const formatMode: DeckMode | "" = selectedFormat ? parseFormatCode(selectedFormat.code).mode : "";
  const formatExtent: DeckExtent | "" = selectedFormat ? parseFormatCode(selectedFormat.code).extent : "";
  // Défaut Expert : tous les slots restent visibles tant qu'aucun format n'est choisi.
  const deckMode: DeckMode = formatMode || "expert";
  // En Classique, seules les Communes sont autorisées : 50 slots Commune, 0 ailleurs.
  // En Expert, le système de slots par rareté plafonne les cartes non-communes (2/4/6/8 = 20 max).
  const SLOT_COUNTS: Record<string, number> = useMemo(
    () =>
      deckMode === "classique"
        ? { "Légendaire": 0, "Épique": 0, "Rare": 0, "Peu Commune": 0, "Commune": 50 }
        : { "Légendaire": 2, "Épique": 4, "Rare": 6, "Peu Commune": 8, "Commune": 30 },
    [deckMode],
  );
  const MAX_MERCENAIRES = 4;
  const MAX_CLANS = 1;
  const RARITY_COLORS: Record<string, string> = { "Légendaire": "#ffd54f", "Épique": "#ce93d8", "Rare": "#4fc3f7", "Peu Commune": "#4caf50", "Commune": "#aaaaaa" };
  const RARITY_EMOJI: Record<string, string> = { "Légendaire": "🟡", "Épique": "🟣", "Rare": "🔵", "Peu Commune": "🟢", "Commune": "⚪" };

  function rarityIndex(r: string): number {
    return RARITY_HIERARCHY.indexOf(r as typeof RARITY_HIERARCHY[number]);
  }

  // Deck restrictions (alignment + faction + clan + mercenaires).
  // Règle : 1 seule faction (hors Mercenaires) et 1 seul clan, plus les
  // Mercenaires et les cartes sans clan de la faction (toujours autorisées).
  // Les decks déjà enregistrés qui dépassent (2 factions / 2 clans) sont
  // conservés : le dépassement faction/clan n'est pas listé dans `violations`
  // (qui bloque la sauvegarde), la limite est seulement appliquée à l'ajout de
  // nouvelles cartes (canAddCard).
  const deckStats = useMemo(() => {
    const factionSet = new Set<string>();
    const allFactions = new Set<string>();
    const clanSet = new Set<string>();
    const alignmentSet = new Set<Alignment>();
    let mercenairesCount = 0;

    deckCards.forEach(({ card, quantity }) => {
      if (card.faction) {
        allFactions.add(card.faction);
        if (card.faction === "Mercenaires") {
          mercenairesCount += quantity;
          if (card.card_alignment) alignmentSet.add(card.card_alignment as Alignment);
        } else {
          factionSet.add(card.faction);
          if (card.clan) clanSet.add(card.clan);
          const fac = FACTIONS[card.faction];
          if (fac && fac.alignment !== "spéciale") alignmentSet.add(fac.alignment);
        }
      }
    });

    const maxMercenaires = MAX_MERCENAIRES;

    const alignmentConflict = alignmentSet.has("bon") && alignmentSet.has("maléfique");
    const violations: string[] = [];
    if (alignmentConflict) violations.push("Alignement Bon et Maléfique incompatibles");
    if (mercenairesCount > maxMercenaires) violations.push(`Max ${maxMercenaires} Mercenaires (actuellement ${mercenairesCount})`);

    return { factions: factionSet, allFactions, clans: clanSet, alignments: alignmentSet, violations, alignmentConflict, mercenairesCount, maxMercenaires };
  }, [deckCards]);

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
  }, [deckCards, SLOT_COUNTS]);

  const slotCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of RARITY_HIERARCHY) {
      counts[r] = slotAllocation[r].reduce((sum, e) => sum + e.quantity, 0);
    }
    return counts;
  }, [slotAllocation]);

  function canAddCard(card: Card): string | null {
    if (!isCardOwned(card, ownedSet, isTester)) return "Carte non possédée";
    if (totalCards >= DECK_SIZE) return "Deck plein";
    const existing = deckCards.get(card.id);
    // Peu Commune, Rare, Épique, Légendaire : 1 exemplaire max. Commune : 3 max.
    const maxCopies = (card.rarity && card.rarity !== "Commune") ? 1 : 3;
    if (existing && existing.quantity >= maxCopies) return maxCopies === 1 ? "Exemplaire unique" : "Max 3 copies";

    // Alignment
    if (card.faction) {
      const a = card.faction === "Mercenaires" ? card.card_alignment : FACTIONS[card.faction]?.alignment;
      if (a === "bon" && deckStats.alignments.has("maléfique")) return "Conflit d'alignement";
      if (a === "maléfique" && deckStats.alignments.has("bon")) return "Conflit d'alignement";
    }

    // Faction limit : une seule faction (hors Mercenaires)
    if (card.faction && card.faction !== "Mercenaires" && !deckStats.factions.has(card.faction) && deckStats.factions.size >= 1) return "1 seule faction autorisée";

    // Clan limit : 1 seul clan (cartes sans clan + Mercenaires toujours autorisés)
    if (card.clan && card.faction !== "Mercenaires" && !deckStats.clans.has(card.clan) && deckStats.clans.size >= MAX_CLANS) return "1 seul clan autorisé";

    // Mercenaires limit
    if (card.faction === "Mercenaires" && deckStats.mercenairesCount >= deckStats.maxMercenaires) return `Max ${deckStats.maxMercenaires} Mercenaires`;

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

  // Nombre max de copies : 3 pour les Communes, 1 pour les autres raretés.
  function maxCopiesOf(card: Card): number {
    return card.rarity && card.rarity !== "Commune" ? 1 : 3;
  }

  // Clic sur la grille des cartes : si la carte est déjà au max de copies,
  // on retire un exemplaire ; sinon on en ajoute un.
  function onGridCardClick(card: Card) {
    const existing = deckCards.get(card.id);
    if (existing && existing.quantity >= maxCopiesOf(card)) {
      removeCard(card.id);
    } else {
      addCard(card);
    }
  }

  // Résout la paire (mode, étendue) vers le format_id correspondant.
  function resolveFormat(mode: DeckMode, extent: DeckExtent) {
    const code = `${mode}-${extent}`;
    const f = formats.find((ff) => ff.code === code);
    setSelectedFormatId(f ? f.id : null);
  }

  async function saveDeck() {
    if (!deckName.trim()) {
      setError("Please enter a deck name");
      return;
    }
    if (!selectedFaction) {
      setError("Veuillez choisir une faction (onglet Préparation)");
      return;
    }
    if (!selectedFormatId) {
      setError("Veuillez sélectionner un format");
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

    // Légalité de format : toutes les cartes doivent respecter le mode (rareté)
    // et l'étendue (rotation) du format choisi. Couvre le cas d'un deck monté en
    // Expert puis basculé en Classique, ou d'une carte sortie de rotation.
    if (selectedFormat) {
      const legal = getFormatFilter(selectedFormat);
      const illegal = Array.from(deckCards.values())
        .filter(({ card }) => !legal(card))
        .map(({ card }) => card.name);
      if (illegal.length > 0) {
        setError(`Cartes non autorisées dans ce format : ${illegal.join(", ")}`);
        return;
      }
    }

    // Verify ownership of collectible cards
    if (!isTester) {
      const unownedCards = Array.from(deckCards.values())
        .filter(({ card }) => card.set_id == null && !ownedSet.has(card.id));
      if (unownedCards.length > 0) {
        setError("Le deck contient des cartes non possédées");
        return;
      }
    }

    setSaving(true);
    setError("");

    try {
      let deckId = existingDeck?.id;

      if (deckId) {
        // Update existing deck
        await supabase
          .from("decks")
          .update({ name: deckName.trim(), hero_id: selectedHeroId, format_id: selectedFormatId, board_id: selectedBoardId, card_back_id: selectedCardBackId, updated_at: new Date().toISOString() })
          .eq("id", deckId);

        // Delete old cards and re-insert
        await supabase.from("deck_cards").delete().eq("deck_id", deckId);
      } else {
        // Create new deck
        const { data, error } = await supabase
          .from("decks")
          .insert({ user_id: userId, name: deckName.trim(), hero_id: selectedHeroId, format_id: selectedFormatId, board_id: selectedBoardId, card_back_id: selectedCardBackId })
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
    <div className="bg-background flex flex-col md:h-screen md:overflow-hidden">
      {/* Barre d'onglets */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-card-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {([[1, "1 · Préparation"], [2, "2 · Apparence"], [3, "3 · Cartes"]] as const).map(([n, label]) => (
            <button
              key={n}
              onClick={() => setTab(n)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                tab === n ? "bg-primary text-background" : "bg-secondary border border-card-border text-foreground/60 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => router.push("/decks")}
          className="px-3 py-1.5 bg-secondary border border-card-border rounded-lg text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          Annuler
        </button>
      </div>

      {/* Corps : la colonne gauche (collection) n'apparaît qu'en onglet Cartes */}
      <div className="flex flex-col md:flex-row md:flex-1 md:min-h-0 md:overflow-hidden">

      {/* ===== Onglet 3 — colonne gauche : collection ===== */}
      {tab === 3 && (
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {!selectedFaction ? (
          <div className="p-10 text-center text-foreground/50 text-sm">
            Choisissez d&apos;abord une faction dans l&apos;onglet 1 · Préparation.
          </div>
        ) : (
        <>
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
            <option value="">Capacités</option>
            {KEYWORDS.map((kw) => (
              <option key={kw} value={kw}>
                {KEYWORD_LABELS[kw]}
              </option>
            ))}
          </select>
          <select
            value={raceFilter ?? ""}
            onChange={(e) => setRaceFilter(e.target.value || null)}
            className="px-2 py-1 bg-secondary border border-card-border rounded text-xs text-foreground/70 focus:outline-none"
          >
            <option value="">Races</option>
            {races.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={clanFilter ?? ""}
            onChange={(e) => setClanFilter(e.target.value || null)}
            className="px-2 py-1 bg-secondary border border-card-border rounded text-xs text-foreground/70 focus:outline-none"
          >
            <option value="">Clans</option>
            {clans.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filterSet}
            onChange={(e) => setFilterSet(e.target.value)}
            className="px-2 py-1 bg-secondary border border-card-border rounded text-xs text-foreground/70 focus:outline-none"
          >
            <option value="">Sets</option>
            {sets.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.icon} {s.name}</option>
            ))}
          </select>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="px-2 py-1 bg-secondary border border-card-border rounded text-xs text-foreground/70 focus:outline-none"
          >
            <option value="">Année</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
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
          <button
            onClick={() => setExpertOnly((v) => !v)}
            title="Afficher uniquement les cartes expertes (non-communes)"
            className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
              expertOnly
                ? "border border-primary text-primary bg-primary/10"
                : "bg-secondary border border-card-border text-foreground/50 hover:border-primary/50"
            }`}
          >
            Expert
          </button>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCards.map((card) => {
            const inDeck = deckCards.get(card.id);
            const atMax = !!inDeck && inDeck.quantity >= maxCopiesOf(card);
            // Au max de copies : on garde la carte cliquable pour en retirer un
            // exemplaire. Sinon, désactivée si elle ne peut pas être ajoutée.
            const disabled = !atMax && !!canAddCard(card);
            return (
              <GameCard
                key={card.id}
                card={card}
                size="md"
                onClick={() => onGridCardClick(card)}
                disabled={disabled}
                dimmed={atMax}
                count={inDeck?.quantity}
              />
            );
          })}
        </div>
        </>
        )}
      </div>
      )}

      {/* Colonne de droite : configuration / deck (toujours présente) */}
      <div className={`bg-secondary border-t md:border-t-0 md:border-l border-card-border flex flex-col md:flex-shrink-0 ${tab === 3 ? "md:overflow-hidden md:w-[320px] md:max-w-[320px]" : "md:overflow-y-auto md:flex-1"}`}>
        {/* Configuration sections (héros / plateau / dos / nom / format / stats).
            Onglet 3 (Cartes) : plafonnées à 55vh avec scroll interne pour libérer
            la place à la liste des cartes en dessous. Onglets 1 & 2 : pas de
            plafond — elles s'écoulent dans le scroll unique du panneau, sinon le
            plateau/dos passent sous le pli (invisibles sur iPad). */}
        <div style={{ flexShrink: 0, overflowY: tab === 3 ? "auto" : "visible", maxHeight: tab === 3 ? "55vh" : undefined }}>

        {/* ===== Onglet 1 — Préparation : nom, faction, format ===== */}
        {tab === 1 && (
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-bold text-foreground mb-1.5">Nom du deck</label>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Nom du deck..."
              className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-1.5">Faction</label>
            <select
              value={selectedFaction ?? ""}
              onChange={(e) => changeFaction(e.target.value || null)}
              className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Choisir une faction...</option>
              {FACTION_OPTIONS.map((f) => (
                <option key={f} value={f}>{getFactionDisplayName(f)} — {f}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-foreground/50">Mono-faction + Mercenaires. Changer de faction retire les cartes/héros incompatibles.</p>
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-1.5">Format</label>
            <div className="flex gap-2">
              <select
                value={formatMode}
                onChange={(e) => {
                  const m = e.target.value as DeckMode | "";
                  if (!m) { setSelectedFormatId(null); return; }
                  resolveFormat(m, formatExtent || "standard");
                }}
                className="flex-1 px-3 py-2 bg-background border border-card-border rounded-lg text-foreground/70 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Mode...</option>
                <option value="classique">Classique</option>
                <option value="expert">Expert</option>
              </select>
              <select
                value={formatExtent}
                onChange={(e) => {
                  const x = e.target.value as DeckExtent | "";
                  if (!x) { setSelectedFormatId(null); return; }
                  resolveFormat(formatMode || "classique", x);
                }}
                className="flex-1 px-3 py-2 bg-background border border-card-border rounded-lg text-foreground/70 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Étendue...</option>
                <option value="standard">Standard</option>
                <option value="etendu">Étendu</option>
              </select>
            </div>
          </div>
        </div>
        )}

        {/* ===== Onglet 2 — Apparence : héros, plateau, dos ===== */}
        {tab === 2 && !selectedFaction && (
          <div className="p-6 text-center text-foreground/50 text-sm">Choisissez d&apos;abord une faction (onglet 1 · Préparation).</div>
        )}
        {tab === 2 && selectedFaction && (<>
        {/* Hero selection */}
        <div className="p-4 border-b border-card-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-foreground">Choisir un héros</h3>
            <span className="text-[10px] text-foreground/40">Clic droit : voir le pouvoir</span>
          </div>
          {factionHeroes.length === 0 && (
            <p className="text-[11px] text-foreground/40 py-2">Aucun héros pour cette faction.</p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {factionHeroes.map((hero) => (
              <button
                key={hero.id}
                onClick={() => setSelectedHeroId(hero.id)}
                onContextMenu={(e) => { e.preventDefault(); setPowerPopup({ hero, x: e.clientX, y: e.clientY }); }}
                title="Clic droit : voir le pouvoir"
                className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
                  selectedHeroId === hero.id
                    ? "border-primary shadow-[0_0_10px_rgba(200,168,78,0.4)]"
                    : "border-card-border/50 hover:border-primary/40"
                }`}
              >
                <div
                  className="w-full aspect-[3/4] bg-background flex items-center justify-center"
                  style={hero.thumbnail_url ? { backgroundImage: `url('${hero.thumbnail_url}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                >
                  {!hero.thumbnail_url && <span className="text-3xl opacity-60">{RACE_ICONS[hero.race] ?? "\u2B50"}</span>}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/70 to-transparent px-1.5 py-1">
                  <div className="text-[10px] font-bold text-foreground truncate">{hero.name}</div>
                </div>
                {selectedHeroId === hero.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-background text-[10px] font-bold flex items-center justify-center">{"\u2713"}</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Board selection */}
        <div className="p-4 border-b border-card-border">
          <h3 className="text-sm font-bold text-foreground mb-2">Plateau</h3>
          {selectedBoard ? (
            <div className="rounded-lg overflow-hidden border border-card-border/50 bg-background">
              <div
                className="relative w-full h-20"
                style={{
                  backgroundImage: `url('${selectedBoard.image_url}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute bottom-1 left-2 right-2 flex items-end justify-between">
                  <div>
                    <div className="text-xs font-bold text-foreground drop-shadow">{selectedBoard.name}</div>
                    <div className="text-[9px] text-foreground/70">{selectedBoard.rarity ?? "Commune"}</div>
                  </div>
                  <button
                    onClick={() => setBoardPickerOpen(true)}
                    className="text-[9px] px-2 py-0.5 bg-primary/80 hover:bg-primary text-background font-bold rounded"
                  >
                    Changer
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setBoardPickerOpen(true)}
              className="w-full py-2 bg-background border border-dashed border-card-border rounded-lg text-xs text-foreground/60 hover:border-primary/50 hover:text-foreground"
            >
              Choisir un plateau
            </button>
          )}
        </div>

        {/* Card back selection */}
        <div className="p-4 border-b border-card-border">
          <h3 className="text-sm font-bold text-foreground mb-2">Dos de carte</h3>
          {selectedCardBack ? (
            <div className="rounded-lg overflow-hidden border border-card-border/50 bg-background flex items-stretch">
              <div
                className="w-14 h-20 shrink-0"
                style={{
                  backgroundImage: `url('${selectedCardBack.image_url}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <div className="flex-1 flex items-center justify-between px-3">
                <div>
                  <div className="text-xs font-bold text-foreground">{selectedCardBack.name}</div>
                  <div className="text-[9px] text-foreground/70">{selectedCardBack.rarity ?? "Commune"}</div>
                </div>
                <button
                  onClick={() => setCardBackPickerOpen(true)}
                  className="text-[9px] px-2 py-0.5 bg-primary/80 hover:bg-primary text-background font-bold rounded"
                >
                  Changer
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCardBackPickerOpen(true)}
              className="w-full py-2 bg-background border border-dashed border-card-border rounded-lg text-xs text-foreground/60 hover:border-primary/50 hover:text-foreground"
            >
              Choisir un dos
            </button>
          )}
        </div>

        </>)}

        {/* Deck restrictions info (toujours visible) */}
        <div className="px-4 py-2 border-b border-card-border/30">
          <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
            <span className="px-1.5 py-0.5 rounded font-bold" style={{ background: "#4caf5022", color: "#4caf50" }}>
              Mono-faction
            </span>
            <span className="px-1.5 py-0.5 rounded font-bold" style={{ background: "#4caf5022", color: "#4caf50" }}>
              Mono-clan
            </span>
            <span className="text-foreground/40">Clan: {deckStats.clans.size}/{MAX_CLANS}</span>
            {Array.from(deckStats.allFactions).map(f => {
              const fac = FACTIONS[f];
              const align = ALIGNMENTS.find(a => a.id === fac?.alignment);
              return <span key={f} style={{ color: fac?.color }}>{fac?.emoji} {f} <span style={{ color: align?.color }}>{align?.emoji}</span></span>;
            })}
            <span className="text-foreground/40">| Mercenaires: {deckStats.mercenairesCount}/{deckStats.maxMercenaires}</span>
          </div>
          {deckStats.violations.length > 0 && (
            <div className="mt-1.5">
              {deckStats.violations.map((v, i) => (
                <div key={i} className="text-[10px] text-accent">{"⚠"} {v}</div>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* ===== Onglet 3 — colonne droite : compteur, courbe, slots ===== */}
        {tab === 3 && (<>
        {/* Compteur deck */}
        <div className="px-4 py-2 border-t border-card-border flex-shrink-0 bg-secondary">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-foreground/60 font-bold uppercase tracking-wider">Deck</span>
            <span
              className={`font-bold text-base ${
                totalCards === DECK_SIZE ? "text-success" : "text-foreground"
              }`}
            >
              {totalCards}/{DECK_SIZE}
            </span>
          </div>
          <div className="mt-1 h-1.5 bg-background rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                totalCards === DECK_SIZE ? "bg-success" : "bg-primary"
              }`}
              style={{ width: `${Math.min(100, (totalCards / DECK_SIZE) * 100)}%` }}
            />
          </div>

          {/* Mana curve — visible en permanence pour aider le joueur à
              équilibrer sa courbe. Cliquer sur une colonne filtre les
              cartes affichées par coût. La dernière colonne agrège 7+. */}
          <div className="mt-2 flex items-end justify-between gap-1 h-12">
            {manaCurve.buckets.map((count, cost) => {
              const isLast = cost === 7;
              const label = isLast ? "7+" : String(cost);
              const isFiltered = manaCostFilter === cost || (isLast && manaCostFilter !== null && manaCostFilter >= 7);
              const height = count > 0 ? Math.max(3, (count / manaCurve.max) * 32) : 0;
              return (
                <button
                  key={cost}
                  onClick={() => setManaCostFilter(isFiltered ? null : cost)}
                  title={`${label} mana : ${count} carte${count > 1 ? "s" : ""}`}
                  className="flex-1 flex flex-col items-center gap-0.5 group cursor-pointer"
                >
                  <span className={`text-[9px] leading-none transition-colors ${
                    count > 0 ? "text-foreground/80" : "text-transparent"
                  }`}>
                    {count}
                  </span>
                  <div className="w-full h-8 flex items-end">
                    <div
                      className={`w-full rounded-sm transition-all ${
                        isFiltered ? "bg-mana-blue" : "bg-mana-blue/50 group-hover:bg-mana-blue/80"
                      }`}
                      style={{ height: `${height}px` }}
                    />
                  </div>
                  <span className={`text-[9px] leading-none font-bold transition-colors ${
                    isFiltered ? "text-mana-blue" : "text-foreground/50 group-hover:text-foreground/80"
                  }`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Slot sections — scroll propre seulement sur l'onglet Cartes ; sur les
            onglets 1 & 2 la liste s'écoule dans le scroll unique du panneau. */}
        <div className={tab === 3 ? "flex-1 overflow-y-auto" : ""} style={{ minHeight: 0 }}>
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
        </>)}

        {/* Barre Sauvegarder (uniquement sur l'onglet Cartes) */}
        {tab === 3 && (
        <div className="p-4 border-t border-card-border flex-shrink-0">
          {error && (
            <p className="text-accent text-xs mb-2">{error}</p>
          )}
          <div className="flex items-center gap-3">
            <span className={`font-bold text-sm whitespace-nowrap ${totalCards === DECK_SIZE ? "text-success" : "text-foreground/70"}`}>
              {totalCards}/{DECK_SIZE}
            </span>
            <button
              onClick={saveDeck}
              disabled={saving}
              className="flex-1 py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Sauvegarde..." : existingDeck ? "Enregistrer" : "Créer le deck"}
            </button>
          </div>
        </div>
        )}
      </div>
      </div>

      {/* Pop-over pouvoir du héros (clic droit) */}
      {powerPopup && (
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => setPowerPopup(null)}
          onContextMenu={(e) => { e.preventDefault(); setPowerPopup(null); }}
        >
          <div
            className="absolute w-64 bg-secondary border border-card-border rounded-xl shadow-2xl overflow-hidden"
            style={{
              left: Math.max(8, Math.min(powerPopup.x, (typeof window !== "undefined" ? window.innerWidth : 1280) - 272)),
              top: Math.max(8, Math.min(powerPopup.y, (typeof window !== "undefined" ? window.innerHeight : 720) - 260)),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {powerPopup.hero.power_image_url && (
              <div
                className="w-full h-28"
                style={{ backgroundImage: `url('${powerPopup.hero.power_image_url}')`, backgroundSize: "cover", backgroundPosition: "center" }}
              />
            )}
            <div className="p-3">
              <div className="text-sm font-bold text-foreground">{powerPopup.hero.name}</div>
              <div className="text-xs text-primary font-medium mt-0.5">{powerPopup.hero.power_name}</div>
              {powerPopup.hero.power_description && (
                <div className="text-[11px] text-foreground/70 mt-1 leading-snug">{powerPopup.hero.power_description}</div>
              )}
              <div className="mt-2">
                {powerPopup.hero.power_type === "passive" ? (
                  <span className="px-1.5 py-0.5 bg-purple-600/20 text-purple-400 text-[9px] font-bold rounded">PASSIF</span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-mana-blue/20 text-mana-blue text-[9px] font-bold rounded">{powerPopup.hero.power_cost} MANA</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Board picker modal */}
      {boardPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setBoardPickerOpen(false)}
        >
          <div
            className="bg-secondary border border-card-border rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-card-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">Choisir un plateau</h3>
              <button
                onClick={() => setBoardPickerOpen(false)}
                className="text-foreground/60 hover:text-foreground text-xl leading-none px-2"
              >×</button>
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              {accessibleBoards.length === 0 ? (
                <div className="col-span-full text-center text-foreground/50 py-10 text-sm">
                  Aucun plateau disponible.
                </div>
              ) : accessibleBoards.map((b) => {
                const isCommon = (b.rarity ?? "Commune") === "Commune";
                const prints = ownedBoardPrints.filter((p) => p.board_id === b.id);
                const selected = selectedBoardId === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => {
                      setSelectedBoardId(b.id);
                      setBoardPickerOpen(false);
                    }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
                      selected ? "border-primary shadow-[0_0_10px_rgba(200,168,78,0.4)]" : "border-card-border/50 hover:border-primary/40"
                    }`}
                  >
                    <div
                      className="w-full h-28"
                      style={{
                        backgroundImage: `url('${b.image_url}')`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/70 to-transparent p-2">
                      <div className="text-xs font-bold text-foreground">{b.name}</div>
                      <div className="text-[10px] text-foreground/70 flex items-center gap-2">
                        <span>{b.rarity ?? "Commune"}</span>
                        {!isCommon && prints.length > 0 && (
                          <span className="text-primary">
                            {prints.map((p) => `${p.print_number}/${p.max_prints}`).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Card back picker modal */}
      {cardBackPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setCardBackPickerOpen(false)}
        >
          <div
            className="bg-secondary border border-card-border rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-card-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">Choisir un dos</h3>
              <button
                onClick={() => setCardBackPickerOpen(false)}
                className="text-foreground/60 hover:text-foreground text-xl leading-none px-2"
              >×</button>
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {accessibleCardBacks.length === 0 ? (
                <div className="col-span-full text-center text-foreground/50 py-10 text-sm">
                  Aucun dos disponible.
                </div>
              ) : accessibleCardBacks.map((cb) => {
                const isCommon = (cb.rarity ?? "Commune") === "Commune";
                const prints = ownedCardBackPrints.filter((p) => p.card_back_id === cb.id);
                const selected = selectedCardBackId === cb.id;
                return (
                  <button
                    key={cb.id}
                    onClick={() => {
                      setSelectedCardBackId(cb.id);
                      setCardBackPickerOpen(false);
                    }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all text-left aspect-[5/7] ${
                      selected ? "border-primary shadow-[0_0_10px_rgba(200,168,78,0.4)]" : "border-card-border/50 hover:border-primary/40"
                    }`}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url('${cb.image_url}')`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/70 to-transparent p-2">
                      <div className="text-xs font-bold text-foreground">{cb.name}</div>
                      <div className="text-[10px] text-foreground/70 flex items-center gap-2">
                        <span>{cb.rarity ?? "Commune"}</span>
                        {!isCommon && prints.length > 0 && (
                          <span className="text-primary">
                            {prints.map((p) => `${p.print_number}/${p.max_prints}`).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
