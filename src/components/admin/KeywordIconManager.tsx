"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { KEYWORD_LABELS, KEYWORD_SYMBOLS } from "@/lib/game/keyword-labels";
import type { Keyword } from "@/lib/game/types";

interface CustomIcon {
  keyword: string;
  icon_url: string;
}

export default function KeywordIconManager() {
  const [customIcons, setCustomIcons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchIcons = useCallback(async () => {
    const res = await fetch("/api/keyword-icons");
    const data = await res.json();
    const map: Record<string, string> = {};
    for (const icon of (data.icons ?? []) as CustomIcon[]) {
      map[icon.keyword] = icon.icon_url;
    }
    setCustomIcons(map);
    setLoading(false);
  }, []);

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
    }
  }

  const allKeywords = Object.entries(KEYWORD_LABELS) as [Keyword, string][];
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
                        style={{ width: 28, height: 28, objectFit: "contain" }}
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
