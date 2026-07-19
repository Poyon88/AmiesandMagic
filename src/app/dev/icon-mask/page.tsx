"use client";

/**
 * PILOTE — comparaison filtre CSS vs mask CSS pour les icônes-image.
 * Page de dev uniquement, à supprimer une fois la décision prise.
 *
 * Objectif : juger à l'œil si `mask-image` + `background-color` donne une
 * couleur plus juste que la chaîne `filter` actuelle, et ce qu'on perd en
 * détail (un masque ne garde que l'alpha : toute icône multicolore devient
 * une silhouette pleine).
 */

import { keywordModeFilter, keywordModeColor } from "@/lib/game/keyword-labels";
import type { KeywordMode } from "@/lib/game/types";

const MODES: { mode: KeywordMode | undefined; label: string }[] = [
  { mode: "entry", label: "invocation / sort" },
  { mode: "tap", label: "pouvoir activé" },
  { mode: "attack", label: "à l'attaque" },
  { mode: "death", label: "râle d'agonie" },
  { mode: "return", label: "retour en main" },
  { mode: "end_of_turn", label: "fin du tour" },
  { mode: undefined, label: "passif (non teinté)" },
];

const ICONS = [
  { key: "armure", png: "/icons/armure.png", svg: "/icons/armure.svg" },
  { key: "augure", png: "/icons/augure.png", svg: "/icons/augure.svg" },
];

const SIZE = 44;

/** Halo de contraste, identique à ICON_CONTRAST_HALO, pour les variantes mask. */
const HALO =
  "drop-shadow(0 0 1.2px rgba(0,0,0,.95)) drop-shadow(0 0 1.2px rgba(0,0,0,.95)) drop-shadow(0 1px 1px rgba(0,0,0,.85))";

function MaskIcon({ src, color }: { src: string; color: string }) {
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
      }}
    />
  );
}

function FilterIcon({ src, mode }: { src: string; mode: KeywordMode | undefined }) {
  return (
    <span style={{ display: "inline-flex", filter: keywordModeFilter(mode), lineHeight: 0 }}>
      <img src={src} alt="" style={{ width: SIZE, height: SIZE, objectFit: "contain", display: "block" }} />
    </span>
  );
}

export default function IconMaskPilotPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#171520", color: "#e8e4f0", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Pilote — filtre CSS vs mask CSS</h1>
      <p style={{ opacity: 0.75, maxWidth: 760, lineHeight: 1.5, marginBottom: 28, fontSize: 14 }}>
        Colonne <b>A</b> = rendu actuel (PNG + chaîne <code>filter</code>). Colonnes <b>B</b> et <b>C</b> = PNG et SVG
        utilisés comme <code>mask-image</code> avec <code>background-color</code>. La pastille et le texte de droite
        portent le hex exact de <code>keywordModeColor</code> : c&apos;est la référence à atteindre.
      </p>

      {ICONS.map((icon) => (
        <section key={icon.key} style={{ marginBottom: 44 }}>
          <h2 style={{ fontSize: 16, marginBottom: 14, textTransform: "capitalize", opacity: 0.9 }}>{icon.key}</h2>
          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 900 }}>
            <thead>
              <tr style={{ fontSize: 12, opacity: 0.6, textAlign: "left" }}>
                <th style={{ padding: "6px 12px", fontWeight: 500 }}>déclencheur</th>
                <th style={{ padding: "6px 12px", fontWeight: 500 }}>A — filter (actuel)</th>
                <th style={{ padding: "6px 12px", fontWeight: 500 }}>B — mask PNG</th>
                <th style={{ padding: "6px 12px", fontWeight: 500 }}>C — mask SVG</th>
                <th style={{ padding: "6px 12px", fontWeight: 500 }}>référence</th>
              </tr>
            </thead>
            <tbody>
              {MODES.map(({ mode, label }) => {
                const color = keywordModeColor(mode) ?? "#ffffff";
                return (
                  <tr key={label} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                    <td style={{ padding: "10px 12px", fontSize: 13, opacity: 0.85 }}>{label}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <FilterIcon src={icon.png} mode={mode} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <MaskIcon src={icon.png} color={color} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <MaskIcon src={icon.svg} color={color} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 20, height: 20, borderRadius: 4, background: color, display: "inline-block" }} />
                        <code style={{ color, fontSize: 13, fontWeight: 700 }}>{color}</code>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <section style={{ marginTop: 8, padding: 16, background: "rgba(255,255,255,.04)", borderRadius: 8, maxWidth: 900 }}>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>Sur fond clair (test du halo de contraste)</h2>
        <div style={{ background: "#e8d9a8", padding: 16, borderRadius: 6, display: "flex", gap: 24, alignItems: "center" }}>
          {MODES.slice(0, 4).map(({ mode, label }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <FilterIcon src={ICONS[0].png} mode={mode} />
              <MaskIcon src={ICONS[0].png} color={keywordModeColor(mode) ?? "#ffffff"} />
              <span style={{ fontSize: 10, color: "#3a2f1a" }}>A / B</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
