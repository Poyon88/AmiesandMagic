// POUVOIR DE HÉROS À PLUSIEURS EFFETS.
//
// `HeroDefinition.powerEffect` porte soit UN effet (forme historique, celle des
// héros déjà en base), soit une LISTE d'effets résolus dans l'ordre d'auteur —
// ex. « Divination & Inspiration 2 ». Tout lecteur passe par `effetsDuPouvoir`,
// qui rend toujours une liste : un seul chemin, quelle que soit la forme stockée.
//
// Chaque effet a son propre créneau de cible (une cible PAR effet, désignées
// l'une après l'autre) :
//   - cible simple  : `HeroPowerAction.ciblesEffets[i]` (effet 0 : repli sur
//     `targetInstanceId`, la forme des anciens clients et des bots) ;
//   - effet composé : `targetMap["hp_<i>#<n>"]`, l'uid de sa capacité synthétique
//     étant `hp_<i>` — l'effet 0 garde donc l'uid historique `hp_0`.
import type { HeroDefinition, HeroPowerAction, HeroPowerEffect } from "./types";

/** Plafond d'effets par pouvoir (arbitrage auteur). */
export const MAX_EFFETS_POUVOIR = 3;

/** Effet valide : un objet portant un mode connu. */
function estEffet(e: unknown): e is HeroPowerEffect {
  return !!e && typeof e === "object" && typeof (e as HeroPowerEffect).mode === "string";
}

/** Les effets du pouvoir, dans l'ordre d'auteur ; [] si le héros n'en a pas. */
export function effetsDuPouvoir(def: Pick<HeroDefinition, "powerEffect"> | null | undefined): HeroPowerEffect[] {
  const brut = def?.powerEffect as HeroPowerEffect | HeroPowerEffect[] | null | undefined;
  if (!brut) return [];
  const liste = Array.isArray(brut) ? brut : [brut];
  return liste.filter(estEffet).slice(0, MAX_EFFETS_POUVOIR);
}

/** Uid de la capacité synthétique d'un effet composé. */
export function uidEffetPouvoir(i: number): string {
  return `hp_${i}`;
}

/** Cible simple choisie pour l'effet `i`. */
export function cibleEffetPouvoir(action: HeroPowerAction, i: number): string | undefined {
  return action.ciblesEffets?.[i] ?? (i === 0 ? action.targetInstanceId : undefined);
}

/** Carte choisie dans une Sélection (et famille) pour l'effet `i`. */
export function selectionEffetPouvoir(action: HeroPowerAction, i: number): number | undefined {
  return action.selectionsEffets?.[i] ?? (i === 0 ? action.selectionCardId : undefined);
}

/** Index choisi dans une modale de deck (Divination, Présage, Creuser) pour l'effet `i`. */
export function choixDeckEffetPouvoir(action: HeroPowerAction, i: number): number | undefined {
  return action.choixDeckEffets?.[i];
}
