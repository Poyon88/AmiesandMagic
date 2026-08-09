// Halo des capacités CONDITIONNELLES : celles qui ne font rien tant qu'une
// condition de partie n'est pas remplie, puis s'activent d'un coup.
//
// Rien à l'écran ne le signalait — il fallait compter son deck ou son cimetière
// pour savoir si une carte était renforcée, et le bonus se découvrait au moment
// de jouer. Un halo coloré rend cet état lisible d'un coup d'œil, sur le plateau
// comme en main.
//
// ⚠️ Ce module N'ÉVALUE PAS de règle : il RÉUTILISE les prédicats et les seuils
// du moteur. Un halo qui s'allume quand la capacité ne s'active pas — ou
// l'inverse — serait pire que pas de halo du tout, et c'est exactement ce que
// produirait une condition recopiée puis laissée dériver.

import type { Card, GameState, PlayerState } from "./types";
import { getCapabilities } from "./capability-adapter";
import { SEUIL_DECK_THRESHOLD } from "./constants";
import { FORCE_ANCETRES_GRAVEYARD_THRESHOLD, boardHasChanter } from "./engine";

export interface ThresholdGlow {
  /** Id de l'ability du registre — sert de clé de rendu. */
  abilityId: string;
  /** Composantes `r, g, b` (pour composer des rgba() à l'opacité voulue). */
  rgb: string;
  /** Libellé court, pour l'infobulle. */
  label: string;
}

/** Palette et ORDRE de priorité. L'ordre compte : deux capacités peuvent être
 *  actives sur la même unité (Seuil Sacrificiel + Force des ancêtres est un cas
 *  réel), et l'anneau ne peut porter qu'une couleur — c'est la première de
 *  cette liste qui gagne. */
const GLOW_PALETTE: ReadonlyArray<{ abilityId: string; rgb: string; label: string }> = [
  { abilityId: "force_des_ancetres", rgb: "168, 85, 247", label: "Force des ancêtres" }, // violet spectral (cimetière)
  { abilityId: "seuil_sacrificiel", rgb: "190, 49, 68", label: "Seuil Sacrificiel" },     // rouge sombre (deck qui s'épuise)
  { abilityId: "seuil_colere", rgb: "232, 122, 24", label: "Seuil de colère" },           // orange braise
  { abilityId: "chant", rgb: "23, 182, 196", label: "Chant" },                            // cyan — teinte déjà associée à Chant
];

/** La condition de CHAQUE capacité, évaluée sur le contrôleur de la carte.
 *
 *  `owner` est le contrôleur, jamais le joueur local : une créature ADVERSE à
 *  seuil actif doit luire pour les deux joueurs, avec le deck et le cimetière de
 *  son propre camp. */
function conditionMet(abilityId: string, owner: PlayerState): boolean {
  switch (abilityId) {
    // Deux capacités adossées au même seuil de deck (cf. recalculateAuras et
    // resolveSpellCard, qui lisent la même constante).
    case "seuil_sacrificiel":
    case "seuil_colere":
      return owner.deck.length <= SEUIL_DECK_THRESHOLD;
    // Même filtre que recalculateAuras : les SORTS au cimetière ne comptent pas.
    case "force_des_ancetres":
      return owner.graveyard.filter(g => g.card.card_type === "creature").length
        >= FORCE_ANCETRES_GRAVEYARD_THRESHOLD;
    // Prédicat du moteur, réutilisé tel quel (chanteuse vivante, côté lanceur).
    case "chant":
      return boardHasChanter(owner);
    default:
      return false;
  }
}

/** Halos ACTIFS d'une carte, dans l'ordre de priorité de la palette.
 *
 *  Les capacités sont lues via `getCapabilities`, jamais via `card.keywords` :
 *  c'est la règle du projet, et une capacité conférée à l'exécution serait
 *  sinon manquée. */
export function activeThresholdGlows(
  card: Card,
  state: GameState | null | undefined,
  ownerId: string | null | undefined,
): ThresholdGlow[] {
  if (!state || !ownerId) return [];
  const owner = state.players.find(p => p.id === ownerId);
  if (!owner) return [];

  const carried = new Set(getCapabilities(card).map(c => c.abilityId));
  return GLOW_PALETTE.filter(g => carried.has(g.abilityId) && conditionMet(g.abilityId, owner));
}

/** Halo à peindre, ou `null`. L'anneau ne portant qu'une couleur, c'est la
 *  première capacité active qui la donne — mais la liste complète reste
 *  disponible pour l'infobulle et le halo externe. */
export function primaryThresholdGlow(
  card: Card,
  state: GameState | null | undefined,
  ownerId: string | null | undefined,
): ThresholdGlow | null {
  return activeThresholdGlows(card, state, ownerId)[0] ?? null;
}
