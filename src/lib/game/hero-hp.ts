// PV de départ d'un héros — et son MAXIMUM, auquel tous ses soins sont
// plafonnés (cf. soignerHeros, engine.ts).
//
// Levier d'équilibrage : un pouvoir fort se paie de PV en moins, un pouvoir
// faible se compense de PV en plus. Partagé par le moteur, l'API et les écrans,
// pour qu'une seule règle décide du chiffre.
import { HERO_MAX_HP } from "./constants";
import type { HeroDefinition } from "./types";

/** Bornes des PV de départ, aussi imposées par la base (heroes_starting_hp_range). */
export const HERO_HP_MIN = 20;
export const HERO_HP_MAX = 40;

/** Valeur acceptable pour `starting_hp` : entier dans [HERO_HP_MIN, HERO_HP_MAX]. */
export function pvDeDepartValides(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= HERO_HP_MIN && v <= HERO_HP_MAX;
}

/** PV de départ du héros. Absent ou hors bornes ⇒ HERO_MAX_HP (30), la valeur
 *  historique : une donnée invalide ne doit pas changer une partie en silence. */
export function pvDeDepart(hero?: Pick<HeroDefinition, "startingHp"> | null): number {
  const v = hero?.startingHp;
  return pvDeDepartValides(v) ? v : HERO_MAX_HP;
}
