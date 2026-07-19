"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Card, Keyword, CardSet, GameFormat, DeckMode, DeckExtent } from "@/lib/game/types";
import { getFormatFilter, parseFormatCode } from "@/lib/game/format-legality";
import { isCardOwned } from "@/lib/game/collection";
import { DECK_SIZE, MAX_SAME_CAPABILITY, CAPABILITY_LIMIT_EXEMPT } from "@/lib/game/constants";
import { ABILITIES } from "@/lib/game/abilities";
import { namedCreatureCapabilityIds, creatureCapabilityCounts, capabilityLimitViolations } from "@/lib/game/deck-rules";
import { FACTIONS, ALIGNMENTS, getFactionForRace } from "@/lib/card-engine/constants";
import { useVocab } from "@/i18n/useVocab";
import { useHeroText } from "@/i18n/useHeroText";
import type { Alignment } from "@/lib/card-engine/constants";
import GameCard from "@/components/cards/GameCard";
import KeywordIcon from "@/components/shared/KeywordIcon";
import useLongPress from "@/hooks/useLongPress";
import { AmButton } from "@/components/ui/AmButton";

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

// Une ligne de carte sélectionnée dans la liste de droite (« deck list »).
// Look proche d'une liste de deck Hearthstone : illustration de la carte en
// fond (dégradé pour garder gemme + nom lisibles), liseré de rareté, compteur.
// Survol (desktop) ou appui long (tactile) → aperçu plein format ; le tap
// simple retire un exemplaire (onRemove). Le hook useLongPress.consume() évite
// qu'un appui long déclenche aussi le retrait (même pattern que BoardCreature).
function DeckCardRow({
  card, quantity, substituted, tint,
  onRemove, onPreviewEnter, onPreviewLeave, onPreviewLong, onPreviewContext,
}: {
  card: Card;
  quantity: number;
  substituted: boolean;
  tint: string;
  onRemove: () => void;
  onPreviewEnter: (card: Card) => void;
  onPreviewLeave: () => void;
  onPreviewLong: (card: Card) => void;
  onPreviewContext: () => void;
}) {
  const lp = useLongPress(() => onPreviewLong(card));
  const rarity = card.rarity || "Commune";
  return (
    <div
      {...lp.handlers}
      onClick={() => { if (lp.consume()) return; onRemove(); }}
      onMouseEnter={() => onPreviewEnter(card)}
      onMouseLeave={onPreviewLeave}
      onContextMenu={(e) => { e.preventDefault(); onPreviewContext(); }}
      className="relative flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-am-bg-3/60 transition-colors group overflow-hidden"
      style={{
        boxShadow: `inset 3px 0 0 ${tint}`,
        backgroundImage: card.image_url
          ? `linear-gradient(to right, var(--am-bg-1) 0%, var(--am-bg-1) 42%, ${tint}1f 72%, rgba(0,0,0,0) 100%), url('${card.image_url}')`
          : `linear-gradient(to right, ${tint}14, rgba(0,0,0,0))`,
        backgroundSize: card.image_url ? "100% 100%, cover" : undefined,
        backgroundPosition: card.image_url ? "left, right center" : undefined,
        backgroundRepeat: "no-repeat",
      }}
    >
      <span className="w-4 h-4 rounded-full bg-am-azure flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
        {card.mana_cost}
      </span>
      <span className="text-[11px] text-am-ink flex-1 truncate" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}>
        {card.name}
      </span>
      {substituted && (
        <span className="text-[8px] px-1 rounded" style={{ background: `${tint}33`, color: tint }}>
          {rarity[0]}
        </span>
      )}
      {quantity > 1 && (
        <span className="text-[10px] text-am-ink-soft font-bold" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}>x{quantity}</span>
      )}
      <span className="text-[10px] text-am-ink-ghost group-hover:text-am-ember transition-colors">{"✕"}</span>
    </div>
  );
}

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
  const vocab = useVocab();
  const heroText = useHeroText();
  const t = useTranslations("deck");

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

  // Aperçu plein format d'une carte du deck. `touch` ⇒ ouvert par appui long
  // (modale centrée + backdrop) ; sinon survol desktop (carte flottante non
  // interactive). On n'arme l'aperçu au survol que sur les pointeurs « hover »
  // (souris) pour éviter les événements souris synthétiques sur tactile.
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [previewTouch, setPreviewTouch] = useState(false);
  // Clic droit sur l'aperçu flottant : bascule illustration ⇄ descriptif. Remis
  // à false à chaque changement de carte pour repartir sur l'illustration.
  const [previewDetails, setPreviewDetails] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCapable = useRef(true);
  useEffect(() => {
    hoverCapable.current = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover)").matches;
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, []);
  const schedulePreview = (card: Card) => {
    if (!hoverCapable.current) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => { setPreviewTouch(false); setPreviewDetails(false); setPreviewCard(card); }, 150);
  };
  const clearPreview = () => {
    if (!hoverCapable.current) return;
    if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null; }
    setPreviewCard(null);
    setPreviewDetails(false);
  };
  // L'aperçu flottant étant pointer-events:none, le clic droit est capté sur la
  // ligne survolée (DeckCardRow) et pilote la face affichée de cette carte.
  const togglePreviewDetails = () => setPreviewDetails((p) => !p);
  const openTouchPreview = (card: Card) => { setPreviewDetails(false); setPreviewTouch(true); setPreviewCard(card); };
  const closeTouchPreview = () => { setPreviewTouch(false); setPreviewCard(null); };

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
    if (alignmentConflict) violations.push(t("alignment_incompatible"));
    if (mercenairesCount > maxMercenaires) violations.push(t("max_mercenaires_current", { max: maxMercenaires, current: mercenairesCount }));
    // Limite : pas plus de MAX_SAME_CAPABILITY fois une même capacité nommée (sauf Vol).
    const capabilityCounts = creatureCapabilityCounts(deckCards.values());
    for (const v of capabilityLimitViolations(capabilityCounts)) {
      violations.push(t("max_capability_current", { max: MAX_SAME_CAPABILITY, label: v.label, count: v.count }));
    }

    return { factions: factionSet, allFactions, clans: clanSet, alignments: alignmentSet, violations, alignmentConflict, mercenairesCount, maxMercenaires, capabilityCounts };
  }, [deckCards]);

  // Récap des mots-clés (capacités nommées) du deck, trié pour un affichage
  // stable : du plus fréquent au plus rare, puis par libellé. Chaque entrée
  // porte la clé d'icône côté créature (`creature.id ?? id`, qui sert aussi à
  // la résolution d'override) et le symbole par défaut du registre.
  const keywordTally = useMemo(() => {
    return [...deckStats.capabilityCounts.entries()]
      .map(([id, count]) => {
        const def = ABILITIES[id];
        return {
          id,
          count,
          iconKey: def?.creature?.id ?? id,
          symbol: def?.symbol ?? "✦",
          label: def?.creature?.label ?? def?.label ?? id,
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [deckStats.capabilityCounts]);

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
    if (!isCardOwned(card, ownedSet, isTester)) return t("card_not_owned");
    if (totalCards >= DECK_SIZE) return t("deck_full");
    const existing = deckCards.get(card.id);
    // Peu Commune, Rare, Épique, Légendaire : 1 exemplaire max. Commune : 3 max.
    const maxCopies = (card.rarity && card.rarity !== "Commune") ? 1 : 3;
    if (existing && existing.quantity >= maxCopies) return maxCopies === 1 ? t("unique_copy") : t("max_three_copies");

    // Alignment
    if (card.faction) {
      const a = card.faction === "Mercenaires" ? card.card_alignment : FACTIONS[card.faction]?.alignment;
      if (a === "bon" && deckStats.alignments.has("maléfique")) return t("alignment_conflict");
      if (a === "maléfique" && deckStats.alignments.has("bon")) return t("alignment_conflict");
    }

    // Faction limit : une seule faction (hors Mercenaires)
    if (card.faction && card.faction !== "Mercenaires" && !deckStats.factions.has(card.faction) && deckStats.factions.size >= 1) return t("one_faction_only");

    // Clan limit : 1 seul clan (cartes sans clan + Mercenaires toujours autorisés)
    if (card.clan && card.faction !== "Mercenaires" && !deckStats.clans.has(card.clan) && deckStats.clans.size >= MAX_CLANS) return t("one_clan_only");

    // Mercenaires limit
    if (card.faction === "Mercenaires" && deckStats.mercenairesCount >= deckStats.maxMercenaires) return t("max_mercenaires", { max: deckStats.maxMercenaires });

    // Slot availability: check if there's a slot for this card's rarity (or higher)
    const cardRarIdx = rarityIndex(card.rarity || "Commune");
    let hasSlot = false;
    for (let i = cardRarIdx; i >= 0; i--) {
      const tier = RARITY_HIERARCHY[i];
      if (slotCounts[tier] < SLOT_COUNTS[tier]) { hasSlot = true; break; }
    }
    if (!hasSlot) return t("no_slot_available");

    // Limite : une même capacité nommée ne peut dépasser MAX_SAME_CAPABILITY
    // exemplaires dans le deck (Vol exempté). +1 simule l'ajout de cette carte.
    const capCounts = creatureCapabilityCounts(deckCards.values());
    for (const id of namedCreatureCapabilityIds(card)) {
      if (CAPABILITY_LIMIT_EXEMPT.has(id)) continue;
      if ((capCounts.get(id) ?? 0) + 1 > MAX_SAME_CAPABILITY) {
        return t("max_capability", { max: MAX_SAME_CAPABILITY, label: ABILITIES[id]?.label ?? id });
      }
    }

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
      setError(t("enter_deck_name"));
      return;
    }
    if (!selectedFaction) {
      setError(t("choose_faction_prep"));
      return;
    }
    if (!selectedFormatId) {
      setError(t("select_format"));
      return;
    }
    if (!selectedHeroId) {
      setError(t("select_hero"));
      return;
    }
    if (totalCards !== DECK_SIZE) {
      setError(t("deck_exact_size", { size: DECK_SIZE, current: totalCards }));
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
        setError(t("illegal_cards", { cards: illegal.join(", ") }));
        return;
      }
    }

    // Verify ownership of collectible cards
    if (!isTester) {
      const unownedCards = Array.from(deckCards.values())
        .filter(({ card }) => card.set_id == null && !ownedSet.has(card.id));
      if (unownedCards.length > 0) {
        setError(t("deck_contains_unowned"));
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
      setError(err instanceof Error ? err.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="am-mesh am-grain relative bg-am-bg-0 text-am-ink flex flex-col md:h-screen md:overflow-hidden">
      {/* Barre d'onglets — La Forge */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-am-gold/30 flex-shrink-0 bg-am-bg-1/70 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <span className="hidden sm:inline font-[family-name:var(--font-cinzel),serif] text-[10px] tracking-[0.32em] uppercase text-am-arcane-bright/80 pr-1">
            {t("forge_your_deck")}
          </span>
          <div className="flex items-center gap-1.5">
            {([[1, t("step_preparation")], [2, t("step_appearance")], [3, t("step_cards")]] as const).map(([n, label]) => (
              <button
                key={n}
                onClick={() => setTab(n)}
                className={`am-gild-border px-3.5 py-1.5 rounded-lg text-sm font-bold font-[family-name:var(--font-cinzel),serif] tracking-wide transition-all ${
                  tab === n
                    ? "am-btn am-btn-gold am-btn-sheen"
                    : "bg-am-bg-2 text-am-ink-soft hover:text-am-ink hover:bg-am-bg-3"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => router.push("/decks")}
          className="am-btn am-btn-ghost px-4 py-1.5 rounded-lg text-sm"
        >
          {t("cancel")}
        </button>
      </div>

      {/* Corps : la colonne gauche (collection) n'apparaît qu'en onglet Cartes */}
      <div className="relative z-10 flex flex-col md:flex-row md:flex-1 md:min-h-0 md:overflow-hidden">

      {/* ===== Onglet 3 — colonne gauche : collection ===== */}
      {tab === 3 && (
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {!selectedFaction ? (
          <div className="am-glass mx-auto mt-10 max-w-md p-10 text-center text-am-ink-soft font-[family-name:var(--font-crimson),serif] italic text-base">
            {t("choose_faction_first_tab")}
          </div>
        ) : (
        <>
        {/* Filters */}
        <div className="am-glass flex flex-wrap gap-2 mb-4 p-3 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search_placeholder")}
            className="am-gild-border px-3 py-1.5 bg-am-bg-2 rounded-lg text-sm text-am-ink placeholder:text-am-ink-faint focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0 w-48"
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
                    ? "bg-am-azure text-white"
                    : "am-gild-border bg-am-bg-2 text-am-ink-faint hover:text-am-ink hover:border-am-azure/50"
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
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              typeFilter === "creature"
                ? "bg-am-gold text-am-bg-0"
                : "am-gild-border bg-am-bg-2 text-am-ink-soft hover:text-am-ink"
            }`}
          >
            {t("creatures")}
          </button>
          <button
            onClick={() =>
              setTypeFilter(typeFilter === "spell" ? null : "spell")
            }
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              typeFilter === "spell"
                ? "bg-am-arcane text-white"
                : "am-gild-border bg-am-bg-2 text-am-ink-soft hover:text-am-ink"
            }`}
          >
            {t("spells")}
          </button>
          <select
            value={keywordFilter ?? ""}
            onChange={(e) =>
              setKeywordFilter(
                e.target.value ? (e.target.value as Keyword) : null
              )
            }
            className="am-gild-border px-2 py-1 bg-am-bg-2 rounded-md text-xs text-am-ink-soft focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0"
          >
            <option value="">{t("all_capabilities")}</option>
            {KEYWORDS.map((kw) => (
              <option key={kw} value={kw}>
                {vocab.keywordLabel(kw)}
              </option>
            ))}
          </select>
          <select
            value={raceFilter ?? ""}
            onChange={(e) => setRaceFilter(e.target.value || null)}
            className="am-gild-border px-2 py-1 bg-am-bg-2 rounded-md text-xs text-am-ink-soft focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0"
          >
            <option value="">{t("all_races")}</option>
            {races.map((r) => (
              <option key={r} value={r}>{vocab.raceName(r)}</option>
            ))}
          </select>
          <select
            value={clanFilter ?? ""}
            onChange={(e) => setClanFilter(e.target.value || null)}
            className="am-gild-border px-2 py-1 bg-am-bg-2 rounded-md text-xs text-am-ink-soft focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0"
          >
            <option value="">{t("all_clans")}</option>
            {clans.map((c) => (
              <option key={c} value={c}>{vocab.clanNameWithRaces(c)}</option>
            ))}
          </select>
          <select
            value={filterSet}
            onChange={(e) => setFilterSet(e.target.value)}
            className="am-gild-border px-2 py-1 bg-am-bg-2 rounded-md text-xs text-am-ink-soft focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0"
          >
            <option value="">{t("all_sets")}</option>
            {sets.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.icon} {vocab.setName(s.code, s.name)}</option>
            ))}
          </select>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="am-gild-border px-2 py-1 bg-am-bg-2 rounded-md text-xs text-am-ink-soft focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0"
          >
            <option value="">{t("year")}</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div className="flex gap-0.5">
            {["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"].map((r) => (
              <button
                key={r}
                onClick={() => setRarityFilter(rarityFilter === r ? null : r)}
                className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                  rarityFilter === r
                    ? "bg-am-gold text-am-bg-0"
                    : "am-gild-border bg-am-bg-2 text-am-ink-soft hover:text-am-ink"
                }`}
              >
                {r === "Peu Commune" ? t("rarity_abbr_uncommon") : r === "Légendaire" ? t("rarity_abbr_legendary") : vocab.rarityLabel(r)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setExpertOnly((v) => !v)}
            title={t("expert_only_title")}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
              expertOnly
                ? "border border-am-gold text-am-gold bg-am-gold/10"
                : "am-gild-border bg-am-bg-2 text-am-ink-soft hover:text-am-gold"
            }`}
          >
            {t("expert")}
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
      <div className={`bg-am-bg-1/80 backdrop-blur-sm border-t md:border-t-0 md:border-l border-am-gold/30 flex flex-col md:flex-shrink-0 ${tab === 3 ? "md:overflow-hidden md:w-[320px] md:max-w-[320px]" : "md:overflow-y-auto md:flex-1"}`}>
        {/* Configuration sections (héros / plateau / dos / nom / format / stats).
            Onglet 3 (Cartes) : plafonnées à 55vh avec scroll interne pour libérer
            la place à la liste des cartes en dessous. Onglets 1 & 2 : pas de
            plafond — elles s'écoulent dans le scroll unique du panneau, sinon le
            plateau/dos passent sous le pli (invisibles sur iPad). */}
        <div style={{ flexShrink: 0, overflowY: tab === 3 ? "auto" : "visible", maxHeight: tab === 3 ? "55vh" : undefined }}>

        {/* ===== Onglet 1 — Préparation : nom, faction, format ===== */}
        {tab === 1 && (
        <div className="p-4 md:p-6">
          <div className="am-glass p-5 space-y-5">
            <div className="text-center pb-1">
              <span className="font-[family-name:var(--font-cinzel),serif] text-[10px] tracking-[0.32em] uppercase text-am-arcane-bright/80">{t("preparation")}</span>
              <h2 className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold text-2xl mt-1">{t("forge_a_deck")}</h2>
              <div className="am-rule-diamond mt-3 w-32 mx-auto" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-am-gold mb-1.5">{t("deck_name")}</label>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder={t("deck_name_placeholder")}
                className="am-gild-border w-full px-3 py-2 bg-am-bg-2 rounded-lg text-am-ink placeholder:text-am-ink-faint focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-am-gold mb-1.5">{t("faction")}</label>
              <select
                value={selectedFaction ?? ""}
                onChange={(e) => changeFaction(e.target.value || null)}
                className="am-gild-border w-full px-3 py-2 bg-am-bg-2 rounded-lg text-am-ink text-sm focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0"
              >
                <option value="">{t("choose_faction")}</option>
                {FACTION_OPTIONS.map((f) => (
                  <option key={f} value={f}>{vocab.factionNameWithRaces(f)}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-am-ink-faint font-[family-name:var(--font-crimson),serif] italic">{t("faction_hint")}</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-am-gold mb-1.5">{t("format")}</label>
              <div className="flex gap-2">
                <select
                  value={formatMode}
                  onChange={(e) => {
                    const m = e.target.value as DeckMode | "";
                    if (!m) { setSelectedFormatId(null); return; }
                    resolveFormat(m, formatExtent || "standard");
                  }}
                  className="am-gild-border flex-1 px-3 py-2 bg-am-bg-2 rounded-lg text-am-ink-soft text-sm focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0"
                >
                  <option value="">{t("mode_placeholder")}</option>
                  <option value="classique">{t("mode_classic")}</option>
                  <option value="expert">{t("mode_expert")}</option>
                </select>
                <select
                  value={formatExtent}
                  onChange={(e) => {
                    const x = e.target.value as DeckExtent | "";
                    if (!x) { setSelectedFormatId(null); return; }
                    resolveFormat(formatMode || "classique", x);
                  }}
                  className="am-gild-border flex-1 px-3 py-2 bg-am-bg-2 rounded-lg text-am-ink-soft text-sm focus:outline-none focus:ring-2 focus:ring-am-gold/60 focus:ring-offset-2 focus:ring-offset-am-bg-0"
                >
                  <option value="">{t("extent_placeholder")}</option>
                  <option value="standard">{t("extent_standard")}</option>
                  <option value="etendu">{t("extent_extended")}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* ===== Onglet 2 — Apparence : héros, plateau, dos ===== */}
        {tab === 2 && !selectedFaction && (
          <div className="am-glass m-4 p-6 text-center text-am-ink-soft text-sm font-[family-name:var(--font-crimson),serif] italic">{t("choose_faction_first_tab_short")}</div>
        )}
        {tab === 2 && selectedFaction && (<>
        {/* Hero selection */}
        <div className="p-4 border-b border-am-gold/20">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm font-bold font-[family-name:var(--font-cinzel),serif] text-am-gold tracking-wide">{t("choose_hero")}</h3>
            <span className="text-[10px] text-am-ink-faint italic">{t("right_click_power")}</span>
          </div>
          {factionHeroes.length === 0 && (
            <p className="text-[11px] text-am-ink-faint py-2 italic">{t("no_hero_for_faction")}</p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {factionHeroes.map((hero) => (
              <button
                key={hero.id}
                onClick={() => setSelectedHeroId(hero.id)}
                onContextMenu={(e) => { e.preventDefault(); setPowerPopup({ hero, x: e.clientX, y: e.clientY }); }}
                title={t("right_click_power")}
                className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
                  selectedHeroId === hero.id
                    ? "border-am-gold shadow-[0_0_14px_rgba(216,178,90,0.5)]"
                    : "border-am-gold/20 hover:border-am-gold/50"
                }`}
              >
                <div
                  className="w-full aspect-[3/4] bg-am-bg-2 flex items-center justify-center"
                  style={hero.thumbnail_url ? { backgroundImage: `url('${hero.thumbnail_url}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                >
                  {!hero.thumbnail_url && <span className="text-3xl opacity-60">{RACE_ICONS[hero.race] ?? "\u2B50"}</span>}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-am-bg-0 via-am-bg-0/70 to-transparent px-1.5 py-1">
                  <div className="text-[10px] font-bold text-am-ink truncate">{heroText.heroName(hero)}</div>
                </div>
                {selectedHeroId === hero.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-am-gold text-am-bg-0 text-[10px] font-bold flex items-center justify-center">{"\u2713"}</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Board selection */}
        <div className="p-4 border-b border-am-gold/20">
          <h3 className="text-sm font-bold font-[family-name:var(--font-cinzel),serif] text-am-gold tracking-wide mb-2.5">{t("board")}</h3>
          {selectedBoard ? (
            <div className="am-gild-border rounded-lg overflow-hidden bg-am-bg-2">
              <div
                className="relative w-full h-20"
                style={{
                  backgroundImage: `url('${selectedBoard.image_url}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-am-bg-0 via-am-bg-0/40 to-transparent" />
                <div className="absolute bottom-1 left-2 right-2 flex items-end justify-between">
                  <div>
                    <div className="text-xs font-bold text-am-ink drop-shadow">{selectedBoard.name}</div>
                    <div className="text-[9px] text-am-ink-soft">{vocab.rarityLabel(selectedBoard.rarity ?? "Commune")}</div>
                  </div>
                  <button
                    onClick={() => setBoardPickerOpen(true)}
                    className="text-[9px] px-2 py-0.5 bg-am-gold/90 hover:bg-am-gold text-am-bg-0 font-bold rounded"
                  >
                    {t("change")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setBoardPickerOpen(true)}
              className="w-full py-2 bg-am-bg-2 border border-dashed border-am-gold/30 rounded-lg text-xs text-am-ink-soft hover:border-am-gold/60 hover:text-am-ink transition-colors"
            >
              {t("choose_board")}
            </button>
          )}
        </div>

        {/* Card back selection */}
        <div className="p-4 border-b border-am-gold/20">
          <h3 className="text-sm font-bold font-[family-name:var(--font-cinzel),serif] text-am-gold tracking-wide mb-2.5">{t("card_back")}</h3>
          {selectedCardBack ? (
            <div className="am-gild-border rounded-lg overflow-hidden bg-am-bg-2 flex items-stretch">
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
                  <div className="text-xs font-bold text-am-ink">{selectedCardBack.name}</div>
                  <div className="text-[9px] text-am-ink-soft">{vocab.rarityLabel(selectedCardBack.rarity ?? "Commune")}</div>
                </div>
                <button
                  onClick={() => setCardBackPickerOpen(true)}
                  className="text-[9px] px-2 py-0.5 bg-am-gold/90 hover:bg-am-gold text-am-bg-0 font-bold rounded"
                >
                  {t("change")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCardBackPickerOpen(true)}
              className="w-full py-2 bg-am-bg-2 border border-dashed border-am-gold/30 rounded-lg text-xs text-am-ink-soft hover:border-am-gold/60 hover:text-am-ink transition-colors"
            >
              {t("choose_card_back")}
            </button>
          )}
        </div>

        </>)}

        {/* Deck restrictions info (toujours visible) */}
        <div className="px-4 py-2.5 border-b border-am-gold/20">
          <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
            <span className="px-2 py-0.5 rounded-full font-bold border border-am-jade/40 bg-am-jade/10 text-am-jade">
              {t("mono_faction")}
            </span>
            <span className="px-2 py-0.5 rounded-full font-bold border border-am-jade/40 bg-am-jade/10 text-am-jade">
              {t("mono_clan")}
            </span>
            <span className="text-am-ink-faint">{t("clan_label")} {deckStats.clans.size}/{MAX_CLANS}</span>
            {Array.from(deckStats.allFactions).map(f => {
              const fac = FACTIONS[f];
              const align = ALIGNMENTS.find(a => a.id === fac?.alignment);
              return <span key={f} style={{ color: fac?.color }}>{fac?.emoji} {vocab.factionName(f)} <span style={{ color: align?.color }}>{align?.emoji}</span></span>;
            })}
            <span className="text-am-ink-faint">| {vocab.factionName("Mercenaires")}: {deckStats.mercenairesCount}/{deckStats.maxMercenaires}</span>
          </div>
          {deckStats.violations.length > 0 && (
            <div className="mt-1.5">
              {deckStats.violations.map((v, i) => (
                <div key={i} className="text-[10px] text-am-ember font-semibold">{"⚠"} {v}</div>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* ===== Onglet 3 — colonne droite : compteur, courbe, slots ===== */}
        {tab === 3 && (<>
        {/* Compteur deck */}
        <div className="px-4 py-2.5 border-t border-am-gold/30 flex-shrink-0 bg-am-bg-1/60">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-am-gold font-bold uppercase tracking-[0.2em] font-[family-name:var(--font-cinzel),serif]">{t("deck")}</span>
            <span
              className={`font-bold text-base ${
                totalCards === DECK_SIZE ? "text-am-jade" : "text-am-ink"
              }`}
            >
              {totalCards}/{DECK_SIZE}
            </span>
          </div>
          <div className="mt-1 h-1.5 bg-am-bg-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                totalCards === DECK_SIZE ? "bg-am-jade" : "bg-am-gold"
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
                  title={t("mana_curve_tooltip", { label, count })}
                  className="flex-1 flex flex-col items-center gap-0.5 group cursor-pointer"
                >
                  <span className={`text-[9px] leading-none transition-colors ${
                    count > 0 ? "text-am-ink-soft" : "text-transparent"
                  }`}>
                    {count}
                  </span>
                  <div className="w-full h-8 flex items-end">
                    <div
                      className={`w-full rounded-sm transition-all ${
                        isFiltered ? "bg-am-azure" : "bg-am-azure/50 group-hover:bg-am-azure/80"
                      }`}
                      style={{ height: `${height}px` }}
                    />
                  </div>
                  <span className={`text-[9px] leading-none font-bold transition-colors ${
                    isFiltered ? "text-am-azure" : "text-am-ink-faint group-hover:text-am-ink-soft"
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
            <p className="text-center text-am-ink-faint mt-8 text-sm font-[family-name:var(--font-crimson),serif] italic">
              {t("click_cards_to_add")}
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
                  <span className="text-[10px] font-bold tracking-wide" style={{ color }}>{emoji} {vocab.rarityLabel(tier).toUpperCase()}</span>
                  <span className="text-[10px] font-semibold" style={{ color: used > maxSlots ? "var(--am-ember)" : "var(--am-ink-faint)" }}>{used}/{maxSlots}</span>
                </div>

                {/* Cards in this slot */}
                <div className="px-2 py-1">
                  {entries.map(entry => (
                    <DeckCardRow
                      key={entry.card.id}
                      card={entry.card}
                      quantity={entry.quantity}
                      substituted={entry.substituted}
                      tint={RARITY_COLORS[entry.card.rarity || "Commune"]}
                      onRemove={() => removeCard(entry.card.id)}
                      onPreviewEnter={schedulePreview}
                      onPreviewLeave={clearPreview}
                      onPreviewLong={openTouchPreview}
                      onPreviewContext={togglePreviewDetails}
                    />
                  ))}

                  {/* Empty slot indicators (only for non-Commune rarities) */}
                  {!isCommon && emptySlots > 0 && Array.from({ length: Math.min(emptySlots, 4) }).map((_, i) => (
                    <div key={`empty-${i}`} className="flex items-center gap-2 px-2 py-1 opacity-20">
                      <span className="w-4 h-4 rounded-full border border-dashed flex-shrink-0" style={{ borderColor: color }} />
                      <span className="text-[10px]" style={{ color }}>{t("free_slot")}</span>
                    </div>
                  ))}
                  {!isCommon && emptySlots > 4 && (
                    <div className="px-2 py-0.5 text-[9px] opacity-20" style={{ color }}>{t("more_slots", { count: emptySlots - 4 })}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Récap mots-clés — décompte par capacité nommée présente dans le deck.
            Nombre en rouge (am-ember) une fois la limite MAX_SAME_CAPABILITY
            atteinte, pour signaler qu'on ne peut plus en ajouter. */}
        {keywordTally.length > 0 && (
          <div className="px-3 py-2 border-t border-am-gold/30 flex-shrink-0 bg-am-bg-1/60">
            <div className="text-[9px] text-am-gold font-bold uppercase tracking-[0.2em] mb-1.5 font-[family-name:var(--font-cinzel),serif]">{t("keywords")}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {keywordTally.map(({ id, count, iconKey, symbol, label }) => {
                const atLimit = count >= MAX_SAME_CAPABILITY;
                return (
                  <div
                    key={id}
                    title={`${label} : ${count}${atLimit ? ` ${t("max_suffix", { max: MAX_SAME_CAPABILITY })}` : ""}`}
                    className="flex items-center gap-1"
                  >
                    <span className="inline-flex items-center justify-center" style={{ width: 18, height: 18 }}>
                      <KeywordIcon symbol={symbol} size={14} keyword={iconKey} />
                    </span>
                    <span className={`text-[11px] font-bold tabular-nums ${atLimit ? "text-am-ember" : "text-am-ink-soft"}`}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </>)}

        {/* Barre Sauvegarder (uniquement sur l'onglet Cartes) */}
        {tab === 3 && (
        <div className="p-4 border-t border-am-gold/30 flex-shrink-0 bg-am-bg-1/60">
          {error && (
            <p className="text-am-ember text-xs mb-2 font-semibold">{error}</p>
          )}
          <div className="flex items-center gap-3">
            <span className={`font-bold text-sm whitespace-nowrap ${totalCards === DECK_SIZE ? "text-am-jade" : "text-am-ink-soft"}`}>
              {totalCards}/{DECK_SIZE}
            </span>
            <AmButton
              variant="gold"
              size="md"
              onClick={saveDeck}
              disabled={saving}
              className="flex-1 rounded-lg"
            >
              {saving ? t("saving") : existingDeck ? t("save_deck") : t("create_deck")}
            </AmButton>
          </div>
        </div>
        )}
      </div>
      </div>

      {/* Aperçu plein format d'une carte du deck — tactile : modale centrée
          avec backdrop (tap pour fermer). */}
      {previewCard && previewTouch && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-6"
          onClick={closeTouchPreview}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <GameCard card={previewCard} size="lg" forceRarityFrame disableHoverZoom />
          </div>
        </div>
      )}
      {/* Aperçu au survol (desktop) — carte flottante non interactive, ancrée à
          gauche du panneau de droite. position:fixed pour éviter le clipping de
          la liste scrollable (et les soucis de stacking Safari). */}
      {previewCard && !previewTouch && (
        <div
          className="fixed z-[60] pointer-events-none hidden md:block drop-shadow-2xl"
          style={{ right: 332, top: "50%", transform: "translateY(-50%)" }}
        >
          <GameCard card={previewCard} size="lg" forceRarityFrame disableHoverZoom showDetails={previewDetails} />
        </div>
      )}

      {/* Pop-over pouvoir du héros (clic droit) */}
      {powerPopup && (
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => setPowerPopup(null)}
          onContextMenu={(e) => { e.preventDefault(); setPowerPopup(null); }}
        >
          <div
            className="am-glass absolute w-64 rounded-xl shadow-2xl overflow-hidden"
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
              <div className="text-sm font-bold font-[family-name:var(--font-cinzel),serif] text-am-ink">{heroText.heroName(powerPopup.hero)}</div>
              <div className="text-xs text-am-gold font-medium mt-0.5">{heroText.powerName(powerPopup.hero)}</div>
              {powerPopup.hero.power_description && (
                <div className="text-[11px] text-am-ink-soft mt-1 leading-snug font-[family-name:var(--font-crimson),serif] italic">{heroText.powerDesc(powerPopup.hero)}</div>
              )}
              <div className="mt-2">
                {powerPopup.hero.power_type === "passive" ? (
                  <span className="px-1.5 py-0.5 bg-am-arcane/20 text-am-arcane-bright text-[9px] font-bold rounded">{t("passive")}</span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-am-azure/20 text-am-azure text-[9px] font-bold rounded">{powerPopup.hero.power_cost} {t("mana")}</span>
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
            className="am-glass rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-am-gold/30 flex items-center justify-between">
              <h3 className="text-lg font-bold am-foil-text font-[family-name:var(--font-cinzel),serif]">{t("choose_board")}</h3>
              <button
                onClick={() => setBoardPickerOpen(false)}
                className="text-am-ink-soft hover:text-am-ink text-xl leading-none px-2"
              >×</button>
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              {accessibleBoards.length === 0 ? (
                <div className="col-span-full text-center text-am-ink-soft py-10 text-sm italic">
                  {t("no_board_available")}
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
                      selected ? "border-am-gold shadow-[0_0_14px_rgba(216,178,90,0.5)]" : "border-am-gold/20 hover:border-am-gold/50"
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
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-am-bg-0 via-am-bg-0/70 to-transparent p-2">
                      <div className="text-xs font-bold text-am-ink">{b.name}</div>
                      <div className="text-[10px] text-am-ink-soft flex items-center gap-2">
                        <span>{vocab.rarityLabel(b.rarity ?? "Commune")}</span>
                        {!isCommon && prints.length > 0 && (
                          <span className="text-am-gold">
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
            className="am-glass rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-am-gold/30 flex items-center justify-between">
              <h3 className="text-lg font-bold am-foil-text font-[family-name:var(--font-cinzel),serif]">{t("choose_card_back")}</h3>
              <button
                onClick={() => setCardBackPickerOpen(false)}
                className="text-am-ink-soft hover:text-am-ink text-xl leading-none px-2"
              >×</button>
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {accessibleCardBacks.length === 0 ? (
                <div className="col-span-full text-center text-am-ink-soft py-10 text-sm italic">
                  {t("no_card_back_available")}
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
                      selected ? "border-am-gold shadow-[0_0_14px_rgba(216,178,90,0.5)]" : "border-am-gold/20 hover:border-am-gold/50"
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
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-am-bg-0 via-am-bg-0/70 to-transparent p-2">
                      <div className="text-xs font-bold text-am-ink">{cb.name}</div>
                      <div className="text-[10px] text-am-ink-soft flex items-center gap-2">
                        <span>{vocab.rarityLabel(cb.rarity ?? "Commune")}</span>
                        {!isCommon && prints.length > 0 && (
                          <span className="text-am-gold">
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
