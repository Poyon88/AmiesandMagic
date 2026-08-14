// Règle d'ancrage du compte à rebours affiché pendant une fenêtre de CHOIX.
//
// Demandé : rendre le chrono visible sur les choix de fin de tour et les
// sélections. Les modales assombrissent le plateau et masquent le chrono, au
// moment précis où il compte — passé le délai, le choix est tranché au hasard.
//
// Le badge doit suivre EXACTEMENT la règle de TurnTimer, sinon il afficherait un
// temps qui n'est pas celui qui s'applique : chrono de CHOIX dédié quand un
// déclencheur est en attente, chrono de TOUR sinon.
import { describe, expect, it } from "vitest";
import { CHOICE_TIMER_SECONDS, TURN_TIMER_SECONDS } from "./constants";

/** Reproduit la décision de GameBoard. */
function ancrageDuBadge(opts: {
  targetingMode: string;
  overlayPeeked?: boolean;
  estMonTour: boolean;
  pendingTriggers: number;
  choiceStartedAt?: number;
  turnStartedAt: number;
}): { startedAt: number; seconds: number } | null {
  const enChoix = ["selection", "divination", "tactique_keywords", "pending_trigger"]
    .includes(opts.targetingMode);
  if (!enChoix || opts.overlayPeeked) return null;
  if (!opts.estMonTour) return null;
  return opts.pendingTriggers > 0 && opts.choiceStartedAt
    ? { startedAt: opts.choiceStartedAt, seconds: CHOICE_TIMER_SECONDS }
    : { startedAt: opts.turnStartedAt, seconds: TURN_TIMER_SECONDS };
}

const base = { estMonTour: true, pendingTriggers: 0, turnStartedAt: 1000 };

describe("Quand le badge s'affiche", () => {
  it.each(["selection", "divination", "tactique_keywords", "pending_trigger"])(
    "s'affiche en mode « %s »",
    (targetingMode) => {
      expect(ancrageDuBadge({ ...base, targetingMode })).not.toBeNull();
    },
  );

  it.each(["none", "spell", "attack", "graveyard", "creature"])(
    "reste masqué en mode « %s » — ce n'est pas une fenêtre de choix",
    (targetingMode) => {
      expect(ancrageDuBadge({ ...base, targetingMode })).toBeNull();
    },
  );

  it("disparaît quand le joueur regarde le plateau (overlayPeeked)", () => {
    expect(ancrageDuBadge({ ...base, targetingMode: "selection", overlayPeeked: true })).toBeNull();
  });

  it("ne s'affiche pas hors de son tour : ce n'est pas à nous de choisir", () => {
    expect(ancrageDuBadge({ ...base, targetingMode: "selection", estMonTour: false })).toBeNull();
  });
});

describe("Quel chrono s'applique", () => {
  it("déclencheur en attente : chrono de CHOIX, ancré sur choiceStartedAt", () => {
    expect(ancrageDuBadge({
      ...base, targetingMode: "pending_trigger", pendingTriggers: 1, choiceStartedAt: 5000,
    })).toEqual({ startedAt: 5000, seconds: CHOICE_TIMER_SECONDS });
  });

  it("sélection à l'entrée en jeu : chrono de TOUR, il n'y a pas de fenêtre dédiée", () => {
    expect(ancrageDuBadge({ ...base, targetingMode: "selection" }))
      .toEqual({ startedAt: 1000, seconds: TURN_TIMER_SECONDS });
  });

  it("déclencheur en attente mais horodatage absent : repli sur le chrono de tour", () => {
    // Même prudence que TurnTimer : sans ancre de choix, on n'invente pas de
    // fenêtre de 15 s qui serait déjà écoulée.
    expect(ancrageDuBadge({ ...base, targetingMode: "pending_trigger", pendingTriggers: 1 }))
      .toEqual({ startedAt: 1000, seconds: TURN_TIMER_SECONDS });
  });

  it("le chrono de choix est bien plus court que celui du tour", () => {
    // Ce qui justifie de le rendre visible : 15 s passent vite.
    expect(CHOICE_TIMER_SECONDS).toBeLessThan(TURN_TIMER_SECONDS);
  });
});
