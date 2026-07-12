"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale, DEFAULT_LOCALE } from "./config";
import cardBackTranslations from "./card-back-translations.json";

// Localisation du NOM des dos de cartes au rendu, keyée par card_back id.
// Contenu DB peu nombreux (~40) et quasi statique → embarqué en JSON généré
// (scripts/generate-cardback-translations.mjs), pas de table de traduction
// (conforme à la préférence « pas de migration »). En FR (source) ou si une
// traduction manque → repli sur le nom FR.

interface CardBackLike {
  id: number;
  name?: string | null;
}

type CardBackTr = { name?: string };

const DATA = cardBackTranslations as Record<string, Record<string, CardBackTr>>;

export interface CardBackText {
  name: (cb: CardBackLike) => string;
}

export function useCardBackText(): CardBackText {
  const locale = normalizeLocale(useLocale());
  return useMemo(() => {
    const table = locale === DEFAULT_LOCALE ? undefined : DATA[locale];
    return {
      name: (cb) => table?.[String(cb.id)]?.name ?? cb.name ?? "",
    };
  }, [locale]);
}
