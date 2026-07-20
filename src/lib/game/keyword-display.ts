import type { Keyword } from "./types";
import type { SafeT } from "@/i18n/config";
import { KEYWORDS, KEYWORD_DESC_BY_ID } from "@/lib/card-engine/constants";
import { getRaceForm } from "@/lib/card-engine/race-forms";
import { KEYWORD_LABELS, getKeywordDisplayLabel } from "./keyword-labels";
import { resolveMarkers, type MarkerCtx, type Resolver } from "./desc-markers";
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

export type KeywordDescCtx = MarkerCtx;

// Résolveurs propres aux mots-clés CRÉATURE : les convocations ont besoin du
// registre de tokens, que desc-markers.ts ne peut pas importer sans créer un
// cycle avec spell-keywords.ts. Ils s'ajoutent aux résolveurs de base.
const TOKEN_RESOLVERS: Record<string, Resolver> = {
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
  const tmpl = template(kw, t);
  if (!tmpl) return null;
  const s = resolveMarkers(tmpl, kw, ctx, t, TOKEN_RESOLVERS);

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
