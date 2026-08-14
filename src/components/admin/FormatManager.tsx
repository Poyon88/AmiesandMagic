"use client";

import { useState, useEffect, useCallback } from "react";
import type { GameFormat } from "@/lib/game/types";

const STYLE = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 12, letterSpacing: 1 } as React.CSSProperties,
  badge: { fontSize: 9, padding: "2px 8px", borderRadius: 4, fontFamily: "'Cinzel',serif", fontWeight: 700 } as React.CSSProperties,
};

// Descriptions des 4 formats de la matrice 2×2 (Mode × Étendue).
const FORMAT_DESCRIPTIONS: Record<string, React.ReactNode> = {
  "classique-standard": "Uniquement les cartes Communes, éditées il y a moins de ~2 ans (rotation).",
  "classique-etendu": "Uniquement les cartes Communes, toutes éditions depuis le début du jeu.",
  "expert-standard": "Toutes raretés (plafonnées par les slots), éditées il y a moins de ~2 ans (rotation).",
  "expert-etendu": "Toutes raretés (plafonnées par les slots), toutes éditions depuis le début du jeu.",
};

export default function FormatManager() {
  const [formats, setFormats] = useState<GameFormat[]>([]);
  const [loading, setLoading] = useState(true);

  /** Bascule la diffusion d'un format (cf. l'onglet Formats de la forge, qui
   *  porte le même bouton — les deux écrans montrent la même donnée). */
  const toggleActif = useCallback(async (fmt: GameFormat) => {
    const res = await fetch("/api/formats", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fmt.id, is_active: !fmt.is_active }),
    });
    if (!res.ok) return;
    const maj = (await res.json()) as GameFormat;
    setFormats(prev => prev.map(f => (f.id === maj.id ? maj : f)));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fmtRes = await fetch("/api/formats");
      const fmtData = await fmtRes.json();
      setFormats(Array.isArray(fmtData) ? fmtData : []);
    } catch (err) {
      console.error("Erreur chargement formats:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#888", fontFamily: "'Cinzel',serif" }}>
        Chargement...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "30px 20px" }}>
      <h1 style={{ fontSize: 18, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 24, letterSpacing: 1 }}>
        Gestion des Formats
      </h1>

      {formats.map(fmt => (
        <div key={fmt.id} style={STYLE.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h2 style={{ ...STYLE.title, margin: 0 }}>{fmt.name}</h2>
            <button
              onClick={() => toggleActif(fmt)}
              title={fmt.is_active
                ? "Diffusé aux joueurs — cliquer pour le masquer de l'écran « Jouer »"
                : "Masqué — cliquer pour le diffuser à nouveau"}
              style={{
                ...STYLE.badge,
                background: fmt.is_active ? "#e8f5e9" : "#fde8e8",
                color: fmt.is_active ? "#2e7d32" : "#e74c3c",
                border: `1px solid ${fmt.is_active ? "#a5d6a7" : "#f5a3a3"}`,
                cursor: "pointer",
              }}
            >
              {fmt.is_active ? "Actif" : "Inactif"}
            </button>
          </div>

          <div style={{ fontSize: 10, color: "#666", lineHeight: 1.6 }}>
            {FORMAT_DESCRIPTIONS[fmt.code] ?? fmt.description}
          </div>
        </div>
      ))}

      {formats.length === 0 && (
        <div style={STYLE.card}>
          <p style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>
            Aucun format trouvé. Vérifiez que la table &quot;formats&quot; est bien créée et peuplée.
          </p>
        </div>
      )}
    </div>
  );
}
