"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { KEYWORD_LABELS, KEYWORD_SYMBOLS } from "@/lib/game/keyword-labels";
import { ALL_SPELL_KEYWORDS, SPELL_KEYWORD_LABELS, SPELL_KEYWORD_SYMBOLS } from "@/lib/game/spell-keywords";
import { POLYMORPHIC_ICON_KEY_FALLBACK } from "@/lib/game/abilities";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";
import type { Keyword } from "@/lib/game/types";

// Liste unifiée des icônes gérables. Une capacité peut vivre côté créature
// (clé = id), côté sort (clé de stockage = `spell_<id>`), ou LES DEUX
// (polymorphe). Pour les polymorphes, on n'affiche qu'UNE ligne (clé créature
// canonique) : l'upload/échelle s'y applique et se propage à la forme sort via
// POLYMORPHIC_ICON_KEY_FALLBACK (miroir déjà en place dans le store + le rendu).
type IconEntry = { key: string; label: string; symbol: string; kind: "creature" | "spell" | "both" };

const ICON_ENTRIES: IconEntry[] = (() => {
  const creature = (Object.entries(KEYWORD_LABELS) as [Keyword, string][]).map(
    ([kw, label]): IconEntry => ({ key: kw, label, symbol: KEYWORD_SYMBOLS[kw], kind: "creature" }),
  );
  const creatureKeys = new Set(creature.map((e) => e.key));

  const spell: IconEntry[] = [];
  for (const id of ALL_SPELL_KEYWORDS) {
    const spellKey = `spell_${id}`;
    // Polymorphe : si la forme sort a une sœur créature déjà listée, on ne crée
    // pas de ligne « sort » distincte — on marque la ligne créature « both ».
    const sibling = POLYMORPHIC_ICON_KEY_FALLBACK[spellKey];
    if (sibling && creatureKeys.has(sibling)) {
      const row = creature.find((e) => e.key === sibling);
      if (row) row.kind = "both";
      continue;
    }
    spell.push({ key: spellKey, label: SPELL_KEYWORD_LABELS[id], symbol: SPELL_KEYWORD_SYMBOLS[id], kind: "spell" });
  }
  return [...creature, ...spell];
})();

// Libellé par clé de stockage, pour les messages (couvre créatures + sorts).
const LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  ICON_ENTRIES.map((e) => [e.key, e.label]),
);

interface CustomIcon {
  keyword: string;
  icon_url: string;
  scale?: number | null;
}

export default function KeywordIconManager() {
  const [customIcons, setCustomIcons] = useState<Record<string, string>>({});
  const [scales, setScales] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [search, setSearch] = useState("");
  // Décalage global, en points d'échelle, appliqué à TOUTES les icônes d'un
  // coup. Additif (et non multiplicatif) pour préserver les écarts existants.
  // Tant qu'il n'est pas appliqué, il ne sert que d'aperçu.
  const [bulkDelta, setBulkDelta] = useState(0);
  const [applyingBulk, setApplyingBulk] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchIcons = useCallback(async () => {
    const res = await fetch("/api/keyword-icons");
    const data = await res.json();
    const map: Record<string, string> = {};
    const scaleMap: Record<string, number> = {};
    for (const icon of (data.icons ?? []) as CustomIcon[]) {
      map[icon.keyword] = icon.icon_url;
      scaleMap[icon.keyword] = icon.scale != null ? Number(icon.scale) : 1;
    }
    // Miroir polymorphe (comme le store) : une capacité créature+sort partage
    // son icône/échelle, quelle que soit la clé sous laquelle elle est stockée.
    // La ligne unifiée « both » reflète ainsi l'upload existant.
    for (const [key, sibling] of Object.entries(POLYMORPHIC_ICON_KEY_FALLBACK)) {
      if (!map[key] && map[sibling]) map[key] = map[sibling];
      if (scaleMap[key] == null && scaleMap[sibling] != null) scaleMap[key] = scaleMap[sibling];
    }
    setCustomIcons(map);
    setScales(scaleMap);
    setLoading(false);
  }, []);

  // Enregistre le facteur d'échelle d'une icône (sans nouveau fichier).
  async function handleScale(keyword: string, scale: number) {
    const formData = new FormData();
    formData.append("keyword", keyword);
    formData.append("scale", String(scale));
    const res = await fetch("/api/keyword-icons", { method: "POST", body: formData });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setMessage({ text: `Échelle de "${LABEL_BY_KEY[keyword] ?? keyword}" : ×${scale.toFixed(2)}`, type: "success" });
      useKeywordIconStore.getState().reload();
    }
  }

  // Échelle telle qu'elle sera écrite si le décalage global est appliqué.
  // Sert à l'aperçu des vignettes ET au libellé du curseur, pour que les deux
  // racontent la même chose.
  const previewScale = useCallback(
    (kw: string) => Math.min(2.5, Math.max(0.5, (scales[kw] ?? 1) + bulkDelta)),
    [scales, bulkDelta],
  );

  // Applique le décalage à toutes les icônes en une seule requête.
  async function handleBulkScale() {
    if (!bulkDelta) return;
    setApplyingBulk(true);
    setMessage(null);
    const formData = new FormData();
    formData.append("scaleDelta", String(bulkDelta));
    const res = await fetch("/api/keyword-icons", { method: "POST", body: formData });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      const sign = bulkDelta > 0 ? "+" : "";
      const clampedNote = data.clamped
        ? ` — ${data.clamped} bloquée${data.clamped > 1 ? "s" : ""} à la borne (leur écart avec les autres a changé)`
        : "";
      setMessage({
        text: `${sign}${bulkDelta.toFixed(2)} appliqué à ${data.count} icône${data.count > 1 ? "s" : ""}${clampedNote}`,
        type: "success",
      });
      setBulkDelta(0);
      await fetchIcons();
      useKeywordIconStore.getState().reload();
    }
    setApplyingBulk(false);
  }

  useEffect(() => {
    fetchIcons();
  }, [fetchIcons]);

  async function handleUpload(keyword: string, file: File) {
    setUploading(keyword);
    setMessage(null);

    const formData = new FormData();
    formData.append("keyword", keyword);
    formData.append("file", file);

    const res = await fetch("/api/keyword-icons", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setMessage({ text: `Icône de "${LABEL_BY_KEY[keyword] ?? keyword}" mise à jour`, type: "success" });
      fetchIcons();
      // Refresh the shared override store so the rest of the app (forge
      // preview, in-game cards…) reflects the new icon without a reload.
      useKeywordIconStore.getState().reload();
    }
    setUploading(null);
  }

  async function handleReset(keyword: string) {
    setMessage(null);
    const res = await fetch("/api/keyword-icons", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setMessage({ text: `Icône de "${LABEL_BY_KEY[keyword] ?? keyword}" réinitialisée`, type: "success" });
      fetchIcons();
      useKeywordIconStore.getState().reload();
    }
  }

  const sorted = [...ICON_ENTRIES].sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const filtered = search
    ? sorted.filter((e) => e.label.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#333", marginBottom: 24 }}>
        Icônes des Capacités
      </h1>

      {message && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 8,
            background: message.type === "success" ? "#d4edda" : "#f8d7da",
            color: message.type === "success" ? "#155724" : "#721c24",
            fontSize: 14,
          }}
        >
          {message.text}
        </div>
      )}

      <div
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <input
          type="text"
          placeholder="Rechercher une capacité..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 6,
            fontSize: 14,
            marginBottom: 16,
            boxSizing: "border-box",
          }}
        />

        {/* Ajustement global : décale toutes les icônes du même nombre de
            points, sans toucher aux écarts entre elles. */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 14px", marginBottom: 16,
            background: bulkDelta ? "#eef4ff" : "#fafafa",
            border: `1px solid ${bulkDelta ? "#b9cdf5" : "#eee"}`,
            borderRadius: 8,
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>Ajuster toutes les icônes</div>
            <div style={{ fontSize: 11, color: "#888" }}>Décale chaque échelle du même nombre de points</div>
          </div>
          <input
            type="range"
            min={-0.5}
            max={0.5}
            step={0.05}
            value={bulkDelta}
            onChange={(e) => setBulkDelta(Number(e.target.value))}
            disabled={applyingBulk}
            title="Décalage appliqué à toutes les icônes"
            style={{ flex: 1, minWidth: 120 }}
          />
          <span
            style={{
              fontSize: 13, fontWeight: 700, width: 48, textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              color: bulkDelta === 0 ? "#999" : bulkDelta < 0 ? "#c0392b" : "#1d7a6c",
            }}
          >
            {bulkDelta > 0 ? "+" : ""}{bulkDelta.toFixed(2)}
          </span>
          <button
            onClick={handleBulkScale}
            disabled={!bulkDelta || applyingBulk}
            style={{
              padding: "7px 14px", borderRadius: 6, border: "none",
              background: !bulkDelta || applyingBulk ? "#ccc" : "#2563eb",
              color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: !bulkDelta || applyingBulk ? "default" : "pointer",
              flexShrink: 0,
            }}
          >
            {applyingBulk ? "Application..." : "Appliquer"}
          </button>
          {bulkDelta !== 0 && !applyingBulk && (
            <button
              onClick={() => setBulkDelta(0)}
              style={{
                padding: "7px 10px", borderRadius: 6, border: "1px solid #ddd",
                background: "#fff", color: "#666", fontSize: 13, cursor: "pointer", flexShrink: 0,
              }}
            >
              Annuler
            </button>
          )}
        </div>
        {bulkDelta !== 0 && (
          <div style={{ fontSize: 11, color: "#8a6d3b", marginTop: -8, marginBottom: 14 }}>
            Aperçu uniquement — rien n&apos;est enregistré tant que tu n&apos;as pas cliqué sur « Appliquer ».
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 20, color: "#999" }}>Chargement...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map(({ key: kw, label, symbol: defaultSymbol, kind }) => {
              const customUrl = customIcons[kw];
              const isImage = customUrl || defaultSymbol.startsWith("/");
              const displayUrl = customUrl || (defaultSymbol.startsWith("/") ? defaultSymbol : null);
              const isUploading = uploading === kw;
              const badge = kind === "spell" ? { text: "SORT", fg: "#6a4bb5", bg: "#efe9fb", bd: "#d6c9f2" }
                : kind === "both" ? { text: "CRÉ. + SORT", fg: "#1d7a6c", bg: "#e3f5f1", bd: "#bfe6dd" }
                : null;

              return (
                <div
                  key={kw}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    background: customUrl ? "#f0f8ff" : "#fafafa",
                    border: `1px solid ${customUrl ? "#b3d9ff" : "#eee"}`,
                    borderRadius: 8,
                  }}
                >
                  {/* Current icon */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#1a1a2e",
                      borderRadius: 6,
                      flexShrink: 0,
                    }}
                  >
                    {displayUrl ? (
                      <img
                        src={displayUrl}
                        alt={label}
                        style={{ width: 28, height: 28, objectFit: "contain", transform: `scale(${previewScale(kw)})` }}
                      />
                    ) : (
                      <span style={{ fontSize: 20 }}>{defaultSymbol}</span>
                    )}
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#333", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      {label}
                      {badge && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: badge.fg, background: badge.bg, border: `1px solid ${badge.bd}`, borderRadius: 4, padding: "1px 6px", letterSpacing: 0.3 }}>
                          {badge.text}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#999" }}>
                      {customUrl ? "Image personnalisée" : isImage ? "Image locale" : `Emoji: ${defaultSymbol}`}
                    </div>
                  </div>

                  {/* Échelle d'affichage (uniquement pour les icônes image) */}
                  {customUrl && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, width: 170, flexShrink: 0 }}>
                      <input
                        type="range"
                        min={0.5}
                        max={2.5}
                        step={0.05}
                        value={previewScale(kw)}
                        onChange={(e) => setScales((prev) => ({ ...prev, [kw]: Number(e.target.value) }))}
                        onPointerUp={() => handleScale(kw, scales[kw] ?? 1)}
                        onKeyUp={() => handleScale(kw, scales[kw] ?? 1)}
                        // Pendant l'aperçu global, ce curseur affiche la valeur
                        // DÉCALÉE : la manipuler enregistrerait ce décalage
                        // comme échelle de base, qui serait ensuite recompté à
                        // l'application. On le neutralise le temps de l'aperçu.
                        disabled={bulkDelta !== 0}
                        title={bulkDelta !== 0
                          ? "Applique ou annule l'ajustement global pour régler cette icône"
                          : "Taille d'affichage de l'icône"}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 11, color: "#666", width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        ×{previewScale(kw).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      ref={(el) => { fileInputRefs.current[kw] = el; }}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(kw, file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => fileInputRefs.current[kw]?.click()}
                      disabled={isUploading}
                      style={{
                        padding: "6px 14px",
                        background: isUploading ? "#ccc" : "#2196f3",
                        border: "none",
                        borderRadius: 4,
                        color: "#fff",
                        fontSize: 12,
                        cursor: isUploading ? "default" : "pointer",
                      }}
                    >
                      {isUploading ? "..." : "Changer"}
                    </button>
                    {customUrl && (
                      <button
                        onClick={() => handleReset(kw)}
                        style={{
                          padding: "6px 10px",
                          background: "#f44336",
                          border: "none",
                          borderRadius: 4,
                          color: "#fff",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
