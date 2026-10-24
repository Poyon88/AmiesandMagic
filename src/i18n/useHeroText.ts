"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale, DEFAULT_LOCALE } from "./config";
import heroTranslations from "./hero-translations.json";
import { useSafeT } from "./useVocab";
import { decrirePouvoir } from "@/lib/game/hero-power-text";
import type { HeroPowerEffect } from "@/lib/game/types";

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
  /** Effets du pouvoir (ligne `heroes.power_effect` ou `HeroDefinition.powerEffect`) :
   *  quand ils sont fournis, le texte du pouvoir est GÉNÉRÉ depuis eux. */
  power_effect?: unknown;
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
  const safeT = useSafeT();
  return useMemo(() => {
    const table = locale === DEFAULT_LOCALE ? undefined : DATA[locale];
    const tr = (h: HeroLike): HeroTr | undefined => table?.[String(h.id)];
    return {
      heroName: (h) => tr(h)?.name ?? h.name ?? "",
      powerName: (h) => tr(h)?.power_name ?? h.power_name ?? null,
      // Texte GÉNÉRÉ depuis les effets, dans la langue du joueur ; le texte libre
      // (et sa traduction) ne sert plus que de repli à un héros sans effet lisible.
      powerDesc: (h) => decrirePouvoir(h.power_effect as HeroPowerEffect | HeroPowerEffect[] | undefined, undefined, safeT)
        ?? tr(h)?.power_description ?? h.power_description ?? null,
    };
  }, [locale, safeT]);
}
