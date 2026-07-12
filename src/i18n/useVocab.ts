"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Keyword } from "@/lib/game/types";
import { getKeywordDisplayLabel } from "@/lib/game/keyword-labels";
import {
  getClanName,
  getFactionDisplayName,
  getRarityLabel,
} from "@/lib/card-engine/constants";
import type { SafeT } from "./config";

// Vocabulaire de jeu localisé, lié à la langue active. Un seul import pour
// couvrir mots-clés / factions / raretés / clans, avec fallback FR intégré.
//
//   const v = useVocab();
//   v.keywordLabel(kw);   // "Provocation" | "Taunt" | …
//   v.factionName(id);    // "L'Alliance Céleste" | "The Celestial Alliance" | …
//
// Les descriptions de mots-clés (vocab.keywords.{id}.desc) ne sont pas encore
// exposées ici — elles transitent par la vue KEYWORDS (indexée par label FR)
// et seront câblées dans une passe dédiée.
export interface Vocab {
  keywordLabel: (kw: Keyword) => string;
  factionName: (faction: string | null | undefined) => string;
  rarityLabel: (rarity: string | null | undefined) => string;
  clanName: (clan: string | null | undefined) => string;
  // Suffixe de déclenchement affiché après un mot-clé (« Provocation · à la
  // mort »). Renvoie une chaîne vide pour le mode par défaut (invocation) et
  // les modes sans suffixe. Fallback FR intégré.
  modeSuffix: (mode: string | null | undefined) => string;
}

// Suffixes FR par défaut, également fallback si la clé de traduction manque.
const MODE_SUFFIX_FR: Record<string, string> = {
  death: " · à la mort",
  tap: " · tap",
  return: " · retour en main",
  end_of_turn: " · fin du tour",
};

export function useVocab(): Vocab {
  const t = useTranslations();

  // SafeT : ne renvoie une valeur que si la clé existe (sinon undefined →
  // fallback FR côté helper). Évite tout warning MISSING_MESSAGE.
  const safe: SafeT = useCallback(
    (key: string) => (t.has(key) ? t(key) : undefined),
    [t],
  );

  return useMemo(
    () => ({
      keywordLabel: (kw: Keyword) => getKeywordDisplayLabel(kw, safe),
      factionName: (faction: string | null | undefined) =>
        getFactionDisplayName(faction, safe),
      rarityLabel: (rarity: string | null | undefined) =>
        getRarityLabel(rarity, safe),
      clanName: (clan: string | null | undefined) => getClanName(clan, safe),
      modeSuffix: (mode: string | null | undefined) => {
        if (!mode || !(mode in MODE_SUFFIX_FR)) return "";
        return safe(`game.mode_suffix_${mode}`) ?? MODE_SUFFIX_FR[mode];
      },
    }),
    [safe],
  );
}
