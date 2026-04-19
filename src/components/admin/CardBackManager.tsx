"use client";

import { useState, useEffect, useCallback } from "react";

interface CardBack {
  id: number;
  name: string;
  image_url: string;
  is_active: boolean;
  rarity: string | null;
  max_prints: number | null;
  is_default: boolean;
  created_at: string;
}

const RARITIES = ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"];
const DEFAULT_MAX_PRINTS: Record<string, number> = {
  "Légendaire": 1,
  "Épique": 10,
  "Rare": 100,
  "Peu Commune": 1000,
};

const STYLE = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 12, letterSpacing: 1 } as React.CSSProperties,
  label: { fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 0.5 } as React.CSSProperties,
  badge: { fontSize: 9, padding: "2px 8px", borderRadius: 4, fontFamily: "'Cinzel',serif", fontWeight: 700 } as React.CSSProperties,
  button: { padding: "6px 20px", borderRadius: 6, border: "none", background: "#333", color: "#fff", fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
};

export default function CardBackManager() {
  const [cardBacks, setCardBacks] = useState<CardBack[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newImage, setNewImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [newRarity, setNewRarity] = useState<string>("Commune");
  const [newMaxPrints, setNewMaxPrints] = useState<number | null>(null);
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [genMessage, setGenMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/card-backs");
      const data = await res.json();
      setCardBacks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur chargement dos:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new window.Image();
    img.onload = () => {
      // Upload at higher resolution so even at 2× DPR the in-hand card back
      // stays crisp. Previously capped at 1024px — bumped to 1600px wide.
      const MAX_DIM = 1600;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/webp", 0.95);
      const base64 = dataUrl.split(",")[1];
      setNewImage({ base64, mimeType: "image/webp" });
      setNewImagePreview(dataUrl);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newImage) return;
    setSaving(true);
    setError(null);
    try {
      const effectiveMaxPrints = newRarity === "Commune"
        ? null
        : (newMaxPrints ?? DEFAULT_MAX_PRINTS[newRarity] ?? null);
      const res = await fetch("/api/card-backs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          imageBase64: newImage.base64,
          imageMimeType: newImage.mimeType,
          rarity: newRarity,
          max_prints: effectiveMaxPrints,
          is_default: newIsDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        setSaving(false);
        return;
      }
      setNewName("");
      setNewImage(null);
      setNewImagePreview(null);
      setNewRarity("Commune");
      setNewMaxPrints(null);
      setNewIsDefault(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    }
    setSaving(false);
  };

  const handleUpdateField = async (cb: CardBack, updates: Record<string, unknown>) => {
    try {
      await fetch("/api/card-backs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cb.id, ...updates }),
      });
      await load();
    } catch (err) {
      console.error("Erreur update:", err);
    }
  };

  const handleToggleActive = (cb: CardBack) => handleUpdateField(cb, { is_active: !cb.is_active });

  const handleDelete = async (cb: CardBack) => {
    if (!confirm(`Supprimer le dos "${cb.name}" ?`)) return;
    try {
      await fetch("/api/card-backs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cb.id }),
      });
      await load();
    } catch (err) {
      console.error("Erreur suppression:", err);
    }
  };

  const handleGeneratePrints = async (cb: CardBack) => {
    if (!cb.rarity || cb.rarity === "Commune") return;
    if (!confirm(`Générer les exemplaires manquants pour "${cb.name}" ?`)) return;
    setGeneratingId(cb.id);
    setGenMessage(null);
    try {
      const res = await fetch("/api/card-back-prints/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardBackId: cb.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenMessage(`Erreur: ${data.error ?? res.status}`);
      } else {
        setGenMessage(`${data.generated}/${data.total} exemplaire(s) créé(s) pour "${cb.name}"`);
      }
    } catch (err) {
      setGenMessage(err instanceof Error ? err.message : "Erreur réseau");
    }
    setGeneratingId(null);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#888", fontFamily: "'Cinzel',serif" }}>
        Chargement...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "30px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <a href="/" style={{
          padding: "5px 12px", borderRadius: 6, cursor: "pointer",
          background: "transparent", border: "1px solid #ddd", color: "#888",
          fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
          textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
        }}>← Menu</a>
        <h1 style={{ fontSize: 18, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", letterSpacing: 1, margin: 0 }}>
          Gestion des Dos de cartes
        </h1>
      </div>

      {/* Add new card back */}
      <div style={{ ...STYLE.card, marginBottom: 24 }}>
        <h2 style={STYLE.title}>Ajouter un dos</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={STYLE.label}>Nom</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Dos royal"
              style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={STYLE.label}>Image (ratio carte recommandé)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ width: "100%", fontSize: 10, marginTop: 4 }}
            />
          </div>
          <div style={{ minWidth: 120 }}>
            <label style={STYLE.label}>Rareté</label>
            <select
              value={newRarity}
              onChange={(e) => {
                const r = e.target.value;
                setNewRarity(r);
                setNewMaxPrints(r === "Commune" ? null : (DEFAULT_MAX_PRINTS[r] ?? null));
              }}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
            >
              {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {newRarity !== "Commune" && (
            <div style={{ minWidth: 90 }}>
              <label style={STYLE.label}>Exemplaires</label>
              <input
                type="number"
                min={1}
                value={newMaxPrints ?? ""}
                onChange={(e) => setNewMaxPrints(e.target.value ? Number(e.target.value) : null)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
              />
            </div>
          )}
          {newRarity === "Commune" && (
            <div style={{ minWidth: 90, display: "flex", alignItems: "center", paddingTop: 18 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#333", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={newIsDefault}
                  onChange={(e) => setNewIsDefault(e.target.checked)}
                />
                Par défaut
              </label>
            </div>
          )}
          <button
            onClick={handleAdd}
            disabled={saving || !newName.trim() || !newImage}
            style={{ ...STYLE.button, marginTop: 18, opacity: saving || !newName.trim() || !newImage ? 0.5 : 1 }}
          >
            {saving ? "Envoi..." : "Ajouter"}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "#fde8e8", border: "1px solid #f5a3a3", color: "#e74c3c", fontSize: 11 }}>
            {error}
          </div>
        )}
        {newImagePreview && (
          <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
            <img src={newImagePreview} alt="Aperçu" style={{ maxWidth: 140, maxHeight: 200, objectFit: "cover", borderRadius: 6, border: "1px solid #e0e0e0" }} />
          </div>
        )}
      </div>

      {genMessage && (
        <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 6, background: "#e8f4fd", border: "1px solid #b6daf5", color: "#1e5581", fontSize: 11 }}>
          {genMessage}
        </div>
      )}

      {/* Card back list */}
      {cardBacks.map((cb) => (
        <div key={cb.id} style={STYLE.card}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <img
              src={cb.image_url}
              alt={cb.name}
              style={{ width: 90, height: 126, objectFit: "cover", borderRadius: 6, border: "1px solid #e0e0e0", flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <h3 style={{ ...STYLE.title, margin: 0 }}>{cb.name}</h3>
                <span style={{
                  ...STYLE.badge,
                  background: cb.is_active ? "#e8f5e9" : "#fde8e8",
                  color: cb.is_active ? "#2e7d32" : "#e74c3c",
                  border: `1px solid ${cb.is_active ? "#a5d6a7" : "#f5a3a3"}`,
                }}>
                  {cb.is_active ? "Actif" : "Inactif"}
                </span>
              </div>
              <p style={{ fontSize: 9, color: "#aaa", marginBottom: 6 }}>
                Ajouté le {new Date(cb.created_at).toLocaleDateString("fr-FR")}
              </p>

              {/* Rarity + default + prints */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #eee" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={STYLE.label}>Rareté :</span>
                  <select
                    value={cb.rarity ?? "Commune"}
                    onChange={(e) => {
                      const newR = e.target.value;
                      const mp = newR === "Commune" ? null : (cb.max_prints ?? DEFAULT_MAX_PRINTS[newR] ?? null);
                      handleUpdateField(cb, { rarity: newR, max_prints: mp, ...(newR !== "Commune" && cb.is_default ? { is_default: false } : {}) });
                    }}
                    style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #e0e0e0", fontSize: 11 }}
                  >
                    {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {(cb.rarity ?? "Commune") !== "Commune" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={STYLE.label}>Exemplaires :</span>
                    <input
                      type="number"
                      min={1}
                      value={cb.max_prints ?? ""}
                      onChange={(e) => handleUpdateField(cb, { max_prints: e.target.value ? Number(e.target.value) : null })}
                      style={{ width: 70, padding: "3px 8px", borderRadius: 4, border: "1px solid #e0e0e0", fontSize: 11 }}
                    />
                    <button
                      onClick={() => handleGeneratePrints(cb)}
                      disabled={generatingId === cb.id}
                      style={{ ...STYLE.button, background: "#1e88e5", padding: "3px 10px", opacity: generatingId === cb.id ? 0.5 : 1 }}
                    >
                      {generatingId === cb.id ? "..." : "Générer les exemplaires"}
                    </button>
                  </div>
                )}
                {(cb.rarity ?? "Commune") === "Commune" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#333", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={cb.is_default}
                      onChange={(e) => handleUpdateField(cb, { is_default: e.target.checked })}
                    />
                    Dos par défaut
                  </label>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleToggleActive(cb)}
                  style={{
                    ...STYLE.button,
                    background: cb.is_active ? "#fde8e8" : "#e8f5e9",
                    color: cb.is_active ? "#e74c3c" : "#2e7d32",
                  }}
                >
                  {cb.is_active ? "Désactiver" : "Activer"}
                </button>
                <button
                  onClick={() => handleDelete(cb)}
                  style={{ ...STYLE.button, background: "#e74c3c" }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {cardBacks.length === 0 && (
        <div style={STYLE.card}>
          <p style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>
            Aucun dos. Ajoutez-en un ci-dessus.
          </p>
        </div>
      )}
    </div>
  );
}
