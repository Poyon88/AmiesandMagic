/** Une affiche du mur : le strict nécessaire, pas la carte entière. La page
 *  serveur réduit chaque ligne `cards` à ceci avant de l'envoyer au client. */
export interface Affiche {
  id: number;
  name: string;
  faction: string;
  race: string | null;
  clan: string | null;
  rarity: string;
  image: string;
  /** Texte d'ambiance de la carte, s'il existe. */
  flavor?: string | null;
}

export interface RangeeDuMur {
  /** Alignement (`bon`, `neutre`, `maléfique`) : c'est lui qui range le mur. */
  id: string;
  affiches: Affiche[];
}
