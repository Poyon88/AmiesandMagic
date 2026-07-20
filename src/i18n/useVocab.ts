"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Keyword, SpellKeywordInstance, Card, TokenTemplate, Capability, ConvocationTokenDef } from "@/lib/game/types";
import { getKeywordDisplayLabel, KEYWORD_LABELS } from "@/lib/game/keyword-labels";
import { getSpellKeywordLabel, getSpellKeywordDesc, formatConvocationTokens, formatConvocationToken, convocationPrefix } from "@/lib/game/spell-keywords";
import { describeKeyword, describeKeywordLabel, keywordScopeNote, type KeywordDescCtx } from "@/lib/game/keyword-display";
import { composedKeywordName, describeComposedCap } from "@/lib/game/composed-display";
import {
  getAlignmentLabel,
  getClanName,
  getFactionDisplayName,
  getRacesForClan,
  getRacesForFaction,
  getRarityLabel,
  getRaceName,
  KEYWORDS,
  KEYWORD_DESC_BY_ID,
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
  // Description d'un mot-clé, localisée, avec les valeurs concrètes de la
  // carte (race/clan/token/capacité conférée) résolues depuis le contexte.
  // Renvoie null si aucune description. Cf. keyword-display.ts.
  keywordDesc: (kw: Keyword, ctx?: KeywordDescCtx) => string | null;
  // Libellé d'un mot-clé, suffixé de sa cible quand la carte la porte
  // (« Entraide (Elfes) »). Remplace la concaténation brute des composants.
  keywordLabelFor: (kw: Keyword, ctx?: KeywordDescCtx) => string;
  // Suffixe de portée d'un mot-clé conféré par un sort (« · à tous les alliés »).
  keywordScopeNote: (grantScope: "target" | "all_allies" | null | undefined) => string | null;
  // Mots-clés de SORT (registre distinct). Label/desc localisés avec
  // substitution X/Y/amount ; fallback FR intégré.
  spellKeywordLabel: (kw: SpellKeywordInstance) => string;
  spellKeywordDesc: (
    kw: SpellKeywordInstance,
    card?: Card | null,
    tokens?: TokenTemplate[],
  ) => string;
  // Effets composés (modèle hybride) : nom du pouvoir (icône réutilisée) et
  // phrase paramétrique décrivant l'effet. Localisés, repli FR intégré.
  composedName: (cap: Capability) => string;
  composedDesc: (cap: Capability, tokens?: TokenTemplate[]) => string;
  factionName: (faction: string | null | undefined) => string;
  // Comme `factionName`, mais suffixé de ses principales races entre
  // parenthèses (ex. « L'Alliance Céleste (Elfes, Fées, Aigles Géants…) »),
  // pour faciliter la navigation dans les sélecteurs. Cap à 3 races + « … ».
  factionNameWithRaces: (faction: string | null | undefined) => string;
  rarityLabel: (rarity: string | null | undefined) => string;
  clanName: (clan: string | null | undefined) => string;
  // Comme `clanName`, mais suffixé des races du clan entre parenthèses
  // (ex. « Les Sylvains (Elfes) »). Cap à 3 races + « … ».
  clanNameWithRaces: (clan: string | null | undefined) => string;
  raceName: (race: string | null | undefined) => string;
  alignmentLabel: (alignment: string | null | undefined) => string;
  // Nom de set localisé, indexé par le `code` stable du set (les sets sont des
  // lignes DB, pas des constantes moteur). Fallback : le nom DB (FR) fourni.
  setName: (code: string | null | undefined, fallbackName: string) => string;
  // Nom de format localisé, indexé par le `code` stable (`${mode}-${extent}`).
  // Fallback : le nom DB (FR) fourni.
  formatName: (code: string | null | undefined, fallbackName: string) => string;
  // Nom de token localisé, indexé par l'id `token_templates` (porté par la carte
  // token via `card.token_id`). Fallback : le nom FR canonique fourni.
  tokenName: (id: number | null | undefined, fallbackName: string) => string;
  // Descriptions de convocation localisées (nom du token + phrase). Le préfixe
  // « Crée … » et la liste sont composés côté helper avec SafeT.
  convocationTokens: (tokens: ConvocationTokenDef[], registry?: TokenTemplate[]) => string;
  convocationToken: (
    tokenId: number | null | undefined,
    registry?: TokenTemplate[],
    statOverride?: number | null,
  ) => string | null;
  convocationPrefix: (content: string) => string;
}

// Nombre max de races affichées entre parenthèses dans un libellé de sélecteur.
const MAX_RACES_LABEL = 3;

// « Base (Race1, Race2, Race3…) » — races localisées, tronquées à
// MAX_RACES_LABEL avec « … » si la faction/le clan en compte davantage.
function labelWithRaces(base: string, raceIds: string[], safe: SafeT): string {
  if (!base || raceIds.length === 0) return base;
  const shown = raceIds.slice(0, MAX_RACES_LABEL).map((r) => getRaceName(r, safe));
  const ellipsis = raceIds.length > MAX_RACES_LABEL ? "…" : "";
  return `${base} (${shown.join(", ")}${ellipsis})`;
}

export function useVocab(): Vocab {
  const t = useTranslations();

  // SafeT : ne renvoie une valeur que si la clé existe (sinon undefined →
  // fallback FR côté helper). Évite tout warning MISSING_MESSAGE.
  //
  // On utilise `t.raw` (pas `t`) : les gabarits de vocabulaire portent des
  // marqueurs littéraux « {x} », « {y} », « {amount} » que les helpers
  // substituent EUX-MÊMES (frag / .replace). Passer par `t()` déclencherait le
  // formatage ICU de next-intl, qui lève FORMATTING_ERROR sur ces variables non
  // fournies. `t.raw` renvoie la chaîne brute, sans interprétation ICU. Aucun
  // message `vocab.*` n'utilise de plural/select, donc c'est sans risque.
  const safe: SafeT = useCallback(
    (key: string) => {
      if (!t.has(key)) return undefined;
      const raw = t.raw(key);
      return typeof raw === "string" ? raw : undefined;
    },
    [t],
  );

  return useMemo(
    () => ({
      keywordLabel: (kw: Keyword) => getKeywordDisplayLabel(kw, safe),
      keywordDesc: (kw: Keyword, ctx?: KeywordDescCtx) =>
        describeKeyword(kw, ctx ?? {}, safe),
      keywordLabelFor: (kw: Keyword, ctx?: KeywordDescCtx) =>
        describeKeywordLabel(kw, ctx ?? {}, safe),
      keywordScopeNote: (grantScope: "target" | "all_allies" | null | undefined) =>
        keywordScopeNote(grantScope, safe),
      spellKeywordLabel: (kw: SpellKeywordInstance) =>
        getSpellKeywordLabel(kw, safe),
      spellKeywordDesc: (
        kw: SpellKeywordInstance,
        card?: Card | null,
        tokens?: TokenTemplate[],
      ) => getSpellKeywordDesc(kw, card, tokens, safe),
      composedName: (cap: Capability) => composedKeywordName(cap, safe),
      composedDesc: (cap: Capability, tokens?: TokenTemplate[]) =>
        describeComposedCap(cap, tokens, safe),
      factionName: (faction: string | null | undefined) =>
        getFactionDisplayName(faction, safe),
      factionNameWithRaces: (faction: string | null | undefined) =>
        labelWithRaces(getFactionDisplayName(faction, safe), getRacesForFaction(faction), safe),
      rarityLabel: (rarity: string | null | undefined) =>
        getRarityLabel(rarity, safe),
      clanName: (clan: string | null | undefined) => getClanName(clan, safe),
      clanNameWithRaces: (clan: string | null | undefined) =>
        labelWithRaces(getClanName(clan, safe), getRacesForClan(clan), safe),
      raceName: (race: string | null | undefined) => getRaceName(race, safe),
      alignmentLabel: (alignment: string | null | undefined) =>
        getAlignmentLabel(alignment, safe),
      setName: (code: string | null | undefined, fallbackName: string) =>
        (code ? safe(`vocab.sets.${code}`) : undefined) ?? fallbackName,
      formatName: (code: string | null | undefined, fallbackName: string) =>
        (code ? safe(`vocab.formats.${code}`) : undefined) ?? fallbackName,
      tokenName: (id: number | null | undefined, fallbackName: string) =>
        (id != null ? safe(`vocab.tokens.${id}`) : undefined) ?? fallbackName,
      convocationTokens: (tokens: ConvocationTokenDef[], registry?: TokenTemplate[]) =>
        formatConvocationTokens(tokens, registry, safe),
      convocationToken: (
        tokenId: number | null | undefined,
        registry?: TokenTemplate[],
        statOverride?: number | null,
      ) => formatConvocationToken(tokenId, registry, statOverride, safe),
      convocationPrefix: (content: string) => convocationPrefix(content, safe),
    }),
    [safe],
  );
}
