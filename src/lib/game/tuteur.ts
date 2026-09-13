// Cartes DÉSIGNÉES d'un effet composé — lecture unique, partagée par le moteur,
// l'affichage, l'éditeur et la page du match.
//
// Tuteur ET l'Invocation désignée acceptent PLUSIEURS cartes, doublons compris
// (`cardIds`, liste ordonnée comme les Compagnons) ; `cardId` reste lu pour les
// cartes enregistrées avant (une seule désignation).
import type { ComposedEffect } from "./types";

/** Ids des cartes qu'un Tuteur ajoute à la main, dans l'ordre d'auteur. */
export function tuteurCardIds(composed: Pick<ComposedEffect, "cardId" | "cardIds"> | null | undefined): number[] {
  if (!composed) return [];
  if (composed.cardIds && composed.cardIds.length > 0) return composed.cardIds.filter((id): id is number => typeof id === "number");
  return composed.cardId != null ? [composed.cardId] : [];
}

/** Regroupe une liste désignée par carte, dans l'ordre de PREMIÈRE apparition,
 *  avec le nombre d'exemplaires : [7, 7, 7] → [{ id: 7, count: 3 }]. C'est ce
 *  que l'affichage peint (une pastille par carte, « 3 × Nom ») — le moteur,
 *  lui, continue de lire la liste brute, un exemplaire par entrée. */
export function groupDesignatedIds(ids: readonly number[]): { id: number; count: number }[] {
  const groupes: { id: number; count: number }[] = [];
  const index = new Map<number, number>();
  for (const id of ids) {
    const i = index.get(id);
    if (i == null) { index.set(id, groupes.length); groupes.push({ id, count: 1 }); }
    else groupes[i].count += 1;
  }
  return groupes;
}

/** Ids désignés par un effet composé, quel que soit son contenu (Tuteur et
 *  Invocation désignée : la liste, ou le `cardId` legacy) — pour résoudre,
 *  nommer les cartes dans les volets et les charger au démarrage du match. */
export function designatedCardIds(composed: ComposedEffect | null | undefined): number[] {
  if (!composed) return [];
  if (composed.content === "tuteur" || composed.content === "invocation") return tuteurCardIds(composed);
  return [];
}
