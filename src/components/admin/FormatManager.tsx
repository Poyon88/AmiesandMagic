"use client";

import { useState, useEffect, useCallback } from "react";
import type { GameFormat, CardSet } from "@/lib/game/types";
import { getFormatFilter } from "@/lib/game/format-legality";

const STYLE = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 12, letterSpacing: 1 } as React.CSSProperties,
  label: { fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 0.5 } as React.CSSProperties,
  badge: { fontSize: 9, padding: "2px 8px", borderRadius: 4, fontFamily: "'Cinzel',serif", fontWeight: 700 } as React.CSSProperties,
};

export default function FormatManager() {
  const [formats, setFormats] = useState<GameFormat[]>([]);
  const [sets, setSets] = useState<CardSet[]>([]);
  const [variableSetIds, setVariableSetIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fmtRes, setsRes] = await Promise.all([
        fetch("/api/formats"),
        fetch("/api/sets"),
      ]);
      const fmtData = await fmtRes.json();
      const setsData = await setsRes.json();
      setFormats(Array.isArray(fmtData) ? fmtData : []);
      setSets(Array.isArray(setsData) ? setsData : []);

      // Charger les sets du format Variable
      const variableFormat = (Array.isArray(fmtData) ? fmtData : []).find((f: GameFormat) => f.code === "variable");
      if (variableFormat) {
        const vsRes = await fetch(`/api/formats/${variableFormat.id}/sets`);
        const vsData = await vsRes.json();
        setVariableSetIds(Array.isArray(vsData) ? vsData : []);
      }
    } catch (err) {
      console.error("Erreur chargement formats:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const variableFormat = formats.find(f => f.code === "variable");

  const toggleVariableSet = (setId: number) => {
    setVariableSetIds(prev =>
      prev.includes(setId) ? prev.filter(id => id !== setId) : [...prev, setId]
    );
  };

  const saveVariableSets = async () => {
    if (!variableFormat) return;
    setSaving(true);
    try {
      await fetch(`/api/formats/${variableFormat.id}/sets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set_ids: variableSetIds }),
      });
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
    }
    setSaving(false);
  };

  // Calcul des sets légaux pour Standard (affichage informatif)
  const baseSet = sets.find(s => s.code === "BASE");
  const latestExtensions = sets
    .filter(s => s.code !== "BASE" && s.released_at)
    .sort((a, b) => new Date(b.released_at!).getTime() - new Date(a.released_at!).getTime())
    .slice(0, 2);

  const formatDescriptions: Record<string, React.ReactNode> = {
    standard: (
      <div style={{ fontSize: 10, color: "#666", lineHeight: 1.6 }}>
        <div><strong>Set de base :</strong> {baseSet ? `${baseSet.icon} ${baseSet.name}` : "Non trouvé"}</div>
        <div><strong>2 dernières extensions :</strong> {latestExtensions.length > 0 ? latestExtensions.map(s => `${s.icon} ${s.name}`).join(", ") : "Aucune"}</div>
        <div><strong>+</strong> Cartes sans extension de moins de 2 ans</div>
      </div>
    ),
    etendu: (
      <div style={{ fontSize: 10, color: "#666" }}>Toutes les cartes sont jouables.</div>
    ),
    basique: (
      <div style={{ fontSize: 10, color: "#666", lineHeight: 1.6 }}>
        <div>Mêmes règles que Standard, uniquement les cartes de rareté <strong>Commune</strong>.</div>
      </div>
    ),
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
      <h1 style={{ fontSize: 18, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 24, letterSpacing: 1 }}>
        Gestion des Formats
      </h1>

      {formats.map(fmt => (
        <div key={fmt.id} style={STYLE.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h2 style={{ ...STYLE.title, margin: 0 }}>{fmt.name}</h2>
            <span style={{
              ...STYLE.badge,
              background: fmt.is_active ? "#e8f5e9" : "#fde8e8",
              color: fmt.is_active ? "#2e7d32" : "#e74c3c",
              border: `1px solid ${fmt.is_active ? "#a5d6a7" : "#f5a3a3"}`,
            }}>
              {fmt.is_active ? "Actif" : "Inactif"}
            </span>
          </div>

          {fmt.description && (
            <p style={{ fontSize: 10, color: "#888", marginBottom: 10 }}>{fmt.description}</p>
          )}

          {/* Descriptions calculées pour Standard, Étendu, Basique */}
          {formatDescriptions[fmt.code]}

          {/* Interface de sélection pour Variable */}
          {fmt.code === "variable" && (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...STYLE.label, marginBottom: 8 }}>
                Extensions incluses (+ set de base + cartes sans extension &lt; 2 ans) :
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sets.filter(s => s.code !== "BASE").map(s => {
                  const isSelected = variableSetIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleVariableSet(s.id)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 5,
                        border: `1px solid ${isSelected ? "#4caf50" : "#e0e0e0"}`,
                        background: isSelected ? "#e8f5e9" : "#fafafa",
                        color: isSelected ? "#2e7d32" : "#666",
                        fontSize: 10,
                        fontFamily: "'Cinzel',serif",
                        fontWeight: isSelected ? 700 : 400,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {s.icon} {s.name}
                    </button>
                  );
                })}
              </div>
              {sets.filter(s => s.code !== "BASE").length === 0 && (
                <p style={{ fontSize: 10, color: "#aaa" }}>Aucune extension disponible</p>
              )}
              <button
                onClick={saveVariableSets}
                disabled={saving}
                style={{
                  marginTop: 12,
                  padding: "6px 20px",
                  borderRadius: 6,
                  border: "none",
                  background: "#333",
                  color: "#fff",
                  fontSize: 10,
                  fontFamily: "'Cinzel',serif",
                  fontWeight: 700,
                  cursor: saving ? "wait" : "pointer",
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>
          )}
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
