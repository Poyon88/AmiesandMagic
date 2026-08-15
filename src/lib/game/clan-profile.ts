// Le portrait d'un CLAN, entièrement dérivé du moteur.
//
// Un clan n'a pas de texte de présentation : sa spécificité vit dans les
// chiffres que le moteur consomme déjà — les races qu'il accueille et son
// penchant offensif ou défensif (`statWeights`). On lit donc CES données plutôt
// que d'écrire à côté une prose qui se désaccorderait au premier rééquilibrage.
//
// Les capacités emblématiques ne sont PAS ici : elles se comptent sur les
// cartes réelles du clan (cf. clan-signature.ts), pas sur l'intention du
// générateur.
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
  /** Penchant de combat, ramené à [0, 1] pour un rendu en jauge. */
  offensif: number;
  defensif: number;
}

/** Les `statWeights` sont des multiplicateurs autour de 1. L'amplitude réelle
 *  observée va de 0,65 à 1,25 — on cadre un peu plus large pour qu'aucune
 *  jauge ne sature. */
const POIDS_MIN = 0.6;
const POIDS_MAX = 1.3;

const jauge = (poids: number) =>
  Math.min(1, Math.max(0, (poids - POIDS_MIN) / (POIDS_MAX - POIDS_MIN)));

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

  return [...parNom.entries()].map(([nom, { races }]) => {
    // Le profil du clan prime ; à défaut, celui de la faction. Même cascade
    // que le générateur, pour que la page annonce ce qu'il produit vraiment.
    //
    // Les CAPACITÉS, elles, ne se lisent plus ici : `likelyKeywords` dit ce que
    // le générateur a le droit de tirer, pas ce que le clan contient. Elles
    // sont comptées sur les cartes (cf. clan-signature.ts).
    const poids = faction.clanProfiles?.[nom]?.statWeights ?? faction.statWeights;

    return { nom, races, offensif: jauge(poids.atk), defensif: jauge(poids.def) };
  });
}
