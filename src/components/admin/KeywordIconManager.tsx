"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { KEYWORD_LABELS, KEYWORD_SYMBOLS } from "@/lib/game/keyword-labels";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";
import type { Keyword } from "@/lib/game/types";

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
      setMessage({ text: `Échelle de "${KEYWORD_LABELS[keyword as Keyword]}" : ×${scale.toFixed(2)}`, type: "success" });
      useKeywordIconStore.getState().reload();
    }
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
      setMessage({ text: `Icône de "${KEYWORD_LABELS[keyword as Keyword]}" mise à jour`, type: "success" });
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
      setMessage({ text: `Icône de "${KEYWORD_LABELS[keyword as Keyword]}" réinitialisée`, type: "success" });
      fetchIcons();
      useKeywordIconStore.getState().reload();
    }
  }

  const allKeywords = (Object.entries(KEYWORD_LABELS) as [Keyword, string][])
    .sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const filtered = search
    ? allKeywords.filter(([, label]) => label.toLowerCase().includes(search.toLowerCase()))
    : allKeywords;

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

        {loading ? (
          <div style={{ textAlign: "center", padding: 20, color: "#999" }}>Chargement...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map(([kw, label]) => {
              const defaultSymbol = KEYWORD_SYMBOLS[kw];
              const customUrl = customIcons[kw];
              const isImage = customUrl || defaultSymbol.startsWith("/");
              const displayUrl = customUrl || (defaultSymbol.startsWith("/") ? defaultSymbol : null);
              const isUploading = uploading === kw;

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
                        style={{ width: 28, height: 28, objectFit: "contain", transform: `scale(${scales[kw] ?? 1})` }}
                      />
                    ) : (
                      <span style={{ fontSize: 20 }}>{defaultSymbol}</span>
                    )}
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#333", fontSize: 14 }}>{label}</div>
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
                        value={scales[kw] ?? 1}
                        onChange={(e) => setScales((prev) => ({ ...prev, [kw]: Number(e.target.value) }))}
                        onPointerUp={() => handleScale(kw, scales[kw] ?? 1)}
                        onKeyUp={() => handleScale(kw, scales[kw] ?? 1)}
                        title="Taille d'affichage de l'icône"
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 11, color: "#666", width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        ×{(scales[kw] ?? 1).toFixed(2)}
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
