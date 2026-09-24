import type { Card, Keyword, KeywordInstance, KeywordMode, TokenTemplate } from "./types";
import { LOW_HP_TRIGGER_THRESHOLD } from "./constants";
import type { SafeT } from "@/i18n/config";
import { getAlignmentLabel, getClanName, getEffectiveAlignment } from "@/lib/card-engine/constants";
import { getClanForm, getFactionForm, getRaceForm } from "@/lib/card-engine/race-forms";
import { getKeywordDisplayLabel } from "./keyword-labels";
import { KEYWORD_DEFAULT_X } from "./abilities";

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
  instance?: Pick<KeywordInstance, "race" | "clan" | "grantScope" | "grantAbilityId" | "y" | "costs" | "faction" | "mode" | "singulier" | "randomX" | "randomY"> | null;
  /** Esprit de corps : combien de points cette carte gagnerait si elle
   *  déclenchait maintenant (cf. `espritDeCorpsPoints`). Le SEUL champ de ce
   *  contexte qui dépende de l'état de la PARTIE et non de la carte — il n'est
   *  donc renseigné que par les composants de jeu (plateau, main). Absent
   *  (forge, collection, mulligan), la description reste sa forme générique. */
  espritCount?: number | null;
  x?: number | null;
  y?: number | null;
  /** SÉLECTION AU HASARD : X s'affiche « 1 à X ». Lu ici, sinon sur
   *  `instance.randomX` — les appelants qui passent l'instance n'ont rien à
   *  ajouter. */
  randomX?: boolean | null;
  tokens?: TokenTemplate[];
}

/** « 1 à {max} », localisé — la même formule que les amplitudes composées
 *  (`vocab.composed.content.random_range`), pour que les deux modèles parlent
 *  d'une seule voix sur la carte. */
export function plageAleatoire(max: number, t?: SafeT): string {
  return (t?.("vocab.composed.content.random_range") ?? "1 à {max}").replace("{max}", String(max));
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
  // Invocations multiples : phrase spécifique, à l'image de Convocations
  // multiples (« Crée 2 tokens Loups 2/2 et un token Ours 3/3 »). Le repli
  // générique ne sert qu'à la carte en cours de création, avant toute saisie.
  "invocations": "plusieurs créatures aléatoires de votre collection",
  "invocations_first_one": "une créature aléatoire de coût {cost}",
  "invocations_first_many": "{count} créatures aléatoires de coût {cost}",
  "invocations_more_one": "une de coût {cost}",
  "invocations_more_many": "{count} de coût {cost}",
  "invocations_join": " et ",
  "invocations_of_race": " (parmi les {v})",
  "invocations_of_faction": " (parmi la faction {v})",
  "lycanthrope": "un token X/X",
  "ability": "une capacité",
  "scope": "à une unité alliée (ou à toutes)",
  // Portée d'un Renforcement multiple : clan, race, ou rien (= toutes).
  // L'espace de tête vit DANS le fragment : la portée « toutes » est vide, et
  // un espace figé dans le gabarit laisserait « à vos créatures .ature ».
  "rm_scope": " de la race ou du clan choisi",
  "rm_scope_race": " de race {v}",
  "rm_scope_clan": " du clan {v}",
  "rm_scope_all": "",
  "scope_target": "à une unité alliée",
  // Esprit de corps EN PARTIE : phrase entièrement recomposée (et non un
  // fragment inséré), pour que le joueur lise le total sans avoir à le
  // calculer. Composée dans describeKeyword, comme Convocations multiples :
  // resolveMarkers ne fait qu'UNE passe, un {clan_de} renvoyé par un résolveur
  // resterait littéral à l'écran.
  "edc_compte": "Gagne {n} fois +1 ATK ou +1 PV au hasard (1 par créature {clan_de} avec Esprit de corps déjà jouée).",
  "scope_all": "à toutes vos unités",
};

export function marker(key: string, t?: SafeT): string | undefined {
  return t?.(`vocab.markers.${key}`) ?? MARKERS_FR[key];
}

// ─── SINGULIER ──────────────────────────────────────────────────────────────

/** Repli FR du moment de déclenchement, dans la phrase d'aide Singulier. */
const SINGULIER_TIMING_FR: Record<string, string> = {
  entry: "à l'entrée", death: "à la mort", tap: "à l'activation", return: "au retour en main",
  attack: "à l'attaque", end_of_turn: "à la fin du tour", start_of_turn: "au début du tour", draw: "à la pioche",
  low_hp: "sous {n} PV", wound: "quand elle est blessée sans mourir", spell: "à la résolution du sort",
};
const SINGULIER_HELP_FR = "Se déclenche {timing} si votre deck de départ ne contenait aucune carte en double.";
const SINGULIER_HELP_PERMANENT_FR = "Actif si votre deck de départ ne contenait aucune carte en double.";

/** Phrase d'aide de la condition Singulier, pour un moment de déclenchement
 *  donné (`undefined` = passif/permanent). Localisée par `vocab.singulier.*`,
 *  repli FR. */
export function singulierHelp(mode: KeywordMode | undefined, t?: SafeT): string {
  if (mode === undefined) return t?.("vocab.singulier.help_permanent") ?? SINGULIER_HELP_PERMANENT_FR;
  const timing = (t?.(`vocab.singulier.timing.${mode}`) ?? SINGULIER_TIMING_FR[mode] ?? mode)
    .replace("{n}", String(LOW_HP_TRIGGER_THRESHOLD));
  return (t?.("vocab.singulier.help") ?? SINGULIER_HELP_FR).replace("{timing}", timing);
}

/** Mot « Singulier » tel qu'il s'annonce dans un badge. */
export function singulierLabel(t?: SafeT): string {
  return t?.("vocab.singulier.label") ?? "Singulier";
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
  // Invocations multiples : énumère ce qui sera RÉELLEMENT invoqué — « une
  // créature aléatoire de coût 4, une de coût 5 et une de coût 6 (parmi les
  // Hommes-Bêtes) ». Les coûts identiques sont groupés, comme Convocations
  // multiples groupe les tokens identiques. Sans liste saisie, on retombe sur
  // le repli générique.
  // Renforcement multiple : « de race X », « du clan Y », ou RIEN quand aucune
  // restriction n'est saisie — le bonus vise alors toutes vos créatures.
  rm_scope: (_kw, ctx, t) => {
    const clan = ctx.instance?.clan;
    if (clan) return (marker("rm_scope_clan", t) ?? "").replace(/\{v\}/g, clan);
    const race = ctx.instance?.race;
    if (race) return (marker("rm_scope_race", t) ?? "").replace(/\{v\}/g, race);
    return marker("rm_scope_all", t) ?? "";
  },
  invocations: (_kw, ctx, t) => {
    const list = (ctx.instance?.costs ?? []).filter((n) => typeof n === "number" && n > 0);
    if (list.length === 0) return null;

    // Groupement par coût, en conservant l'ordre de première apparition.
    const groups: { cost: number; count: number }[] = [];
    for (const cost of list) {
      const g = groups.find((x) => x.cost === cost);
      if (g) g.count++;
      else groups.push({ cost, count: 1 });
    }

    const parts = groups.map((g, i) => {
      const key = i === 0
        ? (g.count > 1 ? "invocations_first_many" : "invocations_first_one")
        : (g.count > 1 ? "invocations_more_many" : "invocations_more_one");
      return (marker(key, t) ?? "")
        .replace(/\{cost\}/g, String(g.cost))
        .replace(/\{count\}/g, String(g.count));
    });

    const joined = parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")}${marker("invocations_join", t) ?? " et "}${parts[parts.length - 1]}`;

    // Restriction de pool : race ou faction, sinon l'alignement (implicite, non dit).
    const race = ctx.instance?.race;
    const faction = ctx.instance?.faction;
    const suffix = race
      ? (marker("invocations_of_race", t) ?? "").replace(/\{v\}/g, race)
      : faction
        ? (marker("invocations_of_faction", t) ?? "").replace(/\{v\}/g, faction)
        : "";
    return joined + suffix;
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
  // X ABSENT : on retombe sur le X implicite de la capacité (KEYWORD_DEFAULT_X)
  // avant de renoncer. Sans ce repli, une capacité devenue scalable après coup
  // décrivait « +X/+X à vos alliés » sur toutes les cartes d'avant la
  // conversion — la lettre à l'écran, au lieu du chiffre qu'elles appliquent
  // réellement. Même repli, même table et même raison que du côté du LIBELLÉ
  // (applyKeywordValueToLabel).
  const x = ctx.x ?? KEYWORD_DEFAULT_X[kw];
  if (x != null) {
    const alea = (ctx.randomX ?? ctx.instance?.randomX) === true && x > 1;
    s = s.replace(/X/g, alea ? plageAleatoire(x, t) : String(x));
  }
  const y = ctx.y ?? ctx.instance?.y;
  if (y != null) {
    // Déchainement au hasard : « coût 1 à Y ».
    const aleaY = ctx.instance?.randomY === true && y > 1;
    s = s.replace(/Y/g, aleaY ? plageAleatoire(y, t) : String(y));
  }
  return s;
}
