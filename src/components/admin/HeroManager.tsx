"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF } from "@react-three/drei";
import type { TokenTemplate } from "@/lib/game/types";
import TokenCascadePicker from "@/components/admin/TokenCascadePicker";
import { FACTIONS } from "@/lib/card-engine/constants";
import { ABILITIES } from "@/lib/game/abilities";
import { autoTrimDarkBorders } from "@/lib/card-back-frames";

const RACES = [
  "humans", "elves", "dwarves", "halflings",
  "beastmen", "giants", "dark_elves", "orcs_goblins", "undead",
] as const;
type Race = typeof RACES[number];

const RACE_LABELS: Record<Race, string> = {
  humans: "Humains",
  elves: "Elfes",
  dwarves: "Nains",
  halflings: "Halflings",
  beastmen: "Hommes-bêtes",
  giants: "Géants",
  dark_elves: "Elfes noirs",
  orcs_goblins: "Orcs & Gobelins",
  undead: "Morts-vivants",
};

// Sensible initial values for the form. Faction is picked first, then the
// race dropdown shows only the races registered in FACTIONS[faction].races.
const INITIAL_FACTION = "Humains";
const INITIAL_RACE = "Humains";

const FACTION_IDS = Object.keys(FACTIONS);

// Map a race string (granular like "Aigles Géants" or legacy simplified like
// "elves") to the user-facing label. Granular races already are the label.
function raceDisplayLabel(r: string): string {
  if (r in RACE_LABELS) return RACE_LABELS[r as Race];
  return r;
}

const RARITIES = ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"];
const DEFAULT_MAX_PRINTS: Record<string, number> = {
  "Légendaire": 1,
  "Épique": 10,
  "Rare": 100,
  "Peu Commune": 1000,
};

// Re-encodes a base64 image to a smaller WebP (preserves alpha, much
// smaller than PNG). Used after AI image generation to keep the in-state
// payload reasonable — Imagen/Gemini PNGs can hit 5+ MB which makes the
// /api/heroes JSON body too big to ship in one request.
async function compressBase64Image(
  base64: string,
  mime: string,
  maxDim: number = 768,
  quality: number = 0.85,
): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/webp", quality);
      resolve({
        base64: dataUrl.split(",")[1],
        mime: "image/webp",
      });
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = `data:${mime};base64,${base64}`;
  });
}

// Power system V2 — see /Users/encellefabrice/.claude/plans/tender-tickling-wilkes.md
// for the design. A hero power is (mode, keywordId, params, tokenId?).

const POWER_MODE_LABELS: Record<"grant_keyword" | "spell_trigger" | "aura", string> = {
  grant_keyword: "1. Donner la capacité à une créature ciblée",
  spell_trigger: "2. Déclencher l'effet une fois (comme un sort)",
  aura: "3. Activer comme aura persistante (cumulable)",
};

// Imports below — ABILITIES is the unified registry shared with creature
// + spell sides. We pick the picker entries from there.

interface HeroRow {
  id: number;
  name: string;
  race: string;
  faction: string | null;
  clan: string | null;
  power_name: string | null;
  power_type: "active" | "passive" | null;
  power_cost: number | null;
  power_effect: Record<string, unknown> | null;
  power_description: string | null;
  power_usage_limit: number | null;
  power_image_url: string | null;
  glb_url: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  rarity: string | null;
  max_prints: number | null;
  is_default: boolean;
  created_at: string;
}

const STYLE = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 12, letterSpacing: 1 } as React.CSSProperties,
  label: { fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 0.5 } as React.CSSProperties,
  input: { width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4, fontFamily: "'Crimson Text',serif" } as React.CSSProperties,
  badge: { fontSize: 9, padding: "2px 8px", borderRadius: 4, fontFamily: "'Cinzel',serif", fontWeight: 700 } as React.CSSProperties,
  button: { padding: "6px 20px", borderRadius: 6, border: "none", background: "#333", color: "#fff", fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
};

function GlbPreview({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene} />;
}

export default function HeroManager() {
  const [heroes, setHeroes] = useState<HeroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [race, setRace] = useState<string>(INITIAL_RACE);
  const [faction, setFaction] = useState<string>(INITIAL_FACTION);
  const [clan, setClan] = useState<string>("");
  const [generatingPortrait, setGeneratingPortrait] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [extraContext, setExtraContext] = useState("");
  const [composedPrompt, setComposedPrompt] = useState("");
  const [composingPrompt, setComposingPrompt] = useState(false);
  const [refImageBase64, setRefImageBase64] = useState<string | null>(null);
  const [refImageMime, setRefImageMime] = useState<string | null>(null);
  const [refImagePreview, setRefImagePreview] = useState<string | null>(null);
  const [useReference, setUseReference] = useState(false);
  // Power image (cast overlay illustration). Independent flow from the
  // portrait — generated using the hero portrait as multimodal reference.
  const [actionContext, setActionContext] = useState("");
  const [composedPowerPrompt, setComposedPowerPrompt] = useState("");
  const [composingPowerPrompt, setComposingPowerPrompt] = useState(false);
  const [generatingPowerImage, setGeneratingPowerImage] = useState(false);
  const [powerImageBase64, setPowerImageBase64] = useState<string | null>(null);
  const [powerImageMime, setPowerImageMime] = useState<string | null>(null);
  const [powerImagePreview, setPowerImagePreview] = useState<string | null>(null);
  const [powerImageError, setPowerImageError] = useState<string | null>(null);
  const [powerName, setPowerName] = useState("");
  const [powerCost, setPowerCost] = useState<number>(2);
  // V2 power system : (mode, keywordId, params).
  const [powerMode, setPowerMode] = useState<"grant_keyword" | "spell_trigger" | "aura">("grant_keyword");
  const [powerKeywordId, setPowerKeywordId] = useState<string>("divine_shield");
  const [powerParamAmount, setPowerParamAmount] = useState<number>(1);
  const [powerParamAttack, setPowerParamAttack] = useState<number>(0);
  const [powerParamHealth, setPowerParamHealth] = useState<number>(0);
  const [powerTokenId, setPowerTokenId] = useState<number | null>(null);
  // null = unlimited
  const [powerUsageLimit, setPowerUsageLimit] = useState<number | null>(null);

  // Token registry (reused by the cascade picker for summon_token).
  const [tokenTemplates, setTokenTemplates] = useState<TokenTemplate[]>([]);
  useEffect(() => {
    fetch("/api/token-templates")
      .then(r => r.ok ? r.json() : [])
      .then((data) => Array.isArray(data) ? setTokenTemplates(data) : null)
      .catch(() => { /* ignore */ });
  }, []);
  const [powerDescription, setPowerDescription] = useState("");
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [glbPreviewUrl, setGlbPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [thumbnailBase64, setThumbnailBase64] = useState<string | null>(null);
  const [thumbnailMimeType, setThumbnailMimeType] = useState<string | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [rarity, setRarity] = useState<string>("Commune");
  const [maxPrints, setMaxPrints] = useState<number | null>(null);
  const [isDefault, setIsDefault] = useState(false);

  // null = mode création ; number = id du héros en cours d'édition.
  const [editingHeroId, setEditingHeroId] = useState<number | null>(null);
  const isEditing = editingHeroId !== null;
  // Référence vers la ligne héros en cours d'édition — utilisée pour afficher
  // les fichiers actuels (GLB notamment) dans le formulaire.
  const editingHero = useMemo<HeroRow | null>(() => {
    if (editingHeroId === null) return null;
    return heroes.find(h => h.id === editingHeroId) ?? null;
  }, [editingHeroId, heroes]);

  const loadHeroes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/heroes");
      const data = await res.json();
      setHeroes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur chargement héros:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadHeroes(); }, [loadHeroes]);

  // Revoke blob URL when replaced
  useEffect(() => {
    return () => {
      if (glbPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(glbPreviewUrl);
    };
  }, [glbPreviewUrl]);

  // Available races derived from the selected faction. Faction is the parent
  // category (Elfes, Hommes-Bêtes, …); race is the granular kind within it
  // (Elfes / Aigles Géants / Fées for the Elfes faction, etc.).
  const availableRaces = useMemo<string[]>(() => {
    if (!faction) return [];
    return FACTIONS[faction]?.races ?? [];
  }, [faction]);

  // Available clans for the currently selected faction. Some factions
  // (Élémentaires, Mercenaires) don't define clans → empty list disables the
  // dropdown.
  const availableClans = useMemo<string[]>(() => {
    if (!faction) return [];
    return FACTIONS[faction]?.clans?.names ?? [];
  }, [faction]);

  // When the faction changes, snap the race onto a valid value for the new
  // faction (or empty if the user picked "Aucune"). En édition la race est
  // verrouillée — on n'écrase jamais la valeur originale, même si la faction
  // change pour une qui ne la contient pas dans sa liste.
  useEffect(() => {
    if (isEditing) return;
    if (availableRaces.length === 0) {
      if (race !== "") setRace("");
      return;
    }
    if (!availableRaces.includes(race)) {
      setRace(availableRaces[0]);
    }
  }, [availableRaces, race, isEditing]);

  // Reset clan when it's no longer valid for the selected faction.
  useEffect(() => {
    if (clan && !availableClans.includes(clan)) {
      setClan("");
    }
  }, [availableClans, clan]);

  const handleGlbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".glb") && !lower.endsWith(".gltf")) {
      setError("Format non supporté — .glb ou .gltf requis");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Fichier trop lourd (max 100 Mo)");
      return;
    }
    setError(null);
    setGlbFile(file);
    if (glbPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(glbPreviewUrl);
    setGlbPreviewUrl(URL.createObjectURL(file));
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    img.onload = () => {
      const MAX = 512;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/webp", 0.85);
      const base64 = dataUrl.split(",")[1];
      setThumbnailBase64(base64);
      setThumbnailMimeType("image/webp");
      setThumbnailPreview(dataUrl);
    };
    img.src = URL.createObjectURL(file);
  };

  const resetForm = () => {
    setName("");
    setFaction(INITIAL_FACTION);
    setRace(INITIAL_RACE);
    setClan("");
    setPortraitError(null);
    setExtraContext("");
    setComposedPrompt("");
    setRefImageBase64(null);
    setRefImageMime(null);
    setRefImagePreview(null);
    setUseReference(false);
    setActionContext("");
    setComposedPowerPrompt("");
    setPowerImageBase64(null);
    setPowerImageMime(null);
    setPowerImagePreview(null);
    setPowerImageError(null);
    setPowerName("");
    setPowerCost(2);
    setPowerMode("grant_keyword");
    setPowerKeywordId("divine_shield");
    setPowerParamAmount(1);
    setPowerParamAttack(0);
    setPowerParamHealth(0);
    setPowerTokenId(null);
    setPowerUsageLimit(null);
    setPowerDescription("");
    if (glbPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(glbPreviewUrl);
    setGlbFile(null);
    setGlbPreviewUrl(null);
    setUploadProgress(null);
    setThumbnailBase64(null);
    setThumbnailMimeType(null);
    setThumbnailPreview(null);
    setRarity("Commune");
    setMaxPrints(null);
    setIsDefault(false);
    setEditingHeroId(null);
    setError(null);
    setMessage(null);
  };

  // Charge un héros existant dans le formulaire et bascule en mode édition.
  // Les champs IA (prompts, ref images) sont remis à zéro car ils ne se
  // transmettent pas d'un héros à l'autre. Les fichiers (GLB / thumbnail /
  // power image) restent vides côté base64 — l'aperçu pointe sur l'URL
  // distante existante, et le PUT n'écrasera ces fichiers que si l'utilisateur
  // re-uploade ou régénère via IA.
  const loadHeroIntoForm = (hero: HeroRow) => {
    setName(hero.name ?? "");
    setFaction(hero.faction ?? "");
    setRace(hero.race ?? "");
    setClan(hero.clan ?? "");

    setPowerName(hero.power_name ?? "");
    setPowerCost(typeof hero.power_cost === "number" ? hero.power_cost : 2);
    setPowerDescription(hero.power_description ?? "");
    const pe = (hero.power_effect ?? {}) as Record<string, unknown>;
    const mode = pe.mode === "spell_trigger" || pe.mode === "aura" ? pe.mode : "grant_keyword";
    setPowerMode(mode as "grant_keyword" | "spell_trigger" | "aura");
    const kwid = typeof pe.keywordId === "string" && pe.keywordId in ABILITIES ? pe.keywordId : "divine_shield";
    setPowerKeywordId(kwid);
    const params = (pe.params ?? {}) as Record<string, unknown>;
    setPowerParamAmount(typeof params.amount === "number" ? params.amount : 1);
    setPowerParamAttack(typeof params.attack === "number" ? params.attack : 0);
    setPowerParamHealth(typeof params.health === "number" ? params.health : 0);
    setPowerTokenId(typeof pe.tokenId === "number" ? pe.tokenId : null);
    setPowerUsageLimit(typeof hero.power_usage_limit === "number" ? hero.power_usage_limit : null);

    setRarity(hero.rarity ?? "Commune");
    setMaxPrints(hero.max_prints ?? null);
    setIsDefault(!!hero.is_default);

    setThumbnailBase64(null);
    setThumbnailMimeType(null);
    setThumbnailPreview(hero.thumbnail_url ?? null);
    setPowerImageBase64(null);
    setPowerImageMime(null);
    setPowerImagePreview(hero.power_image_url ?? null);

    if (glbPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(glbPreviewUrl);
    setGlbFile(null);
    setGlbPreviewUrl(null);

    setExtraContext("");
    setComposedPrompt("");
    setRefImageBase64(null);
    setRefImageMime(null);
    setRefImagePreview(null);
    setUseReference(false);
    setActionContext("");
    setComposedPowerPrompt("");
    setPortraitError(null);
    setPowerImageError(null);

    setEditingHeroId(hero.id);
    setError(null);
    setMessage(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    img.onload = () => {
      const MAX = 768;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.split(",")[1];
      setRefImageBase64(base64);
      setRefImageMime("image/jpeg");
      setRefImagePreview(dataUrl);
      setUseReference(true);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleRemoveRefImage = () => {
    setRefImageBase64(null);
    setRefImageMime(null);
    setRefImagePreview(null);
    setUseReference(false);
  };

  const handleComposePrompt = async () => {
    setComposingPrompt(true);
    setPortraitError(null);
    try {
      const res = await fetch("/api/heroes/compose-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          race,
          faction: faction || null,
          clan: clan || null,
          extraContext: extraContext.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPortraitError(data.error || `Erreur ${res.status}`);
        return;
      }
      setComposedPrompt(data.prompt || "");
    } catch (err) {
      setPortraitError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setComposingPrompt(false);
    }
  };

  const handleGeneratePortrait = async () => {
    if (!composedPrompt.trim()) {
      setPortraitError("Compose d'abord le prompt (étape 1).");
      return;
    }
    setGeneratingPortrait(true);
    setPortraitError(null);
    try {
      const body: Record<string, unknown> = {
        prompt: composedPrompt,
        race, // kept for telemetry / fallback validation
        useReference: useReference && !!refImageBase64,
      };
      if (useReference && refImageBase64 && refImageMime) {
        body.referenceImageBase64 = refImageBase64;
        body.referenceImageMimeType = refImageMime;
      }
      const res = await fetch("/api/heroes/generate-portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setPortraitError(data.error || `Erreur ${res.status}`);
        return;
      }
      // Re-encode the AI PNG (often 3-6 MB base64) to WebP so the eventual
      // /api/heroes save body stays under the JSON parse ceiling.
      const compressed = await compressBase64Image(
        data.imageBase64,
        data.mimeType || "image/png",
        768,
      );
      setThumbnailBase64(compressed.base64);
      setThumbnailMimeType(compressed.mime);
      setThumbnailPreview(`data:${compressed.mime};base64,${compressed.base64}`);
    } catch (err) {
      setPortraitError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setGeneratingPortrait(false);
    }
  };

  const handlePowerImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    img.onload = () => {
      const MAX = 768;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.split(",")[1];
      setPowerImageBase64(base64);
      setPowerImageMime("image/jpeg");
      setPowerImagePreview(dataUrl);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleRemovePowerImage = () => {
    setPowerImageBase64(null);
    setPowerImageMime(null);
    setPowerImagePreview(null);
  };

  const handleComposePowerPrompt = async () => {
    setComposingPowerPrompt(true);
    setPowerImageError(null);
    try {
      const res = await fetch("/api/heroes/compose-power-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          race,
          faction: faction || null,
          clan: clan || null,
          powerName: powerName.trim() || null,
          powerDescription: powerDescription.trim() || null,
          actionContext: actionContext.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPowerImageError(data.error || `Erreur ${res.status}`);
        return;
      }
      setComposedPowerPrompt(data.prompt || "");
    } catch (err) {
      setPowerImageError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setComposingPowerPrompt(false);
    }
  };

  const handleGeneratePowerImage = async () => {
    if (!composedPowerPrompt.trim()) {
      setPowerImageError("Compose d'abord le prompt (étape 1).");
      return;
    }
    // In edit mode the existing portrait lives only as a remote URL
    // (`thumbnailPreview`) — `thumbnailBase64` stays null until the user
    // re-uploads or regenerates. Fetch the URL and decode it to base64
    // on the fly so the user doesn't have to regenerate the portrait
    // just to refresh the power visual.
    let refBase64 = thumbnailBase64;
    let refMime = thumbnailMimeType;
    if ((!refBase64 || !refMime) && thumbnailPreview) {
      try {
        const r = await fetch(thumbnailPreview);
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        const blob = await r.blob();
        refMime = blob.type || "image/webp";
        refBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(",");
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        setPowerImageError(`Impossible de charger le portrait existant comme référence (${err instanceof Error ? err.message : "erreur réseau"}). Régénère ou re-upload le portrait.`);
        return;
      }
    }
    if (!refBase64 || !refMime) {
      setPowerImageError("Génère ou upload d'abord le portrait du héros — il sert de référence visuelle.");
      return;
    }
    setGeneratingPowerImage(true);
    setPowerImageError(null);
    try {
      const res = await fetch("/api/heroes/generate-power-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: composedPowerPrompt,
          referenceImageBase64: refBase64,
          referenceImageMimeType: refMime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPowerImageError(data.error || `Erreur ${res.status}`);
        return;
      }
      // Same trick que le card forge : Gemini renvoie souvent l'art en 5:7
      // mais avec des bandes noires en haut/bas (letterbox). On coupe d'abord
      // les bordures uniformes avant de réencoder, sinon le HeroPowerCastOverlay
      // affiche le letterbox tel quel.
      const trimmed = await autoTrimDarkBorders(
        data.imageBase64,
        data.mimeType || "image/png",
      );
      // Re-encode to WebP at 768 px max — the cast overlay shows it at
      // 252×350, so plenty of headroom while keeping the body small enough
      // to ship to /api/heroes alongside the portrait base64.
      const compressed = await compressBase64Image(
        trimmed.base64,
        trimmed.mime,
        768,
      );
      setPowerImageBase64(compressed.base64);
      setPowerImageMime(compressed.mime);
      setPowerImagePreview(`data:${compressed.mime};base64,${compressed.base64}`);
    } catch (err) {
      setPowerImageError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setGeneratingPowerImage(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Nom requis");
      return;
    }
    // En création, le héros doit avoir au moins un visuel (GLB OU
    // thumbnail) sinon l'in-game tombe sur un placeholder. En édition,
    // le héros existant en base a déjà ces fichiers — on n'exige rien
    // de nouveau, l'utilisateur peut juste retoucher des champs texte.
    if (!isEditing && !glbFile && !thumbnailBase64) {
      setError("Modèle 3D (GLB) ou image 2D requis");
      return;
    }
    // Build the V2 power effect from the form state. Only include params
    // that the chosen keyword actually consumes (server validates).
    const ability = ABILITIES[powerKeywordId];
    const wantsAmount =
      !!ability?.spell?.params?.includes("amount")
      // Creature-side scalable keywords (Résistance X, Carnage X, …) also
      // need the X value persisted.
      || !!ability?.creature?.scalable;
    const wantsAttack = !!ability?.spell?.params?.includes("attack");
    const wantsHealth = !!ability?.spell?.params?.includes("health");
    const params: { amount?: number; attack?: number; health?: number } = {};
    if (wantsAmount) params.amount = powerParamAmount;
    if (wantsAttack) params.attack = powerParamAttack;
    if (wantsHealth) params.health = powerParamHealth;
    // Mode 3 (aura) also benefits from a stack-multiplier value even on
    // keywords that don't formally declare a scalable param.
    if (!wantsAmount && !wantsAttack && !wantsHealth && powerMode === "aura" && powerParamAmount > 0) {
      params.amount = powerParamAmount;
    }
    const powerEffect: Record<string, unknown> = {
      mode: powerMode,
      keywordId: powerKeywordId,
    };
    if (Object.keys(params).length > 0) powerEffect.params = params;
    if ((powerKeywordId === "convocation" || powerKeywordId === "convocation_simple") && powerTokenId != null) {
      powerEffect.tokenId = powerTokenId;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    setUploadProgress("Préparation…");
    try {
      // 1. Si un GLB est fourni, l'uploader d'abord. Sinon (héros 2D),
      //    on saute cette étape et on passe directement à l'insert.
      let publicGlbUrl: string | null = null;
      if (glbFile) {
        const ext = glbFile.name.toLowerCase().endsWith(".gltf") ? "gltf" : "glb";
        const urlRes = await fetch("/api/heroes/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ext }),
        });
        const urlData = await urlRes.json();
        if (!urlRes.ok || !urlData?.signedUrl || !urlData?.publicUrl) {
          throw new Error(urlData?.error || "Impossible d'obtenir l'URL d'upload");
        }

        setUploadProgress(`Upload en cours (${(glbFile.size / (1024 * 1024)).toFixed(1)} Mo)…`);
        const putRes = await fetch(urlData.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": ext === "gltf" ? "model/gltf+json" : "model/gltf-binary" },
          body: glbFile,
        });
        if (!putRes.ok) {
          const txt = await putRes.text().catch(() => "");
          throw new Error(`Upload Storage échoué (${putRes.status}) ${txt.slice(0, 200)}`);
        }
        publicGlbUrl = urlData.publicUrl;
      }

      // 2. Insert la ligne héros — glbUrl peut être null si le héros est
      //    un héros 2D (l'image thumbnail prend le rôle visuel principal).
      setUploadProgress("Enregistrement…");
      const body: Record<string, unknown> = {
        name: name.trim(),
        race,
        faction: faction || null,
        clan: clan || null,
        power_name: powerName || null,
        power_cost: powerCost,
        power_effect: powerEffect,
        power_usage_limit: powerUsageLimit,
        power_description: powerDescription || null,
        glbUrl: publicGlbUrl,
        rarity,
        is_default: rarity === "Commune" ? isDefault : false,
      };
      if (rarity !== "Commune") body.max_prints = maxPrints ?? DEFAULT_MAX_PRINTS[rarity] ?? null;
      // Safety net : every base64 image that ships in this POST body is
      // re-compressed to WebP@768 right before send. Covers the case where
      // images were generated/uploaded before the per-handler compression
      // was in place, and any future code path that forgets to shrink.
      if (thumbnailBase64 && thumbnailMimeType) {
        const t = await compressBase64Image(thumbnailBase64, thumbnailMimeType, 768);
        body.thumbnailBase64 = t.base64;
        body.thumbnailMimeType = t.mime;
      }
      if (powerImageBase64 && powerImageMime) {
        const p = await compressBase64Image(powerImageBase64, powerImageMime, 768);
        body.powerImageBase64 = p.base64;
        body.powerImageMimeType = p.mime;
      }

      if (isEditing && editingHeroId !== null) {
        body.id = editingHeroId;
      }
      const res = await fetch("/api/heroes", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        return;
      }
      setMessage(`Héros "${name.trim()}" ${isEditing ? "modifié" : "créé"}`);
      resetForm();
      await loadHeroes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const handleUpdateField = async (hero: HeroRow, updates: Record<string, unknown>) => {
    try {
      await fetch("/api/heroes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: hero.id, ...updates }),
      });
      await loadHeroes();
    } catch (err) {
      console.error("Erreur update:", err);
    }
  };

  const handleDelete = async (hero: HeroRow) => {
    if (!confirm(`Supprimer le héros "${hero.name}" ?`)) return;
    try {
      await fetch("/api/heroes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: hero.id }),
      });
      await loadHeroes();
    } catch (err) {
      console.error("Erreur suppression:", err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#888", fontFamily: "'Cinzel',serif" }}>
        Chargement...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "30px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", letterSpacing: 1, margin: 0 }}>
          Gestion des Héros 3D
        </h1>
      </div>

      {/* Add or edit hero */}
      <div style={STYLE.card}>
        <h2 style={STYLE.title}>
          {isEditing ? `Modifier le héros : ${name || "…"}` : "Ajouter un héros"}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* LEFT — metadata */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={STYLE.label}>Nom</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Galdor l'Aurélien"
                style={STYLE.input} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={STYLE.label}>Faction</label>
                <select value={faction} onChange={(e) => setFaction(e.target.value)}
                  style={STYLE.input}>
                  <option value="">— Aucune —</option>
                  {FACTION_IDS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={STYLE.label}>Rareté</label>
                <select value={rarity} onChange={(e) => {
                  const r = e.target.value;
                  setRarity(r);
                  setMaxPrints(r === "Commune" ? null : (DEFAULT_MAX_PRINTS[r] ?? null));
                  if (r !== "Commune") setIsDefault(false);
                }} style={STYLE.input}>
                  {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={STYLE.label}>Race</label>
                <select value={race} onChange={(e) => setRace(e.target.value)}
                  disabled={isEditing || availableRaces.length === 0}
                  style={{ ...STYLE.input, opacity: (isEditing || availableRaces.length === 0) ? 0.5 : 1 }}>
                  <option value="">{availableRaces.length === 0 ? "(choisis d'abord une faction)" : "— Aucune —"}</option>
                  {availableRaces.map(r => <option key={r} value={r}>{r}</option>)}
                  {isEditing && race && !availableRaces.includes(race) && (
                    <option value={race}>{race}</option>
                  )}
                </select>
                {isEditing && (
                  <div style={{ fontSize: 9, color: "#999", fontFamily: "'Crimson Text',serif", fontStyle: "italic", marginTop: 2 }}>
                    Race verrouillée — supprimer et recréer pour changer.
                  </div>
                )}
              </div>
              <div>
                <label style={STYLE.label}>Clan</label>
                <select value={clan} onChange={(e) => setClan(e.target.value)}
                  disabled={availableClans.length === 0}
                  style={{ ...STYLE.input, opacity: availableClans.length === 0 ? 0.5 : 1 }}>
                  <option value="">{availableClans.length === 0 ? "(aucun clan)" : "— Aucun —"}</option>
                  {availableClans.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {rarity !== "Commune" ? (
              <div>
                <label style={STYLE.label}>Exemplaires</label>
                <input type="number" min={1} value={maxPrints ?? ""}
                  onChange={(e) => setMaxPrints(e.target.value ? Number(e.target.value) : null)}
                  style={STYLE.input} />
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#333", cursor: "pointer", marginTop: 4 }}>
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                Héros par défaut pour {raceDisplayLabel(race)}
              </label>
            )}

            {/* ─── POUVOIR HÉROÏQUE V2 ─── */}
            {(() => {
              const ability = ABILITIES[powerKeywordId];
              const ww = ability?.spell?.params ?? [];
              // Creature-side scalable keywords (Résistance X, Convocation X,
              // Carnage X, Tactique X, Persécution X, Souffle de feu X…) expose
              // an X parameter through `creature.scalable`. We surface a Quantité
              // input for those too, in addition to spell-side params.
              const isCreatureScalable = !!ability?.creature?.scalable;
              const showAmount = ww.includes("amount") || isCreatureScalable || powerMode === "aura";
              const showAttack = ww.includes("attack");
              const showHealth = ww.includes("health");
              const isConvocation = powerKeywordId === "convocation" || powerKeywordId === "convocation_simple";
              // Sorted ABILITIES list, label-first, for the picker
              const abilityEntries = Object.values(ABILITIES)
                .map(a => ({ id: a.id, label: a.label, desc: a.desc }))
                .sort((a, b) => a.label.localeCompare(b.label, "fr"));
              const previewLabel = ability?.label ?? powerKeywordId;
              const previewDesc = ability?.desc ?? "—";
              const modeText =
                powerMode === "grant_keyword" ? `Donne « ${previewLabel} » à une créature ciblée` :
                powerMode === "spell_trigger" ? `Déclenche l'effet « ${previewLabel} » une fois` :
                /* aura */                       `Active l'aura « ${previewLabel} » (cumulable)`;
              const limitText = powerUsageLimit == null ? "illimité" : `${powerUsageLimit}× max par partie`;
              return (
                <div style={{ borderTop: "1px dashed #eee", paddingTop: 10, marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>
                    POUVOIR HÉROÏQUE
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={STYLE.label}>Nom</label>
                      <input type="text" value={powerName} onChange={(e) => setPowerName(e.target.value)}
                        placeholder="Ex: Flamboiement" style={STYLE.input} />
                    </div>
                    <div>
                      <label style={STYLE.label}>Coût mana</label>
                      <input type="number" min={0} max={10} value={powerCost}
                        onChange={(e) => setPowerCost(Number(e.target.value))}
                        style={STYLE.input} />
                    </div>
                    <div>
                      <label style={STYLE.label}>Limite par partie</label>
                      <select
                        value={powerUsageLimit == null ? "" : String(powerUsageLimit)}
                        onChange={(e) => setPowerUsageLimit(e.target.value === "" ? null : Number(e.target.value))}
                        style={STYLE.input}>
                        <option value="">Illimité</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <option key={n} value={n}>{n}× max</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={STYLE.label}>Mode d&apos;activation</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                      {(Object.keys(POWER_MODE_LABELS) as Array<keyof typeof POWER_MODE_LABELS>).map((m) => (
                        <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#333", cursor: "pointer" }}>
                          <input
                            type="radio"
                            name="powerMode"
                            value={m}
                            checked={powerMode === m}
                            onChange={() => setPowerMode(m)}
                          />
                          {POWER_MODE_LABELS[m]}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={STYLE.label}>
                      Mot-clé{" "}
                      <span style={{ fontStyle: "italic", color: "#aaa", textTransform: "none", letterSpacing: 0 }}>
                        — {previewDesc}
                      </span>
                    </label>
                    <select
                      value={powerKeywordId}
                      onChange={(e) => setPowerKeywordId(e.target.value)}
                      style={STYLE.input}
                    >
                      {abilityEntries.map(a => (
                        <option key={a.id} value={a.id}>{a.label} ({a.id})</option>
                      ))}
                    </select>
                  </div>

                  {(showAmount || showAttack || showHealth) && (
                    <div style={{ display: "grid", gridTemplateColumns: showAttack && showHealth ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8, marginTop: 10 }}>
                      {showAmount && (
                        <div>
                          <label style={STYLE.label}>Quantité (X)</label>
                          <input type="number" min={0} max={20}
                            value={powerParamAmount}
                            onChange={(e) => setPowerParamAmount(Number(e.target.value))}
                            style={STYLE.input} />
                        </div>
                      )}
                      {showAttack && (
                        <div>
                          <label style={STYLE.label}>Attaque (+X)</label>
                          <input type="number" min={0} max={20}
                            value={powerParamAttack}
                            onChange={(e) => setPowerParamAttack(Number(e.target.value))}
                            style={STYLE.input} />
                        </div>
                      )}
                      {showHealth && (
                        <div>
                          <label style={STYLE.label}>PV (+Y)</label>
                          <input type="number" min={0} max={20}
                            value={powerParamHealth}
                            onChange={(e) => setPowerParamHealth(Number(e.target.value))}
                            style={STYLE.input} />
                        </div>
                      )}
                    </div>
                  )}

                  {isConvocation && (
                    <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: "#fdf6ff", border: `1px solid ${powerTokenId ? "#9b59b633" : "#e74c3c"}` }}>
                      <label style={STYLE.label}>
                        TOKEN À INVOQUER
                        {!powerTokenId && <span style={{ color: "#e74c3c", marginLeft: 6 }}>· Requis</span>}
                      </label>
                      <div style={{ marginTop: 4 }}>
                        <TokenCascadePicker
                          value={powerTokenId}
                          onChange={setPowerTokenId}
                          tokens={tokenTemplates}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{
                    marginTop: 10, padding: "8px 10px", borderRadius: 6,
                    background: "#f4f7ff", border: "1px solid #c7dbff",
                    fontSize: 11, color: "#1e5581", fontFamily: "'Crimson Text',serif",
                    fontStyle: "italic",
                  }}>
                    Aperçu : {modeText}. ({powerCost} mana, {limitText})
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <label style={STYLE.label}>Description (affichée au clic droit en jeu)</label>
                    <textarea value={powerDescription}
                      onChange={(e) => setPowerDescription(e.target.value)}
                      rows={2}
                      placeholder="Ex: Donne Bouclier divin à une créature ciblée."
                      style={STYLE.input} />
                    <button
                      type="button"
                      onClick={() => setPowerDescription(`${modeText}.`)}
                      style={{
                        marginTop: 4, padding: "3px 10px", borderRadius: 4,
                        background: "transparent", border: "1px dashed #c0c0c0", color: "#666",
                        fontSize: 9, fontFamily: "'Cinzel',serif", cursor: "pointer",
                      }}
                    >
                      Remplir depuis l&apos;aperçu
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* RIGHT — GLB + thumbnail + preview.
              Either the GLB OR the 2D image is required (not both). When
              only the 2D image is provided the in-game viewer falls back
              to the legacy HeroPortrait component, which now reads the
              uploaded thumbnail directly. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={STYLE.label}>
                Modèle 3D — optionnel (.glb / .gltf, max 100 Mo)
              </label>
              {isEditing && !glbFile && editingHero?.glb_url && (
                <div style={{ marginTop: 4, padding: "6px 8px", borderRadius: 4, background: "#f4f7ff", border: "1px solid #c7dbff", fontSize: 10, color: "#1e5581", fontFamily: "'Crimson Text',serif" }}>
                  Modèle actuel conservé.{" "}
                  <a href={editingHero.glb_url} target="_blank" rel="noreferrer" style={{ color: "#1e5581", textDecoration: "underline" }}>
                    Voir le GLB
                  </a>
                  . Sélectionne un fichier ci-dessous pour le remplacer.
                </div>
              )}
              <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                onChange={handleGlbChange}
                style={{ width: "100%", fontSize: 10, marginTop: 4 }} />
            </div>
            <div>
              <label style={STYLE.label}>
                Image 2D — optionnel (miniature deck builder + portrait en jeu si pas de 3D)
              </label>
              <input type="file" accept="image/*"
                onChange={handleThumbnailChange}
                style={{ width: "100%", fontSize: 10, marginTop: 4 }} />
              {thumbnailPreview && (
                <>
                  <img src={thumbnailPreview} alt="thumbnail"
                    style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #27ae60", marginTop: 6 }} />
                  {isEditing && !thumbnailBase64 && (
                    <div style={{ fontSize: 9, color: "#999", fontFamily: "'Crimson Text',serif", fontStyle: "italic", marginTop: 2 }}>
                      Image actuelle — uploader ou régénérer pour remplacer.
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{
              borderTop: "1px dashed #eee", paddingTop: 10, marginTop: 4,
            }}>
              <div style={{ fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>
                PORTRAIT IA
              </div>
              <div style={{ fontSize: 10, color: "#777", fontFamily: "'Crimson Text',serif", marginBottom: 8, fontStyle: "italic" }}>
                Compose un prompt à partir de la race + faction + clan + ton contexte, puis génère l&apos;image (cadre rond, emblème, fond transparent).
              </div>

              {/* Extra context */}
              <div style={{ marginBottom: 8 }}>
                <label style={STYLE.label}>Contexte supplémentaire (optionnel)</label>
                <textarea
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  rows={3}
                  placeholder="Ex : cicatrice sur l'œil gauche, regard mauvais, mèche grise, tient une lance brisée…"
                  style={{ ...STYLE.input, resize: "vertical" }}
                />
              </div>

              {/* Reference image */}
              <div style={{ marginBottom: 8 }}>
                <label style={STYLE.label}>Image de référence (optionnel)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  {refImagePreview ? (
                    <img src={refImagePreview} alt="référence"
                      style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 4, border: "1px solid #27ae60" }} />
                  ) : (
                    <div style={{ width: 54, height: 54, borderRadius: 4, border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#aaa" }}>
                      vide
                    </div>
                  )}
                  <label style={{
                    ...STYLE.button, background: "#eee", color: "#333", cursor: "pointer",
                    display: "inline-flex", alignItems: "center",
                  }}>
                    {refImagePreview ? "Remplacer" : "Choisir"}
                    <input type="file" accept="image/*"
                      onChange={handleRefImageChange}
                      style={{ display: "none" }} />
                  </label>
                  {refImagePreview && (
                    <button type="button" onClick={handleRemoveRefImage}
                      style={{ ...STYLE.button, background: "#e74c3c" }}>
                      Retirer
                    </button>
                  )}
                </div>
                <label style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 10, color: refImageBase64 ? "#333" : "#aaa",
                  marginTop: 6, cursor: refImageBase64 ? "pointer" : "not-allowed",
                }}>
                  <input type="checkbox"
                    checked={useReference}
                    disabled={!refImageBase64}
                    onChange={(e) => setUseReference(e.target.checked)} />
                  Utiliser comme référence visuelle (Gemini ~1024 px) — sinon Imagen 2K, image ignorée
                </label>
              </div>

              {/* Step 1: compose prompt */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleComposePrompt}
                  disabled={composingPrompt}
                  style={{
                    ...STYLE.button,
                    background: "#8e44ad",
                    opacity: composingPrompt ? 0.5 : 1,
                  }}
                >
                  {composingPrompt
                    ? "Composition…"
                    : composedPrompt
                      ? "1. Recomposer le prompt"
                      : "1. Composer le prompt"}
                </button>
              </div>

              {composedPrompt && (
                <div style={{ marginTop: 8 }}>
                  <label style={STYLE.label}>Prompt (éditable)</label>
                  <textarea
                    value={composedPrompt}
                    onChange={(e) => setComposedPrompt(e.target.value)}
                    rows={6}
                    style={{ ...STYLE.input, fontFamily: "'Crimson Text',serif", resize: "vertical" }}
                  />
                  <button type="button"
                    onClick={() => navigator.clipboard.writeText(composedPrompt).catch(() => null)}
                    style={{
                      marginTop: 4, padding: "3px 10px", borderRadius: 4,
                      background: "transparent", border: "1px dashed #c0c0c0", color: "#666",
                      fontSize: 9, fontFamily: "'Cinzel',serif", cursor: "pointer",
                    }}>
                    copier
                  </button>
                </div>
              )}

              {/* Step 2: generate image */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                <button
                  type="button"
                  onClick={handleGeneratePortrait}
                  disabled={generatingPortrait || !composedPrompt.trim()}
                  style={{
                    ...STYLE.button,
                    background: thumbnailBase64 ? "#1e5581" : "#27ae60",
                    opacity: (generatingPortrait || !composedPrompt.trim()) ? 0.5 : 1,
                  }}
                >
                  {generatingPortrait
                    ? "Génération… (~10-20s)"
                    : thumbnailBase64
                      ? "2. Régénérer l'image"
                      : "2. Générer l'image"}
                </button>
                {thumbnailBase64 && (
                  <span style={{ fontSize: 10, color: "#27ae60", fontFamily: "'Cinzel',serif" }}>
                    ✓ Portrait prêt
                  </span>
                )}
              </div>

              {portraitError && (
                <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, background: "#fde8e8", border: "1px solid #f5a3a3", color: "#e74c3c", fontSize: 10 }}>
                  {portraitError}
                </div>
              )}
            </div>

            {/* ─── VISUEL DU POUVOIR ─── */}
            {true && (
              <div style={{
                borderTop: "1px dashed #eee", paddingTop: 10, marginTop: 4,
              }}>
                <div style={{ fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>
                  VISUEL DU POUVOIR
                </div>
                <div style={{ fontSize: 10, color: "#777", fontFamily: "'Crimson Text',serif", marginBottom: 8, fontStyle: "italic" }}>
                  Illustration affichée à l&apos;activation du pouvoir en jeu (animation de cast). Génération IA basée sur le portrait du héros + une description d&apos;action — ou upload direct.
                </div>

                {/* Action context */}
                <div style={{ marginBottom: 8 }}>
                  <label style={STYLE.label}>Action à illustrer</label>
                  <textarea
                    value={actionContext}
                    onChange={(e) => setActionContext(e.target.value)}
                    rows={3}
                    placeholder="Ex : frappe avec son épée flamboyante, charge le bouclier en avant…"
                    style={{ ...STYLE.input, resize: "vertical" }}
                  />
                </div>

                {/* Direct upload alternative */}
                <div style={{ marginBottom: 8 }}>
                  <label style={STYLE.label}>Import direct (alternative à l&apos;IA)</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                    {powerImagePreview ? (
                      <img src={powerImagePreview} alt="aperçu pouvoir"
                        style={{ width: 54, height: 76, objectFit: "cover", borderRadius: 4, border: "1px solid #27ae60" }} />
                    ) : (
                      <div style={{ width: 54, height: 76, borderRadius: 4, border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#aaa" }}>
                        vide
                      </div>
                    )}
                    <label style={{
                      ...STYLE.button, background: "#eee", color: "#333", cursor: "pointer",
                      display: "inline-flex", alignItems: "center",
                    }}>
                      {powerImagePreview ? "Remplacer" : "Choisir"}
                      <input type="file" accept="image/*"
                        onChange={handlePowerImageUpload}
                        style={{ display: "none" }} />
                    </label>
                    {powerImagePreview && (
                      <button type="button" onClick={handleRemovePowerImage}
                        style={{ ...STYLE.button, background: "#e74c3c" }}>
                        Retirer
                      </button>
                    )}
                  </div>
                  {isEditing && powerImagePreview && !powerImageBase64 && (
                    <div style={{ fontSize: 9, color: "#999", fontFamily: "'Crimson Text',serif", fontStyle: "italic", marginTop: 4 }}>
                      Visuel actuel — uploader ou régénérer pour remplacer.
                    </div>
                  )}
                </div>

                <div style={{ borderTop: "1px dashed #eee", paddingTop: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 9, color: "#999", fontFamily: "'Cinzel',serif", letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>
                    GÉNÉRATION IA
                  </div>
                  <div style={{ fontSize: 10, color: (thumbnailBase64 || thumbnailPreview) ? "#27ae60" : "#e67e22", fontFamily: "'Crimson Text',serif", marginBottom: 6, fontStyle: "italic" }}>
                    {thumbnailBase64
                      ? "✓ Le portrait du héros sera utilisé comme référence visuelle (Gemini)"
                      : thumbnailPreview
                        ? "✓ Le portrait existant sera téléchargé et utilisé comme référence visuelle (Gemini)"
                        : "⚠ Génère ou upload d'abord le portrait du héros — il est requis comme référence pour garder la même identité"}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={handleComposePowerPrompt}
                      disabled={composingPowerPrompt}
                      style={{
                        ...STYLE.button,
                        background: "#8e44ad",
                        opacity: composingPowerPrompt ? 0.5 : 1,
                      }}
                    >
                      {composingPowerPrompt
                        ? "Composition…"
                        : composedPowerPrompt
                          ? "1. Recomposer le prompt"
                          : "1. Composer le prompt"}
                    </button>
                  </div>

                  {composedPowerPrompt && (
                    <div style={{ marginTop: 8 }}>
                      <label style={STYLE.label}>Prompt (éditable)</label>
                      <textarea
                        value={composedPowerPrompt}
                        onChange={(e) => setComposedPowerPrompt(e.target.value)}
                        rows={6}
                        style={{ ...STYLE.input, fontFamily: "'Crimson Text',serif", resize: "vertical" }}
                      />
                      <button type="button"
                        onClick={() => navigator.clipboard.writeText(composedPowerPrompt).catch(() => null)}
                        style={{
                          marginTop: 4, padding: "3px 10px", borderRadius: 4,
                          background: "transparent", border: "1px dashed #c0c0c0", color: "#666",
                          fontSize: 9, fontFamily: "'Cinzel',serif", cursor: "pointer",
                        }}>
                        copier
                      </button>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={handleGeneratePowerImage}
                      disabled={generatingPowerImage || !composedPowerPrompt.trim() || (!thumbnailBase64 && !thumbnailPreview)}
                      style={{
                        ...STYLE.button,
                        background: powerImageBase64 ? "#1e5581" : "#27ae60",
                        opacity: (generatingPowerImage || !composedPowerPrompt.trim() || (!thumbnailBase64 && !thumbnailPreview)) ? 0.5 : 1,
                      }}
                    >
                      {generatingPowerImage
                        ? "Génération… (~10-20s)"
                        : powerImageBase64
                          ? "2. Régénérer le visuel"
                          : "2. Générer le visuel"}
                    </button>
                    {powerImageBase64 && (
                      <span style={{ fontSize: 10, color: "#27ae60", fontFamily: "'Cinzel',serif" }}>
                        ✓ Visuel prêt
                      </span>
                    )}
                  </div>
                </div>

                {powerImageError && (
                  <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, background: "#fde8e8", border: "1px solid #f5a3a3", color: "#e74c3c", fontSize: 10 }}>
                    {powerImageError}
                  </div>
                )}
              </div>
            )}

            <div style={{
              fontSize: 9, color: "#888", fontFamily: "'Crimson Text',serif",
              fontStyle: "italic", padding: "4px 8px",
              background: "#fffbe6", borderRadius: 4, border: "1px solid #f0e0a0",
            }}>
              💡 L&apos;un des deux suffit : un héros 2D peut être créé avec juste une image, un héros 3D peut être créé avec juste un GLB. Les deux ensemble = miniature 2D dans le deck builder + figurine 3D en jeu.
            </div>
            <div style={{ flex: 1, minHeight: 260, border: "1px solid #e0e0e0", borderRadius: 6, background: "#101018", overflow: "hidden" }}>
              {glbPreviewUrl ? (
                <Canvas key={glbPreviewUrl} camera={{ position: [0, 0, 4], fov: 40 }}>
                  <Suspense fallback={null}>
                    <Stage environment="studio" intensity={0.6} shadows="contact">
                      <GlbPreview url={glbPreviewUrl} />
                    </Stage>
                    <OrbitControls makeDefault enablePan={false} autoRotate autoRotateSpeed={0.6} />
                  </Suspense>
                </Canvas>
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: 11, padding: 16, textAlign: "center", fontFamily: "'Crimson Text',serif" }}>
                  Charge un GLB pour prévisualiser
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
          <button onClick={handleSave}
            disabled={saving || !name.trim() || (!isEditing && !glbFile && !thumbnailBase64)}
            style={{ ...STYLE.button, opacity: saving || !name.trim() || (!isEditing && !glbFile && !thumbnailBase64) ? 0.5 : 1 }}>
            {saving
              ? (uploadProgress ?? "Envoi...")
              : isEditing
                ? "Enregistrer les modifications"
                : "Ajouter le héros"}
          </button>
          <button onClick={resetForm}
            style={{ ...STYLE.button, background: "transparent", color: "#888", border: "1px solid #ddd" }}>
            {isEditing ? "Annuler l'édition" : "Réinitialiser"}
          </button>
        </div>

        {uploadProgress && saving && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "#fff7e0", border: "1px solid #e8d094", color: "#a07000", fontSize: 11, fontFamily: "'Crimson Text',serif" }}>
            ⏳ {uploadProgress}
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "#fde8e8", border: "1px solid #f5a3a3", color: "#e74c3c", fontSize: 11 }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "#e8f4fd", border: "1px solid #b6daf5", color: "#1e5581", fontSize: 11 }}>
            {message}
          </div>
        )}
      </div>

      {/* Hero list */}
      {heroes.map((hero) => (
        <div key={hero.id} style={{
          ...STYLE.card,
          ...(hero.id === editingHeroId
            ? { border: "2px solid #1e5581", boxShadow: "0 0 0 2px #c7dbff" }
            : {}),
        }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            {hero.thumbnail_url ? (
              <img src={hero.thumbnail_url} alt={hero.name}
                style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #e0e0e0", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 80, height: 80, background: "#2a2a45", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#c8a84e", fontSize: 10, fontFamily: "'Cinzel',serif", flexShrink: 0 }}>
                {raceDisplayLabel(hero.race)}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <h3 style={{ ...STYLE.title, margin: 0 }}>{hero.name}</h3>
                <span style={{
                  ...STYLE.badge,
                  background: hero.is_active ? "#e8f5e9" : "#fde8e8",
                  color: hero.is_active ? "#2e7d32" : "#e74c3c",
                  border: `1px solid ${hero.is_active ? "#a5d6a7" : "#f5a3a3"}`,
                }}>
                  {hero.is_active ? "Actif" : "Inactif"}
                </span>
                <span style={{ ...STYLE.badge, background: "#eef4ff", color: "#1e5581", border: "1px solid #c7dbff" }}>
                  {raceDisplayLabel(hero.race)}
                </span>
                {hero.is_default && (
                  <span style={{ ...STYLE.badge, background: "#fff5e0", color: "#a07000", border: "1px solid #e8d094" }}>
                    Défaut
                  </span>
                )}
              </div>

              <div style={{ fontSize: 10, color: "#777", marginBottom: 6, fontFamily: "'Crimson Text',serif" }}>
                {hero.power_name ? (
                  <>⚡ <strong>{hero.power_name}</strong> ({hero.power_cost ?? 0} mana) — {hero.power_description ?? "pas de description"}</>
                ) : (
                  <em>Aucun pouvoir configuré</em>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: "#555", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #eee" }}>
                <div>
                  <span style={STYLE.label}>Rareté : </span>
                  <select value={hero.rarity ?? "Commune"}
                    onChange={(e) => {
                      const newR = e.target.value;
                      const mp = newR === "Commune" ? null : (hero.max_prints ?? DEFAULT_MAX_PRINTS[newR] ?? null);
                      handleUpdateField(hero, { rarity: newR, max_prints: mp, ...(newR !== "Commune" && hero.is_default ? { is_default: false } : {}) });
                    }}
                    style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #e0e0e0", fontSize: 11 }}>
                    {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {(hero.rarity ?? "Commune") !== "Commune" && (
                  <div>
                    <span style={STYLE.label}>Exemplaires : </span>
                    <input type="number" min={1} value={hero.max_prints ?? ""}
                      onChange={(e) => handleUpdateField(hero, { max_prints: e.target.value ? Number(e.target.value) : null })}
                      style={{ width: 70, padding: "3px 8px", borderRadius: 4, border: "1px solid #e0e0e0", fontSize: 11 }} />
                  </div>
                )}
                {(hero.rarity ?? "Commune") === "Commune" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#333", cursor: "pointer" }}>
                    <input type="checkbox" checked={hero.is_default}
                      onChange={(e) => handleUpdateField(hero, { is_default: e.target.checked })} />
                    Défaut pour {raceDisplayLabel(hero.race)}
                  </label>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => loadHeroIntoForm(hero)}
                  style={{
                    ...STYLE.button,
                    background: hero.id === editingHeroId ? "#1e5581" : "#eef4ff",
                    color: hero.id === editingHeroId ? "#fff" : "#1e5581",
                  }}>
                  {hero.id === editingHeroId ? "En cours d'édition" : "Modifier"}
                </button>
                <button
                  onClick={() => handleUpdateField(hero, { is_active: !hero.is_active })}
                  style={{
                    ...STYLE.button,
                    background: hero.is_active ? "#fde8e8" : "#e8f5e9",
                    color: hero.is_active ? "#e74c3c" : "#2e7d32",
                  }}>
                  {hero.is_active ? "Désactiver" : "Activer"}
                </button>
                {hero.glb_url && (
                  <a href={hero.glb_url} target="_blank" rel="noreferrer"
                    style={{ ...STYLE.button, background: "#eef4ff", color: "#1e5581", textDecoration: "none", display: "inline-block" }}>
                    Voir GLB
                  </a>
                )}
                <button onClick={() => handleDelete(hero)}
                  style={{ ...STYLE.button, background: "#e74c3c" }}>
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {heroes.length === 0 && (
        <div style={STYLE.card}>
          <p style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>
            Aucun héros en base. Ajoute-en un ci-dessus.
          </p>
        </div>
      )}
    </div>
  );
}
