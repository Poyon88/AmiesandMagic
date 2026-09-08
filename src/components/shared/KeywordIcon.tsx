"use client";

import { useEffect } from "react";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";
import { keywordModeColor, keywordModeFilter, keywordIconPaint, ICON_CONTRAST_HALO, SINGULIER_EMOJI_FILTER } from "@/lib/game/keyword-labels";
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
 *
 * `singulier` : condition Singulier sur la capacité → icône BICOLORE (moitié
 * gauche turquoise réservée, moitié droite couleur du déclencheur, blanc pour
 * un passif), avec un fin liseré sombre quand la moitié droite est claire.
 * Calculé par `keywordIconPaint` (pur, testé) ; ici on ne fait que peindre.
 */
export default function KeywordIcon({
  symbol,
  size = 14,
  keyword,
  fill = false,
  mode,
  singulier,
}: {
  symbol: string;
  size?: number;
  keyword?: string;
  fill?: boolean;
  mode?: KeywordMode;
  singulier?: boolean;
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
  const paint = keywordIconPaint(tint, singulier);
  // Liseré sombre : deux ombres portées de rayon nul, soit un contour d'environ
  // 1 px tout autour, posé sur le parent comme le halo (même contrainte
  // filter-avant-mask).
  const halo = paint.outline
    ? `${ICON_CONTRAST_HALO} drop-shadow(0 0 0.6px #000) drop-shadow(0 0 0.6px #000)`
    : ICON_CONTRAST_HALO;

  if (isImage) {
    // Teinte demandée → masque. Le halo DOIT être porté par un élément parent :
    // en CSS `filter` s'applique AVANT `mask` sur un même élément, le
    // drop-shadow serait calculé sur le carré plein puis rogné par le masque
    // (halo invisible). Le parent filtre le résultat déjà masqué.
    if (paint.background) {
      const box = fill
        ? { width: "100%", height: "100%" }
        : { width: Math.round(size * 1.8), height: Math.round(size * 1.8) };
      return (
        <span
          style={{
            display: "inline-flex",
            filter: halo,
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
              // Couleur unie OU dégradé bicolore : le masque découpe le fond,
              // quel qu'il soit.
              background: paint.background,
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
  if (singulier) {
    // Bicolore sans masque : deux copies du glyphe superposées, chacune
    // rognée à sa moitié (clip-path), la gauche en turquoise Singulier.
    const glyphe = <span style={{ fontSize: size, lineHeight: 1, display: "inline-block", transform }}>{effectiveSymbol}</span>;
    return (
      <span style={{ position: "relative", display: "inline-flex", lineHeight: 0, filter: paint.outline ? "drop-shadow(0 0 0.6px #000)" : undefined }}>
        <span style={{ display: "inline-flex", filter: keywordModeFilter(mode), lineHeight: 0, clipPath: "inset(0 0 0 50%)" }}>{glyphe}</span>
        <span style={{ position: "absolute", inset: 0, display: "inline-flex", filter: `${SINGULIER_EMOJI_FILTER} ${ICON_CONTRAST_HALO}`, lineHeight: 0, clipPath: "inset(0 50% 0 0)" }}>{glyphe}</span>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", filter: keywordModeFilter(mode), lineHeight: 0 }}>
      <span style={{ fontSize: size, lineHeight: 1, display: "inline-block", transform }}>{effectiveSymbol}</span>
    </span>
  );
}
