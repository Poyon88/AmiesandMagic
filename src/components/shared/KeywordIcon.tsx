"use client";

import { useEffect } from "react";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";
import { keywordModeColor, keywordModeFilter, ICON_CONTRAST_HALO } from "@/lib/game/keyword-labels";
import type { KeywordMode } from "@/lib/game/types";

/**
 * Renders a keyword icon — checks for DB overrides, then falls back to emoji or local image path.
 *
 * `mode` : déclencheur de la capacité. C'est ce composant, et lui seul, qui
 * applique la teinte correspondante — les appelants ne doivent PLUS poser de
 * `filter: keywordModeFilter(...)` sur un wrapper.
 *
 * Deux chemins de coloration, selon la nature du symbole :
 *  - **image** (override en base / chemin local) → `mask-image` + `background-color`.
 *    Les icônes du jeu sont des PNG blanc pur + alpha : le masque ne perd donc
 *    aucun détail et rend la couleur EXACTE de keywordModeColor, identique au
 *    texte et sans divergence Blink/WebKit.
 *  - **emoji** → chaîne `filter` historique. Un glyphe de police n'est pas
 *    masquable ; le filtre reste le seul levier disponible.
 *
 * `fill`: when true and an image is used, the image fills its parent.
 * Caller is responsible for sizing the wrapper.
 */
export default function KeywordIcon({
  symbol,
  size = 14,
  keyword,
  fill = false,
  mode,
}: {
  symbol: string;
  size?: number;
  keyword?: string;
  fill?: boolean;
  mode?: KeywordMode;
}) {
  const { overrides, scales, loaded, fetchOverrides } = useKeywordIconStore();

  useEffect(() => {
    if (!loaded) fetchOverrides();
  }, [loaded, fetchOverrides]);

  const overrideUrl = keyword ? overrides[keyword] : undefined;
  const effectiveSymbol = overrideUrl ?? symbol;

  // Facteur d'échelle par icône (normalisation des marges internes des PNG).
  // Appliqué via transform pour ne pas perturber la mise en page (la boîte
  // parente garde sa taille ; l'excédent transparent déborde sans gêne).
  const scale = keyword ? (scales[keyword] ?? 1) : 1;
  const transform = scale !== 1 ? `scale(${scale})` : undefined;

  const isImage = effectiveSymbol.startsWith("/") || effectiveSymbol.startsWith("http");
  const tint = keywordModeColor(mode);

  if (isImage) {
    // Teinte demandée → masque. Le halo DOIT être porté par un élément parent :
    // en CSS `filter` s'applique AVANT `mask` sur un même élément, le
    // drop-shadow serait calculé sur le carré plein puis rogné par le masque
    // (halo invisible). Le parent filtre le résultat déjà masqué.
    if (tint) {
      const box = fill
        ? { width: "100%", height: "100%" }
        : { width: Math.round(size * 1.8), height: Math.round(size * 1.8) };
      return (
        <span
          style={{
            display: "inline-flex",
            filter: ICON_CONTRAST_HALO,
            lineHeight: 0,
            verticalAlign: "middle",
            // En mode `fill`, l'enfant masqué est dimensionné en %. Le wrapper
            // DOIT donc porter la taille : sinon il se dimensionne sur son
            // contenu, qui se dimensionne sur lui — référence circulaire, la
            // boîte s'effondre à 0 et l'icône disparaît.
            ...(fill ? { width: "100%", height: "100%" } : null),
          }}
        >
          <span
            style={{
              ...box,
              display: "block",
              backgroundColor: tint,
              maskImage: `url(${effectiveSymbol})`,
              WebkitMaskImage: `url(${effectiveSymbol})`,
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskPosition: "center",
              maskSize: "contain",
              WebkitMaskSize: "contain",
              transform,
            }}
          />
        </span>
      );
    }

    // Pas de teinte (passif/permanent) : on garde l'image telle quelle, avec le
    // seul halo. La masquer l'aplatirait inutilement — et écraserait les
    // couleurs d'un éventuel override multicolore.
    if (fill) {
      return (
        <span style={{ display: "inline-flex", filter: ICON_CONTRAST_HALO, lineHeight: 0, width: "100%", height: "100%" }}>
          <img src={effectiveSymbol} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", transform }} />
        </span>
      );
    }
    const imgSize = Math.round(size * 1.8);
    return (
      <span style={{ display: "inline-flex", filter: ICON_CONTRAST_HALO, lineHeight: 0, verticalAlign: "middle" }}>
        <img
          src={effectiveSymbol}
          alt=""
          style={{ width: imgSize, height: imgSize, objectFit: "contain", display: "block", transform }}
        />
      </span>
    );
  }

  // Emoji : non masquable, teinte via la chaîne `filter` historique.
  return (
    <span style={{ display: "inline-flex", filter: keywordModeFilter(mode), lineHeight: 0 }}>
      <span style={{ fontSize: size, lineHeight: 1, display: "inline-block", transform }}>{effectiveSymbol}</span>
    </span>
  );
}
