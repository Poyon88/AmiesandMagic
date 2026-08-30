import type { Keyword, KeywordInstance, KeywordMode } from "./types";
import type { SafeT } from "@/i18n/config";
import { KEYWORDS, KEYWORD_DESC_BY_ID } from "@/lib/card-engine/constants";
import { getRaceForm } from "@/lib/card-engine/race-forms";
import { KEYWORD_LABELS, getKeywordDisplayLabel, keywordModeColor } from "./keyword-labels";
import { AUTOMATIC_ABILITY_IDS, CURATED_MULTIMODE_IDS, DEATH_NATURE_IDS } from "./abilities";
import { LOW_HP_TRIGGER_THRESHOLD } from "./constants";
import { marker, resolveMarkers, type MarkerCtx, type Resolver } from "./desc-markers";
import { getClanForm } from "@/lib/card-engine/race-forms";
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
/** Le DÉCLENCHEUR annoncé après le nom d'un pouvoir : le mot ET sa couleur.
 *
 *  Les deux vont ENSEMBLE, et c'est le point : « (Mort) » doit être rouge,
 *  « (Entrée) » jaune, « (Permanent) » blanc. Les calculer séparément, dans
 *  cinq renderers, c'était garantir qu'ils finiraient par se contredire. */
export interface TriggerBadge {
  label: string;
  color: string;
}

/** Badge d'un mode d'affichage. Sert tel quel aux effets COMPOSÉS, dont le
 *  déclencheur est déjà un mode (cf. `composedTriggerMode`). */
export function triggerBadge(mode: KeywordMode | undefined, t?: SafeT): TriggerBadge | null {
  // `spell` ne désigne pas un déclencheur de créature mais la résolution du
  // sort porteur : aucun mot ne lui a été attribué.
  if (mode === "spell") return null;

  const cle = mode ?? "permanent";
  const brut = t?.(`vocab.triggers.${cle}`) ?? REPLI_FR[cle];
  if (!brut) return null;
  return {
    // SafeT rend la chaîne BRUTE (pas de formatage ICU) : la substitution est à
    // notre charge, comme partout dans ce module.
    label: brut.replace("{n}", String(LOW_HP_TRIGGER_THRESHOLD)),
    // Blanc pour un permanent — même règle que l'icône non teintée.
    color: keywordModeColor(mode) ?? "#fff",
  };
}

/** Badge d'un mot-clé de créature, tel qu'il s'annonce AU DOS D'UNE CARTE.
 *
 *  Le PERMANENT ne s'y annonce plus. « Raid (Permanent) » se lisait comme un
 *  qualificatif de durée, exactement le registre des emblèmes — qui, eux,
 *  disent « Emblème (permanent) » et désignent tout autre chose : un effet posé
 *  sur un joueur, qui survit à la carte. Deux mécaniques distinctes portant le
 *  même mot au même endroit, c'était un contresens installé.
 *
 *  Rien n'est perdu : un passif est déjà signalé par son icône BLANCHE, non
 *  teintée, et par l'absence de tout autre déclencheur. Le mot ne disait que ce
 *  que la couleur dit déjà.
 *
 *  `triggerBadge` garde son « Permanent » : la vitrine des clans s'en sert pour
 *  distinguer un profil dominant permanent d'une ÉGALITÉ entre déclencheurs, où
 *  il n'y a rien à affirmer. Les deux y sont blancs — le mot est le seul écart. */
export function keywordTriggerBadge(
  kw: Keyword,
  inst?: KeywordInstance,
  t?: SafeT,
): TriggerBadge | null {
  const mode = keywordTriggerMode(kw, inst);
  if (mode === undefined) return null;
  return triggerBadge(mode, t);
}

/** Le mot seul, sans sa couleur. Conservé pour les appels qui n'affichent pas. */
export function keywordTriggerLabel(
  kw: Keyword,
  inst?: KeywordInstance,
  t?: SafeT,
): string | null {
  return keywordTriggerBadge(kw, inst, t)?.label ?? null;
}

/** Déclencheur RÉEL d'un mot-clé, mode explicite d'abord.
 *
 *  Miroir de `defaultDisplayMode` (keyword-labels) à une correction près, qui
 *  est tout l'intérêt de cette fonction : les capacités « à la mort »
 *  INTRINSÈQUES (Carnage, Héritage, Maléfice, Martyr, Pacte de sang,
 *  Résurrection, Cycle éternel, Sacrifice démoniaque) sont stockées sans mode.
 *  `defaultDisplayMode` les laisse neutres pour garder leur ICÔNE blanche —
 *  choix d'affichage assumé — mais les annoncer « Permanent » serait faux :
 *  elles se déclenchent à la mort. Le mot et sa couleur suivent donc la
 *  réalité, l'icône garde sa neutralité. */
export function keywordTriggerMode(kw: Keyword, inst?: KeywordInstance): KeywordMode | undefined {
  if (inst?.mode) return inst.mode;
  if (CURATED_MULTIMODE_IDS.has(kw)) return "entry";
  if (DEATH_NATURE_IDS.has(kw)) return "death";
  if (AUTOMATIC_ABILITY_IDS.has(kw)) return undefined; // passif → « Permanent »
  return "entry";
}

const REPLI_FR: Record<string, string> = {
  permanent: "Permanent",
  entry: "Entrée",
  attack: "Attaque",
  death: "Mort",
  return: "Remontée",
  tap: "Activable",
  end_of_turn: "Fin de tour",
  draw: "Pioche",
  low_hp: "Sous {n} PV",
};

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

  // Esprit de corps EN PARTIE : phrase entièrement composée, elle aussi — la
  // forme générique (« par créature de même clan… ») oblige le joueur à compter
  // lui-même. Sans `espritCount` (forge, collection, mulligan) on garde la
  // forme générique, qui reste vraie.
  //
  // 0 point retombe volontairement sur la forme générique : « Gagne 0 fois »
  // serait la phrase la plus décourageante de la carte, alors que le compteur
  // grimpera dès la prochaine posée.
  if (kw === "esprit_de_corps" && (ctx.espritCount ?? 0) > 0) {
    // `marker` retombe déjà sur MARKERS_FR quand la locale ne porte rien.
    const tmpl = marker("edc_compte", t) ?? "";
    return tmpl
      .replace("{n}", String(ctx.espritCount))
      .replace("{clan_de}", getClanForm(ctx.card?.clan, t) ?? "");
  }

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
