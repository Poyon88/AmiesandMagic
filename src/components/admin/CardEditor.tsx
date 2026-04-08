"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import GameCard from "@/components/cards/GameCard";
import { ALL_KEYWORDS, KEYWORD_LABELS } from "@/lib/game/keyword-labels";
import { KEYWORDS as KEYWORD_DEFS } from "@/lib/card-engine/constants";
import type { Card, Keyword, SpellKeywordInstance, SpellComposableEffects, CardSet } from "@/lib/game/types";

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
  convocation_race: string | null;
  convocation_tokens: { race: string; attack: number; health: number }[] | null;
  lycanthropie_race: string | null;
  set_id: number | null;
  card_year: number | null;
  card_month: number | null;
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

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsRes, setsRes] = await Promise.all([
        fetch("/api/cards/save"),
        fetch("/api/sets"),
      ]);
      const cardsData = await cardsRes.json();
      const setsData = await setsRes.json();
      setCards(Array.isArray(cardsData) ? cardsData : []);
      setSets(Array.isArray(setsData) ? setsData : []);
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
      convocation_race: card.convocation_race || "",
      convocation_tokens: card.convocation_tokens || [],
      lycanthropie_race: card.lycanthropie_race || "",
      set_id: card.set_id,
      card_year: card.card_year,
      card_month: card.card_month,
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
        convocation_race: editFields.convocation_race || null,
        convocation_tokens: (editFields.convocation_tokens as unknown[])?.length ? editFields.convocation_tokens : null,
        lycanthropie_race: editFields.lycanthropie_race || null,
        set_id: editFields.set_id || null,
        card_year: editFields.card_year || null,
        card_month: editFields.card_month || null,
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
                <select value={(editFields.set_id as number) || ""} onChange={e => updateField("set_id", e.target.value ? parseInt(e.target.value) : null)} style={S.select}>
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

            {/* Keywords */}
            <div style={{ marginBottom: 8 }}>
              <div style={S.label}>Mots-clés ({((editFields.keywords as string[]) || []).length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, position: "relative" }}>
                {SORTED_KEYWORDS.map(kw => {
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

            {/* Convocation race (if keyword present) */}
            {((editFields.keywords as string[]) || []).includes("convocation") && (
              <div style={{ marginBottom: 8 }}>
                <div style={S.label}>Race convocation</div>
                <input type="text" value={(editFields.convocation_race as string) || ""} onChange={e => updateField("convocation_race", e.target.value || null)} style={S.input} />
              </div>
            )}

            {/* Lycanthropie race (if keyword present) */}
            {((editFields.keywords as string[]) || []).includes("lycanthropie") && (
              <div style={{ marginBottom: 8 }}>
                <div style={S.label}>Race lycanthropie</div>
                <input type="text" value={(editFields.lycanthropie_race as string) || ""} onChange={e => updateField("lycanthropie_race", e.target.value || null)} style={S.input} />
              </div>
            )}

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
