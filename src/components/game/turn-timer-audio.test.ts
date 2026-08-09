// Cadrage sonore du chrono : QUAND l'alarme des 15 secondes doit sonner.
//
// Deux horloges se partagent le composant depuis l'ajout de la fenêtre de choix
// (`CHOICE_TIMER_SECONDS`) : celle du TOUR (90 s) et celle du CHOIX (15 s). Or
// l'alarme se déclenche quand le compteur passe sous `WARNING_THRESHOLD`, qui
// vaut exactement la durée de la seconde — l'alerte partait donc dès la première
// seconde de chaque fenêtre de choix, alors que le joueur avait tout son temps,
// et la musique se coupait puis reprenait à chaque ouverture.
//
// Ce fichier verrouille la RÈGLE, indépendamment du rendu React : l'alarme
// appartient à l'horloge de tour, et la remise à zéro audio au changement de
// tour seulement.
import { describe, expect, it } from "vitest";
import { CHOICE_TIMER_SECONDS, TURN_TIMER_SECONDS } from "@/lib/game/constants";

/** Seuil d'alerte du composant (TurnTimer.WARNING_THRESHOLD). Recopié ici
 *  faute d'export : le test ci-dessous vérifie justement que sa relation avec
 *  CHOICE_TIMER_SECONDS reste celle qu'on croit. */
const WARNING_THRESHOLD = 15;

/** Règle appliquée par le composant : l'alarme ne sonne QUE sur l'horloge de
 *  tour, une fois passée sous le seuil. */
function alarmShouldFire(opts: { isMyTurn: boolean; inChoice: boolean; timeLeft: number; alreadyFired: boolean }): boolean {
  if (!opts.isMyTurn) return false;
  if (opts.inChoice) return false;
  if (opts.alreadyFired) return false;
  return opts.timeLeft <= WARNING_THRESHOLD;
}

describe("le piège : la fenêtre de choix naît déjà sous le seuil", () => {
  it("la durée d'un choix n'excède pas le seuil d'alerte — d'où le faux positif", () => {
    // Si un jour CHOICE_TIMER_SECONDS repassait au-dessus du seuil, la garde
    // `inChoice` deviendrait superflue ; tant que ce n'est pas le cas, elle est
    // load-bearing. Ce test documente la raison de son existence.
    expect(CHOICE_TIMER_SECONDS).toBeLessThanOrEqual(WARNING_THRESHOLD);
  });

  it("aucune alarme à l'ouverture d'une fenêtre de choix", () => {
    expect(alarmShouldFire({
      isMyTurn: true, inChoice: true, timeLeft: CHOICE_TIMER_SECONDS, alreadyFired: false,
    })).toBe(false);
  });

  it("ni à la toute fin de cette fenêtre — le repli automatique s'en charge", () => {
    expect(alarmShouldFire({
      isMyTurn: true, inChoice: true, timeLeft: 0, alreadyFired: false,
    })).toBe(false);
  });
});

describe("l'alarme sur l'horloge de TOUR reste intacte", () => {
  it("silencieuse au-dessus du seuil, sonore en dessous", () => {
    const base = { isMyTurn: true, inChoice: false, alreadyFired: false };
    expect(alarmShouldFire({ ...base, timeLeft: TURN_TIMER_SECONDS })).toBe(false);
    expect(alarmShouldFire({ ...base, timeLeft: WARNING_THRESHOLD + 1 })).toBe(false);
    expect(alarmShouldFire({ ...base, timeLeft: WARNING_THRESHOLD })).toBe(true);
    expect(alarmShouldFire({ ...base, timeLeft: 3 })).toBe(true);
  });

  it("une seule fois par tour", () => {
    expect(alarmShouldFire({
      isMyTurn: true, inChoice: false, timeLeft: 5, alreadyFired: true,
    })).toBe(false);
  });

  it("jamais pendant le tour adverse", () => {
    expect(alarmShouldFire({
      isMyTurn: false, inChoice: false, timeLeft: 1, alreadyFired: false,
    })).toBe(false);
  });
});

describe("après une fenêtre de choix, le tour reprend son cours sonore", () => {
  it("l'alarme déjà tirée ne repart pas au retour sur l'horloge de tour", () => {
    // La remise à zéro audio ne se fait plus qu'au changement de TOUR : revenir
    // du choix vers le tour ne doit ni relancer l'alarme, ni faire reprendre la
    // musique coupée — le tour est toujours dans ses quinze dernières secondes.
    expect(alarmShouldFire({
      isMyTurn: true, inChoice: false, timeLeft: 8, alreadyFired: true,
    })).toBe(false);
  });

  it("mais elle sonne si le seuil n'avait pas encore été franchi", () => {
    expect(alarmShouldFire({
      isMyTurn: true, inChoice: false, timeLeft: 12, alreadyFired: false,
    })).toBe(true);
  });
});

/** Règle appliquée par `tick` : un chrono GELÉ ne décompte pas et ne déclenche
 *  rien. Le gel couvre l'auto-attaque et, depuis ce lot, les animations. */
function timerActs(opts: { isPaused: boolean; isMyTurn: boolean; timeLeft: number }): boolean {
  if (opts.isPaused) return false;
  return opts.timeLeft <= 0 && opts.isMyTurn;
}

describe("chrono GELÉ pendant les animations", () => {
  it("un chrono gelé ne termine pas le tour d'office", () => {
    // Le joueur ne peut rien faire tant qu'une animation tourne : lui prendre
    // son temps — voire lui prendre son tour — serait lui facturer une attente
    // qu'il ne contrôle pas.
    expect(timerActs({ isPaused: true, isMyTurn: true, timeLeft: 0 })).toBe(false);
  });

  it("dégelé, il reprend son office normalement", () => {
    expect(timerActs({ isPaused: false, isMyTurn: true, timeLeft: 0 })).toBe(true);
  });

  it("gelé ou non, rien ne part chez l'adversaire", () => {
    expect(timerActs({ isPaused: false, isMyTurn: false, timeLeft: 0 })).toBe(false);
  });

  it("le temps passé gelé est RENDU, pas perdu", () => {
    // `computeTimeLeft(anchor, offsetMs, duration)` retranche la durée du gel de
    // l'écoulé : sans cet offset, le chrono rattraperait d'un coup tout le temps
    // de l'animation au dégel, et le gel n'aurait servi à rien.
    const duration = 90;
    const anchor = 1_000_000;
    const gelMs = 12_000;
    const maintenant = anchor + 30_000;
    const ecouleSansGel = Math.floor((maintenant - anchor) / 1000);
    const ecouleAvecGel = Math.floor((maintenant - anchor - gelMs) / 1000);
    expect(duration - ecouleSansGel).toBe(60);
    expect(duration - ecouleAvecGel).toBe(72); // 12 s rendues
  });
});

describe("bascule de tour : l'alarme ne doit rien hériter du tour précédent", () => {
  // Le compteur affiche le décompte du tour EN COURS, quel qu'en soit le
  // propriétaire : pendant le tour adverse, le joueur voit l'horloge d'en face.
  // Quand le tour bascule vers lui, `timeLeft` traîne encore la valeur basse de
  // la fin du tour adverse tandis que la remise à zéro vient de réarmer
  // l'alarme — le tic-tac partait donc dès sa première seconde, avec 90 s
  // devant lui. Symptôme rapporté : « la musique du chrono se déclenche trop
  // tard, dans le tour de l'adversaire ».
  //
  // Le correctif ne consulte plus la valeur RENDUE mais recalcule depuis
  // l'ancre, toujours à jour car dérivée pendant le rendu.
  function alarmWithRecompute(opts: {
    isMyTurn: boolean; alreadyFired: boolean;
    /** Valeur héritée du rendu précédent (celle qui trompait). */
    renderedTimeLeft: number;
    /** Écoulé réel depuis l'ancre COURANTE. */
    elapsedOnCurrentAnchor: number;
    duration: number;
  }): boolean {
    if (!opts.isMyTurn || opts.alreadyFired) return false;
    const remaining = Math.max(0, opts.duration - opts.elapsedOnCurrentAnchor);
    return remaining <= WARNING_THRESHOLD;
  }

  it("aucune alarme au début de mon tour, même si l'affichage traîne à 2 s", () => {
    expect(alarmWithRecompute({
      isMyTurn: true, alreadyFired: false,
      renderedTimeLeft: 2,            // reliquat du tour adverse
      elapsedOnCurrentAnchor: 0,      // mon tour vient de commencer
      duration: TURN_TIMER_SECONDS,
    })).toBe(false);
  });

  it("elle sonne bien lorsque MON horloge atteint réellement le seuil", () => {
    expect(alarmWithRecompute({
      isMyTurn: true, alreadyFired: false,
      renderedTimeLeft: 40,           // affichage en retard d'un tick
      elapsedOnCurrentAnchor: TURN_TIMER_SECONDS - WARNING_THRESHOLD,
      duration: TURN_TIMER_SECONDS,
    })).toBe(true);
  });
});
