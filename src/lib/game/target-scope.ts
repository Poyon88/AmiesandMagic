// PORTÉE « TOUTES » des capacités qui ciblent une créature.
//
// Une capacité ciblée (Impact, Entrave, Affaiblissement, Remontée…) peut, au
// choix de l'auteur, frapper TOUTES les créatures d'un camp au lieu d'une cible
// désignée. Chaque créature reçoit l'effet ENTIER — Siphon et Vampirisme rendent
// donc X par créature touchée. Seules les créatures sont visées, sauf deux
// exceptions voulues par l'auteur (2026-10-27) : Exécution et Silence frappent
// AUSSI les objets du camp, Guérison soigne AUSSI le héros allié
// (cf. ciblesDePortee).
//
// Ce module est la SOURCE UNIQUE de trois questions, lues par le moteur, la
// forge et le rendu des cartes :
//   - quelles capacités s'ouvrent à la portée « toutes », et vers quels camps ;
//   - quelles créatures une portée désigne à un instant donné ;
//   - comment la portée se nomme.

import type { Capability, CardInstance, KeywordInstance, PlayerState, SpellKeywordId, SpellKeywordInstance, SpellTargetType, TargetScope } from "./types";
import { SPELL_KEYWORDS } from "./abilities";

export type { TargetScope };

const TOUS_CAMPS: TargetScope[] = ["all_enemies", "all_allies", "all"];

/** Capacités qui ciblent une CARTE du cimetière, pas une créature en jeu :
 *  « toutes » n'y a pas de sens. Incinération vise un camp entier (son
 *  cimetière), pas une unité. */
const SORTS_HORS_PORTEE = new Set<string>(["rappel", "exhumation", "incineration"]);

function campsDuType(t: SpellTargetType | undefined): TargetScope[] {
  switch (t) {
    case "enemy_creature": return ["all_enemies"];
    case "friendly_creature":
    case "friendly_any": return ["all_allies"];
    case "any":
    case "any_creature":
    case "any_creature_or_item": return TOUS_CAMPS;
    default: return [];
  }
}

/** Camps ouverts à la portée « toutes » pour un mot-clé de SORT. Déduits du type
 *  de cible déclaré au registre : une capacité qui ne visait que l'ennemi ne
 *  peut frapper que tous les ennemis. [] ⇒ pas de portée « toutes ». */
export function spellScopes(id: SpellKeywordId | string): TargetScope[] {
  if (SORTS_HORS_PORTEE.has(id)) return [];
  const def = SPELL_KEYWORDS[id as SpellKeywordId];
  if (!def?.needsTarget) return [];
  return campsDuType(def.targetType);
}

/** Camps ouverts pour un mot-clé de CRÉATURE (id moteur). Déclaré à la main :
 *  côté créature, le camp visé n'est écrit dans aucun registre, il vit dans
 *  chaque résolveur — la liste suit ce qu'ils acceptent.
 *
 *  Exclues, car une seule cible fait leur sens : Sacrifice, Permutation,
 *  Mimique, Métamorphose, Incinération. Conférer a SA propre portée
 *  (`grantScope`, « tous les alliés ») depuis bien avant ce module. */
const CREATURE_SCOPES: Record<string, TargetScope[]> = {
  impact: TOUS_CAMPS,
  remontee: TOUS_CAMPS,
  retour_differe: TOUS_CAMPS,
  devoration: TOUS_CAMPS,
  affaiblissement: ["all_enemies"],
  malediction: ["all_enemies"],
  vampirisme: ["all_enemies"],
  corruption: ["all_enemies"],
  domination: ["all_enemies"],
  benediction: ["all_allies"],
  // Renforcement / Discipline : une autre unité désignée par défaut, ou
  // elle-même (KeywordInstance.recipient) ; « toutes » = toutes les AUTRES.
  renforcement: ["all_allies"],
  discipline: ["all_allies"],
  usurpation: ["all_allies"],
  // Auras conditionnelles : elle-même par défaut (« S »), ou toutes les AUTRES
  // unités alliées tant que la condition tient (« A »).
  purete: ["all_allies"],
  force_des_ancetres: ["all_allies"],
  seuil_sacrificiel: ["all_allies"],
  // Neutralisation : une ennemie ciblée, ou toutes (aura continue).
  neutralisation: ["all_enemies"],
  tactique: ["all_allies"],
  // Formes créature des actions ciblées (2026-10-27).
  execution: ["all_enemies"],
  silence: TOUS_CAMPS,
  guerison: ["all_allies"],
};

export function creatureScopes(id: string): TargetScope[] {
  return CREATURE_SCOPES[id] ?? [];
}

/** Portée effective : celle demandée si la capacité l'accepte, sinon aucune.
 *  Filet contre une donnée incohérente (portée « alliées » sur une capacité
 *  qui ne vise que l'ennemi) : on retombe sur le ciblage, jamais sur un camp
 *  que la capacité ne connaît pas. */
export function porteeValide(scope: TargetScope | undefined, ouvertes: TargetScope[]): TargetScope | undefined {
  return scope && ouvertes.includes(scope) ? scope : undefined;
}

/** Créatures désignées par la portée, INSTANTANÉ pris avant tout effet : une
 *  créature qui arrive ou change de camp pendant la résolution n'est pas
 *  rattrapée, une qui meurt est simplement sautée par le résolveur. Ordre :
 *  ennemies puis alliées, dans l'ordre du plateau. `exclude` retire la source
 *  (une créature ne se dévore ni ne se transmet ses capacités). */
export function creaturesDePortee(
  scope: TargetScope,
  owner: PlayerState,
  opponent: PlayerState,
  exclude?: string,
): CardInstance[] {
  const camps = scope === "all_enemies" ? [opponent.board]
    : scope === "all_allies" ? [owner.board]
    : [opponent.board, owner.board];
  return camps.flatMap((b) => b.filter((c) => c.instanceId !== exclude));
}

/** Capacités dont la portée « toutes » frappe AUSSI les objets du camp visé. */
const PORTEE_AVEC_OBJETS = new Set<string>(["execution", "silence"]);
/** Capacités dont la portée « toutes » touche AUSSI le héros allié. */
const PORTEE_AVEC_HEROS_ALLIE = new Set<string>(["guerison"]);

/** Ids désignés par la portée d'une capacité : les créatures (cf.
 *  creaturesDePortee), puis les objets en jeu du camp pour Exécution et
 *  Silence, puis la sentinelle "friendly_hero" (relative à `owner`) pour
 *  Guérison. Même instantané : rien d'arrivé en cours de résolution. */
export function ciblesDePortee(
  id: string,
  scope: TargetScope,
  owner: PlayerState,
  opponent: PlayerState,
  exclude?: string,
): string[] {
  const ids = creaturesDePortee(scope, owner, opponent, exclude).map((c) => c.instanceId);
  if (PORTEE_AVEC_OBJETS.has(id)) {
    const camps = scope === "all_enemies" ? [opponent] : scope === "all_allies" ? [owner] : [opponent, owner];
    for (const p of camps) for (const o of p.items ?? []) ids.push(o.instanceId);
  }
  if (PORTEE_AVEC_HEROS_ALLIE.has(id) && scope !== "all_enemies") ids.push("friendly_hero");
  return ids;
}

/** Libellés FR (repli des clés `vocab.target_scope.*`). */
export const TARGET_SCOPE_FR: Record<TargetScope, string> = {
  all_enemies: "toutes les unités ennemies",
  all_allies: "toutes les unités alliées",
  all: "toutes les unités",
};

/** Forme courte, pour les sélecteurs de la forge. */
export const TARGET_SCOPE_SHORT_FR: Record<TargetScope | "target", string> = {
  target: "Cible",
  all_enemies: "Toutes ennemies",
  all_allies: "Toutes alliées",
  all: "Toutes",
};

// ─── affichage : le « A » de portée ────────────────────────────────────────

/** Portée « toutes » d'un mot-clé de SORT, pour le rendu. */
export function spellKwScope(sk: Pick<SpellKeywordInstance, "id" | "targetScope"> | null | undefined): TargetScope | undefined {
  return sk ? porteeValide(sk.targetScope, spellScopes(sk.id)) : undefined;
}

/** Portée « toutes » d'une instance de mot-clé de CRÉATURE, pour le rendu.
 *  Conférer à tous les alliés (`grantScope`) en fait partie : même « A », que la
 *  capacité soit portée par une action ou par une créature. */
export function kwInstanceScope(inst: Pick<KeywordInstance, "id" | "targetScope" | "grantScope"> | null | undefined): TargetScope | undefined {
  if (!inst) return undefined;
  const scope = porteeValide(inst.targetScope, creatureScopes(inst.id as unknown as string));
  if (scope) return scope;
  return inst.grantScope === "all_allies" ? "all_allies" : undefined;
}

/** Portée « toutes » d'un effet COMPOSÉ : désignation de TOUTES les unités d'un
 *  plateau. Les autres désignations (au choix, au hasard, N unités) n'en ont pas. */
export function composedScope(cap: Pick<Capability, "composed"> | null | undefined): TargetScope | undefined {
  const t = cap?.composed?.target;
  if (!t || t.count !== "all" || t.location !== "board") return undefined;
  if (t.entity !== "unit" && t.entity !== "both") return undefined;
  return t.side === "ally" ? "all_allies" : t.side === "enemy" ? "all_enemies" : "all";
}

// ─── affichage : le « S » d'une capacité tournée vers soi ──────────────────

/** Libellé lu par les lecteurs d'écran sur le « S ». */
export const SOI_ARIA_FR = "Sur elle-même";

/** Capacités de créature dont le BÉNÉFICIAIRE est réglable : une autre unité
 *  désignée (défaut), elle-même (`recipient: "self"`, « S »), ou toutes
 *  (portée « A »). Source unique du moteur, de la forge et du rendu. */
export const BENEFICIAIRE_REGLABLE: ReadonlySet<string> = new Set(["renforcement", "discipline", "usurpation", "silence", "guerison"]);

/** AURAS conditionnelles (Pureté, Force des ancêtres, Seuil Sacrificiel) :
 *  elles-mêmes par DÉFAUT (« S »), ou toutes les autres unités alliées (« A »).
 *  Pas d'« autre unité désignée » : une aura n'a pas de cible durable. */
export const AURA_SOI_OU_TOUTES: ReadonlySet<string> = new Set(["purete", "force_des_ancetres", "seuil_sacrificiel"]);

/** Capacité de créature réglée sur « elle-même » (« S ») : l'effet ne va pas à
 *  une autre unité, comme le voudrait la forme sort. Une aura conditionnelle
 *  l'est dès qu'elle n'est pas en portée « toutes ». */
export function kwInstanceSoi(inst: Pick<KeywordInstance, "id" | "recipient" | "targetScope"> | null | undefined): boolean {
  if (!inst || porteeValide(inst.targetScope, creatureScopes(inst.id))) return false;
  return AURA_SOI_OU_TOUTES.has(inst.id) || (BENEFICIAIRE_REGLABLE.has(inst.id) && inst.recipient === "self");
}

/** Effet COMPOSÉ qui se vise lui-même (cible « Soi-même »). */
export function composedSoi(cap: Pick<Capability, "composed"> | null | undefined): boolean {
  return cap?.composed?.target?.entity === "self";
}

/** Libellé lu par les lecteurs d'écran sur le « A ». */
export function scopeAriaLabel(scope: TargetScope): string {
  return TARGET_SCOPE_FR[scope].charAt(0).toUpperCase() + TARGET_SCOPE_FR[scope].slice(1);
}

// ─── description : variante « toutes » ────────────────────────────────────
//
// La description d'une capacité ciblée parle d'UNE cible (« Paralyse une
// créature ennemie ciblée »). En portée « toutes », elle est remplacée par sa
// variante ci-dessous, où `{cibles}` devient « toutes les créatures ennemies »
// (alliées, des deux camps). Les X/Y et autres marqueurs sont substitués ensuite
// par le chemin habituel. Clés de traduction : vocab.target_scope.spell.{id},
// vocab.target_scope.creature.{id}, vocab.target_scope.cibles.{portée}.

/** Groupe nominal de la portée, sans préposition (« Inflige X dégâts à {cibles} »). */
export const TARGET_SCOPE_CIBLES_FR: Record<TargetScope, string> = {
  all_enemies: "toutes les unités ennemies",
  all_allies: "toutes les unités alliées",
  all: "toutes les unités des deux camps",
};

const DESC_TOUTES_COMMUNES: Record<string, string> = {
  impact: "Inflige X dégâts à {cibles}.",
  affaiblissement: "Donne -X ATK et -Y PV à {cibles}.",
  retour_differe: "Place {cibles} sous le deck de leur propriétaire.",
  remontee: "Renvoie {cibles} dans la main de leur propriétaire d'origine.",
  corruption: "Convertit {cibles} à votre camp jusqu'à la fin du tour, dans la limite des places ; elles gagnent Traque.",
  domination: "Prend le contrôle de {cibles}, dans la limite des places.",
  benediction: "Soigne complètement {cibles}.",
};

/** Variantes « toutes » des mots-clés de SORT (repli FR). */
export const SPELL_SCOPE_DESC_FR: Record<string, string> = {
  ...DESC_TOUTES_COMMUNES,
  poison: "Empoisonne {cibles} : elles perdent 1 PV à chaque fin de tour.",
  siphon: "Inflige X dégâts à {cibles} et soigne votre héros de X par unité touchée.",
  entrave: "Paralyse {cibles} pendant X tour(s).",
  execution: "Détruit {cibles}, objets compris.",
  silence: "Retire tous les mots-clés de {cibles}, objets compris, et ramène leurs stats à leur valeur d'origine.",
  renforcement: "+X/+Y à {cibles}.",
  discipline: "Si toutes vos créatures en jeu ont un coût de même parité que celui de cette action, +X/+Y à {cibles}.",
  usurpation: "+X/+Y à {cibles} par carte adverse que vous avez jouée.",
  guerison: "Restaure X PV à {cibles} et à votre héros.",
};

/** Variantes « toutes » des mots-clés de CRÉATURE (repli FR). Neutralisation
 *  n'y figure pas : sa description dit déjà sa portée ({neutralise_cible}). */
export const CREATURE_SCOPE_DESC_FR: Record<string, string> = {
  ...DESC_TOUTES_COMMUNES,
  malediction: "Maudit {cibles} : elles sont exilées à la fin du prochain tour adverse.",
  tactique: "Attribue définitivement X de ses capacités permanentes, tirées au hasard, à {cibles} (un tirage par unité).",
  vampirisme: "Vole X PV à {cibles} et les ajoute aux PV de cette unité.",
  devoration: "Détruit {cibles} ; cette unité gagne définitivement leur ATK et leurs PV.",
  execution: "Détruit {cibles}, objets compris.",
  silence: "Retire tous les mots-clés de {cibles}, objets compris, et ramène leurs stats à leur valeur d'origine.",
  // Source exclue, comme pour Renforcement : « autres ».
  guerison: "Restaure X PV à toutes les autres unités alliées et à votre héros.",
  // Auras conditionnelles en portée « toutes » (source exclue : « autres »).
  purete: "Tant que votre cimetière est vide, toutes les autres unités alliées gagnent +X ATK et +Y PV.",
  force_des_ancetres: "Tant que votre cimetière compte 7 créatures ou plus, toutes les autres unités alliées gagnent +X ATK et +Y PV.",
  seuil_sacrificiel: "Tant que votre deck compte 25 cartes ou moins, toutes les autres unités alliées gagnent +X ATK et +Y PV.",
  // La source est exclue de la portée : « autres » le dit, {cibles} ne le
  // dirait pas.
  renforcement: "Donne +X ATK et +Y PV de façon permanente à toutes les autres unités alliées.",
  discipline: "Si tous les coûts de votre plateau ont la parité du sien, donne +X/+Y permanent à toutes les autres unités alliées.",
  usurpation: "Donne +X/+Y permanent à toutes les autres unités alliées par carte adverse que vous avez jouée.",
  // Pas des portées : variantes « elle-même » (KeywordInstance.recipient
  // "self", marqueur « S »), rangées ici pour voyager avec les autres gabarits
  // jusqu'au catalogue (vocab.target_scope.creature.*).
  renforcement_soi: "Gagne +X ATK et +Y PV de façon permanente.",
  discipline_soi: "Si toutes vos créatures en jeu ont un coût de même parité que le sien, gagne +X ATK et +Y PV de façon permanente.",
  usurpation_soi: "Gagne +X ATK et +Y PV de façon permanente par carte adverse que vous avez jouée.",
  silence_soi: "Perd tous ses mots-clés et ses stats reviennent à leur valeur d'origine.",
  guerison_soi: "Récupère X PV.",
};

/** Gabarit de Renforcement / Discipline quand le bonus va à la créature
 *  ELLE-MÊME (KeywordInstance.recipient "self") ; null sinon — la description
 *  ordinaire parle alors d'une autre unité désignée. */
export function recipientDescTemplate(
  kw: string,
  recipient: "self" | undefined,
  t?: (key: string) => string | undefined,
): string | null {
  if (!BENEFICIAIRE_REGLABLE.has(kw) || recipient !== "self") return null;
  return t?.(`vocab.target_scope.creature.${kw}_soi`) ?? CREATURE_SCOPE_DESC_FR[`${kw}_soi`];
}

/** Gabarit « toutes » d'une capacité, `{cibles}` déjà résolu. null si la
 *  capacité n'a pas de portée valide ou pas de variante (description ordinaire). */
export function scopedDescTemplate(
  kind: "spell" | "creature",
  id: string,
  scope: TargetScope | undefined,
  t?: (key: string) => string | undefined,
): string | null {
  const valide = porteeValide(scope, kind === "spell" ? spellScopes(id) : creatureScopes(id));
  if (!valide) return null;
  const fr = (kind === "spell" ? SPELL_SCOPE_DESC_FR : CREATURE_SCOPE_DESC_FR)[id];
  if (!fr) return null;
  const tmpl = t?.(`vocab.target_scope.${kind}.${id}`) ?? fr;
  const cibles = t?.(`vocab.target_scope.cibles.${valide}`) ?? TARGET_SCOPE_CIBLES_FR[valide];
  return tmpl.replace(/\{cibles\}/g, cibles);
}
