// Cartes DÉSIGNÉES d'un effet composé — lecture unique, partagée par le moteur,
// l'affichage, l'éditeur et la page du match.
//
// Tuteur accepte PLUSIEURS cartes, doublons compris (`cardIds`, liste ordonnée
// comme les Compagnons) ; `cardId` reste lu pour les cartes enregistrées avant
// (une seule désignation). L'Invocation désignée n'en a qu'une (`cardId`).
import type { ComposedEffect } from "./types";

/** Ids des cartes qu'un Tuteur ajoute à la main, dans l'ordre d'auteur. */
export function tuteurCardIds(composed: Pick<ComposedEffect, "cardId" | "cardIds"> | null | undefined): number[] {
  if (!composed) return [];
  if (composed.cardIds && composed.cardIds.length > 0) return composed.cardIds.filter((id): id is number => typeof id === "number");
  return composed.cardId != null ? [composed.cardId] : [];
}

/** Ids désignés par un effet composé, quel que soit son contenu (Tuteur :
 *  toutes ; Invocation désignée : une) — pour nommer les cartes dans les
 *  volets de description et les charger au démarrage du match. */
export function designatedCardIds(composed: ComposedEffect | null | undefined): number[] {
  if (!composed) return [];
  if (composed.content === "tuteur") return tuteurCardIds(composed);
  if (composed.content === "invocation" && composed.cardId != null) return [composed.cardId];
  return [];
}
