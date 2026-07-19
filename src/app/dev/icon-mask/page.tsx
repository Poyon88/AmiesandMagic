"use client";

/**
 * PILOTE — comparaison filtre CSS vs mask CSS sur les VRAIES icônes du jeu
 * (overrides stockés en base / Supabase Storage, servis par /api/keyword-icons).
 * Page de dev uniquement, à supprimer une fois la décision prise.
 *
 * Les icônes de prod sont des PNG 512×512 en blanc pur + canal alpha : le
 * masque n'y perd donc aucun détail (toute la forme est portée par l'alpha),
 * contrairement à une icône multicolore.
 */

import { useEffect, useState } from "react";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";
import { keywordModeFilter, keywordModeColor } from "@/lib/game/keyword-labels";
import type { KeywordMode } from "@/lib/game/types";

const MODES: { mode: KeywordMode | undefined; label: string }[] = [
  { mode: "entry", label: "invocation / sort" },
  { mode: "tap", label: "pouvoir activé" },
  { mode: "attack", label: "à l'attaque" },
  { mode: "death", label: "râle d'agonie" },
  { mode: "return", label: "retour en main" },
  { mode: "end_of_turn", label: "fin du tour" },
  { mode: undefined, label: "passif" },
];

const HALO =
  "drop-shadow(0 0 1.2px rgba(0,0,0,.95)) drop-shadow(0 0 1.2px rgba(0,0,0,.95)) drop-shadow(0 1px 1px rgba(0,0,0,.85))";

const SIZE = 40;

function MaskIcon({ src, color, scale }: { src: string; color: string; scale: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: SIZE,
        height: SIZE,
        backgroundColor: color,
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        filter: HALO,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
      }}
    />
  );
}

function FilterIcon({ src, mode, scale }: { src: string; mode: KeywordMode | undefined; scale: number }) {
  return (
    <span style={{ display: "inline-flex", filter: keywordModeFilter(mode), lineHeight: 0 }}>
      <img
        src={src}
        alt=""
        style={{
          width: SIZE,
          height: SIZE,
          objectFit: "contain",
          display: "block",
          transform: scale !== 1 ? `scale(${scale})` : undefined,
        }}
      />
    </span>
  );
}

export default function IconMaskPilotPage() {
  const { overrides, scales, loaded, fetchOverrides } = useKeywordIconStore();
  const [modeIdx, setModeIdx] = useState(0);
  const [bg, setBg] = useState<"sombre" | "clair" | "illustration">("sombre");

  useEffect(() => {
    if (!loaded) fetchOverrides();
  }, [loaded, fetchOverrides]);

  const { mode, label } = MODES[modeIdx];
  const color = keywordModeColor(mode) ?? "#ffffff";
  const entries = Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b));

  const bgStyle =
    bg === "clair"
      ? { background: "#e8d9a8" }
      : bg === "illustration"
        ? { background: "linear-gradient(135deg,#6b4f2a,#c9a227 40%,#2e4a6b 75%,#7a2a2a)" }
        : { background: "#171520" };

  return (
    <div style={{ minHeight: "100vh", background: "#0f0e15", color: "#e8e4f0", padding: 28, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 21, marginBottom: 6 }}>Pilote — filtre CSS vs mask CSS ({entries.length} icônes réelles)</h1>
      <p style={{ opacity: 0.72, maxWidth: 800, lineHeight: 1.5, fontSize: 13.5, marginBottom: 20 }}>
        Icônes chargées depuis <code>/api/keyword-icons</code> — exactement celles du jeu. Pour chaque icône :
        à gauche le rendu <b>actuel</b> (<code>filter</code>), à droite le rendu <b>mask</b> +{" "}
        <code>background-color</code>. La cible est le carré de référence ci-dessous.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {MODES.map((m, i) => (
          <button
            key={m.label}
            onClick={() => setModeIdx(i)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12.5,
              cursor: "pointer",
              border: i === modeIdx ? `2px solid ${keywordModeColor(m.mode) ?? "#fff"}` : "1px solid rgba(255,255,255,.2)",
              background: i === modeIdx ? "rgba(255,255,255,.1)" : "transparent",
              color: "#e8e4f0",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "center" }}>
        <span style={{ fontSize: 12, opacity: 0.6 }}>fond :</span>
        {(["sombre", "clair", "illustration"] as const).map((b) => (
          <button
            key={b}
            onClick={() => setBg(b)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              border: b === bg ? "2px solid #fff" : "1px solid rgba(255,255,255,.2)",
              background: "transparent",
              color: "#e8e4f0",
            }}
          >
            {b}
          </button>
        ))}
        <span style={{ marginLeft: 18, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          référence {label} :
          <span style={{ width: 22, height: 22, borderRadius: 4, background: color, display: "inline-block" }} />
          <code style={{ color, fontWeight: 700 }}>{color}</code>
        </span>
      </div>

      {!loaded && <p style={{ opacity: 0.6 }}>chargement des icônes…</p>}

      <div
        style={{
          ...bgStyle,
          borderRadius: 10,
          padding: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 14,
        }}
      >
        {entries.map(([kw, url]) => {
          const scale = scales[kw] ?? 1;
          return (
            <div
              key={kw}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: 8,
                borderRadius: 8,
                background: "rgba(0,0,0,.18)",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <span style={{ width: SIZE, height: SIZE, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <FilterIcon src={url} mode={mode} scale={scale} />
                </span>
                <span style={{ width: 1, height: 26, background: "rgba(255,255,255,.25)" }} />
                <MaskIcon src={url} color={color} scale={scale} />
              </div>
              <span style={{ fontSize: 10, opacity: 0.75, textAlign: "center", wordBreak: "break-word", color: bg === "clair" ? "#2a2010" : "#e8e4f0" }}>
                {kw}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ opacity: 0.55, fontSize: 12, marginTop: 16 }}>
        Gauche = filter (actuel) · Droite = mask. Change de déclencheur et de fond pour comparer.
      </p>
    </div>
  );
}
