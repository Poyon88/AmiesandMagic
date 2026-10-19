// Règles du chrono pendant une fenêtre de CHOIX — partagées par TurnTimer et
// le badge de GameBoard, qui doivent afficher et appliquer la MÊME horloge.
//
// Une fenêtre de choix appartient au PROPRIÉTAIRE du choix en tête de file, qui
// n'est pas forcément le joueur actif (râle d'agonie, Blessure, Sélection… au
// tour adverse). Pendant la fenêtre, le chrono de tour est suspendu : le moteur
// rend sa durée au tour quand elle se ferme (cf. applyAction, `turnStartedAt`).
import { CHOICE_TIMER_SECONDS, TURN_TIMER_SECONDS } from "./constants";

/** Délai de grâce après lequel l'AUTRE client tranche à la place du
 *  propriétaire (déconnecté, onglet gelé). Le repli est idempotent
 *  (`headTriggerId`) : si les deux l'émettent, le second est sans effet.
 *
 *  Large à dessein, parce que les deux horloges ne partent PAS ensemble : chacune
 *  démarre quand SES animations se taisent. Le client qui a joué l'action la vit
 *  tout de suite ; l'autre la reçoit derrière la file des actions précédentes
 *  (attaques enchaînées puis fin de tour) et peut l'ouvrir 20 s plus tard. À
 *  10 s de grâce, le secours de l'adversaire tranchait alors une découverte
 *  5 s après l'ouverture de la modale chez son propriétaire. Ce secours ne sert
 *  qu'à un joueur parti : le faire attendre ne coûte rien aux autres. */
export const CHOICE_FALLBACK_GRACE_SECONDS = 45;

/** Ancre et durée du badge de chrono affiché par-dessus les modales de choix,
 *  ou null quand il n'a pas lieu d'être. */
export function ancrageDuBadge(opts: {
  targetingMode: string;
  overlayPeeked?: boolean;
  estMonTour: boolean;
  /** Le joueur local est-il le propriétaire du choix en tête de file ? */
  choixAMoi: boolean;
  pendingTriggers: number;
  choiceStartedAt?: number;
  turnStartedAt: number;
}): { startedAt: number; seconds: number } | null {
  const enChoix = opts.targetingMode === "selection"
    || opts.targetingMode === "divination"
    || opts.targetingMode === "pending_trigger";
  if (!enChoix || opts.overlayPeeked) return null;
  const enAttente = opts.pendingTriggers > 0;
  // Choix en file : c'est son PROPRIÉTAIRE qui a le compte à rebours, quel que
  // soit le tour. Sinon (sélection à l'entrée en jeu), le joueur actif, sur le
  // temps de son tour.
  if (enAttente ? !opts.choixAMoi : !opts.estMonTour) return null;
  return enAttente && opts.choiceStartedAt
    ? { startedAt: opts.choiceStartedAt, seconds: CHOICE_TIMER_SECONDS }
    : { startedAt: opts.turnStartedAt, seconds: TURN_TIMER_SECONDS };
}

/** Ce que doit émettre CE client quand son horloge atteint zéro.
 *  - chrono de tour écoulé : le joueur actif termine son tour ;
 *  - fenêtre de choix écoulée : le propriétaire replie au hasard, l'autre
 *    client seulement après le délai de grâce (secours). */
export function actionALExpiration(opts: {
  enChoix: boolean;
  estMonTour: boolean;
  choixAMoi: boolean;
  /** Secondes écoulées AU-DELÀ de la durée de l'horloge courante (≥ 0 ⇒ expirée). */
  depassement: number;
}): "end_turn" | "auto_resolve" | null {
  if (opts.depassement < 0) return null;
  if (opts.enChoix) {
    if (opts.choixAMoi) return "auto_resolve";
    return opts.depassement >= CHOICE_FALLBACK_GRACE_SECONDS ? "auto_resolve" : null;
  }
  return opts.estMonTour ? "end_turn" : null;
}
