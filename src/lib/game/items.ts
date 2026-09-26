// OBJETS — prédicats et comptage de places partagés.
//
// Module minuscule et à part, pour la raison habituelle dans ce dépôt : la
// forge, l'éditeur et les composants de jeu ont besoin de ces réponses sans
// tirer `engine.ts` (un demi-mégaoctet) dans le bundle client.
//
// RÈGLE DU JEU, en une phrase : un objet occupe une des places du plateau, mais
// n'est une unité pour rien d'autre. Il n'est ni attaquable, ni détruit par les
// effets qui visent les unités, et aucune aura ni aucun comptage ne le voit.

import type { Card, CardInstance, PlayerState } from "./types";
import { MAX_BOARD_SIZE } from "./constants";

/** La carte est-elle un OBJET ? */
export function estUnObjet(card: Pick<Card, "card_type">): boolean {
  return card.card_type === "item";
}

/** La carte est-elle une UNITÉ, au sens de tout ce que le moteur fait subir au
 *  plateau (attaquer, cibler, compter, buffer, tuer) ?
 *
 *  Écrit en positif — `card_type === "creature"` — et non « tout sauf objet » :
 *  un sort n'est pas davantage une unité, et la forme positive reste juste si
 *  un quatrième type apparaît. */
export function estUneUnite(card: Pick<Card, "card_type">): boolean {
  return card.card_type === "creature";
}

/** La carte réclame-t-elle une place sur la table une fois jouée ?
 *
 *  Vraie pour les unités ET les objets — c'est exactement ce que veut dire
 *  « l'objet occupe une des huit places ». Les portes de légalité testaient
 *  `card_type === "creature"` : sans ce prédicat, un objet se serait posé sur
 *  un plateau déjà plein. */
export function occupeUnePlace(card: Pick<Card, "card_type">): boolean {
  return card.card_type === "creature" || card.card_type === "item";
}

/** Les objets en jeu d'un joueur. `items` est optionnel (parties en cours et
 *  instantanés d'avant les objets) : on rend toujours un tableau.
 *
 *  Prend le JOUEUR ENTIER, et non `Pick<PlayerState, "items">` : ce Pick n'a que
 *  des champs optionnels, donc le typage structurel l'aurait laissé accepter
 *  n'importe quel objet — un `GameState`, par exemple. C'est arrivé en test, et
 *  TypeScript n'a rien dit. */
export function objetsDe(p: PlayerState): CardInstance[] {
  return p.items ?? [];
}

/** PLACES OCCUPÉES sur la table : unités + objets.
 *
 *  Point de comptage UNIQUE. Tous les tests de plafond du moteur passent par
 *  ici plutôt que par `board.length`, sans quoi les objets seraient gratuits en
 *  place — ce qui viderait de son sens le choix de les poser sur le plateau.
 *  Un test garde-fou (`items-plafond.test.ts`) échoue si un `board.length`
 *  comparé à MAX_BOARD_SIZE réapparaît dans la source. */
export function placesOccupees(p: PlayerState): number {
  return p.board.length + objetsDe(p).length;
}

/** Reste-t-il une place sur la table ? */
export function placeLibre(p: PlayerState): boolean {
  return placesOccupees(p) < MAX_BOARD_SIZE;
}

/** COÛT D'ÉQUIPEMENT, en mana. Null, négatif ou absent ⇒ gratuit. */
export function getEquipCost(card: Pick<Card, "equip_cost">): number {
  return Math.max(0, card.equip_cost ?? 0);
}

/** L'objet que porte cette créature, s'il y en a un.
 *
 *  Sens DÉRIVÉ du lien : la source de vérité vit sur l'objet
 *  (`equippedToInstanceId`). Balayer au plus huit objets coûte moins cher que
 *  d'entretenir un second pointeur sur la créature — lequel se serait
 *  désynchronisé au premier chemin de retrait oublié. */
export function objetPorteParUnite(
  p: PlayerState,
  creatureInstanceId: string,
): CardInstance | undefined {
  return objetsDe(p).find(o => o.equippedToInstanceId === creatureInstanceId);
}

/** Bonus d'ATK et de PV qu'un objet confère à son porteur.
 *
 *  Ce sont les colonnes `attack` / `health` de la carte objet, réutilisées : ce
 *  que l'objet ajoute au combat. Nulles ⇒ 0, parce qu'un objet qui ne donne que
 *  des capacités est une carte légitime. */
export function bonusDObjet(item: CardInstance): { atk: number; pv: number } {
  return { atk: item.card.attack ?? 0, pv: item.card.health ?? 0 };
}

/** uid que prend une capacité composée d'objet une fois greffée sur son
 *  porteur. Déterministe : l'objet se regreffe à chaque recalcul, et un uid
 *  instable créerait un doublon par passe. Préfixé par l'instance de l'OBJET
 *  (et non par sa carte) pour que deux exemplaires du même objet, portés par
 *  deux créatures, ne se marchent pas dessus. */
export function uidCapaciteObjet(item: CardInstance, uidOrigine: string): string {
  return `obj_${item.instanceId}_${uidOrigine}`;
}

/** La créature porte-t-elle MAÎTRE D'ARME ? Seule exception à la règle « un
 *  objet par créature » : elle peut en cumuler autant que son contrôleur en
 *  possède. Lu sur `keywords`, où toute capacité curée figure — ce module ne
 *  tire pas le moteur. */
export function estMaitreDArme(c: Pick<CardInstance, "card">): boolean {
  return (c.card.keywords as unknown as string[]).includes("maitre_darme");
}

/** Cette créature peut-elle recevoir `item` (en plus de ce qu'elle porte) ?
 *  Règle UNIQUE pour le moteur (equipItem), le store (cibles d'équipement) et le
 *  plateau (vignette cliquable) : une créature libre, ou un Maître d'arme. Un
 *  objet déjà porté par cette même créature n'a nulle part où aller. */
export function peutRecevoirObjet(p: PlayerState, c: CardInstance, item: CardInstance): boolean {
  if (item.equippedToInstanceId === c.instanceId) return false;
  return estMaitreDArme(c) || !objetPorteParUnite(p, c.instanceId);
}

/** Somme des bonus d'ATK / PV de TOUS les objets portés par une créature. Une
 *  créature ordinaire n'en porte qu'un ; un Maître d'arme les cumule. */
export function bonusDesObjetsPortes(p: PlayerState, creatureInstanceId: string): { atk: number; pv: number } {
  let atk = 0, pv = 0;
  for (const o of objetsDe(p)) {
    if (o.equippedToInstanceId !== creatureInstanceId) continue;
    const b = bonusDObjet(o);
    atk += b.atk; pv += b.pv;
  }
  return { atk, pv };
}
