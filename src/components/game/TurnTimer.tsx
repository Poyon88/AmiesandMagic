"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TURN_TIMER_SECONDS, CHOICE_TIMER_SECONDS } from "@/lib/game/constants";
import { useAudioStore } from "@/lib/store/audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";
import AudioEngine from "@/lib/audio/AudioEngine";
import { actionALExpiration } from "@/lib/game/choice-timer";

const WARNING_THRESHOLD = 15;

interface TurnTimerProps {
  isMyTurn: boolean;
  onTimeUp: () => void;
  turnNumber: number;
  /** Wall-clock (`Date.now()`) ms when the current turn began. The display
   *  is always derived from this anchor, so even if the browser throttles
   *  our setInterval (Chrome aggressively throttles unfocused windows when
   *  testing two clients side-by-side), the value is corrected the next
   *  time the tick fires or the tab regains focus. */
  turnStartedAt: number;
  /** When true, the timer display freezes and onTimeUp will not fire. The
   *  duration spent paused is added to an offset so the player isn't
   *  penalised after unpause. */
  isPaused?: boolean;
  /** True quand des déclencheurs interactifs « fin de tour » restent à résoudre
   *  (file pendingTriggers du joueur local). Dans ce cas, l'expiration du chrono
   *  ne déclenche PAS onTimeUp (end_turn, bloqué de toute façon) mais
   *  onPendingTimeout (repli automatique au hasard). */
  hasPendingTriggers?: boolean;
  /** Ancre du compte à rebours du CHOIX — l'instant où la fenêtre est devenue
   *  VISIBLE chez ce client (cf. GameBoard, `choiceAnchor`), à défaut
   *  `gameState.choiceStartedAt`. Tant
   *  qu'un choix est en attente, le compteur bascule sur cette horloge et sur
   *  CHOICE_TIMER_SECONDS au lieu du chrono de tour : la pause naît le plus
   *  souvent de l'expiration du chrono, et le reliquat valait alors ~0 s — la
   *  modale s'affichait puis le repli tranchait à la place du joueur. */
  choiceStartedAt?: number;
  /** Appelé quand la fenêtre de choix expire — le propriétaire n'a pas choisi
   *  à temps, on résout au hasard. */
  onPendingTimeout?: () => void;
  /** Le joueur local est-il le PROPRIÉTAIRE du choix en tête de file ? Il peut
   *  l'être hors de son tour (râle d'agonie, Blessure…). C'est lui qui replie à
   *  l'expiration ; l'autre client seulement après un délai de grâce. */
  isChoiceMine?: boolean;
}

function computeTimeLeft(anchor: number, offsetMs = 0, duration = TURN_TIMER_SECONDS): number {
  if (!anchor) return duration;
  const elapsed = Math.floor((Date.now() - anchor - offsetMs) / 1000);
  return Math.max(0, Math.min(duration, duration - elapsed));
}

/** Secondes écoulées AU-DELÀ de la durée (négatif tant que l'horloge court). */
function computeOverrun(anchor: number, offsetMs: number, duration: number): number {
  if (!anchor) return -duration;
  return Math.floor((Date.now() - anchor - offsetMs) / 1000) - duration;
}

export default function TurnTimer({
  isMyTurn,
  onTimeUp,
  turnNumber,
  turnStartedAt,
  isPaused = false,
  hasPendingTriggers = false,
  choiceStartedAt,
  onPendingTimeout,
  isChoiceMine = false,
}: TurnTimerProps) {
  // Deux régimes, une seule mécanique : on ne change QUE l'ancre et la durée.
  const inChoice = hasPendingTriggers && !!choiceStartedAt;
  const anchor = inChoice ? choiceStartedAt! : turnStartedAt;
  const duration = inChoice ? CHOICE_TIMER_SECONDS : TURN_TIMER_SECONDS;
  const pauseStartedAtRef = useRef<number | null>(null);
  // Un décompte de pause (animations) PAR horloge : celui du tour survit à une
  // fenêtre de choix — le tour reprend où il en était, crédit compris — et
  // celui du choix repart de zéro à chaque nouvelle fenêtre.
  const turnPauseOffsetMsRef = useRef(0);
  const choicePauseOffsetMsRef = useRef(0);
  const pauseOffsetMsRef = inChoice ? choicePauseOffsetMsRef : turnPauseOffsetMsRef;
  const [timeLeft, setTimeLeft] = useState(() => computeTimeLeft(anchor, 0, duration));
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;
  const onPendingTimeoutRef = useRef(onPendingTimeout);
  onPendingTimeoutRef.current = onPendingTimeout;
  const hasPendingTriggersRef = useRef(hasPendingTriggers);
  hasPendingTriggersRef.current = hasPendingTriggers;

  const hasFiredWarningRef = useRef(false);
  const warningAudioRef = useRef<HTMLAudioElement | null>(null);

  // Single source of truth for "what should we display now". Wraps the
  // setTimeLeft call and optionally fires onTimeUp when we reach zero on
  // our own turn — kept here so that interval ticks AND focus/visibility
  // recomputes share the exact same logic.
  const tick = useCallback(() => {
    if (isPaused) return;
    const next = computeTimeLeft(anchor, pauseOffsetMsRef.current, duration);
    setTimeLeft(next);
    // Qui émet quoi (cf. actionALExpiration) : fenêtre de choix → son
    // propriétaire, l'autre client en secours après un délai de grâce ; chrono
    // de tour → le joueur actif.
    //
    // Re-tenté à chaque tick, SANS verrou « déjà tiré » : les poignées sont
    // refusées en silence quand une animation tourne (cf. handleEndTurn /
    // handleAutoResolvePending), et un verrou transformait ce refus en abandon
    // définitif — le tour restait planté à 0. C'est sûr parce que les actions
    // sont idempotentes côté moteur (end_turn sur une fin de tour en pause est
    // un no-op ; le repli porte l'id de la tête de file) et que la condition
    // s'éteint d'elle-même dès que la file ou le tour change.
    const action = actionALExpiration({
      enChoix: inChoice,
      estMonTour: isMyTurn,
      choixAMoi: isChoiceMine,
      depassement: computeOverrun(anchor, pauseOffsetMsRef.current, duration),
    });
    if (!action) return;
    // Chrono de TOUR écoulé avec une file sans horloge de choix (état hérité) :
    // end_turn serait bloqué, on replie la file.
    if (action === "auto_resolve" || hasPendingTriggersRef.current) {
      setTimeout(() => onPendingTimeoutRef.current?.(), 0);
    } else {
      setTimeout(() => onTimeUpRef.current(), 0);
    }
  }, [anchor, duration, isMyTurn, isPaused, inChoice, isChoiceMine, pauseOffsetMsRef]);

  // Pause tracking — when isPaused flips true we anchor the moment; when
  // it flips false we add the elapsed pause to the offset so subsequent
  // ticks subtract it from the wall-clock elapsed value.
  useEffect(() => {
    if (isPaused) {
      pauseStartedAtRef.current = Date.now();
    } else if (pauseStartedAtRef.current !== null) {
      pauseOffsetMsRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
      const recomputed = computeTimeLeft(anchor, pauseOffsetMsRef.current, duration);
      setTimeLeft(recomputed);
    }
  }, [isPaused, anchor, duration, pauseOffsetMsRef]);

  // Remise à zéro AUDIO — au changement de TOUR seulement.
  //
  // Surtout pas à chaque changement d'ancre : l'ouverture d'une fenêtre de choix
  // bascule le compteur sur l'horloge de choix, et relancer l'audio ici faisait
  // reprendre la musique puis la couper aussitôt, tandis que l'alarme repartait
  // du début. Sur un tour à plusieurs choix, la bande-son faisait le yoyo alors
  // que le tour, lui, ne s'était jamais interrompu.
  useEffect(() => {
    AudioEngine.getInstance().resume();
    hasFiredWarningRef.current = false;
    SfxEngine.getInstance().stop(warningAudioRef.current);
    warningAudioRef.current = null;
  }, [turnNumber]);

  // Démontage : couper l'alarme et rendre la musique. Le chrono disparaît à la
  // fin de partie (et à la sortie du match), mais `SfxEngine` joue sur des
  // éléments MUTUALISÉS, hors du cycle de vie React — sans ce nettoyage, le
  // tic-tac continuait par-dessus la musique de victoire ou de défaite, et la
  // musique restait coupée si l'alerte des 15 s venait de la mettre en pause.
  useEffect(() => () => {
    SfxEngine.getInstance().stop(warningAudioRef.current);
    warningAudioRef.current = null;
    AudioEngine.getInstance().resume();
  }, []);

  // Remise à zéro des décomptes de pause : celui du tour au changement de TOUR
  // (son ancre bouge aussi quand une fenêtre de choix lui rend son temps — ce
  // n'est pas un nouveau tour), celui du choix à chaque nouvelle fenêtre.
  useEffect(() => { turnPauseOffsetMsRef.current = 0; }, [turnNumber]);
  useEffect(() => { choicePauseOffsetMsRef.current = 0; }, [choiceStartedAt]);

  // Remise à jour de l'AFFICHAGE à chaque changement d'horloge (tour ↔ choix).
  // Une pause EN COURS (la fenêtre s'ouvre souvent pendant l'animation de
  // l'action qui l'a déclenchée) repart de maintenant, pour la nouvelle horloge :
  // l'oublier faisait manger la fenêtre de choix par l'animation.
  useEffect(() => {
    pauseStartedAtRef.current = isPaused ? Date.now() : null;
    setTimeLeft(computeTimeLeft(anchor, pauseOffsetMsRef.current, duration));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isPaused lu à l'instant du changement d'horloge seulement
  }, [anchor, duration, pauseOffsetMsRef]);

  // 1 Hz interval ticking the display. The browser may throttle this when
  // the window is unfocused (Chrome especially), so we don't rely on it as
  // the only update path — visibility/focus listeners below force a
  // recompute whenever the tab returns to the foreground.
  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  // Force-recompute when the tab/window becomes visible or refocused —
  // covers the throttled-background-tab case.
  useEffect(() => {
    const handler = () => tick();
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, [tick]);

  // Fire the 15-second warning SFX + pause the music exactly once per turn,
  // the first time the countdown crosses the threshold (player's turn only).
  useEffect(() => {
    if (!isMyTurn) return;
    // L'alarme annonce la fin du TOUR. Pendant une fenêtre de choix elle serait
    // un mensonge : cette horloge dure exactement WARNING_THRESHOLD secondes,
    // si bien qu'elle démarre déjà « sous le seuil » — l'alerte sonnait donc dès
    // la première seconde d'une fenêtre pourtant entière.
    if (inChoice) return;
    if (hasFiredWarningRef.current) return;
    // Temps restant RECALCULÉ, et non `timeLeft` tel que rendu.
    //
    // Au basculement de tour, `anchor` porte déjà la nouvelle valeur alors que
    // `timeLeft` traîne encore celle du rendu précédent : le compteur affichait
    // le décompte du joueur SORTANT. Le joueur entrant héritait donc d'une
    // valeur basse — celle de la fin du tour d'en face — pendant que la remise à
    // zéro venait de réarmer l'alarme, et le tic-tac partait dès la première
    // seconde de son tour, avec 90 secondes devant lui.
    //
    // `anchor` étant calculé pendant le rendu, il est TOUJOURS à jour ici : ce
    // recalcul neutralise toute la famille des courses sur l'état rendu.
    if (computeTimeLeft(anchor, pauseOffsetMsRef.current, duration) > WARNING_THRESHOLD) return;
    hasFiredWarningRef.current = true;
    const audio = useAudioStore.getState();
    const url = audio.standardSfxUrls["timer_warning"];
    if (url && audio.userHasInteracted && !audio.settings.sfxMuted) {
      warningAudioRef.current = SfxEngine.getInstance().play(url);
    }
    AudioEngine.getInstance().pause();
  }, [timeLeft, isMyTurn, inChoice, anchor, duration, pauseOffsetMsRef]);

  const percentage = (timeLeft / duration) * 100;
  const isLow = timeLeft <= WARNING_THRESHOLD;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`text-xl font-bold ${
          isLow ? "text-accent animate-pulse" : "text-foreground"
        }`}
      >
        {timeLeft}s
      </div>
      <div className="w-16 h-1.5 bg-background/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isLow ? "bg-accent" : "bg-primary"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
