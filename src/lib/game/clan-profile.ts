// Le portrait d'un CLAN, entièrement dérivé du moteur.
//
// Ce module ne rend plus que le RATTACHEMENT d'un clan : son nom et les races
// qu'il accueille — deux faits que seul le moteur détient.
//
// Tout ce qui décrit sa MANIÈRE DE JOUER se mesure désormais sur les cartes :
// les capacités emblématiques (clan-signature.ts) et le penchant offensif /
// défensif (clan-stat-profile.ts). Les deux se lisaient auparavant dans
// l'intention déclarée du générateur — `likelyKeywords` et `statWeights` — et
// les deux s'en écartaient : jusqu'à 11,6 points pour le second.
//
// Module pur : aucune requête, aucun DOM. C'est ce qui le rend testable.

import { FACTIONS } from "@/lib/card-engine/constants";

export interface ClanProfile {
  /** Nom canonique FR — c'est la clé de `vocab.clans` ET la valeur stockée
   *  dans `cards.clan`. */
  nom: string;
  /** Races que le clan accueille, dédoublonnées, dans l'ordre de déclaration.
   *  Un clan « transversal » (`appliesTo: "all"`) hérite de toute la faction. */
  races: string[];
}

/** Les clans d'une faction, dans l'ordre de déclaration.
 *
 *  Un même clan est déclaré une fois PAR RACE qu'il accueille (La Combe Verte
 *  apparaît pour les Hobbits et pour les Hommes-Arbres). On le rend une seule
 *  fois, en réunissant ses races — sinon la page afficherait deux sections
 *  identiques. */
export function clansOfFaction(factionId: string): ClanProfile[] {
  const faction = FACTIONS[factionId];
  if (!faction) return [];

  const parNom = new Map<string, { races: string[] }>();
  for (const groupe of faction.clans ?? []) {
    for (const nom of groupe.names) {
      const entree = parNom.get(nom) ?? { races: [] };
      // « all » : le clan est transversal, il accueille toute la faction.
      const races = groupe.appliesTo === "all" ? faction.races : [groupe.appliesTo];
      for (const r of races) if (!entree.races.includes(r)) entree.races.push(r);
      parNom.set(nom, entree);
    }
  }

  return [...parNom.entries()].map(([nom, { races }]) => ({ nom, races }));
}
