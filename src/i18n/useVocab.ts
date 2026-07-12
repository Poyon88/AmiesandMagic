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
}

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
    }),
    [safe],
  );
}
