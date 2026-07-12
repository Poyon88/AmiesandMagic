"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale, DEFAULT_LOCALE } from "./config";
import heroTranslations from "./hero-translations.json";

// Localisation du CONTENU des héros (nom + nom de pouvoir + description de
// pouvoir) au rendu, keyée par hero_id. Contenu DB peu nombreux (~25 héros) et
// quasi statique → embarqué en JSON généré (scripts/generate-hero-translations.mjs),
// pas de table de traduction (conforme à la préférence « pas de migration »).
// En FR (source) ou si une traduction manque → repli sur les champs FR.

interface HeroLike {
  id: number;
  name?: string | null;
  power_name?: string | null;
  power_description?: string | null;
}

type HeroTr = { name?: string; power_name?: string; power_description?: string };

const DATA = heroTranslations as Record<string, Record<string, HeroTr>>;

export interface HeroText {
  heroName: (h: HeroLike) => string;
  powerName: (h: HeroLike) => string | null;
  powerDesc: (h: HeroLike) => string | null;
}

export function useHeroText(): HeroText {
  const locale = normalizeLocale(useLocale());
  return useMemo(() => {
    const table = locale === DEFAULT_LOCALE ? undefined : DATA[locale];
    const tr = (h: HeroLike): HeroTr | undefined => table?.[String(h.id)];
    return {
      heroName: (h) => tr(h)?.name ?? h.name ?? "",
      powerName: (h) => tr(h)?.power_name ?? h.power_name ?? null,
      powerDesc: (h) => tr(h)?.power_description ?? h.power_description ?? null,
    };
  }, [locale]);
}
