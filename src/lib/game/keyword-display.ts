import type { Card, Keyword, KeywordInstance, TokenTemplate } from "./types";
import type { SafeT } from "@/i18n/config";
import { KEYWORDS, KEYWORD_DESC_BY_ID, getEffectiveAlignment, getAlignmentLabel, getClanName } from "@/lib/card-engine/constants";
import { getRaceForm, getClanForm, getFactionForm } from "@/lib/card-engine/race-forms";
import { KEYWORD_LABELS, getKeywordDisplayLabel } from "./keyword-labels";
import {
  convocationPrefix,
  formatConvocationToken,
  formatConvocationTokens,
} from "./spell-keywords";

// Rendu des descriptions de mots-clés CRÉATURE, avec les valeurs concrètes de
// la carte (« Ajoute en main le Démon… » plutôt que « …la créature de la race
// choisie »).
//
// Ce module remplace `keywordDesc(kw, x)`, qui ne recevait qu'un scalaire :
// faute de canal vers la carte, six composants réécrivaient la description
// après coup, en code dupliqué et parfois en français codé en dur. Tout est
// désormais ici. Modèle repris de `getSpellKeywordDesc` (spell-keywords.ts).
//
// La substitution est manuelle (`.replace`), JAMAIS ICU : SafeT renvoie du brut
// via `t.raw`, sinon next-intl lèverait FORMATTING_ERROR sur les marqueurs non
// fournis (cf. useVocab.ts).

export interface KeywordDescCtx {
  /** Carte porteuse. Null en l'absence de contexte (tooltips de registre). */
  card?: Pick<
    Card,
    | "race" | "clan" | "faction" | "card_alignment" | "entraide_race"
    | "convocation_token_id" | "convocation_tokens" | "lycanthropie_token_id"
  > | null;
  /** Instance du mot-clé : porte la race/clan CIBLÉS et la capacité conférée. */
  instance?: KeywordInstance | null;
  x?: number | null;
  y?: number | null;
  /** Registre des tokens, pour résoudre les convocations. */
  tokens?: TokenTemplate[];
}

// Replis génériques, employés quand la carte ne porte pas encore la valeur
// (carte en cours de création dans la forge, entrée legacy sans instance).
// Le texte FR est volontairement l'ANCIENNE formulation générique : le repli ne
// coûte donc aucune rédaction et la forge garde son comportement d'origine.
// Source unique + graine du générateur de vocab, comme COMPOSED_FR.
export const MARKERS_FR: Record<string, string> = {
  // Phrase nominale entière — « Ajoute en main {race} » .
  "race": "la créature de la race choisie",
  // Qualificatif POST-NOMINAL — « par allié {race_bare} ». Le repli doit se
  // placer au même endroit que la valeur concrète, d'où « de même race » et
  // non « allié de même race » (qui doublerait le nom).
  "race_bare": "de même race",
  "race_de": "de même race",
  // Après déterminant — « vos {race_pl} ».
  "race_pl": "unités de même race",
  "clan": "votre clan",
  "clan_de": "de même clan",
  "faction": "votre faction",
  "faction_de": "de même faction",
  "alignment": "du même alignement",
  // Gabarit de l'alignement concret : localisable, contrairement à une
  // préposition recollée dans le résolveur.
  "alignment_of": "d'alignement {a}",
  "token": "le token configuré",
  "tokens": "plusieurs tokens",
  "lycanthrope": "un token X/X",
  "ability": "une capacité",
  "scope": "à une unité alliée (ou à toutes)",
  "scope_target": "à une unité alliée",
  "scope_all": "à toutes vos unités",
};

function marker(key: string, t?: SafeT): string | undefined {
  return t?.(`vocab.markers.${key}`) ?? MARKERS_FR[key];
}

// Race ciblée par CE mot-clé. Priorité à l'instance (Appel Suprême,
// Renforcement multiple stockent leur cible sur l'instance), puis au champ
// dédié d'Entraide, puis à la race de la carte elle-même (Loyauté, Martyr…).
function targetRace(kw: Keyword, ctx: KeywordDescCtx): string | null | undefined {
  if (kw === "entraide") return ctx.card?.entraide_race ?? ctx.instance?.race;
  return ctx.instance?.race ?? ctx.card?.race;
}

function targetClan(ctx: KeywordDescCtx): string | null | undefined {
  return ctx.instance?.clan ?? ctx.card?.clan;
}

type Resolver = (kw: Keyword, ctx: KeywordDescCtx, t?: SafeT) => string | null;

const RESOLVERS: Record<string, Resolver> = {
  race: (kw, ctx, t) => getRaceForm(targetRace(kw, ctx), "def", t),
  race_bare: (kw, ctx, t) => getRaceForm(targetRace(kw, ctx), "bare", t),
  race_de: (kw, ctx, t) => getRaceForm(targetRace(kw, ctx), "de", t),
  race_pl: (kw, ctx, t) => getRaceForm(targetRace(kw, ctx), "pl", t),
  clan: (_kw, ctx, t) => {
    const c = targetClan(ctx);
    return c ? getClanName(c, t) : null;
  },
  clan_de: (_kw, ctx, t) => getClanForm(targetClan(ctx), t),
  faction: (_kw, ctx, t) => {
    const f = ctx.card?.faction;
    return f ? getFactionForm(f, t) : null;
  },
  faction_de: (_kw, ctx, t) => getFactionForm(ctx.card?.faction, t),
  alignment: (_kw, ctx, t) => {
    if (!ctx.card) return null;
    const a = getEffectiveAlignment(ctx.card);
    if (!a) return null;
    const tmpl = marker("alignment_of", t) ?? "d'alignement {a}";
    return tmpl.replace(/\{a\}/g, getAlignmentLabel(a, t));
  },
  token: (kw, ctx, t) =>
    formatConvocationToken(
      ctx.card?.convocation_token_id,
      ctx.tokens,
      // Convocation X crée un X/X ; Convocation simple garde les stats du modèle.
      kw === "convocation" ? ctx.x : null,
      t,
    ),
  tokens: (_kw, ctx, t) =>
    ctx.card?.convocation_tokens?.length
      ? formatConvocationTokens(ctx.card.convocation_tokens, ctx.tokens, t)
      : null,
  lycanthrope: (_kw, ctx, t) =>
    formatConvocationToken(ctx.card?.lycanthropie_token_id, ctx.tokens, ctx.x, t),
  ability: (_kw, ctx, t) => {
    const id = ctx.instance?.grantAbilityId;
    return id ? getKeywordDisplayLabel(id as Keyword, t) : null;
  },
  scope: (_kw, ctx, t) => {
    const sc = ctx.instance?.grantScope;
    if (sc === "all_allies") return marker("scope_all", t) ?? null;
    if (sc === "target") return marker("scope_target", t) ?? null;
    return null;
  },
};

/**
 * Suffixe de portée d'un mot-clé CONFÉRÉ par un sort (« · à tous les alliés »).
 * Réutilise les clés déjà employées par SpellCastOverlay — GameCard portait la
 * même note en français codé en dur, faute de traducteur dans ce composant.
 */
export function keywordScopeNote(
  grantScope: "target" | "all_allies" | null | undefined,
  t?: SafeT,
): string | null {
  if (grantScope === "all_allies") {
    return t?.("game.spell_grant_all_allies") ?? " · à tous les alliés";
  }
  if (grantScope === "target") {
    return t?.("game.spell_grant_target") ?? " · à la créature ciblée";
  }
  return null;
}

/** Gabarit brut d'un mot-clé : message localisé, sinon repli FR du registre. */
function template(kw: Keyword, t?: SafeT): string | null {
  const forgeKey = KEYWORD_LABELS[kw];
  const fallback =
    (forgeKey ? KEYWORDS[forgeKey]?.desc : undefined) ?? KEYWORD_DESC_BY_ID[kw];
  return t?.(`vocab.keywords.${kw}.desc`) ?? fallback ?? null;
}

/**
 * Description affichée d'un mot-clé créature, marqueurs résolus.
 * Renvoie null si le mot-clé n'a pas de description.
 */
export function describeKeyword(
  kw: Keyword,
  ctx: KeywordDescCtx = {},
  t?: SafeT,
): string | null {
  let s = template(kw, t);
  if (!s) return null;

  // Marqueurs D'ABORD. Un marqueur sans valeur retombe sur sa forme générique ;
  // un marqueur inconnu reste littéral plutôt que de produire « undefined ».
  s = s.replace(/\{(\w+)\}/g, (literal, key: string) => {
    const resolved = RESOLVERS[key]?.(kw, ctx, t);
    return resolved ?? marker(key, t) ?? literal;
  });

  // X/Y ENSUITE : certains replis portent eux-mêmes un gabarit (« un token
  // X/X »), qui resterait littéral si l'ordre était inversé. Les résolveurs
  // consomment ctx.x directement, jamais la chaîne.
  if (ctx.x != null) s = s.replace(/X/g, String(ctx.x));
  const y = ctx.y ?? ctx.instance?.y;
  if (y != null) s = s.replace(/Y/g, String(y));

  // Convocations multiples : phrase entièrement composée, pas un simple
  // remplacement (la liste groupe les tokens identiques).
  if (kw === "convocations_multiples" && ctx.card?.convocation_tokens?.length) {
    return convocationPrefix(
      formatConvocationTokens(ctx.card.convocation_tokens, ctx.tokens, t),
      t,
    );
  }

  return s;
}

/**
 * Libellé affiché d'un mot-clé, suffixé de sa cible quand elle est portée par
 * la carte — remplace le `${label} (${card.entraide_race})` dupliqué dans les
 * composants, qui affichait la race BRUTE, jamais localisée.
 */
export function describeKeywordLabel(
  kw: Keyword,
  ctx: KeywordDescCtx = {},
  t?: SafeT,
): string {
  const label = getKeywordDisplayLabel(kw, t);
  if (kw !== "entraide") return label;
  const race = getRaceForm(ctx.card?.entraide_race, "pl", t);
  return race ? `${label} (${race})` : label;
}
