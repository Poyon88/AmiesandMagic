'use client';

import { useState, useCallback, useRef, useEffect } from "react";
import { generateCardStats, pickMana, pickRarity, buildId } from "@/lib/card-engine/generator";
import { RARITIES, FACTIONS, TYPES, KEYWORDS, RARITY_WEIGHTS_BY_MANA, RARITY_MAP, ALIGNMENTS } from "@/lib/card-engine/constants";
import CardVisual, { KEYWORD_SYMBOLS } from "./CardVisual";
import KeywordIcon from "@/components/shared/KeywordIcon";
import type { CardType, Keyword, SpellEffect, SpellTargetType, SpellKeywordInstance, SpellComposableEffects, SpellEffectNode, SpellTargetSlot, AtomicEffectType, SpellCondition, AtomicEffect, ConditionalEffectNode, CardSet, GameFormat } from "@/lib/game/types";
import { SPELL_KEYWORDS, ALL_SPELL_KEYWORDS, SPELL_KEYWORD_LABELS, SPELL_KEYWORD_SYMBOLS } from "@/lib/game/spell-keywords";
import type { SpellKeywordId } from "@/lib/game/types";
import CardEditor from "@/components/admin/CardEditor";

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
  convocationRace?: string;
  convocationTokenName?: string;
  convocationTokens?: {race: string; attack: number; health: number}[];
  lycanthropieRace?: string;
  setName?: string;
  setIcon?: string;
  cardYear?: number;
  cardMonth?: number;
  spellKeywords?: SpellKeywordInstance[];
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
  // Token templates
  const [tokenTemplates, setTokenTemplates] = useState<{ id: number; race: string; name: string; image_url: string | null }[]>([]);
  const [tokenRace, setTokenRace] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenImageBase64, setTokenImageBase64] = useState<string | null>(null);
  const [tokenImageMime, setTokenImageMime] = useState<string | null>(null);
  const [tokenImagePreview, setTokenImagePreview] = useState<string | null>(null);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tokenEditId, setTokenEditId] = useState<number | null>(null);
  const [tokenKeywords, setTokenKeywords] = useState<string[]>([]);
  const [tokenPrompt, setTokenPrompt] = useState("");
  const [tokenGenerating, setTokenGenerating] = useState(false);
  const [tokenMessage, setTokenMessage] = useState<{ ok: boolean; msg: string } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkCards, setBulkCards] = useState<ForgeCard[]>([]);
  const [tab, setTab] = useState("forge");
  const [cardImages, setCardImages] = useState<Record<string, string>>({});
  const abortRef = useRef(false);

  // ─── PRINTS (séries limitées) ──────────────────────────────────────────────
  const [printsCards, setPrintsCards] = useState<{ id: number; name: string; mana_cost: number; rarity: string | null; card_year: number | null; card_month: number | null; set_id: number | null }[]>([]);
  const [printsProfiles, setPrintsProfiles] = useState<{ id: string; username: string }[]>([]);
  const [selectedPrintCard, setSelectedPrintCard] = useState<{ id: number; name: string; rarity: string | null } | null>(null);
  const [printsList, setPrintsList] = useState<{ id: number; print_number: number; max_prints: number; owner_id: string | null; owner_username: string | null; is_tradeable: boolean }[]>([]);
  const [printsLoading, setPrintsLoading] = useState(false);
  const [printsSearch, setPrintsSearch] = useState("");

  async function loadPrintsData() {
    const [cardsRes, profRes] = await Promise.all([
      fetch("/api/cards/save"),
      fetch("/api/collections/role"),
    ]);
    const cardsData = await cardsRes.json();
    const profData = await profRes.json();
    setPrintsCards(Array.isArray(cardsData) ? cardsData.filter((c: { set_id: number | null; card_year: number | null }) => c.set_id == null && c.card_year) : []);
    setPrintsProfiles(Array.isArray(profData) ? profData : []);
  }

  async function loadPrintsList(cardId: number) {
    setPrintsLoading(true);
    try {
      const res = await fetch(`/api/card-prints?cardId=${cardId}`);
      const data = await res.json();
      setPrintsList(Array.isArray(data) ? data : []);
    } finally {
      setPrintsLoading(false);
    }
  }

  async function assignPrint(printId: number, ownerId: string | null) {
    await fetch("/api/card-prints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printId, ownerId }),
    });
    if (selectedPrintCard) loadPrintsList(selectedPrintCard.id);
  }

  async function togglePrintTradeable(printId: number, current: boolean) {
    await fetch("/api/card-prints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printId, isTradeable: !current }),
    });
    if (selectedPrintCard) loadPrintsList(selectedPrintCard.id);
  }

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
  const [hoveredKw, setHoveredKw] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [convocationRace, setConvocationRace] = useState("");
  const [convocationTokens, setConvocationTokens] = useState<{race: string; attack: number; health: number}[]>([]);
  const [lycanthropieRace, setLycanthropieRace] = useState("");
  const [cardSetId, setCardSetId] = useState<number | null>(null);
  const [cardYear, setCardYear] = useState<number | null>(null);
  const [cardMonth, setCardMonth] = useState<number | null>(null);
  const [sets, setSets] = useState<CardSet[]>([]);
  const [newSetName, setNewSetName] = useState("");
  const [newSetCode, setNewSetCode] = useState("");
  const [newSetIcon, setNewSetIcon] = useState("⚔️");
  const [newSetReleasedAt, setNewSetReleasedAt] = useState("");
  const [formats, setFormats] = useState<GameFormat[]>([]);
  const [variableSetIds, setVariableSetIds] = useState<number[]>([]);
  const [savingFormats, setSavingFormats] = useState(false);

  // ─── NEW SPELL SYSTEM ──────────────────────────────────────────────────────
  const [spellKeywords, setSpellKeywords] = useState<SpellKeywordInstance[]>([]);
  const [spellEffectsData, setSpellEffectsData] = useState<SpellComposableEffects | null>(null);

  const SPELL_TARGET_LABELS: Record<SpellTargetType, string> = {
    any: "N'importe qui", any_creature: "Créature",
    enemy_hero: "Héros ennemi", friendly_hero: "Héros allié",
    friendly_creature: "Créature alliée", enemy_creature: "Créature ennemie",
    all_enemy_creatures: "Toutes créa. ennemies", all_enemies: "Tous ennemis",
    all_friendly_creatures: "Toutes créa. alliées",
    friendly_graveyard: "Cimetière → main", friendly_graveyard_to_board: "Cimetière → terrain",
  };

  function buildSpellData(): { spell_keywords: SpellKeywordInstance[] | null; spell_effects: SpellComposableEffects | null } {
    if (type === "Unité") return { spell_keywords: null, spell_effects: null };
    return {
      spell_keywords: spellKeywords.length > 0 ? spellKeywords : null,
      spell_effects: spellEffectsData,
    };
  }

  const availableManualKeywords = Object.entries(KEYWORDS)
    .filter(([id, kw]) => {
      const tier = RARITY_MAP[rarity]?.tier ?? 0;
      const forbidden = FACTIONS[faction]?.forbiddenKeywords ?? [];
      return kw.minTier <= tier && !forbidden.includes(id);
    })
    .sort(([a], [b]) => a.localeCompare(b, 'fr'));

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
    convocationRace: convocationRace || undefined,
    convocationTokenName: tokenTemplates.find(t => t.race === convocationRace)?.name || convocationRace || undefined,
    convocationTokens: convocationTokens.length > 0 ? convocationTokens : undefined,
    lycanthropieRace: lycanthropieRace || undefined,
    setName: cardSetId ? sets.find(s => s.id === cardSetId)?.name : undefined,
    setIcon: cardSetId ? sets.find(s => s.id === cardSetId)?.icon : undefined,
    cardYear: cardYear || undefined,
    cardMonth: cardMonth || undefined,
    spellKeywords: type !== "Unité" && spellKeywords.length > 0 ? spellKeywords : undefined,
  };

  // All races from all factions
  const allRaces = Object.values(FACTIONS).flatMap(f => f.races).sort();

  const loadTokenTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/token-templates');
      if (res.ok) setTokenTemplates(await res.json());
    } catch { /* ignore */ }
  }, []);

  const loadSets = useCallback(async () => {
    try {
      const res = await fetch('/api/sets');
      if (res.ok) setSets(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSets(); }, [loadSets]);

  const loadFormats = useCallback(async () => {
    try {
      const [fmtRes, setsRes] = await Promise.all([
        fetch('/api/formats'),
        fetch('/api/sets'),
      ]);
      if (fmtRes.ok) {
        const fmtData = await fmtRes.json();
        setFormats(Array.isArray(fmtData) ? fmtData : []);
        const variableFormat = (Array.isArray(fmtData) ? fmtData : []).find((f: GameFormat) => f.code === 'variable');
        if (variableFormat) {
          const vsRes = await fetch(`/api/formats/${variableFormat.id}/sets`);
          if (vsRes.ok) setVariableSetIds(await vsRes.json());
        }
      }
      if (setsRes.ok) setSets(await setsRes.json());
    } catch { /* ignore */ }
  }, []);

  const generateTokenPrompt = useCallback(() => {
    if (!tokenRace) return;
    const tokenVisualDescriptions: Record<string, string> = {
      "Elfes": "an elven warrior with pointed ears, elegant features, flowing hair, light armor with nature motifs",
      "Aigles Géants": "a massive giant eagle with piercing eyes, powerful wingspan, golden-brown plumage, sharp talons",
      "Fées": "a luminous fairy with translucent butterfly wings, glowing aura, ethereal and delicate",
      "Nains": "a stout dwarven warrior with thick beard, heavy plate armor, runes engraved on equipment",
      "Golems": "a stone or metal construct with glowing runes carved into its body, hulking and mechanical",
      "Hobbits": "a halfling with bare hairy feet, round cheerful face, simple rustic clothing",
      "Hommes-Arbres": "a towering treant made of living wood, bark skin, branch limbs, leaves as hair, mossy and ancient",
      "Humains": "a human warrior in medieval armor, realistic proportions, heraldic symbols on shield",
      "Hommes-Loups": "a werewolf humanoid with wolf head, fur-covered muscular body, feral eyes, claws and fangs",
      "Hommes-Ours": "a werebear humanoid, massive bear-headed figure, thick fur, enormous claws, towering",
      "Hommes-Félins": "a feline humanoid with panther features, lithe and agile body, slit pupils, sleek fur",
      "Centaures": "a centaur, a single creature with a human head, human chest and human arms on top, and four horse legs below with hooves, no separate horse head, wielding spear or bow, wild hair, tribal war paint",
      "Feu": "a fire elemental, body made of living flames, molten core, embers floating around",
      "Terre": "an earth elemental, body of rock and stone, crystal growths, moss patches, heavy and immovable",
      "Eau": "a water elemental, body of flowing translucent water, whirlpool core, droplets suspended in air",
      "Air/Tempête": "a storm elemental, body of swirling wind and lightning, crackling electricity, semi-transparent",
      "Géants": "a towering giant humanoid, crude armor, massive club, standing several stories tall",
      "Ogres": "a large brutish ogre, ugly face, thick skin, crude leather armor, wielding a club",
      "Dragons": "a magnificent dragon with scales, massive wings, long tail, breathing fire, serpentine neck",
      "Chiens": "a large war hound, battle-scarred, armored barding, fierce and loyal, muscular",
      "Phoenix": "a majestic phoenix bird engulfed in sacred flames, radiant feathers of gold and crimson",
      "Anges": "a celestial angelic being with luminous feathered wings, divine armor, halo of light",
      "Ours": "a massive bear, thick fur, powerful claws, intimidating presence, standing on hind legs",
      "Loups": "a fierce wolf, larger than normal, piercing eyes, thick fur, fangs bared, wild and untamed",
      "Orcs": "a green-skinned muscular orc, tusks, brutal heavy armor, scarred face, savage and menacing",
      "Gobelins": "a green goblin, pointy ears, sharp teeth, ragged clothing, sneaky and mischievous",
      "Trolls": "a huge troll with regenerating flesh, long arms, hunched posture, warty skin",
      "Wargs": "a giant wolf-like warg beast, dark matted fur, red eyes, razor fangs",
      "Squelettes": "an animated skeleton warrior, hollow eye sockets with ghostly glow, rusted ancient armor",
      "Zombies": "a shambling undead corpse, rotting flesh, torn clothing, decayed and horrifying",
      "Spectres": "a ghostly translucent specter, floating ethereal form, glowing eyes, trailing wisps of ectoplasm",
      "Vampires": "an elegant vampire lord, pale skin, red eyes, aristocratic dark clothing, fangs",
      "Lich": "a skeletal undead sorcerer in ornate robes, glowing phylactery, crown of dark magic",
      "Banshees": "a wailing ghostly female spirit, flowing spectral hair, mouth open in eternal scream",
      "Elfes Corrompus": "a dark elf with ashen skin, white hair, cruel features, spiked dark armor, malevolent aura",
      "Araignées Géantes": "an enormous spider with dark chitin, multiple glowing eyes, venomous dripping fangs",
      "Démons": "a demonic creature with horns, bat-like wings, cloven hooves, infernal flames",
    };
    const visual = tokenVisualDescriptions[tokenRace] || `a ${tokenRace} creature`;
    const nameHint = tokenName ? ` named "${tokenName}"` : '';
    const kwHint = tokenKeywords.length > 0 ? ` Abilities: ${tokenKeywords.join(', ')}.` : '';
    const prompt = `${visual}${nameHint}.${kwHint} Cinematic lighting, highly detailed, painterly style, dark fantasy atmosphere, full body portrait centered on a plain dark background. Square format. Absolutely no text, no letters, no words, no symbols, no writing, no borders, no frames, no card layout, no UI elements anywhere in the image.`;
    setTokenPrompt(prompt);
  }, [tokenRace, tokenName, tokenKeywords]);

  const generateTokenImage = useCallback(async () => {
    if (!tokenPrompt) return;
    setTokenGenerating(true);
    setTokenMessage(null);
    try {
      const res = await fetch('/api/cards/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: tokenPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur génération');
      setTokenImageBase64(data.imageBase64);
      setTokenImageMime(data.mimeType);
      // Convert to blob URL for preview
      const byteChars = atob(data.imageBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: data.mimeType });
      setTokenImagePreview(URL.createObjectURL(blob));
      setTokenMessage({ ok: true, msg: `Image générée (${data.model})` });
    } catch (err) {
      setTokenMessage({ ok: false, msg: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setTokenGenerating(false);
    }
  }, [tokenPrompt]);

  const saveTokenTemplate = useCallback(async () => {
    if (!tokenRace || !tokenName) return;
    setTokenSaving(true);
    setTokenMessage(null);
    try {
      const gameKws = tokenKeywords.map(k => FORGE_TO_GAME_KEYWORD[k] || k).filter(Boolean);
      const res = await fetch('/api/token-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          race: tokenRace, name: tokenName,
          keywords: gameKws,
          imageBase64: tokenImageBase64,
          imageMimeType: tokenImageMime,
          updateId: tokenEditId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      setTokenRace(""); setTokenName(""); setTokenKeywords([]); setTokenImageBase64(null); setTokenImageMime(null);
      setTokenImagePreview(null); setTokenEditId(null); setTokenPrompt("");
      setTokenMessage({ ok: true, msg: tokenEditId ? "Template mis à jour" : "Template créé" });
      loadTokenTemplates();
    } catch (err) {
      setTokenMessage({ ok: false, msg: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setTokenSaving(false);
    }
  }, [tokenRace, tokenName, tokenKeywords, tokenImageBase64, tokenImageMime, tokenEditId, loadTokenTemplates]);

  const deleteTokenTemplate = useCallback(async (id: number) => {
    try {
      await fetch('/api/token-templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      loadTokenTemplates();
    } catch { /* ignore */ }
  }, [loadTokenTemplates]);

  const resetManualForm = useCallback(() => {
    setManualName(""); setManualMana(3); setManualAttack(3); setManualDefense(3);
    setManualPower(2); setManualAbility(""); setManualFlavorText("");
    setManualIllustrationPrompt(""); setManualKeywords([]); setKeywordXValues({}); setCard(null);
    setEditedPrompt(null); setSaveResult(null);
    setSpellKeywords([]); setSpellEffectsData(null); setConvocationRace(""); setConvocationTokens([]);
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
    let text: CardText = { name: "", ability: "—", flavorText: "", illustrationPrompt: "" };
    try {
      text = await generateCardText(f, t, r, stats, race || undefined, clan || undefined);
    } catch (err) {
      console.error("[card-forge] generateCardText failed:", err);
    }
    // Keep manually-entered name/ability if set, use API result, or fallback
    if (manualName) text.name = manualName;
    else if (!text.name || text.name === "Carte sans nom") text.name = `${f} ${t}`;
    if (manualAbility) text.ability = manualAbility;
    const newCard: ForgeCard = {
      id: buildId(), name: text.name || "Sans nom",
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
        id: buildId(), name: text.name || "Sans nom",
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
    "Raid": "raid", "Convocations multiples": "convocations_multiples", "Traque": "charge", "Provocation": "taunt", "Bouclier": "divine_shield", "Vol": "ranged",
    // Tier 0
    "Loyauté": "loyaute", "Ancré": "ancre", "Résistance X": "resistance",
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
    // Deck / Race / Clan
    "Traque du destin X": "traque_du_destin", "Sang mêlé": "sang_mele",
    "Fierté du clan": "fierte_du_clan", "Solidarité X": "solidarite",
    "Cycle éternel": "cycle_eternel", "Martyr": "martyr",
    "Instinct de meute X": "instinct_de_meute", "Totem": "totem",
    "Appel du clan X": "appel_du_clan", "Rassemblement X": "rassemblement",
    "Sélection X": "selection",
    "Lycanthropie X": "lycanthropie",
  };

  const [saving, setSaving] = useState(false);
  const [sfxPlayFile, setSfxPlayFile] = useState<{ base64: string; mimeType: string } | null>(null);
  const [sfxDeathFile, setSfxDeathFile] = useState<{ base64: string; mimeType: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);


  const GAME_TO_FORGE_TYPE: Record<string, string> = {
    creature: "Unité", spell: "Sort",
  };
  const GAME_TO_FORGE_KEYWORD: Record<string, string> = Object.fromEntries(
    Object.entries(FORGE_TO_GAME_KEYWORD).map(([k, v]) => [v, k])
  );


  const saveToGame = useCallback(async (forgeCard: ForgeCard) => {
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
            ...buildSpellData(),
            faction: forgeCard.faction,
            race: forgeCard.race || null,
            clan: forgeCard.clan || null,
            card_alignment: forgeCard.cardAlignment || null,
            convocation_race: convocationRace || null,
            convocation_tokens: convocationTokens.length > 0 ? convocationTokens : null,
            lycanthropie_race: lycanthropieRace || null,
            set_id: cardSetId || null,
            card_year: cardYear || null,
            card_month: cardMonth || null,
          },
          imageBase64,
          imageMimeType,
          updateId: undefined,
          sfxPlayBase64: sfxPlayFile?.base64 || null,
          sfxPlayMimeType: sfxPlayFile?.mimeType || null,
          sfxDeathBase64: sfxDeathFile?.base64 || null,
          sfxDeathMimeType: sfxDeathFile?.mimeType || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur serveur');

      setSaveResult({ ok: true, msg: `"${forgeCard.name}" ajoutée !` });
    } catch (err) {
      setSaveResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur inconnue" });
    } finally {
      setSaving(false);
    }
  }, [cardImages, type, spellKeywords, spellEffectsData, convocationRace, convocationTokens, cardSetId, cardYear, cardMonth, lycanthropieRace, sfxPlayFile, sfxDeathFile]);

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

      <div style={{ height: "100vh", background: "#ffffff", fontFamily: "'Cinzel',serif", color: "#333", display: "flex", flexDirection: "column" }}>

        {/* Topbar */}
        <div style={{ padding: "11px 20px", borderBottom: "1px solid #e0e0e0", background: "#fafafa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="/" style={{
              padding: "5px 12px", borderRadius: 6, cursor: "pointer",
              background: "transparent",
              border: "1px solid #ddd",
              color: "#888",
              fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
              transition: "all 0.2s",
              textDecoration: "none",
              display: "flex", alignItems: "center", gap: 4,
            }}>← Menu</a>
            <span style={{ fontSize: 18 }}>⚗️</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#333", letterSpacing: 2.5 }}>CARD FORGE</span>
            <span style={{ fontSize: 8, color: "#aaa", letterSpacing: 2 }}>ARMIES & MAGIC</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {([["forge", "⚒ Forge"], ["edition", "✏ Édition"], ["tokens", "🎭 Tokens"], ["sets", "📦 Sets"], ["formats", "🎮 Formats"], ["bulk", "📦 Masse"], ["budget", "⚖ Budget"], ["schema", "📋 Schéma"], ["prints", "🏷 Séries"]] as const).map(([t, l]) => (
              <button key={t} onClick={() => { setTab(t); if (t === "sets") loadSets(); if (t === "formats") loadFormats(); if (t === "prints") loadPrintsData(); }} style={{
                padding: "5px 14px", borderRadius: 6, cursor: "pointer",
                background: tab === t ? "#333" : "transparent",
                border: `1px solid ${tab === t ? "#333" : "#ddd"}`,
                color: tab === t ? "#fff" : "#888",
                fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                transition: "all 0.2s",
              }}>{l}</button>
            ))}
            <a href="/admin/boards" style={{
              padding: "5px 14px", borderRadius: 6, cursor: "pointer",
              background: "transparent",
              border: "1px solid #ddd",
              color: "#888",
              fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
              transition: "all 0.2s",
              textDecoration: "none",
              display: "flex", alignItems: "center",
            }}>🗺 Plateaux</a>
            <a href="/admin/collections" style={{
              padding: "5px 14px", borderRadius: 6, cursor: "pointer",
              background: "transparent",
              border: "1px solid #ddd",
              color: "#888",
              fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
              transition: "all 0.2s",
              textDecoration: "none",
              display: "flex", alignItems: "center",
            }}>📚 Collections</a>
          </div>
        </div>

        {/* ── FORGE ── */}
        {tab === "forge" && (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

            {/* Controls */}
            <div style={{ width: 235, minHeight: 0, padding: "16px 13px", borderRight: "1px solid #e8e8e8", background: "#fafafa", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
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
                      <button key={r} onClick={() => { setRace(race === r ? "" : r); setClan(""); }} style={{
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

              <Sec title="Set / Année">
                <select value={cardSetId ?? ""} onChange={e => { const v = e.target.value; setCardSetId(v ? parseInt(v) : null); if (v) { setCardYear(null); setCardMonth(null); } }}
                  style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 10, fontFamily: "'Cinzel',serif", marginBottom: 4 }}>
                  <option value="">— Aucun set —</option>
                  {sets.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name} ({s.code})</option>)}
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 8, color: "#888" }}>OU Mois/Année :</span>
                  <select value={cardMonth ?? ""} onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null; setCardMonth(v); if (v && !cardYear) setCardYear(new Date().getFullYear()); if (v) setCardSetId(null); }}
                    disabled={!!cardSetId}
                    style={{ width: 70, padding: "3px 6px", borderRadius: 4, border: "1px solid #e0e0e0", fontSize: 10, fontFamily: "'Cinzel',serif", opacity: cardSetId ? 0.4 : 1 }}>
                    <option value="">Mois</option>
                    {["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"].map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <input type="number" min={2020} max={2040} value={cardYear ?? ""} placeholder="ex: 2026"
                    onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null; setCardYear(v); if (v) setCardSetId(null); }}
                    disabled={!!cardSetId}
                    style={{ width: 60, padding: "3px 6px", borderRadius: 4, border: "1px solid #e0e0e0", fontSize: 10, fontFamily: "'Cinzel',serif", opacity: cardSetId ? 0.4 : 1 }} />
                </div>
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
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 28, background: "#f5f5f5", overflowY: "auto" }}>
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
              {/* SFX par carte */}
              {(card || (forgeMode === "manuel" && manualName)) && !loading && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ fontSize: 9, color: "#888", fontFamily: "'Cinzel',serif" }}>Son d&apos;invocation</label>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const result = reader.result as string;
                          setSfxPlayFile({ base64: result.split(",")[1], mimeType: file.type });
                        };
                        reader.readAsDataURL(file);
                      }}
                      style={{ width: "100%", fontSize: 9, marginTop: 2 }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ fontSize: 9, color: "#888", fontFamily: "'Cinzel',serif" }}>Son de mort</label>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const result = reader.result as string;
                          setSfxDeathFile({ base64: result.split(",")[1], mimeType: file.type });
                        };
                        reader.readAsDataURL(file);
                      }}
                      style={{ width: "100%", fontSize: 9, marginTop: 2 }}
                    />
                  </div>
                </div>
              )}
              {(card || (forgeMode === "manuel" && manualName)) && !loading && (
                <div style={{ display: "flex", gap: 7 }}>
                  {forgeMode === "auto" && <Btn onClick={() => forgeCard()} label="🎲 Re-roll" color="#74b9ff" />}
                  <Btn onClick={() => exportJSON([manualCard])} label="📤 JSON" color="#55efc4" />
                  <Btn onClick={() => { if (!card) createManualCard(); saveToGame(manualCard); }} label={saving ? "⏳ …" : "💾 Nouvelle carte"} color="#ffd54f" />
                </div>
              )}
              {saveResult && !loading && (
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
            <div style={{ width: 240, minHeight: 0, padding: "14px 10px", borderLeft: "1px solid #e8e8e8", background: "#fafafa", overflowY: "auto" }}>

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
                  <div style={{ fontSize: 8, color: "#aaa", letterSpacing: 2 }}>{"ÉDITION"}</div>

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
                          <label style={{ fontSize: 8, color: "#e74c3c", letterSpacing: 1 }}>ATK</label>
                          <input type="number" min={0} max={30} value={manualAttack} onChange={e => setManualAttack(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid #e74c3c44", background: "#fff", color: "#e74c3c", fontFamily: "'Cinzel',serif", fontSize: 14, textAlign: "center", marginTop: 3 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 8, color: "#f1c40f", letterSpacing: 1 }}>DEF</label>
                          <input type="number" min={1} max={30} value={manualDefense} onChange={e => setManualDefense(Math.max(1, parseInt(e.target.value) || 1))}
                            style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid #f1c40f44", background: "#fff", color: "#f1c40f", fontFamily: "'Cinzel',serif", fontSize: 14, textAlign: "center", marginTop: 3 }}
                          />
                        </div>
                      </>
                    ) : (
                      <div style={{ gridColumn: "span 2" }}>
                        <label style={{ fontSize: 8, color: "#9b59b6", letterSpacing: 1 }}>
                          PUISSANCE
                        </label>
                        <input type="number" min={1} max={20} value={manualPower} onChange={e => setManualPower(Math.max(1, parseInt(e.target.value) || 1))}
                          style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid #9b59b644", background: "#fff", color: "#9b59b6", fontFamily: "'Cinzel',serif", fontSize: 14, textAlign: "center", marginTop: 3 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Spell Keywords + Composable Effects Builder */}
                  {type !== "Unité" && (
                    <div style={{ border: "1px solid #9b59b633", borderRadius: 8, padding: 8, background: "#f9f0ff" }}>
                      <label style={{ fontSize: 9, color: "#9b59b6", letterSpacing: 1, fontWeight: 700 }}>EFFETS DU SORT</label>

                      {/* Spell Keywords */}
                      <div style={{ marginTop: 5 }}>
                        <label style={{ fontSize: 8, color: "#666", letterSpacing: 1 }}>SPELL KEYWORDS</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                          {ALL_SPELL_KEYWORDS.map(kwId => {
                            const def = SPELL_KEYWORDS[kwId];
                            const active = spellKeywords.some(k => k.id === kwId);
                            return (
                              <button key={kwId} onClick={() => {
                                if (active) {
                                  setSpellKeywords(prev => prev.filter(k => k.id !== kwId));
                                } else {
                                  const init: SpellKeywordInstance = { id: kwId };
                                  if (def.params.includes("amount")) init.amount = 1;
                                  if (def.params.includes("attack")) init.attack = 1;
                                  if (def.params.includes("health")) init.health = 1;
                                  setSpellKeywords(prev => [...prev, init]);
                                }
                              }}
                                title={def.desc}
                                style={{
                                  padding: "3px 7px", borderRadius: 5, cursor: "pointer", fontSize: 9,
                                  fontFamily: "'Cinzel',serif", fontWeight: active ? 700 : 400,
                                  background: active ? "#9b59b622" : "#fff",
                                  border: `1px solid ${active ? "#9b59b6" : "#e0e0e0"}`,
                                  color: active ? "#9b59b6" : "#999",
                                }}
                              >{def.symbol} {def.label.replace(" X", "").replace(" +X/+Y", "")}</button>
                            );
                          })}
                        </div>

                        {/* Inline params for active keywords */}
                        {spellKeywords.map((kw, idx) => {
                          const def = SPELL_KEYWORDS[kw.id];
                          if (def.params.length === 0) return null;
                          return (
                            <div key={kw.id} style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                              <span style={{ fontSize: 9, color: "#9b59b6", fontWeight: 700, minWidth: 70 }}>{def.symbol} {SPELL_KEYWORD_LABELS[kw.id].replace(" X", "").replace(" +X/+Y", "")}</span>
                              {def.params.includes("amount") && (
                                <div>
                                  <label style={{ fontSize: 7, color: "#666" }}>X</label>
                                  <input type="number" min={1} max={20} value={kw.amount ?? 1}
                                    onChange={e => {
                                      const val = Math.max(1, parseInt(e.target.value) || 1);
                                      setSpellKeywords(prev => prev.map((k, i) => i === idx ? { ...k, amount: val } : k));
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
                                      setSpellKeywords(prev => prev.map((k, i) => i === idx ? { ...k, attack: val } : k));
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
                                      setSpellKeywords(prev => prev.map((k, i) => i === idx ? { ...k, health: val } : k));
                                    }}
                                    style={{ width: 40, padding: "2px 4px", borderRadius: 4, border: "1px solid #f1c40f44", fontSize: 11, textAlign: "center", fontFamily: "'Cinzel',serif", color: "#f1c40f" }}
                                  />
                                </div>
                              )}
                              {kw.id === "invocation" && (
                                <div>
                                  <label style={{ fontSize: 7, color: "#27ae60" }}>Race</label>
                                  <select value={kw.race ?? ""} onChange={e => {
                                    setSpellKeywords(prev => prev.map((k, i) => i === idx ? { ...k, race: e.target.value || undefined } : k));
                                  }}
                                    style={{ padding: "2px 4px", borderRadius: 4, border: "1px solid #27ae6044", fontSize: 9, fontFamily: "'Cinzel',serif", color: "#27ae60" }}>
                                    <option value="">Aucune</option>
                                    {allRaces.map(r => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                </div>
                              )}
                              {kw.id === "invocation_multiple" && (
                                <div style={{ fontSize: 8, color: "#9b59b6", marginTop: 2 }}>Config dans "Tokens à invoquer" ci-dessous</div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Token list for invocation_multiple spell keyword */}
                      {spellKeywords.some(k => k.id === "invocation_multiple") && (
                        <div style={{ marginTop: 6, border: "1px solid #9b59b633", borderRadius: 6, padding: 8, background: "#f0e8ff" }}>
                          <label style={{ fontSize: 8, color: "#9b59b6", letterSpacing: 1, fontWeight: 700 }}>TOKENS A INVOQUER</label>
                          {convocationTokens.map((tok, idx) => (
                            <div key={idx} style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
                              <select value={tok.race} onChange={e => setConvocationTokens(prev => prev.map((t, i) => i === idx ? { ...t, race: e.target.value } : t))}
                                style={{ flex: 1, padding: "2px 4px", borderRadius: 4, border: "1px solid #9b59b644", fontSize: 9, fontFamily: "'Cinzel',serif" }}>
                                <option value="">Race</option>
                                {allRaces.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <input type="number" min={1} max={20} value={tok.attack} onChange={e => setConvocationTokens(prev => prev.map((t, i) => i === idx ? { ...t, attack: Math.max(1, parseInt(e.target.value) || 1) } : t))}
                                style={{ width: 32, padding: "2px", borderRadius: 4, border: "1px solid #e74c3c44", fontSize: 10, textAlign: "center", color: "#e74c3c", fontFamily: "'Cinzel',serif" }} title="ATK" />
                              <span style={{ fontSize: 8, color: "#999" }}>/</span>
                              <input type="number" min={1} max={20} value={tok.health} onChange={e => setConvocationTokens(prev => prev.map((t, i) => i === idx ? { ...t, health: Math.max(1, parseInt(e.target.value) || 1) } : t))}
                                style={{ width: 32, padding: "2px", borderRadius: 4, border: "1px solid #f1c40f44", fontSize: 10, textAlign: "center", color: "#f1c40f", fontFamily: "'Cinzel',serif" }} title="DEF" />
                              <button onClick={() => setConvocationTokens(prev => prev.filter((_, i) => i !== idx))}
                                style={{ padding: "1px 5px", borderRadius: 3, border: "1px solid #f5a3a3", background: "#fde8e8", color: "#e74c3c", fontSize: 8, cursor: "pointer" }}>x</button>
                            </div>
                          ))}
                          <button onClick={() => setConvocationTokens(prev => [...prev, { race: "", attack: 1, health: 1 }])}
                            style={{ marginTop: 4, padding: "2px 8px", borderRadius: 4, border: "1px solid #9b59b644", background: "#fff", color: "#9b59b6", fontSize: 8, cursor: "pointer", fontFamily: "'Cinzel',serif" }}>
                            + Ajouter un token
                          </button>
                        </div>
                      )}

                      {/* Composable Effects (JSON editor for now — full tree builder in future iteration) */}
                      <div style={{ marginTop: 8 }}>
                        <details>
                          <summary style={{ fontSize: 8, color: "#666", letterSpacing: 1, cursor: "pointer" }}>EFFETS COMPOSABLES (avancé)</summary>
                          <textarea
                            value={spellEffectsData ? JSON.stringify(spellEffectsData, null, 2) : ""}
                            placeholder='{"targets":[{"slot":"target_0","type":"enemy_creature"}],"effects":[{"type":"deal_damage","target_slot":"target_0","amount":2}]}'
                            onChange={e => {
                              const val = e.target.value.trim();
                              if (!val) { setSpellEffectsData(null); return; }
                              try {
                                const parsed = JSON.parse(val);
                                setSpellEffectsData(parsed);
                              } catch {
                                // Invalid JSON — don't update
                              }
                            }}
                            style={{
                              width: "100%", minHeight: 80, marginTop: 4, padding: 6,
                              borderRadius: 5, border: "1px solid #9b59b644", background: "#fff",
                              fontFamily: "monospace", fontSize: 9, color: "#333", resize: "vertical",
                            }}
                          />
                          <div style={{ fontSize: 7, color: "#999", marginTop: 2 }}>
                            JSON : targets (slots de cible) + effects (arbre if/then/else)
                          </div>
                        </details>
                      </div>
                    </div>
                  )}

                  {/* Budget */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
                    <div style={{ flex: 1, height: 4, background: "#e8e8e8", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: budgetColor, width: `${Math.min(120, budgetRatio * 100)}%`, transition: "width 0.2s" }} />
                    </div>
                    <span style={{ color: budgetColor, fontWeight: 700, fontFamily: "'Cinzel',serif" }}>{manualBudgetUsed}/{manualBudgetTotal}</span>
                  </div>

                  {/* Capacités */}
                  <div style={{ position: "relative" }}>
                    <label style={{ fontSize: 9, color: "#666", letterSpacing: 1 }}>CAPACITÉS ({manualKeywords.length})</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                      {availableManualKeywords.map(([id, kw]) => {
                        const selected = manualKeywords.includes(id);
                        const isScalable = kw.scalable;
                        return (
                          <div key={id} style={{ display: "inline-flex", alignItems: "center", gap: 2, position: "relative" }}
                            onMouseEnter={e => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredKw({ id, rect });
                            }}
                            onMouseLeave={() => setHoveredKw(null)}
                          >
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
                    {/* Convocation race selector */}
                    {manualKeywords.includes("Convocation X") && (
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <label style={{ fontSize: 8, color: "#f1c40f", letterSpacing: 1, fontWeight: 700 }}>RACE DU TOKEN</label>
                        <select value={convocationRace} onChange={e => setConvocationRace(e.target.value)}
                          style={{ padding: "3px 6px", borderRadius: 5, border: `1px solid ${convocationRace ? "#f1c40f44" : "#e74c3c"}`, fontSize: 9, fontFamily: "'Cinzel',serif", color: convocationRace ? "#f1c40f" : "#e74c3c", background: "#fff" }}>
                          <option value="">-- Choisir une race --</option>
                          {allRaces.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {!convocationRace && <span style={{ fontSize: 8, color: "#e74c3c" }}>Requis</span>}
                      </div>
                    )}
                    {/* Lycanthropie race selector */}
                    {manualKeywords.includes("Lycanthropie X") && (
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <label style={{ fontSize: 8, color: "#8b5cf6", letterSpacing: 1, fontWeight: 700 }}>🐺 RACE LYCANTHROPE</label>
                        <select value={lycanthropieRace} onChange={e => setLycanthropieRace(e.target.value)}
                          style={{ padding: "3px 6px", borderRadius: 5, border: `1px solid ${lycanthropieRace ? "#8b5cf644" : "#e74c3c"}`, fontSize: 9, fontFamily: "'Cinzel',serif", color: lycanthropieRace ? "#8b5cf6" : "#e74c3c", background: "#fff" }}>
                          <option value="">-- Choisir une race --</option>
                          {allRaces.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {!lycanthropieRace && <span style={{ fontSize: 8, color: "#e74c3c" }}>Requis</span>}
                      </div>
                    )}
                    {/* Convocations multiples — token list editor */}
                    {manualKeywords.includes("Convocations multiples") && (
                      <div style={{ marginTop: 6, border: "1px solid #9b59b633", borderRadius: 6, padding: 8, background: "#f9f0ff" }}>
                        <label style={{ fontSize: 8, color: "#9b59b6", letterSpacing: 1, fontWeight: 700 }}>TOKENS A INVOQUER</label>
                        {convocationTokens.map((tok, idx) => (
                          <div key={idx} style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
                            <select value={tok.race} onChange={e => setConvocationTokens(prev => prev.map((t, i) => i === idx ? { ...t, race: e.target.value } : t))}
                              style={{ flex: 1, padding: "2px 4px", borderRadius: 4, border: "1px solid #9b59b644", fontSize: 9, fontFamily: "'Cinzel',serif" }}>
                              <option value="">Race</option>
                              {allRaces.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <input type="number" min={1} max={20} value={tok.attack} onChange={e => setConvocationTokens(prev => prev.map((t, i) => i === idx ? { ...t, attack: Math.max(1, parseInt(e.target.value) || 1) } : t))}
                              style={{ width: 32, padding: "2px", borderRadius: 4, border: "1px solid #e74c3c44", fontSize: 10, textAlign: "center", color: "#e74c3c", fontFamily: "'Cinzel',serif" }} title="ATK" />
                            <span style={{ fontSize: 8, color: "#999" }}>/</span>
                            <input type="number" min={1} max={20} value={tok.health} onChange={e => setConvocationTokens(prev => prev.map((t, i) => i === idx ? { ...t, health: Math.max(1, parseInt(e.target.value) || 1) } : t))}
                              style={{ width: 32, padding: "2px", borderRadius: 4, border: "1px solid #f1c40f44", fontSize: 10, textAlign: "center", color: "#f1c40f", fontFamily: "'Cinzel',serif" }} title="DEF" />
                            <button onClick={() => setConvocationTokens(prev => prev.filter((_, i) => i !== idx))}
                              style={{ padding: "1px 5px", borderRadius: 3, border: "1px solid #f5a3a3", background: "#fde8e8", color: "#e74c3c", fontSize: 8, cursor: "pointer" }}>x</button>
                          </div>
                        ))}
                        <button onClick={() => setConvocationTokens(prev => [...prev, { race: "", attack: 1, health: 1 }])}
                          style={{ marginTop: 4, padding: "2px 8px", borderRadius: 4, border: "1px solid #9b59b644", background: "#fff", color: "#9b59b6", fontSize: 8, cursor: "pointer", fontFamily: "'Cinzel',serif" }}>
                          + Ajouter un token
                        </button>
                      </div>
                    )}
                    {/* Keyword tooltip */}
                    {hoveredKw && KEYWORDS[hoveredKw.id] && (() => {
                      const kwDef = KEYWORDS[hoveredKw.id];
                      const tierLabel = ["Commune+", "Peu Commune+", "Rare+", "Épique+", "Légendaire"][kwDef.minTier] || "";
                      return (
                        <div style={{
                          position: "fixed",
                          left: Math.min(hoveredKw.rect.left, window.innerWidth - 280),
                          top: hoveredKw.rect.bottom + 6,
                          zIndex: 9999,
                          width: 260,
                          padding: "10px 12px",
                          background: "#1a1a2e",
                          border: `1px solid ${fac.color}66`,
                          borderRadius: 8,
                          boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 8px ${fac.color}22`,
                          pointerEvents: "none",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <KeywordIcon symbol={KEYWORD_SYMBOLS[hoveredKw.id] || "✦"} size={16} />
                            <span style={{ fontSize: 13, color: fac.accent, fontWeight: 700, fontFamily: "'Cinzel',serif" }}>{hoveredKw.id}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#ddd", lineHeight: 1.5, fontFamily: "'Crimson Text',serif", marginBottom: 8 }}>
                            {kwDef.desc}
                          </div>
                          <div style={{ display: "flex", gap: 8, fontSize: 10, color: "#999" }}>
                            <span>Tier : <strong style={{ color: "#bbb" }}>{tierLabel}</strong></span>
                            <span>Coût : <strong style={{ color: "#bbb" }}>{kwDef.cost} pts</strong>{kwDef.costPerX > 0 && <> (+{kwDef.costPerX}/X)</>}</span>
                            <span style={{ color: kwDef.zone === "Terrain" ? "#4caf50" : kwDef.zone === "Cimetière" ? "#9b59b6" : kwDef.zone === "Main" ? "#3498db" : "#f39c12" }}>
                              {kwDef.zone}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
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
                                raceId: race || undefined,
                                clanId: clan || undefined,
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

        {/* ── ÉDITION ── */}
        {tab === "edition" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <CardEditor />
          </div>
        )}

        {/* ── TOKENS ── */}
        {tab === "tokens" && (
          <div style={{ flex: 1, padding: 22, overflowY: "auto" }}>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, letterSpacing: 2 }}>TEMPLATES DE TOKENS</h2>

              {/* Status message */}
              {tokenMessage && (
                <div style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 10, marginBottom: 12,
                  background: tokenMessage.ok ? "#e8f8f0" : "#fde8e8",
                  border: `1px solid ${tokenMessage.ok ? "#a3e4c1" : "#f5a3a3"}`,
                  color: tokenMessage.ok ? "#27ae60" : "#e74c3c",
                  fontFamily: "'Crimson Text',serif",
                }}>{tokenMessage.msg}</div>
              )}

              {/* New/Edit form */}
              <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 16, marginBottom: 20, background: "#fafafa" }}>
                <div style={{ fontSize: 10, color: "#666", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
                  {tokenEditId ? "MODIFIER LE TEMPLATE" : "NOUVEAU TEMPLATE"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>RACE</label>
                    <select value={tokenRace} onChange={e => { setTokenRace(e.target.value); if (!tokenName) setTokenName(e.target.value); }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 11, fontFamily: "'Cinzel',serif", marginTop: 2 }}>
                      <option value="">-- Choisir --</option>
                      {allRaces.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>NOM DU TOKEN</label>
                    <input type="text" value={tokenName} onChange={e => setTokenName(e.target.value)}
                      placeholder="Ex: Recrue Elfique"
                      style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 11, fontFamily: "'Cinzel',serif", marginTop: 2 }} />
                  </div>
                </div>

                {/* Keywords */}
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>CAPACITES DU TOKEN</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                    {Object.entries(KEYWORDS).filter(([, kw]) => kw.minTier <= 1).map(([kwName]) => {
                      const active = tokenKeywords.includes(kwName);
                      return (
                        <button key={kwName} onClick={() => {
                          setTokenKeywords(prev => active ? prev.filter(k => k !== kwName) : [...prev, kwName]);
                        }}
                          style={{
                            padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 8,
                            fontFamily: "'Cinzel',serif", fontWeight: active ? 700 : 400,
                            background: active ? "#33333318" : "#fff",
                            border: `1px solid ${active ? "#333" : "#e0e0e0"}`,
                            color: active ? "#333" : "#aaa",
                          }}>{kwName}</button>
                      );
                    })}
                  </div>
                </div>

                {/* Prompt generation */}
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>PROMPT IMAGE</label>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <textarea value={tokenPrompt} onChange={e => setTokenPrompt(e.target.value)}
                      placeholder="Cliquez 'Auto-prompt' pour générer, ou écrivez le vôtre..."
                      style={{ flex: 1, minHeight: 60, padding: 6, borderRadius: 6, border: "1px solid #ddd", fontSize: 10, fontFamily: "monospace", resize: "vertical" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button onClick={generateTokenPrompt} disabled={!tokenRace}
                      style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid #ddd", background: "#fff", color: tokenRace ? "#666" : "#ccc", fontSize: 9, fontFamily: "'Cinzel',serif", cursor: tokenRace ? "pointer" : "default" }}>
                      Auto-prompt
                    </button>
                    <button onClick={generateTokenImage} disabled={!tokenPrompt || tokenGenerating}
                      style={{ padding: "4px 12px", borderRadius: 5, border: "none", background: tokenPrompt && !tokenGenerating ? "linear-gradient(135deg, #6c5ce7, #a855f7)" : "#e0e0e0", color: "#fff", fontSize: 9, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: tokenPrompt && !tokenGenerating ? "pointer" : "default" }}>
                      {tokenGenerating ? "Génération..." : "Générer image"}
                    </button>
                  </div>
                </div>

                {/* Image upload OR generated preview */}
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>OU UPLOADER UNE IMAGE</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                    <input type="file" accept=".png,.jpg,.jpeg,.webp"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = reader.result as string;
                            setTokenImageBase64(dataUrl.split(",")[1]);
                            setTokenImageMime(f.type);
                            setTokenImagePreview(URL.createObjectURL(f));
                          };
                          reader.readAsDataURL(f);
                        }
                      }}
                      style={{ fontSize: 10 }} />
                  </div>
                </div>

                {/* Preview */}
                {tokenImagePreview && (
                  <div style={{ marginTop: 10, textAlign: "center" }}>
                    <img src={tokenImagePreview} alt="preview" style={{ maxWidth: 200, maxHeight: 200, objectFit: "cover", borderRadius: 8, border: "2px solid #ddd" }} />
                  </div>
                )}

                {/* Actions */}
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button onClick={saveTokenTemplate} disabled={!tokenRace || !tokenName || tokenSaving}
                    style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "#333", color: "#fff", fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", opacity: (!tokenRace || !tokenName || tokenSaving) ? 0.4 : 1 }}>
                    {tokenSaving ? "Sauvegarde..." : tokenEditId ? "Mettre a jour" : "Creer"}
                  </button>
                  {tokenEditId && (
                    <button onClick={() => { setTokenEditId(null); setTokenRace(""); setTokenName(""); setTokenImageBase64(null); setTokenImageMime(null); setTokenImagePreview(null); setTokenPrompt(""); }}
                      style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", color: "#888", fontSize: 10, fontFamily: "'Cinzel',serif", cursor: "pointer" }}>
                      Annuler
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, color: "#666", letterSpacing: 1, fontWeight: 700 }}>
                    TEMPLATES EXISTANTS ({tokenTemplates.length})
                  </span>
                  <button onClick={loadTokenTemplates} style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid #ddd", background: "#fff", color: "#666", fontSize: 9, fontFamily: "'Cinzel',serif", cursor: "pointer" }}>
                    Charger / Rafraichir
                  </button>
                </div>
                {tokenTemplates.length === 0 && (
                  <div style={{ color: "#ccc", fontSize: 11, textAlign: "center", padding: 20 }}>Aucun template — cliquez Charger</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {tokenTemplates.map(t => (
                    <div key={t.id} style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                      {t.image_url ? (
                        <img src={t.image_url} alt={t.name} style={{ width: "100%", height: 120, objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: 120, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>⚔️</div>
                      )}
                      <div style={{ padding: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{t.name}</div>
                        <div style={{ fontSize: 9, color: "#888" }}>{t.race}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button onClick={() => { setTokenEditId(t.id); setTokenRace(t.race); setTokenName(t.name); setTokenKeywords((t as { keywords?: string[] }).keywords?.map(k => GAME_TO_FORGE_KEYWORD[k] || k) ?? []); setTokenImagePreview(t.image_url); setTokenImageBase64(null); setTokenImageMime(null); setTokenPrompt(""); }}
                            style={{ fontSize: 8, padding: "2px 8px", borderRadius: 4, border: "1px solid #ddd", background: "#fff", color: "#666", cursor: "pointer", fontFamily: "'Cinzel',serif" }}>
                            Modifier
                          </button>
                          <button onClick={() => deleteTokenTemplate(t.id)}
                            style={{ fontSize: 8, padding: "2px 8px", borderRadius: 4, border: "1px solid #f5a3a3", background: "#fde8e8", color: "#e74c3c", cursor: "pointer", fontFamily: "'Cinzel',serif" }}>
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SETS ── */}
        {tab === "sets" && (
          <div style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16 }}>
              <h3 style={{ fontSize: 11, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 12, letterSpacing: 1 }}>
                CRÉER UN SET
              </h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input value={newSetName} onChange={e => setNewSetName(e.target.value)} placeholder="Nom (ex: Set de Base)"
                  style={{ flex: 2, padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 11, fontFamily: "'Cinzel',serif" }} />
                <input value={newSetCode} onChange={e => setNewSetCode(e.target.value.toUpperCase())} placeholder="Code (ex: BASE)" maxLength={8}
                  style={{ width: 80, padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 11, fontFamily: "'Cinzel',serif", textTransform: "uppercase" }} />
                <input value={newSetIcon} onChange={e => setNewSetIcon(e.target.value)} placeholder="Icône"
                  style={{ width: 40, padding: "6px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 14, textAlign: "center" }} />
                <input type="date" value={newSetReleasedAt} onChange={e => setNewSetReleasedAt(e.target.value)} title="Date de sortie"
                  style={{ padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 11, fontFamily: "'Cinzel',serif" }} />
                <button onClick={async () => {
                  if (!newSetName || !newSetCode) return;
                  const res = await fetch('/api/sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newSetName, code: newSetCode, icon: newSetIcon, released_at: newSetReleasedAt || null }) });
                  if (res.ok) { setNewSetName(""); setNewSetCode(""); setNewSetIcon("⚔️"); setNewSetReleasedAt(""); loadSets(); }
                }} disabled={!newSetName || !newSetCode}
                  style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "#333", color: "#fff", fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", opacity: (!newSetName || !newSetCode) ? 0.4 : 1 }}>
                  Créer
                </button>
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16 }}>
              <h3 style={{ fontSize: 11, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 12, letterSpacing: 1 }}>
                SETS EXISTANTS ({sets.length})
              </h3>
              {sets.length === 0 && <p style={{ fontSize: 10, color: "#aaa" }}>Aucun set créé</p>}
              {sets.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Cinzel',serif" }}>{s.name}</div>
                    <div style={{ fontSize: 9, color: "#888" }}>{s.code}{s.released_at ? ` — ${s.released_at}` : ''}</div>
                  </div>
                  <button onClick={async () => {
                    const res = await fetch('/api/sets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) });
                    const data = await res.json();
                    if (res.ok) loadSets();
                    else alert(data.error || "Erreur");
                  }} style={{ fontSize: 8, padding: "3px 10px", borderRadius: 4, border: "1px solid #f5a3a3", background: "#fde8e8", color: "#e74c3c", cursor: "pointer", fontFamily: "'Cinzel',serif" }}>
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FORMATS ── */}
        {tab === "formats" && (
          <div style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
            {formats.length === 0 && (
              <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, textAlign: "center" }}>
                <p style={{ fontSize: 10, color: "#aaa" }}>Aucun format trouvé. Vérifiez que la table &quot;formats&quot; est créée et peuplée.</p>
              </div>
            )}
            {formats.map(fmt => (
              <div key={fmt.id} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <h3 style={{ fontSize: 12, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", letterSpacing: 1, margin: 0 }}>
                    {fmt.name}
                  </h3>
                  <span style={{
                    fontSize: 8, padding: "2px 8px", borderRadius: 4, fontFamily: "'Cinzel',serif", fontWeight: 700,
                    background: fmt.is_active ? "#e8f5e9" : "#fde8e8",
                    color: fmt.is_active ? "#2e7d32" : "#e74c3c",
                    border: `1px solid ${fmt.is_active ? "#a5d6a7" : "#f5a3a3"}`,
                  }}>
                    {fmt.is_active ? "Actif" : "Inactif"}
                  </span>
                </div>
                {fmt.description && <p style={{ fontSize: 9, color: "#888", marginBottom: 8 }}>{fmt.description}</p>}

                {fmt.code === "standard" && (
                  <div style={{ fontSize: 9, color: "#666", lineHeight: 1.8 }}>
                    <div><strong>Set de base :</strong> {sets.find(s => s.code === "BASE") ? `${sets.find(s => s.code === "BASE")!.icon} ${sets.find(s => s.code === "BASE")!.name}` : "Non trouvé"}</div>
                    <div><strong>2 dernières extensions :</strong> {
                      sets.filter(s => s.code !== "BASE" && s.released_at)
                        .sort((a, b) => new Date(b.released_at!).getTime() - new Date(a.released_at!).getTime())
                        .slice(0, 2)
                        .map(s => `${s.icon} ${s.name}`).join(", ") || "Aucune"
                    }</div>
                    <div>+ Cartes sans extension de moins de 2 ans</div>
                  </div>
                )}

                {fmt.code === "etendu" && (
                  <p style={{ fontSize: 9, color: "#666" }}>Toutes les cartes sont jouables.</p>
                )}

                {fmt.code === "basique" && (
                  <p style={{ fontSize: 9, color: "#666" }}>Mêmes règles que Standard, uniquement rareté <strong>Commune</strong>.</p>
                )}

                {fmt.code === "variable" && (
                  <div>
                    <p style={{ fontSize: 9, color: "#888", marginBottom: 8 }}>Extensions incluses (+ set de base + cartes sans extension &lt; 2 ans) :</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {sets.filter(s => s.code !== "BASE").map(s => {
                        const isSelected = variableSetIds.includes(s.id);
                        return (
                          <button key={s.id} onClick={() => setVariableSetIds(prev => isSelected ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                            style={{
                              padding: "4px 10px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: "'Cinzel',serif", transition: "all 0.15s",
                              border: `1px solid ${isSelected ? "#4caf50" : "#e0e0e0"}`,
                              background: isSelected ? "#e8f5e9" : "#fafafa",
                              color: isSelected ? "#2e7d32" : "#666",
                              fontWeight: isSelected ? 700 : 400,
                            }}>
                            {s.icon} {s.name}
                          </button>
                        );
                      })}
                      {sets.filter(s => s.code !== "BASE").length === 0 && <span style={{ fontSize: 9, color: "#aaa" }}>Aucune extension</span>}
                    </div>
                    <button onClick={async () => {
                      setSavingFormats(true);
                      try {
                        await fetch(`/api/formats/${fmt.id}/sets`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ set_ids: variableSetIds }),
                        });
                      } catch { /* ignore */ }
                      setSavingFormats(false);
                    }} disabled={savingFormats}
                      style={{
                        padding: "5px 16px", borderRadius: 6, border: "none", background: "#333", color: "#fff",
                        fontSize: 9, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: savingFormats ? "wait" : "pointer",
                        opacity: savingFormats ? 0.5 : 1,
                      }}>
                      {savingFormats ? "Sauvegarde..." : "Sauvegarder"}
                    </button>
                  </div>
                )}
              </div>
            ))}
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
  keywords: ["Armure", "Résistance X"],
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

        {/* ── PRINTS (Séries Limitées) ── */}
        {tab === "prints" && (
          <div style={{ flex: 1, padding: 22, overflowY: "auto" }}>
            <div style={{ fontSize: 8, color: "#aaa", letterSpacing: 2, marginBottom: 16 }}>SÉRIES LIMITÉES — ATTRIBUTION</div>

            {printsCards.length === 0 ? (
              <div style={{ color: "#aaa", fontSize: 12, textAlign: "center", marginTop: 40 }}>Aucune carte forgée avec date en base.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, maxWidth: 1000 }}>
                {/* Left: card list */}
                <div>
                  <input
                    type="text"
                    value={printsSearch}
                    onChange={(e) => setPrintsSearch(e.target.value)}
                    placeholder="Rechercher..."
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: 11, marginBottom: 8, fontFamily: "'Cinzel',serif" }}
                  />
                  <div style={{ background: "#fafafa", borderRadius: 8, border: "1px solid #e0e0e0", maxHeight: 500, overflowY: "auto" }}>
                    {printsCards
                      .filter(c => !printsSearch || c.name.toLowerCase().includes(printsSearch.toLowerCase()))
                      .map(c => (
                        <div
                          key={c.id}
                          onClick={() => { setSelectedPrintCard({ id: c.id, name: c.name, rarity: c.rarity }); loadPrintsList(c.id); }}
                          style={{
                            padding: "7px 10px", cursor: "pointer", fontSize: 11,
                            borderBottom: "1px solid #eee", fontFamily: "'Cinzel',serif",
                            background: selectedPrintCard?.id === c.id ? "#ffd70018" : "transparent",
                            borderLeft: selectedPrintCard?.id === c.id ? "3px solid #ffd700" : "3px solid transparent",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}
                        >
                          <span>
                            <span style={{ color: "#4fc3f7", fontWeight: 700, marginRight: 6 }}>{c.mana_cost}</span>
                            {c.name}
                            {c.rarity && <span style={{ color: "#aaa", marginLeft: 6 }}>({c.rarity})</span>}
                          </span>
                          <span style={{ fontSize: 9, color: "#bbb" }}>{c.card_year}/{String(c.card_month).padStart(2, "0")}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Right: prints detail */}
                <div>
                  {!selectedPrintCard ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#bbb", fontSize: 11, background: "#fafafa", borderRadius: 8, border: "1px solid #e0e0e0" }}>
                      Sélectionner une carte pour voir ses exemplaires
                    </div>
                  ) : printsLoading ? (
                    <div style={{ padding: 20, color: "#aaa", fontSize: 11 }}>Chargement...</div>
                  ) : (
                    <div style={{ background: "#fafafa", borderRadius: 8, border: "1px solid #e0e0e0", padding: 14 }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Cinzel',serif" }}>{selectedPrintCard.name}</div>
                        <div style={{ fontSize: 10, color: "#888" }}>
                          {selectedPrintCard.rarity} — {printsList.length} exemplaires — {printsList.filter(p => p.owner_id).length} attribués, {printsList.filter(p => !p.owner_id).length} disponibles
                        </div>
                      </div>

                      <div style={{ maxHeight: 440, overflowY: "auto" }}>
                        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", fontFamily: "'Cinzel',serif" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #e0e0e0", textAlign: "left" }}>
                              <th style={{ padding: "5px 8px", fontWeight: 700, fontSize: 9, letterSpacing: 0.5 }}>#</th>
                              <th style={{ padding: "5px 8px", fontWeight: 700, fontSize: 9, letterSpacing: 0.5 }}>PROPRIÉTAIRE</th>
                              <th style={{ padding: "5px 8px", fontWeight: 700, fontSize: 9, letterSpacing: 0.5 }}>ÉCHANGEABLE</th>
                              <th style={{ padding: "5px 8px", fontWeight: 700, fontSize: 9, letterSpacing: 0.5 }}>ACTIONS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {printsList.map(p => (
                              <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                                <td style={{ padding: "5px 8px", fontWeight: 700, color: "#ffd700" }}>#{p.print_number}/{p.max_prints}</td>
                                <td style={{ padding: "5px 8px" }}>
                                  {p.owner_username
                                    ? <span style={{ color: "#27ae60", fontWeight: 600 }}>{p.owner_username}</span>
                                    : <span style={{ color: "#ccc" }}>— disponible —</span>}
                                </td>
                                <td style={{ padding: "5px 8px" }}>
                                  <button onClick={() => togglePrintTradeable(p.id, p.is_tradeable)} style={{
                                    padding: "2px 8px", borderRadius: 4, border: "none", fontSize: 9, fontWeight: 700, cursor: "pointer",
                                    background: p.is_tradeable ? "#27ae6022" : "#e74c3c22",
                                    color: p.is_tradeable ? "#27ae60" : "#e74c3c",
                                  }}>{p.is_tradeable ? "Oui" : "Non"}</button>
                                </td>
                                <td style={{ padding: "5px 8px" }}>
                                  {p.owner_id ? (
                                    <button onClick={() => assignPrint(p.id, null)} style={{
                                      padding: "3px 10px", borderRadius: 5, border: "none", background: "#e74c3c22", color: "#e74c3c", fontSize: 9, fontWeight: 700, cursor: "pointer",
                                    }}>Retirer</button>
                                  ) : (
                                    <select value="" onChange={(e) => { if (e.target.value) assignPrint(p.id, e.target.value); }} style={{
                                      padding: "3px 6px", borderRadius: 5, border: "1px solid #ddd", fontSize: 9, fontFamily: "'Cinzel',serif",
                                    }}>
                                      <option value="">Attribuer à...</option>
                                      {printsProfiles.map(prof => (
                                        <option key={prof.id} value={prof.id}>{prof.username}</option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
