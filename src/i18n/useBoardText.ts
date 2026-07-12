"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale, DEFAULT_LOCALE } from "./config";
import boardTranslations from "./board-translations.json";

// Localisation du NOM des plateaux (arènes) au rendu, keyée par game_board id.
// Contenu DB peu nombreux (~30) et quasi statique → embarqué en JSON généré
// (scripts/generate-board-translations.mjs), pas de table de traduction
// (conforme à la préférence « pas de migration »). En FR (source) ou si une
// traduction manque → repli sur le nom FR.

interface BoardLike {
  id: number;
  name?: string | null;
}

type BoardTr = { name?: string };

const DATA = boardTranslations as Record<string, Record<string, BoardTr>>;

export interface BoardText {
  name: (b: BoardLike) => string;
}

export function useBoardText(): BoardText {
  const locale = normalizeLocale(useLocale());
  return useMemo(() => {
    const table = locale === DEFAULT_LOCALE ? undefined : DATA[locale];
    return {
      name: (b) => table?.[String(b.id)]?.name ?? b.name ?? "",
    };
  }, [locale]);
}
