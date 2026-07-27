// Catalogue unique des effets proposés à l'auteur d'un SORT dans la forge.
//
// Historiquement la forge présentait trois zones cloisonnées (« + Effet du
// sort » = spell_keywords, « + Conférer » = mots-clés créature portés par le
// sort, « Effets composés » = Capability.composed). Ce catalogue les réunit en
// une seule liste, sans rien changer au modèle de données : chaque entrée dit
// simplement SOUS QUELLE FORME l'effet est persisté.
//
//  - `composed` : l'effet a un équivalent EXACT dans l'interpréteur composé.
//    On insère un ComposedEffect préréglé, ensuite librement éditable (bord,
//    nombre, appartenance…). Le vocabulaire reste lisible sur la carte :
//    composedIcon() réutilise déjà l'icône et le nom du mot-clé le plus proche
//    (dégâts à toutes les unités ennemies → « Déferlement », etc.).
//  - `curated` : mécanique singulière sans équivalent composé (Relancer,
//    Déchainement, Silence…). L'entrée reste un spell_keyword résolu par le
//    moteur historique — la fusion est côté FORMULAIRE, pas côté moteur.
//
// Règle de tri d'une entrée : elle n'est `composed` que si la sémantique legacy
// est reproduite À L'IDENTIQUE. Tout ce qui demanderait une décomposition en
// plusieurs lignes (Siphon = dégâts + soin du héros) ou porte une contrainte
// implicite non exprimable par un TargetSpec (Entrainement = « même faction que
// le sort ») reste `curated` : mieux vaut une mécanique intacte qu'un preset
// qui ment.

import type { ComposedEffect, SpellKeywordId, TargetSpec } from "@/lib/game/types";
import { SPELL_KEYWORD_LABELS, SPELL_KEYWORD_SYMBOLS } from "@/lib/game/spell-keywords";

export type SpellEffectCatalogEntry =
  | { kind: "composed"; id: string; label: string; symbol: string; preset: ComposedEffect }
  | { kind: "curated"; id: SpellKeywordId; label: string; symbol: string };

const board = (over: Partial<TargetSpec>): TargetSpec => ({
  entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice", ...over,
});

/** Préréglages composés, keyés par l'id du mot-clé de sort équivalent. */
const COMPOSED_PRESETS: Partial<Record<SpellKeywordId, ComposedEffect>> = {
  impact: { content: "deal_damage", magnitude: { x: 1 }, target: board({ entity: "both", side: "any" }) },
  deferlement: { content: "deal_damage", magnitude: { x: 1 }, target: board({ count: "all", designation: "automatic" }) },
  cataclysme: { content: "deal_damage", magnitude: { x: 1 }, target: board({ count: "all", side: "any", designation: "automatic" }) },
  // Tempête = X points répartis un à un : c'est exactement la désignation "scatter".
  tempete: { content: "deal_damage", magnitude: { x: 1 }, target: board({ designation: "scatter" }) },
  douleur: { content: "deal_damage", magnitude: { x: 1 }, target: board({ entity: "hero", side: "ally", designation: "automatic" }) },
  entrave: { content: "paralyze", target: board({}) },
  execution: { content: "destroy", target: board({ side: "any" }) },
  remontee: { content: "bounce", target: board({ side: "any" }) },
  renforcement: { content: "buff", magnitude: { x: 1, y: 1 }, target: board({ side: "ally" }) },
  affaiblissement: { content: "debuff", magnitude: { x: 1, y: 1 }, target: board({}) },
  guerison: { content: "heal", magnitude: { x: 1 }, target: board({ entity: "both", side: "ally" }) },
  poison: { content: "grant_keyword", grantAbilityId: "poison", target: board({}) },
  inspiration: { content: "draw_cards", magnitude: { x: 1 } },
  afflux: { content: "gain_mana", magnitude: { x: 1 } },
  pillage: { content: "discard", magnitude: { x: 1 } },
  convocation_simple: { content: "summon_token", magnitude: { x: 1 }, tokenId: null },
  exhumation: { content: "exhumation", magnitude: { x: 1 }, target: board({ side: "ally", location: "graveyard" }) },
  selection: { content: "selection", magnitude: { x: 1 } },
  renfort_royal: { content: "renfort_royal", magnitude: { x: 1 } },
  // Le X/Y et la race/clan sont saisis ensuite dans la ligne (appartenance).
  renforcement_multiple: { content: "buff", magnitude: { x: 1, y: 1 }, target: board({ count: "all", side: "ally", designation: "automatic" }) },
};

/** Entrée « Conférer » générique : c'est elle qui remplace le picker legacy,
 *  limité aux alliés. Le bord et le nombre se règlent dans la ligne. */
export const GRANT_ENTRY: SpellEffectCatalogEntry = {
  kind: "composed", id: "grant_keyword", label: "Conférer une capacité", symbol: "✋",
  preset: { content: "grant_keyword", target: board({ side: "ally" }) },
};

/** Catalogue complet, dans l'ordre d'affichage du sélecteur d'ajout. */
export function buildSpellEffectCatalog(allSpellKeywordIds: SpellKeywordId[]): SpellEffectCatalogEntry[] {
  const entries: SpellEffectCatalogEntry[] = [GRANT_ENTRY];
  for (const id of allSpellKeywordIds) {
    const label = SPELL_KEYWORD_LABELS[id] ?? id;
    const symbol = SPELL_KEYWORD_SYMBOLS[id] ?? "✦";
    const preset = COMPOSED_PRESETS[id];
    entries.push(preset
      ? { kind: "composed", id, label, symbol, preset }
      : { kind: "curated", id, label, symbol });
  }
  return entries;
}

/** Copie profonde du preset : chaque ligne ajoutée doit être indépendante,
 *  sinon deux effets d'une même carte partageraient le même objet cible. */
export function instantiatePreset(entry: SpellEffectCatalogEntry): ComposedEffect {
  if (entry.kind !== "composed") throw new Error(`instantiatePreset: entrée curée ${entry.id}`);
  return JSON.parse(JSON.stringify(entry.preset)) as ComposedEffect;
}

export const isComposedSpellEffect = (id: string): boolean => id in COMPOSED_PRESETS;
