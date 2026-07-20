import type { Card, Keyword, KeywordInstance, TokenTemplate } from "./types";
import type { SafeT } from "@/i18n/config";
import { getAlignmentLabel, getClanName, getEffectiveAlignment } from "@/lib/card-engine/constants";
import { getClanForm, getFactionForm, getRaceForm } from "@/lib/card-engine/race-forms";
import { getKeywordDisplayLabel } from "./keyword-labels";

// Marqueurs de description partagés par les DEUX registres : mots-clés créature
// (keyword-display.ts) et mots-clés de sort (spell-keywords.ts). Une capacité
// comme Sélection ou Appel Suprême existe dans les deux, avec la même
// description — si un seul chemin résolvait les marqueurs, l'autre afficherait
// « {alignment} » brut au joueur.
//
// Ce module ne dépend PAS de spell-keywords.ts : les résolveurs de token, qui
// en ont besoin, sont injectés par keyword-display.ts via `extra`. Sans cette
// séparation, les deux fichiers s'importeraient mutuellement.

export interface MarkerCtx {
  card?: Pick<
    Card,
    | "race" | "clan" | "faction" | "card_alignment" | "entraide_race"
    | "convocation_token_id" | "convocation_tokens" | "lycanthropie_token_id"
  > | null;
  /** Instance : porte la race/clan CIBLÉS et la capacité conférée. */
  instance?: Pick<KeywordInstance, "race" | "clan" | "grantScope" | "grantAbilityId" | "y"> | null;
  x?: number | null;
  y?: number | null;
  tokens?: TokenTemplate[];
}

// Replis employés quand la carte ne porte pas encore la valeur (carte en cours
// de création dans la forge, entrée legacy sans instance). Le texte FR est
// volontairement l'ANCIENNE formulation générique : le repli ne coûte donc
// aucune rédaction et la forge garde son comportement d'origine.
// Source unique + graine du générateur de vocab, comme COMPOSED_FR.
export const MARKERS_FR: Record<string, string> = {
  // Phrase nominale entière — « Ajoute en main {race} ».
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

export function marker(key: string, t?: SafeT): string | undefined {
  return t?.(`vocab.markers.${key}`) ?? MARKERS_FR[key];
}

// Race ciblée par CE mot-clé. Priorité à l'instance (Appel Suprême, Sélection
// stockent leur cible sur l'instance), puis au champ dédié d'Entraide, puis à
// la race de la carte elle-même (Loyauté, Martyr…).
function targetRace(kw: string, ctx: MarkerCtx): string | null | undefined {
  if (kw === "entraide") return ctx.card?.entraide_race ?? ctx.instance?.race;
  return ctx.instance?.race ?? ctx.card?.race;
}

function targetClan(ctx: MarkerCtx): string | null | undefined {
  return ctx.instance?.clan ?? ctx.card?.clan;
}

export type Resolver = (kw: string, ctx: MarkerCtx, t?: SafeT) => string | null;

export const BASE_RESOLVERS: Record<string, Resolver> = {
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
 * Substitue les marqueurs nommés puis X/Y.
 *
 * Ordre : marqueurs D'ABORD, X/Y ENSUITE — certains replis portent eux-mêmes un
 * gabarit (« un token X/X ») qui resterait littéral dans l'ordre inverse. Les
 * résolveurs consomment `ctx.x` directement, jamais la chaîne.
 *
 * Un marqueur sans valeur retombe sur sa forme générique ; un marqueur inconnu
 * reste littéral plutôt que de produire « undefined » à l'écran.
 */
export function resolveMarkers(
  text: string,
  kw: string,
  ctx: MarkerCtx,
  t?: SafeT,
  extra?: Record<string, Resolver>,
): string {
  let s = text.replace(/\{(\w+)\}/g, (literal, key: string) => {
    const resolver = extra?.[key] ?? BASE_RESOLVERS[key];
    return resolver?.(kw, ctx, t) ?? marker(key, t) ?? literal;
  });
  if (ctx.x != null) s = s.replace(/X/g, String(ctx.x));
  const y = ctx.y ?? ctx.instance?.y;
  if (y != null) s = s.replace(/Y/g, String(y));
  return s;
}
