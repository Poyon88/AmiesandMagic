// PORTÉE « TOUTES » des capacités qui ciblent une créature.
//
// Une capacité ciblée (Impact, Entrave, Affaiblissement, Remontée…) peut, au
// choix de l'auteur, frapper TOUTES les créatures d'un camp au lieu d'une cible
// désignée. Chaque créature reçoit l'effet ENTIER — Siphon et Vampirisme rendent
// donc X par créature touchée. Seules les créatures sont visées : ni héros, ni
// objets, même pour les capacités qui savent viser ceux-ci en mode ciblé.
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
    case "friendly_creature": return ["all_allies"];
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
  // Neutralisation : une ennemie ciblée, ou toutes (aura continue).
  neutralisation: ["all_enemies"],
  tactique: ["all_allies"],
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

/** Libellés FR (repli des clés `vocab.target_scope.*`). */
export const TARGET_SCOPE_FR: Record<TargetScope, string> = {
  all_enemies: "toutes les créatures ennemies",
  all_allies: "toutes les créatures alliées",
  all: "toutes les créatures",
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

/** Portée « toutes » CIBLÉE d'une instance de mot-clé de créature (sans le don
 *  à tous les alliés de Conférer, dont le texte dit déjà la portée). */
export function kwTargetScope(inst: Pick<KeywordInstance, "id" | "targetScope"> | null | undefined): TargetScope | undefined {
  // Neutralisation dit déjà sa portée dans sa description ({neutralise_cible}).
  if (inst?.id === "neutralisation") return undefined;
  return inst ? porteeValide(inst.targetScope, creatureScopes(inst.id as unknown as string)) : undefined;
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

/** Libellé lu par les lecteurs d'écran sur le « A ». */
export function scopeAriaLabel(scope: TargetScope): string {
  return TARGET_SCOPE_FR[scope].charAt(0).toUpperCase() + TARGET_SCOPE_FR[scope].slice(1);
}
