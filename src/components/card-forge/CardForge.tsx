'use client';

import { useState, useCallback, useRef } from "react";
import { generateCardStats, pickMana, pickRarity, buildId } from "@/lib/card-engine/generator";
import { RARITIES, FACTIONS, TYPES, KEYWORDS, RARITY_WEIGHTS_BY_MANA, RARITY_MAP, ALIGNMENTS } from "@/lib/card-engine/constants";
import CardVisual from "./CardVisual";
import type { CardType, Keyword } from "@/lib/game/types";

// ─── API CALL ────────────────────────────────────────────────────────────────

interface CardText {
  name: string;
  ability: string;
  flavorText: string;
  illustrationPrompt: string;
}

async function generateCardText(factionId: string, type: string, rarityId: string, stats: ReturnType<typeof generateCardStats>, raceId?: string, clanId?: string): Promise<CardText> {
  const response = await fetch('/api/cards/generate-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factionId, type, rarityId, stats, raceId, clanId }),
  });
  if (!response.ok) return { name: 'Inconnu', ability: '—', flavorText: '', illustrationPrompt: '' };
  return response.json();
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── HELPERS ─────────────────────────────────────────────────────────────────

interface ForgeCard {
  id: string;
  name: string;
  faction: string;
  race: string;
  clan: string;
  cardAlignment: string;
  type: string;
  rarity: string;
  mana: number;
  attack: number | null;
  defense: number | null;
  power: number | null;
  keywords: string[];
  keywordXValues?: Record<string, number>;
  ability: string;
  flavorText: string;
  illustrationPrompt: string;
  budgetTotal: number;
  budgetUsed: number;
  generatedAt: string;
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: "#aaa", letterSpacing: 2, marginBottom: 7, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 9, color: "#999", letterSpacing: 1.5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Btn({ onClick, label, color }: { onClick: () => void; label: string; color: string }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 6, cursor: "pointer",
      background: `${color}12`, border: `1px solid ${color}44`,
      color, fontFamily: "'Cinzel',serif", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
      transition: "all 0.2s",
    }}>{label}</button>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function CardForge() {
  const [faction, setFaction] = useState("Elfes");
  const [race, setRace] = useState("");
  const [clan, setClan] = useState("");
  const [cardAlignment, setCardAlignment] = useState<string>("neutre");
  const [type, setType] = useState("Unité");
  const [rarity, setRarity] = useState("Rare");
  const [card, setCard] = useState<ForgeCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ForgeCard[]>([]);
  const [bulkCount, setBulkCount] = useState(20);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkCards, setBulkCards] = useState<ForgeCard[]>([]);
  const [tab, setTab] = useState("forge");
  const [cardImages, setCardImages] = useState<Record<string, string>>({});
  const abortRef = useRef(false);

  // ─── MANUAL MODE ───────────────────────────────────────────────────────────
  const [forgeMode, setForgeMode] = useState<"auto" | "manuel">("auto");
  const [manualName, setManualName] = useState("");
  const [manualMana, setManualMana] = useState(3);
  const [manualAttack, setManualAttack] = useState(3);
  const [manualDefense, setManualDefense] = useState(3);
  const [manualPower, setManualPower] = useState(2);
  const [manualAbility, setManualAbility] = useState("");
  const [manualFlavorText, setManualFlavorText] = useState("");
  const [manualIllustrationPrompt, setManualIllustrationPrompt] = useState("");
  const [manualKeywords, setManualKeywords] = useState<string[]>([]);
  const [keywordXValues, setKeywordXValues] = useState<Record<string, number>>({});

  const availableManualKeywords = Object.entries(KEYWORDS)
    .filter(([id, kw]) => {
      const tier = RARITY_MAP[rarity]?.tier ?? 0;
      const forbidden = FACTIONS[faction]?.forbiddenKeywords ?? [];
      return kw.minTier <= tier && !forbidden.includes(id);
    });

  const manualBudgetTotal = Math.round(manualMana * 10 * (RARITY_MAP[rarity]?.multiplier ?? 1));
  const manualBudgetUsed = Math.round(
    (type === "Unité" ? (manualAttack * 5 + manualDefense * 4) : manualPower * 5)
    + manualKeywords.reduce((sum, kw) => {
      const kwDef = KEYWORDS[kw];
      if (!kwDef) return sum;
      const x = keywordXValues[kw] ?? 1;
      return sum + kwDef.cost + kwDef.costPerX * Math.max(0, x - 1);
    }, 0)
  );
  const budgetRatio = manualBudgetTotal > 0 ? manualBudgetUsed / manualBudgetTotal : 0;
  const budgetColor = budgetRatio <= 0.85 ? "#27ae60" : budgetRatio <= 1.0 ? "#f39c12" : "#e74c3c";

  // Live preview from manual fields — always computed so editing works in both modes
  const manualCard: ForgeCard = {
    id: card?.id || "manual_preview",
    name: manualName || "Sans nom",
    faction, race, clan, cardAlignment, type, rarity,
    mana: manualMana,
    attack: type === "Unité" ? manualAttack : null,
    defense: type === "Unité" ? manualDefense : null,
    power: type !== "Unité" ? manualPower : null,
    keywords: manualKeywords,
    keywordXValues,
    ability: manualAbility,
    flavorText: manualFlavorText,
    illustrationPrompt: manualIllustrationPrompt,
    budgetTotal: manualBudgetTotal,
    budgetUsed: manualBudgetUsed,
    generatedAt: card?.generatedAt || new Date().toISOString(),
  };

  const resetManualForm = useCallback(() => {
    setManualName(""); setManualMana(3); setManualAttack(3); setManualDefense(3);
    setManualPower(2); setManualAbility(""); setManualFlavorText("");
    setManualIllustrationPrompt(""); setManualKeywords([]); setKeywordXValues({}); setCard(null);
    setEditedPrompt(null); setSaveResult(null);
    setCardImages(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== "manual_preview")));
  }, []);

  const createManualCard = useCallback(() => {
    const newCard: ForgeCard = {
      id: buildId(),
      name: manualName || "Sans nom",
      faction, race, clan, cardAlignment, type, rarity,
      mana: manualMana,
      attack: type === "Unité" ? manualAttack : null,
      defense: type === "Unité" ? manualDefense : null,
      power: type !== "Unité" ? manualPower : null,
      keywords: manualKeywords,
      ability: manualAbility,
      flavorText: manualFlavorText,
      illustrationPrompt: manualIllustrationPrompt,
      budgetTotal: manualBudgetTotal,
      budgetUsed: manualBudgetUsed,
      generatedAt: new Date().toISOString(),
    };
    setCard(newCard);
    setHistory(h => [newCard, ...h].slice(0, 30));
  }, [faction, type, rarity, manualName, manualMana, manualAttack, manualDefense, manualPower, manualKeywords, keywordXValues, manualAbility, manualFlavorText, manualIllustrationPrompt, manualBudgetTotal, manualBudgetUsed]);

  const forgeCard = useCallback(async (f = faction, t = type, r = rarity) => {
    setLoading(true);
    // Use manually-set mana if changed from default, and pass race for keyword selection
    const fixedMana = manualMana !== 3 ? manualMana : null;
    const stats = generateCardStats(f, t, r, fixedMana, race || undefined);
    // If manual keywords are set, override generated ones
    if (manualKeywords.length > 0) {
      stats.keywords = manualKeywords;
    }
    let text: CardText = { name: "Inconnu", ability: "—", flavorText: "", illustrationPrompt: "" };
    try {
      text = await generateCardText(f, t, r, stats, race || undefined, clan || undefined);
    } catch { /* fallback above */ }
    // Keep manually-entered name/ability if set
    if (manualName) text.name = manualName;
    if (manualAbility) text.ability = manualAbility;
    const newCard: ForgeCard = {
      id: buildId(), name: text.name || "Inconnu",
      faction: f, race, clan, cardAlignment, type: t, rarity: r, ...stats,
      ability: text.ability || "—",
      flavorText: text.flavorText || "",
      illustrationPrompt: text.illustrationPrompt || "",
      generatedAt: new Date().toISOString(),
    };
    setCard(newCard);
    setHistory(h => [newCard, ...h].slice(0, 30));
    setEditedPrompt(null);
    // Pre-fill manual fields for editing
    setManualName(newCard.name);
    setManualMana(newCard.mana);
    setManualAttack(newCard.attack ?? 3);
    setManualDefense(newCard.defense ?? 3);
    setManualPower(newCard.power ?? 2);
    setManualKeywords(newCard.keywords);
    // Use X values from generator (budget-aware), fallback to mana/3
    const autoXValues: Record<string, number> = { ...(stats.keywordXValues || {}) };
    for (const kw of newCard.keywords) {
      if (KEYWORDS[kw]?.scalable && !(kw in autoXValues)) {
        autoXValues[kw] = Math.max(1, Math.floor(newCard.mana / 3));
      }
    }
    setKeywordXValues(autoXValues);
    setManualAbility(newCard.ability);
    setManualFlavorText(newCard.flavorText);
    setManualIllustrationPrompt(newCard.illustrationPrompt);
    setLoading(false);
    return newCard;
  }, [faction, type, rarity, race, clan, manualMana, manualName, manualAbility, manualKeywords]);

  const startBulk = useCallback(async () => {
    abortRef.current = false;
    setBulkProgress({ done: 0, total: bulkCount });
    setBulkCards([]);
    const results: ForgeCard[] = [];
    for (let i = 0; i < bulkCount; i++) {
      if (abortRef.current) break;
      // Use selected values if set, otherwise randomize
      const f = faction || pick(Object.keys(FACTIONS));
      const t = type || pick(TYPES);
      const r = rarity || pickRarity();
      const facData = FACTIONS[f];
      const bulkRace = race || (facData?.races ? pick(facData.races) : "");
      const bulkClan = clan || (facData?.clans ? pick(facData.clans.names) : "");
      const stats = generateCardStats(f, t, r, null, bulkRace || undefined);
      let text: CardText = { name: "Inconnu", ability: "—", flavorText: "", illustrationPrompt: "" };
      try { text = await generateCardText(f, t, r, stats, bulkRace || undefined, bulkClan || undefined); } catch { /* fallback above */ }
      const c: ForgeCard = {
        id: buildId(), name: text.name || "Inconnu",
        faction: f, race: bulkRace, clan: bulkClan, cardAlignment: facData?.alignment === "spéciale" ? pick(["bon","neutre","maléfique"]) : (facData?.alignment || "neutre"),
        type: t, rarity: r, ...stats,
        ability: text.ability || "—", flavorText: text.flavorText || "",
        illustrationPrompt: text.illustrationPrompt || "",
        generatedAt: new Date().toISOString(),
      };
      results.push(c);
      setBulkCards([...results]);
      setBulkProgress({ done: i + 1, total: bulkCount });
    }
    setBulkProgress(null);
  }, [bulkCount, faction, type, rarity, race, clan]);

  const exportJSON = (cards: ForgeCard[]) => {
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `am-cards-${Date.now()}.json`,
    });
    a.click();
  };

  // ─── SAVE TO GAME DB ─────────────────────────────────────────────────────

  const FORGE_TO_GAME_TYPE: Record<string, CardType> = {
    "Unité": "creature", "Sort": "spell", "Artefact": "spell", "Magie": "spell",
  };

  const FORGE_TO_GAME_KEYWORD: Record<string, Keyword> = {
    // Legacy aliases
    "Traque": "charge", "Provocation": "taunt", "Bouclier": "divine_shield", "Vol": "ranged",
    // Tier 0
    "Loyauté": "loyaute", "Ancré": "ancre", "Résistance": "resistance",
    "Première Frappe": "premiere_frappe", "Berserk": "berserk",
    // Tier 1 — Terrain
    "Précision": "precision", "Drain de vie": "drain_de_vie", "Esquive": "esquive",
    "Poison": "poison", "Célérité": "celerite",
    "Augure": "augure", "Bénédiction": "benediction", "Bravoure": "bravoure",
    "Pillage": "pillage", "Riposte X": "riposte",
    // Tier 1 — Cimetière / Main
    "Rappel": "rappel", "Combustion": "combustion",
    // Tier 2 — Terrain
    "Terreur": "terreur", "Armure": "armure", "Commandement": "commandement",
    "Fureur": "fureur", "Double Attaque": "double_attaque", "Invisible": "invisible",
    "Canalisation": "canalisation", "Contresort": "contresort",
    "Convocation X": "convocation", "Malédiction": "malediction",
    "Nécrophagie": "necrophagie", "Paralysie": "paralysie",
    "Permutation": "permutation", "Persécution X": "persecution",
    // Tier 2 — Cimetière / Main / Mixte
    "Catalyse": "catalyse", "Ombre du passé": "ombre_du_passe",
    "Profanation X": "profanation", "Prescience X": "prescience",
    "Suprématie": "suprematie", "Divination": "divination",
    // Tier 3
    "Liaison de vie": "liaison_de_vie", "Ombre": "ombre",
    "Sacrifice": "sacrifice", "Maléfice": "malefice",
    "Indestructible": "indestructible", "Régénération": "regeneration", "Corruption": "corruption",
    "Carnage X": "carnage", "Héritage X": "heritage", "Mimique": "mimique",
    "Métamorphose": "metamorphose", "Tactique X": "tactique",
    "Exhumation X": "exhumation", "Héritage du cimetière": "heritage_du_cimetiere",
    // Tier 4
    "Pacte de sang": "pacte_de_sang", "Souffle de feu X": "souffle_de_feu",
    "Domination": "domination", "Résurrection": "resurrection", "Transcendance": "transcendance",
    "Vampirisme X": "vampirisme",
  };

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [updateTargetId, setUpdateTargetId] = useState<number | null>(null);
  const [updateTargetName, setUpdateTargetName] = useState<string | null>(null);
  const [existingCards, setExistingCards] = useState<{ id: number; name: string; mana_cost: number; card_type: string; attack: number | null; health: number | null; effect_text: string; flavor_text: string | null; keywords: string[]; image_url: string | null; illustration_prompt: string | null; faction: string | null; race: string | null; clan: string | null; rarity: string | null; card_alignment: string | null }[]>([]);
  const [showExistingCards, setShowExistingCards] = useState(false);
  const [existingSearch, setExistingSearch] = useState("");

  const loadExistingCards = useCallback(async () => {
    try {
      const res = await fetch('/api/cards/save');
      const data = await res.json();
      if (res.ok) {
        setExistingCards(data);
        setShowExistingCards(true);
      } else {
        setSaveResult({ ok: false, msg: data.error || "Erreur chargement cartes" });
      }
    } catch (err) {
      setSaveResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur réseau" });
    }
  }, []);

  const GAME_TO_FORGE_TYPE: Record<string, string> = {
    creature: "Unité", spell: "Sort",
  };
  const GAME_TO_FORGE_KEYWORD: Record<string, string> = Object.fromEntries(
    Object.entries(FORGE_TO_GAME_KEYWORD).map(([k, v]) => [v, k])
  );

  const selectUpdateTarget = (dbCard: typeof existingCards[number]) => {
    setUpdateTargetId(dbCard.id);
    setUpdateTargetName(dbCard.name);
    setShowExistingCards(false);

    // Pre-fill all form fields from existing card
    setManualName(dbCard.name);
    setManualMana(dbCard.mana_cost);
    setManualAttack(dbCard.attack ?? 3);
    setManualDefense(dbCard.health ?? 3);
    setManualPower(1);
    setManualAbility(dbCard.effect_text || "");
    setManualFlavorText(dbCard.flavor_text || "");
    setManualIllustrationPrompt(dbCard.illustration_prompt || "");
    const forgeKws = (dbCard.keywords || []).map(k => GAME_TO_FORGE_KEYWORD[k] || k);
    setManualKeywords(forgeKws);

    // Parse X values from effect_text (format: [Keyword1 2, Keyword2 3])
    const xMatch = (dbCard.effect_text || "").match(/\[([^\]]+)\]/);
    if (xMatch) {
      const parsed: Record<string, number> = {};
      for (const part of xMatch[1].split(",")) {
        const trimmed = part.trim();
        const lastSpace = trimmed.lastIndexOf(" ");
        if (lastSpace > 0) {
          const kwName = trimmed.slice(0, lastSpace);
          const val = parseInt(trimmed.slice(lastSpace + 1));
          if (!isNaN(val)) {
            // Find matching forge keyword with " X" suffix
            const fullName = `${kwName} X`;
            if (forgeKws.includes(fullName)) {
              parsed[fullName] = val;
            }
          }
        }
      }
      setKeywordXValues(parsed);
    } else {
      setKeywordXValues({});
    }

    // Set faction/type/rarity/race/clan from card
    if (dbCard.faction && FACTIONS[dbCard.faction]) setFaction(dbCard.faction);
    if (dbCard.card_type) setType(GAME_TO_FORGE_TYPE[dbCard.card_type] || "Unité");
    setRace(dbCard.race || "");
    setClan(dbCard.clan || "");
    setCardAlignment(dbCard.card_alignment || "neutre");

    // Load existing image if available
    if (dbCard.image_url) {
      setCardImages(prev => ({ ...prev, [dbCard.id.toString()]: dbCard.image_url! }));
    }

    // Set a card so buttons appear
    setCard({
      id: dbCard.id.toString(),
      name: dbCard.name,
      faction: dbCard.faction || faction,
      race: dbCard.race || "",
      clan: dbCard.clan || "",
      cardAlignment: dbCard.card_alignment || "neutre",
      type: GAME_TO_FORGE_TYPE[dbCard.card_type] || "Unité",
      rarity,
      mana: dbCard.mana_cost,
      attack: dbCard.attack,
      defense: dbCard.health,
      power: null,
      keywords: (dbCard.keywords || []).map(k => GAME_TO_FORGE_KEYWORD[k] || k),
      ability: dbCard.effect_text || "",
      flavorText: "",
      illustrationPrompt: "",
      budgetTotal: 0,
      budgetUsed: 0,
      generatedAt: new Date().toISOString(),
    });

    setEditedPrompt(null);
    setSaveResult(null);
  };

  const clearUpdateTarget = () => {
    setUpdateTargetId(null);
    setUpdateTargetName(null);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const deleteCard = useCallback(async (id: number) => {
    try {
      const res = await fetch('/api/cards/save', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExistingCards(prev => prev.filter(c => c.id !== id));
      setDeleteConfirmId(null);
      if (updateTargetId === id) clearUpdateTarget();
      setSaveResult({ ok: true, msg: "Carte supprimée" });
    } catch (err) {
      setSaveResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur suppression" });
    }
  }, [updateTargetId]);

  const saveToGame = useCallback(async (forgeCard: ForgeCard, updateId?: number | null) => {
    setSaving(true);
    setSaveResult(null);

    try {
      const gameKeywords: Keyword[] = forgeCard.keywords
        .map(k => FORGE_TO_GAME_KEYWORD[k])
        .filter((k): k is Keyword => !!k);

      // Build effect text with X values appended for scalable keywords
      const xParts = Object.entries(forgeCard.keywordXValues || {})
        .filter(([kw]) => forgeCard.keywords.includes(kw))
        .map(([kw, x]) => `${kw.replace(/ X$/, "")} ${x}`)
        .join(", ");
      const effectText = [forgeCard.ability || "", xParts ? `[${xParts}]` : ""].filter(Boolean).join(" ");

      let imageBase64: string | null = null;
      let imageMimeType: string | null = null;
      const blobUrl = cardImages[forgeCard.id];
      if (blobUrl && blobUrl.startsWith("blob:")) {
        // Local blob — compress via canvas before sending
        imageBase64 = await new Promise<string>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const maxSize = 800;
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
              const ratio = Math.min(maxSize / w, maxSize / h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL("image/webp", 0.85);
            resolve(dataUrl.split(",")[1]);
          };
          img.onerror = reject;
          img.src = blobUrl;
        });
        imageMimeType = "image/webp";
      }
      // If blobUrl is an external URL (e.g. Supabase), skip re-upload — image already in storage

      const response = await fetch('/api/cards/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card: {
            name: forgeCard.name,
            mana_cost: forgeCard.mana,
            card_type: FORGE_TO_GAME_TYPE[forgeCard.type] || "creature",
            attack: forgeCard.attack,
            health: forgeCard.defense,
            effect_text: effectText,
            flavor_text: forgeCard.flavorText || null,
            illustration_prompt: forgeCard.illustrationPrompt || null,
            rarity: forgeCard.rarity || null,
            keywords: gameKeywords,
            spell_effect: null,
            faction: forgeCard.faction,
            race: forgeCard.race || null,
            clan: forgeCard.clan || null,
            card_alignment: forgeCard.cardAlignment || null,
          },
          imageBase64,
          imageMimeType,
          updateId: updateId || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur serveur');

      const action = data.updated ? "mise à jour" : "ajoutée";
      setSaveResult({ ok: true, msg: `"${forgeCard.name}" ${action} !` });
      if (updateId) clearUpdateTarget();
    } catch (err) {
      setSaveResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur inconnue" });
    } finally {
      setSaving(false);
    }
  }, [cardImages]);

  const [generatingImage, setGeneratingImage] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null);

  const generateIllustration = useCallback(async (forgeCard: ForgeCard) => {
    if (!forgeCard.illustrationPrompt) return;
    setGeneratingImage(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/cards/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: forgeCard.illustrationPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur génération image');

      // Convert base64 to blob URL for preview
      const byteChars = atob(data.imageBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: data.mimeType });
      const blobUrl = URL.createObjectURL(blob);

      setCardImages(prev => ({ ...prev, [forgeCard.id]: blobUrl }));
      setSaveResult({ ok: true, msg: `Illustration générée (${data.model})` });
    } catch (err) {
      setSaveResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur génération" });
    } finally {
      setGeneratingImage(false);
    }
  }, []);

  const fac = FACTIONS[faction];

  return (
    <>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0;transform:translateY(6px); } to { opacity:1;transform:none; } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.45} }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:#f0f0f0; }
        ::-webkit-scrollbar-thumb { background:#ccc; border-radius:2px; }
        .hist-row:hover { background:rgba(0,0,0,0.04) !important; }
        .bulk-row:hover { border-color:rgba(0,0,0,0.15) !important; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "'Cinzel',serif", color: "#333", display: "flex", flexDirection: "column" }}>

        {/* Topbar */}
        <div style={{ padding: "11px 20px", borderBottom: "1px solid #e0e0e0", background: "#fafafa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚗️</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#333", letterSpacing: 2.5 }}>CARD FORGE</span>
            <span style={{ fontSize: 8, color: "#aaa", letterSpacing: 2 }}>ARMIES & MAGIC</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {([["forge", "⚒ Forge"], ["bulk", "📦 Masse"], ["budget", "⚖ Budget"], ["schema", "📋 Schéma"]] as const).map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "5px 14px", borderRadius: 6, cursor: "pointer",
                background: tab === t ? "#333" : "transparent",
                border: `1px solid ${tab === t ? "#333" : "#ddd"}`,
                color: tab === t ? "#fff" : "#888",
                fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                transition: "all 0.2s",
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* ── FORGE ── */}
        {tab === "forge" && (
          <div style={{ display: "flex", flex: 1 }}>

            {/* Controls */}
            <div style={{ width: 235, padding: "16px 13px", borderRight: "1px solid #e8e8e8", background: "#fafafa", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
              <Sec title="Faction">
                {Object.entries(FACTIONS).map(([f, fc]) => (
                  <button key={f} onClick={() => setFaction(f)} style={{
                    padding: "6px 10px", borderRadius: 6, cursor: "pointer", width: "100%",
                    background: faction === f ? `${fc.color}18` : "#fff",
                    border: `1px solid ${faction === f ? fc.color : "#e0e0e0"}`,
                    color: faction === f ? fc.color : "#888",
                    fontFamily: "'Cinzel',serif", fontSize: 10, fontWeight: faction === f ? 700 : 400,
                    textAlign: "left", transition: "all 0.15s", marginBottom: 3,
                    display: "flex", alignItems: "center", gap: 7,
                  }}>
                    <span>{fc.emoji}</span><span style={{ flex: 1 }}>{f}</span>
                  </button>
                ))}
              </Sec>

              {/* Race selector */}
              {FACTIONS[faction]?.races && (
                <Sec title="Race">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {FACTIONS[faction].races.map(r => (
                      <button key={r} onClick={() => { setRace(r); setClan(""); }} style={{
                        padding: "4px 8px", borderRadius: 5, cursor: "pointer",
                        background: race === r ? `${fac.color}22` : "#fff",
                        border: `1px solid ${race === r ? fac.color : "#e0e0e0"}`,
                        color: race === r ? fac.color : "#888",
                        fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: race === r ? 700 : 400,
                        transition: "all 0.15s",
                      }}>{r}</button>
                    ))}
                  </div>
                </Sec>
              )}

              {/* Clan selector */}
              {FACTIONS[faction]?.clans && (FACTIONS[faction].clans!.appliesTo === "all" || FACTIONS[faction].clans!.appliesTo === race) && (
                <Sec title="Clan">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {FACTIONS[faction].clans!.names.map(c => (
                      <button key={c} onClick={() => setClan(clan === c ? "" : c)} style={{
                        padding: "4px 8px", borderRadius: 5, cursor: "pointer",
                        background: clan === c ? `${fac.color}22` : "#fff",
                        border: `1px solid ${clan === c ? fac.color : "#e0e0e0"}`,
                        color: clan === c ? fac.color : "#888",
                        fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: clan === c ? 700 : 400,
                        transition: "all 0.15s",
                      }}>{c}</button>
                    ))}
                  </div>
                </Sec>
              )}

              {/* Mercenaires alignment selector */}
              {faction === "Mercenaires" && (
                <Sec title="Alignement">
                  <div style={{ display: "flex", gap: 3 }}>
                    {(["bon", "neutre", "maléfique"] as const).map(a => {
                      const al = ALIGNMENTS.find(x => x.id === a);
                      return (
                        <button key={a} onClick={() => setCardAlignment(a)} style={{
                          padding: "4px 8px", borderRadius: 5, cursor: "pointer", flex: 1,
                          background: cardAlignment === a ? `${al?.color}22` : "#fff",
                          border: `1px solid ${cardAlignment === a ? al?.color : "#e0e0e0"}`,
                          color: cardAlignment === a ? al?.color : "#888",
                          fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: cardAlignment === a ? 700 : 400,
                        }}>{al?.emoji} {al?.label}</button>
                      );
                    })}
                  </div>
                </Sec>
              )}

              <Sec title="Type">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {TYPES.map(t => (
                    <button key={t} onClick={() => setType(t)} style={{
                      padding: "5px 4px", borderRadius: 6, cursor: "pointer",
                      background: type === t ? "#333" : "#fff",
                      border: `1px solid ${type === t ? "#333" : "#e0e0e0"}`,
                      color: type === t ? "#fff" : "#888",
                      fontFamily: "'Cinzel',serif", fontSize: 9, transition: "all 0.15s",
                    }}>{t}</button>
                  ))}
                </div>
              </Sec>

              <Sec title="Rareté">
                {RARITIES.map(r => (
                  <button key={r.id} onClick={() => setRarity(r.id)} style={{
                    padding: "6px 10px", borderRadius: 6, cursor: "pointer", width: "100%",
                    background: rarity === r.id ? `${r.color}15` : "#fff",
                    border: `1px solid ${rarity === r.id ? r.color : "#e0e0e0"}`,
                    color: rarity === r.id ? r.color : "#888",
                    fontFamily: "'Cinzel',serif", fontSize: 10, fontWeight: rarity === r.id ? 700 : 400,
                    textAlign: "left", transition: "all 0.15s", marginBottom: 3,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span>{r.label}</span>
                    <span style={{ fontSize: 7.5, opacity: 0.45 }}>×{r.multiplier.toFixed(2)}</span>
                  </button>
                ))}
              </Sec>

              <Sec title="Mode">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {(["auto", "manuel"] as const).map(m => (
                    <button key={m} onClick={() => setForgeMode(m)} style={{
                      padding: "5px 4px", borderRadius: 6, cursor: "pointer",
                      background: forgeMode === m ? "#333" : "#fff",
                      border: `1px solid ${forgeMode === m ? "#333" : "#e0e0e0"}`,
                      color: forgeMode === m ? "#fff" : "#888",
                      fontFamily: "'Cinzel',serif", fontSize: 9, transition: "all 0.15s",
                      textTransform: "capitalize",
                    }}>{m === "auto" ? "⚙ Auto" : "✏ Manuel"}</button>
                  ))}
                </div>
              </Sec>

              {forgeMode === "auto" && (
                <button onClick={() => forgeCard()} disabled={loading} style={{
                  padding: "11px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
                  background: loading ? "#e0e0e0" : `linear-gradient(135deg,${fac.color},${fac.accent}dd)`,
                  border: "none",
                  color: loading ? "#999" : "#fff",
                  fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 700, letterSpacing: 2,
                  boxShadow: loading ? "none" : `0 2px 12px ${fac.color}44`,
                  animation: loading ? "pulse 1.5s infinite" : "none",
                  transition: "all 0.3s",
                }}>
                  {loading ? "FORGE EN COURS…" : `${fac.emoji}  FORGER`}
                </button>
              )}

              {forgeMode === "manuel" && (
                <>
                  <button onClick={createManualCard} style={{
                    padding: "11px", borderRadius: 8, cursor: "pointer",
                    background: `linear-gradient(135deg,${fac.color},${fac.accent}dd)`,
                    border: "none", color: "#fff",
                    fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 700, letterSpacing: 2,
                    boxShadow: `0 2px 12px ${fac.color}44`,
                    transition: "all 0.3s",
                  }}>
                    {"✏ CRÉER"}
                  </button>
                  <button onClick={resetManualForm} style={{
                    padding: "7px", borderRadius: 6, cursor: "pointer",
                    background: "#fff", border: "1px solid #e0e0e0",
                    color: "#999", fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 600,
                    transition: "all 0.2s",
                  }}>
                    {"🗑 RÉINITIALISER"}
                  </button>
                </>
              )}
            </div>

            {/* Preview */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 28, background: "#f5f5f5" }}>
              <div style={{ animation: card ? "fadeIn 0.35s ease" : "none" }}>
                <CardVisual
                  card={(card || forgeMode === "manuel") ? manualCard : null}
                  loading={forgeMode === "auto" && loading}
                  imageUrl={cardImages[manualCard.id] || null}
                  onImageChange={(url) => {
                    setCardImages(prev => ({ ...prev, [manualCard.id]: url }));
                  }}
                />
              </div>
              {(card || (forgeMode === "manuel" && manualName)) && !loading && (
                <div style={{ display: "flex", gap: 7 }}>
                  {forgeMode === "auto" && <Btn onClick={() => forgeCard()} label="🎲 Re-roll" color="#74b9ff" />}
                  <Btn onClick={() => exportJSON([manualCard])} label="📤 JSON" color="#55efc4" />
                  <Btn onClick={() => { if (!card) createManualCard(); saveToGame(manualCard); }} label={saving ? "⏳ …" : "💾 Nouvelle carte"} color="#ffd54f" />
                  <Btn onClick={loadExistingCards} label="📝 Mettre à jour" color="#a29bfe" />
                </div>
              )}
              {/* Update target indicator */}
              {updateTargetId && (card || (forgeMode === "manuel" && manualName)) && !loading && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                  borderRadius: 8, background: "#f0eeff", border: "1px solid #d0c8ff",
                  maxWidth: 380,
                }}>
                  <span style={{ fontSize: 10, color: "#6c5ce7", fontFamily: "'Crimson Text',serif", flex: 1 }}>
                    Cible : <strong>{updateTargetName}</strong> (#{updateTargetId})
                  </span>
                  <Btn onClick={() => saveToGame(manualCard, updateTargetId)} label={saving ? "⏳ …" : "✅ Confirmer"} color="#27ae60" />
                  <Btn onClick={clearUpdateTarget} label="✕" color="#e74c3c" />
                </div>
              )}
              {/* Existing cards picker modal */}
              {showExistingCards && (
                <div style={{
                  maxWidth: 420, maxHeight: 300, overflowY: "auto",
                  padding: "12px", borderRadius: 8, background: "#fff",
                  border: "1px solid #e0e0e0", boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 9, color: "#888", letterSpacing: 1.5 }}>SÉLECTIONNER UNE CARTE À METTRE À JOUR</span>
                    <Btn onClick={() => setShowExistingCards(false)} label="✕" color="#e74c3c" />
                  </div>
                  <input
                    type="text" placeholder="Rechercher…" value={existingSearch}
                    onChange={e => setExistingSearch(e.target.value)}
                    style={{
                      width: "100%", padding: "6px 10px", marginBottom: 8, borderRadius: 6,
                      background: "#f8f8f8", border: "1px solid #e0e0e0", color: "#333",
                      fontFamily: "'Crimson Text',serif", fontSize: 12,
                    }}
                  />
                  {existingCards
                    .filter(c => c.name.toLowerCase().includes(existingSearch.toLowerCase()))
                    .map(c => (
                    <div key={c.id} style={{
                      padding: "6px 10px", borderRadius: 6, marginBottom: 3,
                      background: deleteConfirmId === c.id ? "#fde8e8" : "#f8f8f8",
                      border: `1px solid ${deleteConfirmId === c.id ? "#f5a3a3" : "#e8e8e8"}`,
                      transition: "all 0.15s",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      {deleteConfirmId === c.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                          <span style={{ fontSize: 9, color: "#e74c3c", flex: 1 }}>{"Supprimer définitivement ?"}</span>
                          <button onClick={() => deleteCard(c.id)} style={{ fontSize: 8, padding: "2px 8px", borderRadius: 4, background: "#e74c3c", border: "none", color: "#fff", cursor: "pointer", fontFamily: "'Cinzel',serif" }}>{"Oui"}</button>
                          <button onClick={() => setDeleteConfirmId(null)} style={{ fontSize: 8, padding: "2px 8px", borderRadius: 4, background: "#fff", border: "1px solid #ddd", color: "#888", cursor: "pointer", fontFamily: "'Cinzel',serif" }}>{"Non"}</button>
                        </div>
                      ) : (
                        <>
                          <div onClick={() => selectUpdateTarget(c)} style={{ flex: 1, cursor: "pointer" }}>
                            <div style={{ fontSize: 10, color: "#333", fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: 8, color: "#999" }}>
                              {"💧"}{c.mana_cost}
                              {c.attack != null && <>{" · ⚔"}{c.attack}{" ❤"}{c.health}</>}
                              {c.faction && <>{" · "}{c.faction}</>}
                              {c.keywords?.length > 0 && <>{" · "}{c.keywords.length}{" cap."}</>}
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(c.id); }} style={{
                            fontSize: 10, background: "none", border: "none", color: "#ccc", cursor: "pointer",
                            padding: "2px 4px", transition: "color 0.15s",
                          }} title="Supprimer">{"🗑"}</button>
                        </>
                      )}
                    </div>
                  ))}
                  {existingCards.length === 0 && (
                    <div style={{ fontSize: 10, color: "#bbb", textAlign: "center", padding: 20 }}>Aucune carte trouvée</div>
                  )}
                </div>
              )}
              {saveResult && !loading && !showExistingCards && (
                <div style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 10,
                  background: saveResult.ok ? "#e8f8f0" : "#fde8e8",
                  border: `1px solid ${saveResult.ok ? "#a3e4c1" : "#f5a3a3"}`,
                  color: saveResult.ok ? "#27ae60" : "#e74c3c",
                  fontFamily: "'Crimson Text',serif", maxWidth: 380, textAlign: "center",
                }}>
                  {saveResult.msg}
                </div>
              )}
              {(card?.illustrationPrompt || manualCard.illustrationPrompt) && (() => {
                const basePrompt = card?.illustrationPrompt || manualCard.illustrationPrompt || "";
                const currentPrompt = editedPrompt ?? basePrompt;
                return (
                  <div style={{ maxWidth: 380, padding: "10px 14px", borderRadius: 8, background: "#fff", border: "1px solid #e0e0e0", fontFamily: "'Crimson Text',serif", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div style={{ fontSize: 8, color: "#aaa", letterSpacing: 1.5, marginBottom: 4, fontFamily: "'Cinzel',serif" }}>ILLUSTRATION PROMPT</div>
                    <textarea
                      value={currentPrompt}
                      onChange={e => setEditedPrompt(e.target.value)}
                      rows={4}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#f8f8f8", color: "#555", fontFamily: "'Crimson Text',serif", fontSize: 11, lineHeight: 1.5, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
                      <button onClick={() => navigator.clipboard.writeText(currentPrompt)} style={{
                        fontSize: 9, background: "none", border: "none",
                        color: "#27ae60", cursor: "pointer", fontFamily: "'Cinzel',serif",
                      }}>[copier]</button>
                      {editedPrompt !== null && editedPrompt !== basePrompt && (
                        <button onClick={() => setEditedPrompt(null)} style={{
                          fontSize: 9, background: "none", border: "none",
                          color: "#e74c3c", cursor: "pointer", fontFamily: "'Cinzel',serif",
                        }}>[reset]</button>
                      )}
                      <button
                        onClick={() => {
                          const c = card || manualCard;
                          if (c) generateIllustration({ ...c, illustrationPrompt: currentPrompt });
                        }}
                        disabled={generatingImage}
                        style={{
                          fontSize: 9, background: generatingImage ? "#f0f0f0" : "#f0eeff",
                          border: `1px solid ${generatingImage ? "#ddd" : "#d0c8ff"}`,
                          borderRadius: 6, padding: "3px 10px",
                          color: generatingImage ? "#999" : "#6c5ce7", cursor: generatingImage ? "not-allowed" : "pointer",
                          fontFamily: "'Cinzel',serif",
                          animation: generatingImage ? "pulse 1.5s infinite" : "none",
                        }}
                      >{generatingImage ? "⏳ Génération…" : "🎨 Illustrer"}</button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Right panel: History or Edit Form */}
            <div style={{ width: 240, padding: "14px 10px", borderLeft: "1px solid #e8e8e8", background: "#fafafa", overflowY: "auto" }}>

              {forgeMode === "auto" && !card && (
                <>
                  <div style={{ fontSize: 8, color: "#aaa", letterSpacing: 2, marginBottom: 10 }}>HISTORIQUE</div>
                  {history.length === 0 && <div style={{ fontSize: 10, color: "#ccc", textAlign: "center", marginTop: 30 }}>Aucune carte</div>}
                  {history.map(c => {
                    const f = FACTIONS[c.faction] || FACTIONS.Humains;
                    const r = RARITY_MAP[c.rarity];
                    return (
                      <div key={c.id} className="hist-row" onClick={() => setCard(c)} style={{
                        padding: "7px 9px", borderRadius: 6, marginBottom: 4,
                        background: "#fff", border: `1px solid #e8e8e8`,
                        borderLeft: `3px solid ${r.color}`,
                        cursor: "pointer", transition: "all 0.15s",
                      }}>
                        <div style={{ fontSize: 10, color: f.color, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                        <div style={{ fontSize: 8, color: "#999", display: "flex", justifyContent: "space-between" }}>
                          <span>{c.faction}</span>
                          <span style={{ color: r.color }}>{r.code} · {c.mana}💧</span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {(forgeMode === "manuel" || card) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 8, color: "#aaa", letterSpacing: 2 }}>{"ÉDITION"}</div>
                    <button onClick={loadExistingCards} style={{
                      fontSize: 8, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                      background: "#f0eeff", border: "1px solid #d0c8ff",
                      color: "#6c5ce7", fontFamily: "'Cinzel',serif",
                    }}>{"📂 Charger carte"}</button>
                  </div>

                  {/* Existing cards picker (inline in right panel) */}
                  {showExistingCards && (
                    <div style={{
                      padding: "8px", borderRadius: 6, background: "#fff",
                      border: "1px solid #e0e0e0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>CARTES EXISTANTES</span>
                        <button onClick={() => setShowExistingCards(false)} style={{
                          fontSize: 8, background: "none", border: "none", color: "#e74c3c", cursor: "pointer",
                        }}>{"✕"}</button>
                      </div>
                      <input
                        type="text" placeholder="Rechercher…" value={existingSearch}
                        onChange={e => setExistingSearch(e.target.value)}
                        style={{
                          width: "100%", padding: "5px 8px", marginBottom: 6, borderRadius: 5,
                          background: "#f8f8f8", border: "1px solid #e0e0e0", color: "#333",
                          fontFamily: "'Crimson Text',serif", fontSize: 11,
                        }}
                      />
                      <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {existingCards
                          .filter(c => c.name.toLowerCase().includes(existingSearch.toLowerCase()))
                          .map(c => (
                          <div key={c.id} style={{
                            padding: "5px 8px", borderRadius: 5, marginBottom: 2,
                            background: deleteConfirmId === c.id ? "#fde8e8" : "#f8f8f8",
                            border: `1px solid ${deleteConfirmId === c.id ? "#f5a3a3" : "#eee"}`,
                            transition: "all 0.15s",
                            display: "flex", alignItems: "center",
                          }}>
                            {deleteConfirmId === c.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                                <span style={{ fontSize: 8, color: "#e74c3c", flex: 1 }}>{"Supprimer ?"}</span>
                                <button onClick={() => deleteCard(c.id)} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, background: "#e74c3c", border: "none", color: "#fff", cursor: "pointer" }}>{"Oui"}</button>
                                <button onClick={() => setDeleteConfirmId(null)} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, background: "#fff", border: "1px solid #ddd", color: "#888", cursor: "pointer" }}>{"Non"}</button>
                              </div>
                            ) : (
                              <>
                                <div onClick={() => selectUpdateTarget(c)} style={{ flex: 1, cursor: "pointer" }}>
                                  <div style={{ fontSize: 10, color: "#333", fontWeight: 600 }}>{c.name}</div>
                                  <div style={{ fontSize: 8, color: "#999" }}>
                                    {"💧"}{c.mana_cost}
                                    {c.attack != null && <>{" · ⚔"}{c.attack}{" ❤"}{c.health}</>}
                                    {c.faction && <>{" · "}{c.faction}</>}
                                  </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(c.id); }} style={{
                                  fontSize: 9, background: "none", border: "none", color: "#ccc", cursor: "pointer", padding: "2px",
                                }} title="Supprimer">{"🗑"}</button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nom */}
                  <div>
                    <label style={{ fontSize: 9, color: "#666", letterSpacing: 1 }}>NOM</label>
                    <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
                      placeholder="Nom de la carte"
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", color: "#333", fontFamily: "'Crimson Text',serif", fontSize: 13, marginTop: 3 }}
                    />
                  </div>

                  {/* Mana + Stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    <div>
                      <label style={{ fontSize: 8, color: "#4a90d9", letterSpacing: 1 }}>MANA</label>
                      <input type="number" min={1} max={10} value={manualMana} onChange={e => setManualMana(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                        style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid #4a90d944", background: "#fff", color: "#4a90d9", fontFamily: "'Cinzel',serif", fontSize: 14, textAlign: "center", marginTop: 3 }}
                      />
                    </div>
                    {type === "Unité" ? (
                      <>
                        <div>
                          <label style={{ fontSize: 8, color: "#f1c40f", letterSpacing: 1 }}>ATK</label>
                          <input type="number" min={0} max={30} value={manualAttack} onChange={e => setManualAttack(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid #f1c40f44", background: "#fff", color: "#f1c40f", fontFamily: "'Cinzel',serif", fontSize: 14, textAlign: "center", marginTop: 3 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 8, color: "#e74c3c", letterSpacing: 1 }}>DEF</label>
                          <input type="number" min={1} max={30} value={manualDefense} onChange={e => setManualDefense(Math.max(1, parseInt(e.target.value) || 1))}
                            style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid #e74c3c44", background: "#fff", color: "#e74c3c", fontFamily: "'Cinzel',serif", fontSize: 14, textAlign: "center", marginTop: 3 }}
                          />
                        </div>
                      </>
                    ) : (
                      <div style={{ gridColumn: "span 2" }}>
                        <label style={{ fontSize: 8, color: "#9b59b6", letterSpacing: 1 }}>PUISSANCE</label>
                        <input type="number" min={1} max={20} value={manualPower} onChange={e => setManualPower(Math.max(1, parseInt(e.target.value) || 1))}
                          style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid #9b59b644", background: "#fff", color: "#9b59b6", fontFamily: "'Cinzel',serif", fontSize: 14, textAlign: "center", marginTop: 3 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Budget */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
                    <div style={{ flex: 1, height: 4, background: "#e8e8e8", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: budgetColor, width: `${Math.min(120, budgetRatio * 100)}%`, transition: "width 0.2s" }} />
                    </div>
                    <span style={{ color: budgetColor, fontWeight: 700, fontFamily: "'Cinzel',serif" }}>{manualBudgetUsed}/{manualBudgetTotal}</span>
                  </div>

                  {/* Capacités */}
                  <div>
                    <label style={{ fontSize: 9, color: "#666", letterSpacing: 1 }}>CAPACITÉS ({manualKeywords.length})</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                      {availableManualKeywords.map(([id, kw]) => {
                        const selected = manualKeywords.includes(id);
                        const isScalable = kw.scalable;
                        return (
                          <div key={id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                            <button onClick={() => {
                              setManualKeywords(prev => selected ? prev.filter(k => k !== id) : [...prev, id]);
                              if (selected && isScalable) {
                                setKeywordXValues(prev => { const next = { ...prev }; delete next[id]; return next; });
                              } else if (!selected && isScalable) {
                                setKeywordXValues(prev => ({ ...prev, [id]: 1 }));
                              }
                            }}
                              style={{
                                padding: "3px 7px", borderRadius: isScalable && selected ? "5px 0 0 5px" : 5, cursor: "pointer",
                                background: selected ? `${fac.color}22` : "#fff",
                                border: `1px solid ${selected ? fac.color : "#e0e0e0"}`,
                                color: selected ? fac.color : "#999",
                                fontSize: 9, fontFamily: "'Cinzel',serif", fontWeight: selected ? 700 : 400,
                                transition: "all 0.15s",
                              }}>{id.replace(/ X$/, "")}{isScalable && !selected ? " X" : ""}</button>
                            {isScalable && selected && (
                              <input
                                type="number" min={1} max={10}
                                value={keywordXValues[id] ?? 1}
                                onChange={e => setKeywordXValues(prev => ({ ...prev, [id]: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) }))}
                                style={{
                                  width: 32, padding: "3px 4px", borderRadius: "0 5px 5px 0",
                                  border: `1px solid ${fac.color}`, borderLeft: "none",
                                  background: `${fac.color}11`, color: fac.color,
                                  fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700,
                                  textAlign: "center", outline: "none",
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ability */}
                  <div>
                    <label style={{ fontSize: 9, color: "#666", letterSpacing: 1 }}>POUVOIR SPÉCIFIQUE</label>
                    <textarea value={manualAbility} onChange={e => setManualAbility(e.target.value)}
                      placeholder="Texte du pouvoir spécifique…"
                      rows={3}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", color: "#333", fontFamily: "'Crimson Text',serif", fontSize: 12, marginTop: 3, resize: "vertical" }}
                    />
                  </div>

                  {/* Flavor Text */}
                  <div>
                    <label style={{ fontSize: 9, color: "#666", letterSpacing: 1 }}>TEXTE D&apos;AMBIANCE</label>
                    <textarea value={manualFlavorText} onChange={e => setManualFlavorText(e.target.value)}
                      placeholder="Citation narrative…"
                      rows={2}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", color: "#888", fontFamily: "'Crimson Text',serif", fontSize: 11, fontStyle: "italic", marginTop: 3, resize: "vertical" }}
                    />
                  </div>

                  {/* Illustration Prompt */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label style={{ fontSize: 9, color: "#666", letterSpacing: 1 }}>PROMPT ILLUSTRATION</label>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/cards/generate-text', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                factionId: faction, type, rarityId: rarity,
                                stats: { mana: manualMana, attack: manualAttack, defense: manualDefense, power: manualPower, keywords: manualKeywords },
                                existingName: manualName || undefined,
                                existingAbility: manualAbility || undefined,
                              }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              if (data.illustrationPrompt) setManualIllustrationPrompt(data.illustrationPrompt);
                              if (!manualAbility && data.ability) setManualAbility(data.ability);
                              if (!manualFlavorText && data.flavorText) setManualFlavorText(data.flavorText);
                              if (!manualName && data.name) setManualName(data.name);
                            }
                          } catch { /* silently fail */ }
                        }}
                        style={{
                          fontSize: 8, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                          background: "#f0eeff", border: "1px solid #d0c8ff",
                          color: "#6c5ce7", fontFamily: "'Cinzel',serif",
                        }}
                      >{"🤖 Générer par IA"}</button>
                    </div>
                    <textarea value={manualIllustrationPrompt} onChange={e => setManualIllustrationPrompt(e.target.value)}
                      placeholder="English prompt for image generation…"
                      rows={3}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", color: "#666", fontFamily: "'Crimson Text',serif", fontSize: 11, marginTop: 3, resize: "vertical" }}
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── BULK ── */}
        {tab === "bulk" && (
          <div style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0" }}>
              <span style={{ fontSize: 10, color: "#888", letterSpacing: 1 }}>NOMBRE</span>
              <input type="number" value={bulkCount} min={1} max={500}
                onChange={e => setBulkCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                style={{ width: 60, padding: "4px 8px", background: "#f8f8f8", border: "1px solid #e0e0e0", borderRadius: 6, color: "#333", fontFamily: "'Cinzel',serif", fontSize: 13, textAlign: "center" }}
              />
              <span style={{ fontSize: 9, color: "#aaa" }}>Tous paramètres aléatoires</span>
              <div style={{ flex: 1 }} />
              {bulkProgress
                ? <Btn onClick={() => { abortRef.current = true; setBulkProgress(null); }} label="✕ Annuler" color="#ff6b6b" />
                : <Btn onClick={startBulk} label="▶ Lancer" color="#ffd54f" />
              }
              {bulkCards.length > 0 && !bulkProgress && (
                <Btn onClick={() => exportJSON(bulkCards)} label={`📤 JSON (${bulkCards.length})`} color="#55efc4" />
              )}
            </div>

            {bulkProgress && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 3, background: "#e8e8e8", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "linear-gradient(90deg,#6c5ce7,#a29bfe)", borderRadius: 2, width: `${(bulkProgress.done / bulkProgress.total) * 100}%`, transition: "width 0.2s" }} />
                </div>
                <span style={{ fontSize: 10, color: "#6c5ce7", fontWeight: 700, whiteSpace: "nowrap" }}>{bulkProgress.done}/{bulkProgress.total}</span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(185px,1fr))", gap: 7, overflowY: "auto", flex: 1 }}>
              {bulkCards.map(c => {
                const f = FACTIONS[c.faction] || FACTIONS.Humains;
                const r = RARITY_MAP[c.rarity];
                return (
                  <div key={c.id} className="bulk-row" style={{
                    padding: "8px 10px", borderRadius: 6,
                    background: `${f.color}08`, border: `1px solid ${r.color}22`,
                    animation: "fadeIn 0.2s ease", transition: "border-color 0.2s",
                  }}>
                    <div style={{ fontSize: 9.5, color: f.accent, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontSize: 8, color: "#444", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>{c.faction} · {c.type}</span>
                      <span style={{ color: r.color }}>{c.rarity}</span>
                    </div>
                    <div style={{ fontSize: 8.5, color: "#3a3a5a", lineHeight: 1.4, fontFamily: "'Crimson Text',serif" }}>
                      {c.ability?.slice(0, 85)}{c.ability?.length > 85 ? "…" : ""}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 7.5, color: "#74b9ff" }}>💧{c.mana}</span>
                      {c.attack != null && <><span style={{ fontSize: 7.5, color: "#ff6b6b" }}>⚔{c.attack}</span><span style={{ fontSize: 7.5, color: "#74b9ff" }}>🛡{c.defense}</span></>}
                      {c.power != null && <span style={{ fontSize: 7.5, color: f.accent }}>✨{c.power}</span>}
                      <span style={{ fontSize: 7, color: "#222", marginLeft: "auto" }}>{c.budgetUsed}/{c.budgetTotal}pt</span>
                    </div>
                    {c.keywords?.length > 0 && (
                      <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {c.keywords.map(kw => (
                          <span key={kw} style={{ fontSize: 6.5, padding: "1px 4px", borderRadius: 3, background: `${f.color}18`, color: f.accent, border: `1px solid ${f.color}44` }}>{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── BUDGET ── */}
        {tab === "budget" && (
          <div style={{ flex: 1, padding: 22, overflowY: "auto" }}>
            <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ fontSize: 8, color: "#aaa", letterSpacing: 2 }}>SYSTÈME DE BUDGET — RÉFÉRENCE</div>

              {/* Mana-Rarity distribution */}
              <Panel title="DISTRIBUTION RARETÉ PAR COÛT DE MANA (MODE BULK)">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "5px 10px", textAlign: "left", color: "#333", fontWeight: 400, borderBottom: "1px solid #e0e0e0" }}>Mana</th>
                        {RARITIES.map(r => (
                          <th key={r.id} style={{ padding: "5px 10px", textAlign: "center", color: r.color, fontWeight: 700, borderBottom: "1px solid #e0e0e0", whiteSpace: "nowrap" }}>
                            {r.code} {r.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {RARITY_WEIGHTS_BY_MANA.map((weights, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "5px 10px", color: "#74b9ff", fontWeight: 700 }}>{i + 1}</td>
                          {weights.map((w, j) => {
                            const rar = RARITIES[j];
                            const pct = Math.round(w * 100);
                            const intensity = Math.min(1, w / 0.40);
                            return (
                              <td key={j} style={{
                                padding: "5px 10px", textAlign: "center",
                                color: pct >= 20 ? rar.color : pct >= 10 ? rar.color + "aa" : "#333",
                                fontWeight: pct >= 20 ? 700 : 400,
                                background: pct >= 5 ? `${rar.color}${Math.round(intensity * 18).toString(16).padStart(2, "0")}` : "transparent",
                              }}>
                                {pct}%
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 10, fontSize: 8, color: "#333", lineHeight: 1.8 }}>
                  En mode Bulk : le mana est tiré en premier (1–10), puis la rareté est tirée selon ces probabilités. &nbsp;
                  Une carte à 10 mana a <strong style={{ color: "#ffd54f" }}>10× plus de chances</strong> d&apos;être Légendaire qu&apos;une carte à 1 mana, tout en restant possible à toutes les raretés.
                </div>
              </Panel>

              {/* Rarity grid */}
              <Panel title="MULTIPLICATEURS PAR RARETÉ">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
                  {RARITIES.map(r => (
                    <div key={r.id} style={{ textAlign: "center", padding: "10px 6px", borderRadius: 5, border: `1px solid ${r.color}33`, background: `${r.color}08` }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: r.color, marginBottom: 3 }}>{r.code}</div>
                      <div style={{ fontSize: 8.5, color: r.color, marginBottom: 6 }}>{r.label}</div>
                      <div style={{ fontSize: 13, color: "#aaa", fontWeight: 700 }}>×{r.multiplier.toFixed(2)}</div>
                      <div style={{ fontSize: 7.5, color: "#333", marginTop: 3 }}>+{((r.multiplier - 1) * 100).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 8.5, color: "#333", lineHeight: 1.9 }}>
                  Budget = mana × 10 × multiplicateur (±10%) &nbsp;·&nbsp; Ex: 5 mana Épique → <strong style={{ color: "#ce93d8" }}>57.5 pts</strong> (fourchette 51–63)
                </div>
              </Panel>

              {/* Stat costs */}
              <Panel title="COÛT DES STATISTIQUES">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {([["ATK", "#ff6b6b", "2.5 pts par point"], ["DEF", "#74b9ff", "2.0 pts par point"]] as const).map(([stat, color, desc]) => (
                    <div key={stat} style={{ padding: "10px 14px", borderRadius: 5, background: `${color}0a`, border: `1px solid ${color}33` }}>
                      <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 3 }}>{stat}</div>
                      <div style={{ fontSize: 9, color: "#555" }}>{desc}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 8.5, color: "#333", lineHeight: 1.8 }}>
                  L&apos;algorithme alloue d&apos;abord ATK (45% du budget restant), puis DEF (55%), puis tente d&apos;ajouter des capacités jusqu&apos;à épuisement.
                  Les multiplicateurs de faction (ATK weight, DEF weight) modifient les plages de tirage.
                </div>
              </Panel>

              {/* Keyword costs */}
              <Panel title="COÛT DES CAPACITÉS">
                <div style={{ fontSize: 8, color: "#333", lineHeight: 1.9, marginBottom: 10 }}>
                  <strong style={{ color: "#aaa" }}>1 SE (stat équivalent)</strong> = ~4.5 pts de budget = 1 point de stat vanilla que la capacité remplace.
                  &nbsp;ATK coûte <strong style={{ color: "#ff6b6b" }}>5 pts</strong>, DEF coûte <strong style={{ color: "#74b9ff" }}>4 pts</strong>.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 5 }}>
                  {Object.entries(KEYWORDS).map(([id, kw]) => {
                    const tierRar = RARITIES[kw.minTier];
                    return (
                      <div key={id} style={{ padding: "6px 9px", borderRadius: 4, background: `${tierRar.color}07`, border: `1px solid ${tierRar.color}28`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9.5, color: tierRar.color, fontWeight: 700 }}>{id}</div>
                          <div style={{ fontSize: 7.5, color: "#333", lineHeight: 1.4, marginTop: 1, fontFamily: "'Crimson Text',serif" }}>{kw.desc}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>{kw.cost}pt</div>
                          <div style={{ fontSize: 7.5, color: "#555" }}>{kw.se} SE</div>
                          <div style={{ fontSize: 7, color: tierRar.color }}>{tierRar.code}+</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              {/* Faction profiles */}
              <Panel title="PROFILS DE FACTION">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(235px,1fr))", gap: 8 }}>
                  {Object.entries(FACTIONS).map(([f, fc]) => (
                    <div key={f} style={{ padding: "10px 12px", borderRadius: 5, background: `${fc.color}09`, border: `1px solid ${fc.color}28` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                        <span style={{ fontSize: 15 }}>{fc.emoji}</span>
                        <span style={{ fontSize: 10, color: fc.accent, fontWeight: 700 }}>{f}</span>
                      </div>
                      <div style={{ fontSize: 8.5, color: "#3a3a5a", fontFamily: "'Crimson Text',serif", marginBottom: 6 }}>{fc.description}</div>
                      <div style={{ fontSize: 8, color: "#333", lineHeight: 1.8 }}>
                        <div>⚔ ATK ×{fc.statWeights.atk.toFixed(2)} &nbsp;·&nbsp; 🛡 DEF ×{fc.statWeights.def.toFixed(2)}</div>
                        {fc.guaranteedKeywords.length > 0 && <div style={{ color: fc.accent }}>★ Garanti : {fc.guaranteedKeywords.join(", ")}</div>}
                        <div style={{ color: "#222" }}>✕ Interdit : {fc.forbiddenKeywords.join(", ")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* ── SCHEMA ── */}
        {tab === "schema" && (
          <div style={{ flex: 1, padding: 22, overflowY: "auto" }}>
            <div style={{ maxWidth: 660 }}>
              <div style={{ fontSize: 8, color: "#aaa", letterSpacing: 2, marginBottom: 12 }}>CARD SCHEMA — JSON</div>
              <pre style={{ background: "#f8f8f8", border: "1px solid #e0e0e0", borderRadius: 8, padding: 18, fontSize: 11, color: "#6c5ce7", lineHeight: 1.75, fontFamily: "monospace", overflow: "auto" }}>
{JSON.stringify({
  id: "am_1711234567_ab12",
  name: "Forgeron de l'Abîme",
  faction: "Nains|Elfes|Humains|Morts-vivants|Démons|Dragons",
  type: "Unité|Sort|Artefact|Magie",
  rarity: "Commune|Peu Commune|Rare|Épique|Légendaire",
  mana: "1–10",
  attack: "int (Unité) | null",
  defense: "int (Unité) | null",
  power: "int (Sort/Magie) | null",
  keywords: ["Armure", "Résistance"],
  ability: "Texte de capacité (IA)",
  flavorText: "Texte narratif (IA)",
  illustrationPrompt: "Midjourney prompt EN (IA)",
  budgetTotal: 44,
  budgetUsed: 41,
  generatedAt: "2026-03-21T10:00:00.000Z"
}, null, 2)}
              </pre>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
