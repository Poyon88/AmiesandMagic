"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF } from "@react-three/drei";
import type { TokenTemplate } from "@/lib/game/types";
import TokenCascadePicker from "@/components/admin/TokenCascadePicker";

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

const RARITIES = ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"];
const DEFAULT_MAX_PRINTS: Record<string, number> = {
  "Légendaire": 1,
  "Épique": 10,
  "Rare": 100,
  "Peu Commune": 1000,
};

type EffectType = "gain_armor" | "deal_damage" | "heal" | "buff_on_friendly_death" | "summon_token";
type EffectTarget = "any" | "any_friendly" | "enemy_hero";

const EFFECT_TYPE_LABELS: Record<EffectType, string> = {
  gain_armor: "Gagner de l'armure",
  deal_damage: "Infliger des dégâts",
  heal: "Soigner",
  buff_on_friendly_death: "Buff à la mort d'un allié",
  summon_token: "Invoquer un token",
};

const EFFECT_TARGET_LABELS: Record<EffectTarget, string> = {
  any: "N'importe quelle cible (flèche)",
  any_friendly: "Créature/héros alliés (flèche)",
  enemy_hero: "Héros ennemi (auto, pas de flèche)",
};

function effectNeedsAmount(t: EffectType): boolean {
  return t === "gain_armor" || t === "deal_damage" || t === "heal";
}
function effectNeedsAttack(t: EffectType): boolean {
  return t === "buff_on_friendly_death";
}
function effectNeedsTarget(t: EffectType): boolean {
  return t === "deal_damage" || t === "heal";
}
function effectNeedsToken(t: EffectType): boolean {
  return t === "summon_token";
}

function describeEffect(
  t: EffectType,
  amount: number,
  attack: number,
  target: EffectTarget,
  tokenLabel: string | null,
  tokenAtk: number | null,
  tokenHp: number | null,
): string {
  const n = amount || 0;
  switch (t) {
    case "gain_armor":
      return `Donne ${n} point${n > 1 ? "s" : ""} d'armure au héros.`;
    case "deal_damage":
      return `Inflige ${n} dégât${n > 1 ? "s" : ""} à ${EFFECT_TARGET_LABELS[target].toLowerCase()}.`;
    case "heal":
      return `Rend ${n} PV à ${EFFECT_TARGET_LABELS[target].toLowerCase()}.`;
    case "buff_on_friendly_death":
      return `Chaque fois qu'une créature alliée meurt, une autre gagne +${attack || 0} atk (passif).`;
    case "summon_token":
      return tokenLabel
        ? `Invoque ${tokenLabel} (${tokenAtk ?? "?"}/${tokenHp ?? "?"}).`
        : "Invoque un token (à choisir ci-dessus).";
  }
}

interface HeroRow {
  id: number;
  name: string;
  race: Race;
  power_name: string | null;
  power_type: "active" | "passive" | null;
  power_cost: number | null;
  power_effect: Record<string, unknown> | null;
  power_description: string | null;
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
  const [race, setRace] = useState<Race>("humans");
  const [powerName, setPowerName] = useState("");
  const [powerType, setPowerType] = useState<"active" | "passive">("active");
  const [powerCost, setPowerCost] = useState<number>(2);
  const [effectType, setEffectType] = useState<EffectType>("deal_damage");
  const [effectAmount, setEffectAmount] = useState<number>(2);
  const [effectAttack, setEffectAttack] = useState<number>(1);
  const [effectTarget, setEffectTarget] = useState<EffectTarget>("any");
  const [effectTokenId, setEffectTokenId] = useState<number | null>(null);
  const [effectTokenAtkOverride, setEffectTokenAtkOverride] = useState<number | "">("");
  const [effectTokenHpOverride, setEffectTokenHpOverride] = useState<number | "">("");

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
    setRace("humans");
    setPowerName("");
    setPowerType("active");
    setPowerCost(2);
    setEffectType("deal_damage");
    setEffectAmount(2);
    setEffectAttack(1);
    setEffectTarget("any");
    setEffectTokenId(null);
    setEffectTokenAtkOverride("");
    setEffectTokenHpOverride("");
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
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      setError("Nom requis");
      return;
    }
    // The hero can be authored as a 3D model (GLB) OR a 2D image
    // (thumbnail). At least one is required so the in-game viewer has
    // something to render — without either the player would get a
    // faceless emoji placeholder.
    if (!glbFile && !thumbnailBase64) {
      setError("Modèle 3D (GLB) ou image 2D requis");
      return;
    }
    const powerEffect: Record<string, unknown> = { type: effectType };
    if (effectNeedsAmount(effectType)) powerEffect.amount = effectAmount;
    if (effectNeedsAttack(effectType)) powerEffect.attack = effectAttack;
    if (effectNeedsTarget(effectType)) powerEffect.target = effectTarget;
    if (effectNeedsToken(effectType)) {
      powerEffect.token_id = effectTokenId ?? undefined;
      if (effectTokenAtkOverride !== "") powerEffect.attack = effectTokenAtkOverride;
      if (effectTokenHpOverride !== "") powerEffect.health = effectTokenHpOverride;
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
        power_name: powerName || null,
        power_type: powerType,
        power_cost: powerCost,
        power_effect: powerEffect,
        power_description: powerDescription || null,
        glbUrl: publicGlbUrl,
        rarity,
        is_default: rarity === "Commune" ? isDefault : false,
      };
      if (rarity !== "Commune") body.max_prints = maxPrints ?? DEFAULT_MAX_PRINTS[rarity] ?? null;
      if (thumbnailBase64 && thumbnailMimeType) {
        body.thumbnailBase64 = thumbnailBase64;
        body.thumbnailMimeType = thumbnailMimeType;
      }

      const res = await fetch("/api/heroes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        return;
      }
      setMessage(`Héros "${name.trim()}" créé`);
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

      {/* Add new hero */}
      <div style={STYLE.card}>
        <h2 style={STYLE.title}>Ajouter un héros</h2>

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
                <label style={STYLE.label}>Race</label>
                <select value={race} onChange={(e) => setRace(e.target.value as Race)}
                  style={STYLE.input}>
                  {RACES.map(r => <option key={r} value={r}>{RACE_LABELS[r]}</option>)}
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
                Héros par défaut pour {RACE_LABELS[race]}
              </label>
            )}

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
                  <label style={STYLE.label}>Type</label>
                  <select value={powerType} onChange={(e) => setPowerType(e.target.value as "active" | "passive")}
                    style={STYLE.input}>
                    <option value="active">Actif</option>
                    <option value="passive">Passif</option>
                  </select>
                </div>
                <div>
                  <label style={STYLE.label}>Coût</label>
                  <input type="number" min={0} max={10} value={powerCost}
                    onChange={(e) => setPowerCost(Number(e.target.value))}
                    style={STYLE.input} />
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={STYLE.label}>Effet</label>
                <select
                  value={effectType}
                  onChange={(e) => setEffectType(e.target.value as EffectType)}
                  style={STYLE.input}
                >
                  {(Object.keys(EFFECT_TYPE_LABELS) as EffectType[]).map((t) => (
                    <option key={t} value={t}>{EFFECT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                {effectNeedsAmount(effectType) && (
                  <div>
                    <label style={STYLE.label}>Quantité</label>
                    <input
                      type="number" min={0} max={20}
                      value={effectAmount}
                      onChange={(e) => setEffectAmount(Number(e.target.value))}
                      style={STYLE.input}
                    />
                  </div>
                )}
                {effectNeedsAttack(effectType) && (
                  <div>
                    <label style={STYLE.label}>Bonus d&apos;attaque</label>
                    <input
                      type="number" min={0} max={10}
                      value={effectAttack}
                      onChange={(e) => setEffectAttack(Number(e.target.value))}
                      style={STYLE.input}
                    />
                  </div>
                )}
                {effectNeedsTarget(effectType) && (
                  <div style={{ gridColumn: effectNeedsAmount(effectType) ? "auto" : "span 2" }}>
                    <label style={STYLE.label}>Cible</label>
                    <select
                      value={effectTarget}
                      onChange={(e) => setEffectTarget(e.target.value as EffectTarget)}
                      style={STYLE.input}
                    >
                      {(Object.keys(EFFECT_TARGET_LABELS) as EffectTarget[]).map((t) => (
                        <option key={t} value={t}>{EFFECT_TARGET_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Token picker — only for summon_token effect */}
              {effectNeedsToken(effectType) && (() => {
                const tmpl = tokenTemplates.find(t => t.id === effectTokenId) ?? null;
                return (
                  <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: "#fdf6ff", border: `1px solid ${effectTokenId ? "#9b59b633" : "#e74c3c"}` }}>
                    <label style={STYLE.label}>
                      TOKEN À INVOQUER
                      {!effectTokenId && <span style={{ color: "#e74c3c", marginLeft: 6 }}>· Requis</span>}
                    </label>
                    <div style={{ marginTop: 4 }}>
                      <TokenCascadePicker
                        value={effectTokenId}
                        onChange={setEffectTokenId}
                        tokens={tokenTemplates}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <span style={{ fontSize: 9, color: "#888", letterSpacing: 1 }}>OVERRIDE STATS :</span>
                      <input type="number" min={0} max={20}
                        value={effectTokenAtkOverride}
                        placeholder={tmpl ? `ATK ${tmpl.attack}` : "ATK"}
                        onChange={(e) => setEffectTokenAtkOverride(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                        style={{ width: 70, padding: "4px 8px", borderRadius: 5, border: "1px solid #e74c3c44", fontSize: 11, color: "#e74c3c", textAlign: "center", fontFamily: "'Cinzel',serif" }} />
                      <span style={{ color: "#999" }}>/</span>
                      <input type="number" min={1} max={20}
                        value={effectTokenHpOverride}
                        placeholder={tmpl ? `DEF ${tmpl.health}` : "DEF"}
                        onChange={(e) => setEffectTokenHpOverride(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))}
                        style={{ width: 70, padding: "4px 8px", borderRadius: 5, border: "1px solid #f1c40f44", fontSize: 11, color: "#f1c40f", textAlign: "center", fontFamily: "'Cinzel',serif" }} />
                      <span style={{ fontSize: 9, color: "#888", fontStyle: "italic" }}>(vide = stats du token)</span>
                    </div>
                  </div>
                );
              })()}

              <div style={{
                marginTop: 10, padding: "8px 10px", borderRadius: 6,
                background: "#f4f7ff", border: "1px solid #c7dbff",
                fontSize: 11, color: "#1e5581", fontFamily: "'Crimson Text',serif",
                fontStyle: "italic",
              }}>
                {(() => {
                  const tmpl = tokenTemplates.find(t => t.id === effectTokenId) ?? null;
                  const tokenLabel = tmpl ? `${tmpl.name}` : null;
                  const tokenAtk = effectTokenAtkOverride !== "" ? Number(effectTokenAtkOverride) : tmpl?.attack ?? null;
                  const tokenHp = effectTokenHpOverride !== "" ? Number(effectTokenHpOverride) : tmpl?.health ?? null;
                  return `Aperçu : ${describeEffect(effectType, effectAmount, effectAttack, effectTarget, tokenLabel, tokenAtk, tokenHp)}`;
                })()}
              </div>

              <div style={{ marginTop: 8 }}>
                <label style={STYLE.label}>Description (affichée au clic droit en jeu)</label>
                <textarea value={powerDescription}
                  onChange={(e) => setPowerDescription(e.target.value)}
                  rows={2}
                  placeholder="Ex: Inflige 2 dégâts à une créature ennemie."
                  style={STYLE.input} />
                <button
                  type="button"
                  onClick={() => {
                    const tmpl = tokenTemplates.find(t => t.id === effectTokenId) ?? null;
                    const tokenLabel = tmpl ? tmpl.name : null;
                    const tokenAtk = effectTokenAtkOverride !== "" ? Number(effectTokenAtkOverride) : tmpl?.attack ?? null;
                    const tokenHp = effectTokenHpOverride !== "" ? Number(effectTokenHpOverride) : tmpl?.health ?? null;
                    setPowerDescription(describeEffect(effectType, effectAmount, effectAttack, effectTarget, tokenLabel, tokenAtk, tokenHp));
                  }}
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
                <img src={thumbnailPreview} alt="thumbnail"
                  style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #27ae60", marginTop: 6 }} />
              )}
            </div>
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
          <button onClick={handleAdd}
            disabled={saving || !name.trim() || (!glbFile && !thumbnailBase64)}
            style={{ ...STYLE.button, opacity: saving || !name.trim() || (!glbFile && !thumbnailBase64) ? 0.5 : 1 }}>
            {saving ? (uploadProgress ?? "Envoi...") : "Ajouter le héros"}
          </button>
          <button onClick={resetForm}
            style={{ ...STYLE.button, background: "transparent", color: "#888", border: "1px solid #ddd" }}>
            Réinitialiser
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
        <div key={hero.id} style={STYLE.card}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            {hero.thumbnail_url ? (
              <img src={hero.thumbnail_url} alt={hero.name}
                style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #e0e0e0", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 80, height: 80, background: "#2a2a45", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#c8a84e", fontSize: 10, fontFamily: "'Cinzel',serif", flexShrink: 0 }}>
                {RACE_LABELS[hero.race]}
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
                  {RACE_LABELS[hero.race]}
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
                    Défaut pour {RACE_LABELS[hero.race]}
                  </label>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
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
