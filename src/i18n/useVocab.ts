"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Keyword } from "@/lib/game/types";
import { getKeywordDisplayLabel, KEYWORD_LABELS } from "@/lib/game/keyword-labels";
import {
  getAlignmentLabel,
  getClanName,
  getFactionDisplayName,
  getRarityLabel,
  getRaceName,
  KEYWORDS,
} from "@/lib/card-engine/constants";
import type { SafeT } from "./config";

// Vocabulaire de jeu localisé, lié à la langue active. Un seul import pour
// couvrir mots-clés / factions / raretés / clans, avec fallback FR intégré.
//
//   const v = useVocab();
//   v.keywordLabel(kw);   // "Provocation" | "Taunt" | …
//   v.factionName(id);    // "L'Alliance Céleste" | "The Celestial Alliance" | …
//
export interface Vocab {
  keywordLabel: (kw: Keyword) => string;
  // Description d'un mot-clé, localisée. `x` (valeur X de l'instance) est
  // substituée aux gabarits « X » comme le fait le moteur. Fallback FR =
  // KEYWORDS[label].desc. Renvoie null si aucune description.
  keywordDesc: (kw: Keyword, x?: number | null) => string | null;
  factionName: (faction: string | null | undefined) => string;
  rarityLabel: (rarity: string | null | undefined) => string;
  clanName: (clan: string | null | undefined) => string;
  raceName: (race: string | null | undefined) => string;
  alignmentLabel: (alignment: string | null | undefined) => string;
  // Nom de set localisé, indexé par le `code` stable du set (les sets sont des
  // lignes DB, pas des constantes moteur). Fallback : le nom DB (FR) fourni.
  setName: (code: string | null | undefined, fallbackName: string) => string;
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
      keywordDesc: (kw: Keyword, x?: number | null) => {
        const forgeKey = KEYWORD_LABELS[kw];
        const fallback = forgeKey ? KEYWORDS[forgeKey]?.desc : undefined;
        const tmpl = safe(`vocab.keywords.${kw}.desc`) ?? fallback;
        if (!tmpl) return null;
        return x != null ? tmpl.replace(/X/g, String(x)) : tmpl;
      },
      factionName: (faction: string | null | undefined) =>
        getFactionDisplayName(faction, safe),
      rarityLabel: (rarity: string | null | undefined) =>
        getRarityLabel(rarity, safe),
      clanName: (clan: string | null | undefined) => getClanName(clan, safe),
      raceName: (race: string | null | undefined) => getRaceName(race, safe),
      alignmentLabel: (alignment: string | null | undefined) =>
        getAlignmentLabel(alignment, safe),
      setName: (code: string | null | undefined, fallbackName: string) =>
        (code ? safe(`vocab.sets.${code}`) : undefined) ?? fallbackName,
      modeSuffix: (mode: string | null | undefined) => {
        if (!mode || !(mode in MODE_SUFFIX_FR)) return "";
        return safe(`game.mode_suffix_${mode}`) ?? MODE_SUFFIX_FR[mode];
      },
    }),
    [safe],
  );
}
