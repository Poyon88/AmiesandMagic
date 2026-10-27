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
import { actionALExpiration, ancrageDuBadge, CHOICE_FALLBACK_GRACE_SECONDS } from "./choice-timer";

const base = { estMonTour: true, choixAMoi: false, pendingTriggers: 0, turnStartedAt: 1000 };

describe("Quand le badge s'affiche", () => {
  it.each(["selection", "divination", "pending_trigger"])(
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

  it("s'affiche AU TOUR ADVERSE quand le choix en file est le nôtre", () => {
    expect(ancrageDuBadge({
      ...base, estMonTour: false, choixAMoi: true, targetingMode: "pending_trigger", pendingTriggers: 1, choiceStartedAt: 5000,
    })).toEqual({ startedAt: 5000, seconds: CHOICE_TIMER_SECONDS });
  });

  it("reste masqué à notre tour quand le choix en file est celui de l'adversaire", () => {
    expect(ancrageDuBadge({
      ...base, choixAMoi: false, targetingMode: "pending_trigger", pendingTriggers: 1, choiceStartedAt: 5000,
    })).toBeNull();
  });
});

describe("Quel chrono s'applique", () => {
  it("déclencheur en attente : chrono de CHOIX, ancré sur choiceStartedAt", () => {
    expect(ancrageDuBadge({
      ...base, choixAMoi: true, targetingMode: "pending_trigger", pendingTriggers: 1, choiceStartedAt: 5000,
    })).toEqual({ startedAt: 5000, seconds: CHOICE_TIMER_SECONDS });
  });

  it("sélection à l'entrée en jeu : chrono de TOUR, il n'y a pas de fenêtre dédiée", () => {
    expect(ancrageDuBadge({ ...base, targetingMode: "selection" }))
      .toEqual({ startedAt: 1000, seconds: TURN_TIMER_SECONDS });
  });

  it("déclencheur en attente mais horodatage absent : repli sur le chrono de tour", () => {
    // Même prudence que TurnTimer : sans ancre de choix, on n'invente pas de
    // fenêtre de 20 s qui serait déjà écoulée.
    expect(ancrageDuBadge({ ...base, choixAMoi: true, targetingMode: "pending_trigger", pendingTriggers: 1 }))
      .toEqual({ startedAt: 1000, seconds: TURN_TIMER_SECONDS });
  });

  it("le chrono de choix est bien plus court que celui du tour", () => {
    // Ce qui justifie de le rendre visible : 20 s passent vite.
    expect(CHOICE_TIMER_SECONDS).toBeLessThan(TURN_TIMER_SECONDS);
  });
});

describe("Qui émet quoi à l'expiration", () => {
  const exp = { enChoix: false, estMonTour: true, choixAMoi: false, depassement: 0 };

  it("chrono de tour écoulé : seul le joueur actif termine son tour", () => {
    expect(actionALExpiration(exp)).toBe("end_turn");
    expect(actionALExpiration({ ...exp, estMonTour: false })).toBeNull();
  });

  it("fenêtre de choix écoulée : le propriétaire replie aussitôt, même hors de son tour", () => {
    expect(actionALExpiration({ ...exp, enChoix: true, estMonTour: false, choixAMoi: true })).toBe("auto_resolve");
  });

  it("l'autre client ne replie qu'après le délai de grâce (propriétaire déconnecté)", () => {
    const autre = { ...exp, enChoix: true, choixAMoi: false };
    expect(actionALExpiration({ ...autre, depassement: CHOICE_FALLBACK_GRACE_SECONDS - 1 })).toBeNull();
    expect(actionALExpiration({ ...autre, depassement: CHOICE_FALLBACK_GRACE_SECONDS })).toBe("auto_resolve");
  });

  it("rien avant l'expiration", () => {
    expect(actionALExpiration({ ...exp, enChoix: true, choixAMoi: true, depassement: -3 })).toBeNull();
  });
});
