"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import GameCard from "@/components/cards/GameCard";
import { ALL_KEYWORDS, KEYWORD_LABELS } from "@/lib/game/keyword-labels";
import { KEYWORDS as KEYWORD_DEFS, FACTIONS } from "@/lib/card-engine/constants";
import { SPELL_KEYWORDS, ALL_SPELL_KEYWORDS, SPELL_KEYWORD_LABELS } from "@/lib/game/spell-keywords";
import type { Card, Keyword, SpellKeywordInstance, SpellComposableEffects, CardSet, TokenTemplate } from "@/lib/game/types";
import TokenCascadePicker from "@/components/admin/TokenCascadePicker";

interface DbCard {
  id: number;
  name: string;
  mana_cost: number;
  card_type: string;
  attack: number | null;
  health: number | null;
  effect_text: string;
  flavor_text: string | null;
  keywords: string[];
  spell_keywords: SpellKeywordInstance[] | null;
  spell_effects: SpellComposableEffects | null;
  image_url: string | null;
  illustration_prompt: string | null;
  faction: string | null;
  race: string | null;
  clan: string | null;
  rarity: string | null;
  card_alignment: string | null;
  convocation_token_id: number | null;
  convocation_tokens: { token_id: number; attack?: number; health?: number }[] | null;
  lycanthropie_token_id: number | null;
  entraide_race: string | null;
  set_id: number | null;
  card_year: number | null;
  card_month: number | null;
  life_cost: number | null;
  discard_cost: number | null;
  sacrifice_cost: number | null;
}

const S = {
  label: { fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 0.5, marginBottom: 3 } as React.CSSProperties,
  input: { width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 11, fontFamily: "'Crimson Text',serif" } as React.CSSProperties,
  select: { width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 11, background: "#fff" } as React.CSSProperties,
  textarea: { width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 11, fontFamily: "'Crimson Text',serif", resize: "vertical" as const, minHeight: 50 } as React.CSSProperties,
  btn: (bg: string, color = "#fff") => ({ padding: "6px 16px", borderRadius: 6, border: "none", background: bg, color, fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", letterSpacing: 0.5 }) as React.CSSProperties,
  filterBtn: (active: boolean) => ({ padding: "4px 10px", borderRadius: 5, border: `1px solid ${active ? "#333" : "#ddd"}`, background: active ? "#333" : "#fff", color: active ? "#fff" : "#888", fontSize: 9, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }) as React.CSSProperties,
  manaBtn: (active: boolean) => ({ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${active ? "#4a90d9" : "#ddd"}`, background: active ? "#4a90d9" : "#fff", color: active ? "#fff" : "#888", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }) as React.CSSProperties,
};

const RARITIES = ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"];
const SORTED_KEYWORDS = [...ALL_KEYWORDS].sort((a, b) => KEYWORD_LABELS[a].localeCompare(KEYWORD_LABELS[b], "fr"));

export default function CardEditor() {
  // Data
  const [cards, setCards] = useState<DbCard[]>([]);
  const [sets, setSets] = useState<CardSet[]>([]);
  const [tokenTemplates, setTokenTemplates] = useState<TokenTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredKw, setHoveredKw] = useState<Keyword | null>(null);
  const [keywordXValues, setKeywordXValues] = useState<Record<string, number>>({});

  // Filters
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
  const [filterMonth, setFilterMonth] = useState("");

  // View
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Edit
  const [selectedCard, setSelectedCard] = useState<DbCard | null>(null);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [newImageFile, setNewImageFile] = useState<{ base64: string; mimeType: string } | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [generatingPrints, setGeneratingPrints] = useState(false);
  const [printsResult, setPrintsResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsRes, setsRes, tokensRes] = await Promise.all([
        fetch("/api/cards/save"),
        fetch("/api/sets"),
        fetch("/api/token-templates"),
      ]);
      const cardsData = await cardsRes.json();
      const setsData = await setsRes.json();
      const tokensData = await tokensRes.json();
      setCards(Array.isArray(cardsData) ? cardsData : []);
      setSets(Array.isArray(setsData) ? setsData : []);
      setTokenTemplates(Array.isArray(tokensData) ? tokensData : []);
    } catch (err) {
      console.error("Erreur chargement:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Dynamic filter options
  const factions = useMemo(() => [...new Set(cards.map(c => c.faction).filter(Boolean) as string[])].sort(), [cards]);
  const races = useMemo(() => [...new Set(cards.map(c => c.race).filter(Boolean) as string[])].sort(), [cards]);
  const clans = useMemo(() => [...new Set(cards.map(c => c.clan).filter(Boolean) as string[])].sort(), [cards]);
  const years = useMemo(() => [...new Set(cards.map(c => c.card_year).filter(Boolean) as number[])].sort((a, b) => b - a), [cards]);

  // Filtered cards
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      if (search && !card.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (manaCostFilter !== null && card.mana_cost !== manaCostFilter) return false;
      if (typeFilter !== null && card.card_type !== typeFilter) return false;
      if (keywordFilter !== null && !card.keywords.includes(keywordFilter)) return false;
      if (factionFilter !== null && card.faction !== factionFilter) return false;
      if (rarityFilter !== null && card.rarity !== rarityFilter) return false;
      if (raceFilter !== null && card.race !== raceFilter) return false;
      if (clanFilter !== null && card.clan !== clanFilter) return false;
      if (filterSet && card.set_id !== parseInt(filterSet)) return false;
      if (filterYear && String(card.card_year) !== filterYear) return false;
      if (filterMonth && String(card.card_month) !== filterMonth) return false;
      return true;
    }).sort((a, b) => a.mana_cost - b.mana_cost || a.name.localeCompare(b.name, "fr"));
  }, [cards, search, manaCostFilter, typeFilter, keywordFilter, factionFilter, rarityFilter, raceFilter, clanFilter, filterSet, filterYear, filterMonth]);

  // Select card for editing
  const selectCard = useCallback((card: DbCard) => {
    setSelectedCard(card);

    // Parse X values from effect_text suffix like [Riposte 2, Carnage 3]
    const xMatch = (card.effect_text || "").match(/\[([^\]]+)\]$/);
    const parsedX: Record<string, number> = {};
    if (xMatch) {
      for (const part of xMatch[1].split(",")) {
        const trimmed = part.trim();
        const lastSpace = trimmed.lastIndexOf(" ");
        if (lastSpace > 0) {
          const kwName = trimmed.slice(0, lastSpace);
          const val = parseInt(trimmed.slice(lastSpace + 1));
          if (!isNaN(val)) {
            // Find the game keyword ID from the forge label
            const fullName = `${kwName} X`;
            const entry = Object.entries(KEYWORD_LABELS).find(([, label]) => label === fullName);
            if (entry) parsedX[entry[0]] = val;
          }
        }
      }
    }
    setKeywordXValues(parsedX);

    // Strip X suffix from effect_text for editing
    const cleanEffectText = (card.effect_text || "").replace(/\s*\[[^\]]*\]$/, "").trim();

    setEditFields({
      name: card.name,
      mana_cost: card.mana_cost,
      card_type: card.card_type,
      attack: card.attack,
      health: card.health,
      effect_text: cleanEffectText,
      flavor_text: card.flavor_text || "",
      illustration_prompt: card.illustration_prompt || "",
      keywords: [...(card.keywords || [])],
      spell_keywords: card.spell_keywords ? JSON.parse(JSON.stringify(card.spell_keywords)) : [],
      spell_effects: card.spell_effects ? JSON.parse(JSON.stringify(card.spell_effects)) : null,
      faction: card.faction || "",
      race: card.race || "",
      clan: card.clan || "",
      rarity: card.rarity || "Commune",
      card_alignment: card.card_alignment || "neutre",
      convocation_token_id: card.convocation_token_id ?? null,
      convocation_tokens: card.convocation_tokens || [],
      lycanthropie_token_id: card.lycanthropie_token_id ?? null,
      entraide_race: card.entraide_race || null,
      set_id: card.set_id,
      card_year: card.card_year,
      card_month: card.card_month,
      life_cost: card.life_cost ?? 0,
      discard_cost: card.discard_cost ?? 0,
      sacrifice_cost: card.sacrifice_cost ?? 0,
    });
    setNewImageFile(null);
    setNewImagePreview(null);
    setSaveResult(null);
    setDeleteConfirmId(null);
  }, []);

  const updateField = (key: string, value: unknown) => {
    setEditFields(prev => ({ ...prev, [key]: value }));
  };

  const toggleKeyword = (kw: string) => {
    const kws = (editFields.keywords as string[]) || [];
    if (kws.includes(kw)) {
      updateField("keywords", kws.filter(k => k !== kw));
      // Remove X value if keyword is removed
      setKeywordXValues(prev => { const n = { ...prev }; delete n[kw]; return n; });
    } else {
      updateField("keywords", [...kws, kw]);
      // Set default X=1 for scalable keywords
      const label = KEYWORD_LABELS[kw as Keyword];
      if (label && KEYWORD_DEFS[label]?.scalable) {
        setKeywordXValues(prev => ({ ...prev, [kw]: 1 }));
      }
    }
  };

  // Save
  const handleSave = useCallback(async () => {
    if (!selectedCard) return;
    setSaving(true);
    setSaveResult(null);
    try {
      // Rebuild effect_text with X values appended
      const activeKeywords = (editFields.keywords as string[]) || [];

      // Required-token validation: matches CardForge — silently saving
      // these without a token would leave the keyword as a no-op at play
      // time.
      if (activeKeywords.includes("convocation") && !editFields.convocation_token_id) {
        setSaveResult({ ok: false, msg: "Convocation X : sélectionnez un token avant de sauvegarder." });
        setSaving(false);
        return;
      }
      if (activeKeywords.includes("convocation_simple") && !editFields.convocation_token_id) {
        setSaveResult({ ok: false, msg: "Convocation : sélectionnez un token avant de sauvegarder." });
        setSaving(false);
        return;
      }
      if (activeKeywords.includes("convocations_multiples") && !((editFields.convocation_tokens as unknown[]) || []).length) {
        setSaveResult({ ok: false, msg: "Convocations multiples : ajoutez au moins un token avant de sauvegarder." });
        setSaving(false);
        return;
      }
      // Spell side: same concept, `invocation_multiple` in spell_keywords.
      const spellKws = (editFields.spell_keywords as SpellKeywordInstance[]) || [];
      if (
        spellKws.some((k) => k.id === "invocation_multiple") &&
        !((editFields.convocation_tokens as unknown[]) || []).length
      ) {
        setSaveResult({ ok: false, msg: "Convocations multiples (sort) : ajoutez au moins un token avant de sauvegarder." });
        setSaving(false);
        return;
      }
      if (
        spellKws.some((k) => k.id === "convocation_simple") &&
        !editFields.convocation_token_id
      ) {
        setSaveResult({ ok: false, msg: "Convocation (sort) : sélectionnez un token avant de sauvegarder." });
        setSaving(false);
        return;
      }
      if (activeKeywords.includes("lycanthropie") && !editFields.lycanthropie_token_id) {
        setSaveResult({ ok: false, msg: "Lycanthropie X : sélectionnez un token de transformation avant de sauvegarder." });
        setSaving(false);
        return;
      }
      if (activeKeywords.includes("entraide") && !editFields.entraide_race) {
        setSaveResult({ ok: false, msg: "Entraide : sélectionnez la race cible avant de sauvegarder." });
        setSaving(false);
        return;
      }

      const xParts = Object.entries(keywordXValues)
        .filter(([kw]) => activeKeywords.includes(kw))
        .map(([kw, x]) => `${KEYWORD_LABELS[kw as Keyword].replace(/ X$/, "")} ${x}`)
        .join(", ");
      const effectTextBase = (editFields.effect_text as string) || "";
      const effectTextFull = [effectTextBase, xParts ? `[${xParts}]` : ""].filter(Boolean).join(" ");

      const cardData = {
        name: editFields.name,
        mana_cost: editFields.mana_cost,
        card_type: editFields.card_type,
        attack: editFields.card_type === "creature" ? editFields.attack : null,
        health: editFields.card_type === "creature" ? editFields.health : null,
        effect_text: effectTextFull || null,
        flavor_text: editFields.flavor_text || null,
        illustration_prompt: editFields.illustration_prompt || null,
        keywords: editFields.keywords || [],
        spell_keywords: (editFields.spell_keywords as SpellKeywordInstance[])?.length ? editFields.spell_keywords : null,
        spell_effects: editFields.spell_effects || null,
        faction: editFields.faction || null,
        race: editFields.race || null,
        clan: editFields.clan || null,
        rarity: editFields.rarity || null,
        card_alignment: editFields.card_alignment || null,
        convocation_token_id: editFields.convocation_token_id ?? null,
        convocation_tokens: (editFields.convocation_tokens as unknown[])?.length ? editFields.convocation_tokens : null,
        lycanthropie_token_id: editFields.lycanthropie_token_id ?? null,
        entraide_race: activeKeywords.includes("entraide") ? (editFields.entraide_race || null) : null,
        set_id: editFields.set_id || null,
        card_year: editFields.card_year || null,
        card_month: editFields.card_month || null,
        life_cost: (editFields.life_cost as number) || 0,
        discard_cost: (editFields.discard_cost as number) || 0,
        sacrifice_cost: (editFields.sacrifice_cost as number) || 0,
      };

      const body: Record<string, unknown> = { card: cardData, updateId: selectedCard.id };
      if (newImageFile) {
        body.imageBase64 = newImageFile.base64;
        body.imageMimeType = newImageFile.mimeType;
      }

      const res = await fetch("/api/cards/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSaveResult({ ok: true, msg: "Carte mise à jour" });
      // Refresh cards
      const cardsRes = await fetch("/api/cards/save");
      const cardsData = await cardsRes.json();
      if (Array.isArray(cardsData)) {
        setCards(cardsData);
        const updated = cardsData.find((c: DbCard) => c.id === selectedCard.id);
        if (updated) setSelectedCard(updated);
      }
      setNewImageFile(null);
      setNewImagePreview(null);
    } catch (err) {
      setSaveResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur" });
    }
    setSaving(false);
  }, [selectedCard, editFields, newImageFile, keywordXValues]);

  // Delete
  const handleDelete = useCallback(async (id: number) => {
    try {
      const res = await fetch("/api/cards/save", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCards(prev => prev.filter(c => c.id !== id));
      if (selectedCard?.id === id) {
        setSelectedCard(null);
        setEditFields({});
      }
      setDeleteConfirmId(null);
      setSaveResult({ ok: true, msg: "Carte supprimée" });
    } catch (err) {
      setSaveResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur suppression" });
    }
  }, [selectedCard]);

  // Generate prints for a single card. Persist the current edit state
  // first (year / month / rarity etc.) — otherwise the generate API
  // reads stale DB values and bails out with "cette carte n'a pas
  // d'année définie" even when the admin just typed the year in the
  // form.
  const handleGeneratePrints = useCallback(async (cardId: number) => {
    setGeneratingPrints(true);
    setPrintsResult(null);
    try {
      // Lightweight pre-save: we only push the print-relevant fields so
      // we don't trip handleSave's validation gates (convocation token
      // requirements, entraide race, etc.) that may not be relevant
      // when the admin's only goal is to set a card_year.
      const preSaveBody = {
        card: {
          card_year: editFields.card_year || null,
          card_month: editFields.card_month || null,
          rarity: editFields.rarity || null,
          set_id: editFields.set_id || null,
        },
        updateId: cardId,
        partial: true,
      };
      const saveRes = await fetch("/api/cards/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preSaveBody),
      });
      if (!saveRes.ok) {
        const saveData = await saveRes.json();
        throw new Error(saveData.error || `Erreur sauvegarde ${saveRes.status}`);
      }

      const res = await fetch("/api/card-prints/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrintsResult({ ok: true, msg: data.message });
    } catch (err) {
      setPrintsResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur" });
    }
    setGeneratingPrints(false);
  }, [editFields]);

  // Batch generate prints for all eligible cards
  const handleBatchGeneratePrints = useCallback(async () => {
    setGeneratingPrints(true);
    setPrintsResult(null);
    try {
      const res = await fetch("/api/card-prints/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrintsResult({ ok: true, msg: data.message });
    } catch (err) {
      setPrintsResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur" });
    }
    setGeneratingPrints(false);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setNewImageFile({ base64: result.split(",")[1], mimeType: file.type });
      setNewImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const clearFilters = () => {
    setSearch(""); setManaCostFilter(null); setTypeFilter(null); setKeywordFilter(null);
    setFactionFilter(null); setRarityFilter(null); setRaceFilter(null); setClanFilter(null);
    setFilterSet(""); setFilterYear(""); setFilterMonth("");
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#888", fontFamily: "'Cinzel',serif" }}>Chargement...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f5f5f5" }}>
      {/* ── FILTER BAR ── */}
      <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e0e0e0", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {/* Search */}
        <input
          type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...S.input, width: 160, flex: "none" }}
        />

        {/* Mana */}
        <div style={{ display: "flex", gap: 2 }}>
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} onClick={() => setManaCostFilter(manaCostFilter === i ? null : i)} style={S.manaBtn(manaCostFilter === i)}>{i}</button>
          ))}
        </div>

        {/* Type */}
        <div style={{ display: "flex", gap: 3 }}>
          {(["creature", "spell"] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} style={S.filterBtn(typeFilter === t)}>
              {t === "creature" ? "Unité" : "Sort"}
            </button>
          ))}
        </div>

        {/* Keyword */}
        <select value={keywordFilter || ""} onChange={e => setKeywordFilter((e.target.value || null) as Keyword | null)} style={{ ...S.select, width: 130 }}>
          <option value="">Mot-clé...</option>
          {SORTED_KEYWORDS.map(kw => (
            <option key={kw} value={kw}>{KEYWORD_LABELS[kw]}</option>
          ))}
        </select>

        {/* Faction */}
        <select value={factionFilter || ""} onChange={e => setFactionFilter(e.target.value || null)} style={{ ...S.select, width: 110 }}>
          <option value="">Faction...</option>
          {factions.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        {/* Race */}
        <select value={raceFilter || ""} onChange={e => setRaceFilter(e.target.value || null)} style={{ ...S.select, width: 110 }}>
          <option value="">Race...</option>
          {races.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* Clan */}
        <select value={clanFilter || ""} onChange={e => setClanFilter(e.target.value || null)} style={{ ...S.select, width: 110 }}>
          <option value="">Clan...</option>
          {clans.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Set */}
        <select value={filterSet} onChange={e => setFilterSet(e.target.value)} style={{ ...S.select, width: 110 }}>
          <option value="">Set...</option>
          {sets.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
        </select>

        {/* Year */}
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ ...S.select, width: 80 }}>
          <option value="">Année...</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Month */}
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...S.select, width: 70 }}>
          <option value="">Mois...</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
          ))}
        </select>

        {/* Rarity */}
        <div style={{ display: "flex", gap: 3 }}>
          {RARITIES.map(r => (
            <button key={r} onClick={() => setRarityFilter(rarityFilter === r ? null : r)} style={S.filterBtn(rarityFilter === r)}>
              {r}
            </button>
          ))}
        </div>

        {/* View toggle + clear + count */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
          <span style={{ fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif" }}>{filteredCards.length} cartes</span>
          <button onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")} style={S.filterBtn(false)}>
            {viewMode === "grid" ? "Liste" : "Grille"}
          </button>
          <button onClick={clearFilters} style={S.filterBtn(false)}>Reset</button>
          <button onClick={handleBatchGeneratePrints} disabled={generatingPrints} style={{ ...S.filterBtn(false), background: "#e8f5e9", borderColor: "#a5d6a7", color: "#2e7d32", opacity: generatingPrints ? 0.5 : 1 }}>
            {generatingPrints ? "..." : "Générer exemplaires manquants"}
          </button>
          {printsResult && !selectedCard && (
            <span style={{ fontSize: 9, color: printsResult.ok ? "#2e7d32" : "#c62828", fontFamily: "'Cinzel',serif" }}>{printsResult.msg}</span>
          )}
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Card list/grid */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {viewMode === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {filteredCards.map(card => (
                <div key={card.id} onClick={() => selectCard(card)} style={{ cursor: "pointer" }}>
                  <GameCard
                    card={card as unknown as Card}
                    size="sm"
                    selected={selectedCard?.id === card.id}
                    tokens={tokenTemplates}
                  />
                </div>
              ))}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Crimson Text',serif" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e0e0e0", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: "#888" }}>Nom</th>
                  <th style={{ padding: "6px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: "#888", width: 40 }}>Mana</th>
                  <th style={{ padding: "6px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: "#888", width: 50 }}>Type</th>
                  <th style={{ padding: "6px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: "#888", width: 50 }}>ATK/DEF</th>
                  <th style={{ padding: "6px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: "#888" }}>Faction</th>
                  <th style={{ padding: "6px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: "#888" }}>Race</th>
                  <th style={{ padding: "6px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: "#888" }}>Rareté</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map(card => (
                  <tr
                    key={card.id}
                    onClick={() => selectCard(card)}
                    style={{
                      cursor: "pointer",
                      background: selectedCard?.id === card.id ? "#e3f2fd" : "transparent",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                    onMouseEnter={e => { if (selectedCard?.id !== card.id) (e.currentTarget.style.background = "#fafafa"); }}
                    onMouseLeave={e => { if (selectedCard?.id !== card.id) (e.currentTarget.style.background = "transparent"); }}
                  >
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{card.name}</td>
                    <td style={{ padding: "6px 8px", color: "#4a90d9" }}>{card.mana_cost}</td>
                    <td style={{ padding: "6px 8px" }}>{card.card_type === "creature" ? "Unité" : "Sort"}</td>
                    <td style={{ padding: "6px 8px" }}>{card.card_type === "creature" ? `${card.attack}/${card.health}` : "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{card.faction || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{card.race || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{card.rarity || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filteredCards.length === 0 && (
            <div style={{ textAlign: "center", color: "#aaa", padding: 40, fontFamily: "'Cinzel',serif", fontSize: 12 }}>
              Aucune carte trouvée
            </div>
          )}
        </div>

        {/* ── EDIT PANEL ── */}
        {selectedCard && (
          <div style={{ width: 320, borderLeft: "1px solid #e0e0e0", background: "#fff", overflow: "auto", padding: "16px 14px", flexShrink: 0 }}>
            {/* Image preview */}
            {(newImagePreview || selectedCard.image_url) && (
              <div style={{ marginBottom: 12, borderRadius: 6, overflow: "hidden", border: "1px solid #e0e0e0" }}>
                <img src={newImagePreview || selectedCard.image_url!} alt="" style={{ width: "100%", height: 160, objectFit: "cover" }} />
              </div>
            )}

            {/* Image upload */}
            <div style={{ marginBottom: 12 }}>
              <div style={S.label}>Image</div>
              <input type="file" accept="image/*" onChange={handleImageChange} style={{ fontSize: 10, width: "100%" }} />
            </div>

            {/* Name */}
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>Nom</div>
              <input type="text" value={(editFields.name as string) || ""} onChange={e => updateField("name", e.target.value)} style={S.input} />
            </div>

            {/* Type */}
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>Type</div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["creature", "spell"] as const).map(t => (
                  <button key={t} onClick={() => updateField("card_type", t)} style={S.filterBtn(editFields.card_type === t)}>
                    {t === "creature" ? "Unité" : "Sort"}
                  </button>
                ))}
              </div>
            </div>

            {/* Mana / ATK / DEF */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={S.label}>Mana</div>
                <input type="number" min={0} max={10} value={(editFields.mana_cost as number) ?? 0} onChange={e => updateField("mana_cost", parseInt(e.target.value) || 0)} style={S.input} />
              </div>
              {editFields.card_type === "creature" && (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={S.label}>ATK</div>
                    <input type="number" min={0} value={(editFields.attack as number) ?? 0} onChange={e => updateField("attack", parseInt(e.target.value) || 0)} style={S.input} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={S.label}>DEF</div>
                    <input type="number" min={0} value={(editFields.health as number) ?? 0} onChange={e => updateField("health", parseInt(e.target.value) || 0)} style={S.input} />
                  </div>
                </>
              )}
            </div>

            {/* Coûts additionnels (cumulables avec mana_cost) */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={S.label} title="Points de vie payés par le héros à l'invocation. La carte est non-jouable si la somme tomberait à 0 PV.">Coût ♥ Vie</div>
                <input type="number" min={0} max={20} value={(editFields.life_cost as number) ?? 0} onChange={e => updateField("life_cost", parseInt(e.target.value) || 0)} style={S.input} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.label} title="Nombre de cartes que le joueur doit défausser de sa main pour jouer cette carte.">Coût 🃏 Discard</div>
                <input type="number" min={0} max={5} value={(editFields.discard_cost as number) ?? 0} onChange={e => updateField("discard_cost", parseInt(e.target.value) || 0)} style={S.input} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.label} title="Nombre de créatures alliées que le joueur doit sacrifier pour jouer cette carte.">Coût ☠ Sacrifice</div>
                <input type="number" min={0} max={5} value={(editFields.sacrifice_cost as number) ?? 0} onChange={e => updateField("sacrifice_cost", parseInt(e.target.value) || 0)} style={S.input} />
              </div>
            </div>

            {/* Faction */}
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>Faction</div>
              <select value={(editFields.faction as string) || ""} onChange={e => updateField("faction", e.target.value || null)} style={S.select}>
                <option value="">—</option>
                {factions.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            {/* Race + Clan */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={S.label}>Race</div>
                <input type="text" value={(editFields.race as string) || ""} onChange={e => updateField("race", e.target.value || null)} style={S.input} list="races-list" />
                <datalist id="races-list">{races.map(r => <option key={r} value={r} />)}</datalist>
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.label}>Clan</div>
                <input type="text" value={(editFields.clan as string) || ""} onChange={e => updateField("clan", e.target.value || null)} style={S.input} list="clans-list" />
                <datalist id="clans-list">{clans.map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>

            {/* Rarity */}
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>Rareté</div>
              <select value={(editFields.rarity as string) || ""} onChange={e => updateField("rarity", e.target.value)} style={S.select}>
                {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Alignment */}
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>Alignement</div>
              <select value={(editFields.card_alignment as string) || "neutre"} onChange={e => updateField("card_alignment", e.target.value)} style={S.select}>
                <option value="neutre">Neutre</option>
                <option value="lumiere">Lumière</option>
                <option value="tenebres">Ténèbres</option>
              </select>
            </div>

            {/* Set + Year + Month */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 2 }}>
                <div style={S.label}>Set</div>
                <select value={(editFields.set_id as number) || ""} onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null; updateField("set_id", v); if (v) { updateField("card_year", null); updateField("card_month", null); } }} style={S.select}>
                  <option value="">—</option>
                  {sets.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.label}>Année</div>
                <input type="number" value={(editFields.card_year as number) || ""} onChange={e => updateField("card_year", e.target.value ? parseInt(e.target.value) : null)} style={S.input} placeholder="2026" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.label}>Mois</div>
                <input type="number" min={1} max={12} value={(editFields.card_month as number) || ""} onChange={e => updateField("card_month", e.target.value ? parseInt(e.target.value) : null)} style={S.input} />
              </div>
            </div>

            {/* Generate prints button */}
            {!editFields.set_id && !!(editFields.card_year) && !!(editFields.rarity) && (
              <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => selectedCard && handleGeneratePrints(selectedCard.id)}
                  disabled={generatingPrints}
                  style={{ ...S.btn("#2e7d32"), fontSize: 9, padding: "4px 12px", opacity: generatingPrints ? 0.5 : 1 }}
                >
                  {generatingPrints ? "..." : "Générer / Régénérer exemplaires"}
                </button>
                {printsResult && (
                  <span style={{ fontSize: 9, color: printsResult.ok ? "#2e7d32" : "#c62828", fontFamily: "'Cinzel',serif" }}>{printsResult.msg}</span>
                )}
              </div>
            )}

            {/* Keywords (creature side). For spells, the engine reads only
                spell_keywords — creature-side keywords on a spell are inert
                data. We hide the grid entirely for clean spells, and for
                spells with stale entries we show only the active ones plus
                a warning so the user can deactivate them and re-add via
                "Capacités de sort". */}
            {(() => {
              const isSpell = editFields.card_type === "spell";
              const activeCreatureKws = ((editFields.keywords as string[]) || []);
              if (isSpell && activeCreatureKws.length === 0) return null;
              const visibleKeywords = isSpell
                ? SORTED_KEYWORDS.filter(kw => activeCreatureKws.includes(kw))
                : SORTED_KEYWORDS;
              return (
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>
                Mots-clés ({activeCreatureKws.length})
                {isSpell && (
                  <span style={{ color: "#c0392b", fontWeight: 600, marginLeft: 6, fontSize: 9 }}>
                    ⚠ Capacités de créature inactives sur un sort — désactive-les ici, puis ré-ajoute via &laquo;&nbsp;Capacités de sort&nbsp;&raquo;.
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, position: "relative" }}>
                {visibleKeywords.map(kw => {
                  const active = ((editFields.keywords as string[]) || []).includes(kw);
                  const label = KEYWORD_LABELS[kw];
                  return (
                    <div key={kw} style={{ position: "relative", display: "inline-flex" }}
                      onMouseEnter={() => setHoveredKw(kw)}
                      onMouseLeave={() => setHoveredKw(null)}
                    >
                      <button onClick={() => toggleKeyword(kw)} style={{
                        padding: "2px 6px", borderRadius: 4, fontSize: 8, fontFamily: "'Cinzel',serif", fontWeight: active ? 700 : 400,
                        border: `1px solid ${active ? "#333" : "#e0e0e0"}`,
                        background: active ? "#333" : "#fafafa",
                        color: active ? "#fff" : "#888",
                        cursor: "pointer",
                      }}>
                        {label}
                      </button>
                      {hoveredKw === kw && KEYWORD_DEFS[label]?.desc && (
                        <div style={{
                          position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
                          marginBottom: 6, padding: "6px 10px", borderRadius: 6,
                          background: "#1a1a2e", color: "#e0e0e0", fontSize: 10, lineHeight: 1.4,
                          fontFamily: "'Crimson Text',serif", whiteSpace: "normal", width: 220,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 100, pointerEvents: "none",
                          border: "1px solid #3d3d5c",
                        }}>
                          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, color: "#c8a84e", marginBottom: 3 }}>{label}</div>
                          {KEYWORD_DEFS[label].desc}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
              );
            })()}

            {/* X values for scalable keywords */}
            {(() => {
              const activeScalable = ((editFields.keywords as string[]) || []).filter(kw => {
                const label = KEYWORD_LABELS[kw as Keyword];
                return label && KEYWORD_DEFS[label]?.scalable;
              });
              if (activeScalable.length === 0) return null;
              return (
                <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 6, background: "#f8f5ff", border: "1px solid #e0d8f0" }}>
                  <div style={{ ...S.label, color: "#6c5ce7", marginBottom: 6 }}>Valeurs X</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {activeScalable.map(kw => {
                      const label = KEYWORD_LABELS[kw as Keyword];
                      return (
                        <div key={kw} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 9, fontFamily: "'Cinzel',serif", fontWeight: 600, color: "#333" }}>{label.replace(/ X$/, "")}</span>
                          <input
                            type="number" min={1} max={10}
                            value={keywordXValues[kw] ?? 1}
                            onChange={e => setKeywordXValues(prev => ({ ...prev, [kw]: parseInt(e.target.value) || 1 }))}
                            style={{ width: 40, padding: "2px 4px", borderRadius: 4, border: "1px solid #d0c8ff", fontSize: 11, textAlign: "center" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Spell keywords (capacités de sort) — only for spells. Mirrors
                the forge UI: pickable list + inline params (amount/X, ATK,
                PV, race), with optional JSON editor for composable effects. */}
            {editFields.card_type === "spell" && (() => {
              const spellKws = (editFields.spell_keywords as SpellKeywordInstance[]) || [];
              const setSpellKws = (next: SpellKeywordInstance[]) => updateField("spell_keywords", next);
              const allRaces = Array.from(new Set(Object.values(FACTIONS).flatMap(f => f.races))).sort();
              return (
                <div style={{ marginBottom: 8, padding: 8, borderRadius: 6, border: "1px solid #9b59b633", background: "#f9f0ff" }}>
                  <div style={{ ...S.label, color: "#9b59b6" }}>Capacités de sort ({spellKws.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                    {ALL_SPELL_KEYWORDS.map(kwId => {
                      const def = SPELL_KEYWORDS[kwId];
                      const active = spellKws.some(k => k.id === kwId);
                      return (
                        <button key={kwId} onClick={() => {
                          if (active) {
                            setSpellKws(spellKws.filter(k => k.id !== kwId));
                          } else {
                            const init: SpellKeywordInstance = { id: kwId };
                            if (def.params.includes("amount")) init.amount = 1;
                            if (def.params.includes("attack")) init.attack = 1;
                            if (def.params.includes("health")) init.health = 1;
                            setSpellKws([...spellKws, init]);
                          }
                        }}
                          title={def.desc}
                          style={{
                            padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 8,
                            fontFamily: "'Cinzel',serif", fontWeight: active ? 700 : 400,
                            background: active ? "#9b59b622" : "#fff",
                            border: `1px solid ${active ? "#9b59b6" : "#e0e0e0"}`,
                            color: active ? "#9b59b6" : "#888",
                          }}
                        >{def.symbol} {def.label.replace(" X", "").replace(" +X/+Y", "")}</button>
                      );
                    })}
                  </div>
                  {spellKws.map((kw, idx) => {
                    const def = SPELL_KEYWORDS[kw.id];
                    const hasParams = def.params.length > 0 || kw.id === "invocation" || kw.id === "invocation_multiple";
                    if (!hasParams) return null;
                    return (
                      <div key={`${kw.id}-${idx}`} style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 9, color: "#9b59b6", fontWeight: 700, minWidth: 70 }}>
                          {def.symbol} {SPELL_KEYWORD_LABELS[kw.id].replace(" X", "").replace(" +X/+Y", "")}
                        </span>
                        {def.params.includes("amount") && (
                          <div>
                            <label style={{ fontSize: 7, color: "#666" }}>X</label>
                            <input type="number" min={1} max={20} value={kw.amount ?? 1}
                              onChange={e => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                setSpellKws(spellKws.map((k, i) => i === idx ? { ...k, amount: val } : k));
                              }}
                              style={{ width: 40, padding: "2px 4px", borderRadius: 4, border: "1px solid #9b59b644", fontSize: 11, textAlign: "center", fontFamily: "'Cinzel',serif" }}
                            />
                          </div>
                        )}
                        {def.params.includes("attack") && (
                          <div>
                            <label style={{ fontSize: 7, color: "#e74c3c" }}>ATK</label>
                            <input type="number" min={0} max={20} value={kw.attack ?? 1}
                              onChange={e => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setSpellKws(spellKws.map((k, i) => i === idx ? { ...k, attack: val } : k));
                              }}
                              style={{ width: 40, padding: "2px 4px", borderRadius: 4, border: "1px solid #e74c3c44", fontSize: 11, textAlign: "center", fontFamily: "'Cinzel',serif", color: "#e74c3c" }}
                            />
                          </div>
                        )}
                        {def.params.includes("health") && (
                          <div>
                            <label style={{ fontSize: 7, color: "#f1c40f" }}>PV</label>
                            <input type="number" min={0} max={20} value={kw.health ?? 1}
                              onChange={e => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setSpellKws(spellKws.map((k, i) => i === idx ? { ...k, health: val } : k));
                              }}
                              style={{ width: 40, padding: "2px 4px", borderRadius: 4, border: "1px solid #f1c40f44", fontSize: 11, textAlign: "center", fontFamily: "'Cinzel',serif", color: "#f1c40f" }}
                            />
                          </div>
                        )}
                        {kw.id === "invocation" && (
                          <div>
                            <label style={{ fontSize: 7, color: "#27ae60" }}>Race</label>
                            <select value={kw.race ?? ""}
                              onChange={e => setSpellKws(spellKws.map((k, i) => i === idx ? { ...k, race: e.target.value || undefined } : k))}
                              style={{ padding: "2px 4px", borderRadius: 4, border: "1px solid #27ae6044", fontSize: 9, fontFamily: "'Cinzel',serif", color: "#27ae60" }}>
                              <option value="">Aucune</option>
                              {allRaces.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                        )}
                        {kw.id === "invocation_multiple" && (
                          <div style={{ fontSize: 8, color: "#9b59b6" }}>Config dans &quot;Tokens à invoquer&quot; ci-dessous</div>
                        )}
                      </div>
                    );
                  })}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 8, color: "#666", letterSpacing: 1, cursor: "pointer" }}>EFFETS COMPOSABLES (avancé)</summary>
                    <textarea
                      defaultValue={editFields.spell_effects ? JSON.stringify(editFields.spell_effects, null, 2) : ""}
                      placeholder='{"targets":[{"slot":"target_0","type":"enemy_creature"}],"effects":[{"type":"deal_damage","target_slot":"target_0","amount":2}]}'
                      onChange={e => {
                        const val = e.target.value.trim();
                        if (!val) { updateField("spell_effects", null); return; }
                        try { updateField("spell_effects", JSON.parse(val)); } catch { /* invalid JSON, ignore */ }
                      }}
                      style={{
                        width: "100%", minHeight: 80, marginTop: 4, padding: 6,
                        borderRadius: 5, border: "1px solid #9b59b644", background: "#fff",
                        fontFamily: "monospace", fontSize: 9, color: "#333", resize: "vertical",
                      }}
                    />
                  </details>
                </div>
              );
            })()}

            {/* Effect text */}
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>Texte d'effet</div>
              <textarea value={(editFields.effect_text as string) || ""} onChange={e => updateField("effect_text", e.target.value)} style={S.textarea} />
            </div>

            {/* Flavor text */}
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>Texte d'ambiance</div>
              <textarea value={(editFields.flavor_text as string) || ""} onChange={e => updateField("flavor_text", e.target.value)} style={S.textarea} />
            </div>

            {/* Illustration prompt */}
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>Prompt illustration</div>
              <textarea value={(editFields.illustration_prompt as string) || ""} onChange={e => updateField("illustration_prompt", e.target.value)} style={S.textarea} />
            </div>

            {/* Convocation token (creature ou sort, X ou simple) — un seul
                champ FK partagé : `card.convocation_token_id`. */}
            {(
              ((editFields.keywords as string[]) || []).some(k => k === "convocation" || k === "convocation_simple") ||
              ((editFields.spell_keywords as SpellKeywordInstance[]) || []).some(k => k.id === "convocation_simple")
            ) && (
              <div style={{ marginBottom: 8 }}>
                <div style={S.label}>Token convocation</div>
                <TokenCascadePicker
                  value={(editFields.convocation_token_id as number | null) ?? null}
                  onChange={(id) => updateField("convocation_token_id", id)}
                  tokens={tokenTemplates}
                  compact
                />
              </div>
            )}

            {/* Lycanthropie token (if keyword present) */}
            {((editFields.keywords as string[]) || []).includes("lycanthropie") && (
              <div style={{ marginBottom: 8 }}>
                <div style={S.label}>Token lycanthropie</div>
                <TokenCascadePicker
                  value={(editFields.lycanthropie_token_id as number | null) ?? null}
                  onChange={(id) => updateField("lycanthropie_token_id", id)}
                  tokens={tokenTemplates}
                  compact
                />
              </div>
            )}

            {/* Entraide — race targeted by the cost reduction (if keyword present) */}
            {((editFields.keywords as string[]) || []).includes("entraide") && (
              <div style={{ marginBottom: 8 }}>
                <div style={S.label}>🤝 Race cible (Entraide)</div>
                <select
                  value={(editFields.entraide_race as string) || ""}
                  onChange={e => updateField("entraide_race", e.target.value || null)}
                  style={S.select}
                >
                  <option value="">-- Choisir une race --</option>
                  {Array.from(new Set(Object.values(FACTIONS).flatMap(f => f.races))).sort().map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Convocations multiples — applies whether the trigger is a
                creature on_play (keyword "convocations_multiples") or a
                spell cast (spell_keyword "invocation_multiple"). Both read
                the same `convocation_tokens` JSONB array. */}
            {(
              ((editFields.keywords as string[]) || []).includes("convocations_multiples") ||
              ((editFields.spell_keywords as SpellKeywordInstance[]) || []).some(k => k.id === "invocation_multiple")
            ) && (() => {
              const tokens = (editFields.convocation_tokens as { token_id: number; attack?: number; health?: number }[]) || [];
              const setTokens = (next: typeof tokens) => updateField("convocation_tokens", next);
              return (
                <div style={{ marginBottom: 8, padding: 8, borderRadius: 6, border: "1px solid #9b59b633", background: "#f9f0ff" }}>
                  <div style={{ ...S.label, color: "#9b59b6" }}>Tokens à invoquer</div>
                  {tokens.map((tok, idx) => {
                    const tmpl = tokenTemplates.find(t => t.id === tok.token_id);
                    return (
                      <div key={idx} style={{ marginTop: 6, padding: 6, borderRadius: 5, background: "#fff", border: "1px solid #9b59b622" }}>
                        <TokenCascadePicker
                          value={tok.token_id ?? null}
                          onChange={(newId) => setTokens(tokens.map((t, i) => i === idx ? { ...t, token_id: newId ?? 0 } : t))}
                          tokens={tokenTemplates}
                          compact
                        />
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                          <span style={{ fontSize: 8, color: "#999", letterSpacing: 1 }}>OVERRIDE :</span>
                          <input type="number" min={0} max={20}
                            value={tok.attack ?? ""}
                            placeholder={tmpl ? String(tmpl.attack) : "ATK"}
                            onChange={e => setTokens(tokens.map((t, i) => i === idx ? { ...t, attack: e.target.value ? Math.max(0, parseInt(e.target.value)) : undefined } : t))}
                            style={{ width: 36, padding: "2px", borderRadius: 4, border: "1px solid #e74c3c44", fontSize: 10, textAlign: "center", color: "#e74c3c", fontFamily: "'Cinzel',serif" }} title="ATK override" />
                          <span style={{ fontSize: 8, color: "#999" }}>/</span>
                          <input type="number" min={1} max={20}
                            value={tok.health ?? ""}
                            placeholder={tmpl ? String(tmpl.health) : "DEF"}
                            onChange={e => setTokens(tokens.map((t, i) => i === idx ? { ...t, health: e.target.value ? Math.max(1, parseInt(e.target.value)) : undefined } : t))}
                            style={{ width: 36, padding: "2px", borderRadius: 4, border: "1px solid #f1c40f44", fontSize: 10, textAlign: "center", color: "#f1c40f", fontFamily: "'Cinzel',serif" }} title="DEF override" />
                          <button onClick={() => setTokens(tokens.filter((_, i) => i !== idx))}
                            style={{ marginLeft: "auto", padding: "1px 7px", borderRadius: 3, border: "1px solid #f5a3a3", background: "#fde8e8", color: "#e74c3c", fontSize: 9, cursor: "pointer" }}>×</button>
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => setTokens([...tokens, { token_id: 0 }])}
                    style={{ marginTop: 6, padding: "3px 10px", borderRadius: 4, border: "1px solid #9b59b644", background: "#fff", color: "#9b59b6", fontSize: 9, cursor: "pointer", fontFamily: "'Cinzel',serif" }}>
                    + Ajouter un token
                  </button>
                </div>
              );
            })()}

            {/* Save result */}
            {saveResult && (
              <div style={{ padding: "6px 10px", borderRadius: 5, marginBottom: 8, fontSize: 10, fontFamily: "'Cinzel',serif",
                background: saveResult.ok ? "#e8f5e9" : "#fde8e8", color: saveResult.ok ? "#2e7d32" : "#e74c3c",
                border: `1px solid ${saveResult.ok ? "#a5d6a7" : "#f5a3a3"}`,
              }}>{saveResult.msg}</div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...S.btn("#333"), flex: 1, opacity: saving ? 0.5 : 1 }}>
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              {deleteConfirmId === selectedCard.id ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => handleDelete(selectedCard.id)} style={S.btn("#e74c3c")}>Confirmer</button>
                  <button onClick={() => setDeleteConfirmId(null)} style={S.btn("#888")}>Annuler</button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirmId(selectedCard.id)} style={S.btn("#e74c3c")}>Supprimer</button>
              )}
            </div>

            {/* Close */}
            <button onClick={() => { setSelectedCard(null); setEditFields({}); }} style={{ ...S.btn("#f5f5f5", "#888"), width: "100%" }}>
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
