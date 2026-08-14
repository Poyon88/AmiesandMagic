"use client";

// Compte à rebours VISIBLE pendant une fenêtre de choix (Sélection, Divination,
// mots-clés de Tactique, déclencheur de fin de tour).
//
// Le chrono vit en haut à droite du plateau, à côté du bouton « Fin de tour ».
// Or ces choix s'ouvrent dans une modale qui assombrit le plateau : le joueur ne
// voit plus le temps qui lui reste, alors que c'est précisément le moment où il
// en manque — passé le délai, le choix est résolu au hasard à sa place.
//
// Ce badge est rendu par-dessus la modale plutôt que dans chacune des quatre :
// une seule implémentation, aucune API d'overlay à changer, et rien qui puisse
// passer derrière.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** Horodatage d'ancrage (choiceStartedAt ou turnStartedAt). 0 = pas de chrono. */
  startedAt: number;
  /** Durée totale de la fenêtre, en secondes. */
  seconds: number;
  /** Chrono gelé (animation en cours) : on fige l'affichage. */
  paused?: boolean;
}

/** Secondes restantes, bornées à [0, seconds]. Même calcul que TurnTimer. */
function resteEnSecondes(startedAt: number, seconds: number): number {
  if (!startedAt) return seconds;
  const ecoule = Math.floor((Date.now() - startedAt) / 1000);
  return Math.max(0, Math.min(seconds, seconds - ecoule));
}

export default function ChoiceTimerBadge({ startedAt, seconds, paused = false }: Props) {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  const [reste, setReste] = useState(() => resteEnSecondes(startedAt, seconds));

  useEffect(() => {
    if (paused) return;
    setReste(resteEnSecondes(startedAt, seconds));
    // 250 ms plutôt que 1 s : le chiffre change à la bonne seconde, sans le
    // décalage d'un tick aligné sur le montage.
    const id = setInterval(() => setReste(resteEnSecondes(startedAt, seconds)), 250);
    return () => clearInterval(id);
  }, [startedAt, seconds, paused]);

  if (!monte) return null;

  // Sous 5 s, le badge passe au rouge et bat : c'est le moment où le joueur doit
  // trancher, sous peine de voir le choix résolu au hasard.
  const urgent = reste <= 5;
  const teinte = urgent ? "#e74c3c" : "#c8a84e";
  const part = seconds > 0 ? reste / seconds : 0;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 18,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 120, // au-dessus des modales de choix
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 16px",
        borderRadius: 999,
        border: `1px solid ${teinte}`,
        background: "rgba(10,8,18,0.92)",
        boxShadow: `0 0 18px ${urgent ? "rgba(231,76,60,0.55)" : "rgba(200,168,78,0.35)"}`,
        fontFamily: "var(--font-cinzel), serif",
        color: teinte,
        animation: urgent ? "am-choice-timer-pulse 1s ease-in-out infinite" : undefined,
      }}
      role="timer"
      aria-live="off"
    >
      <span style={{ fontSize: 11, letterSpacing: "0.14em", opacity: 0.85 }}>
        TEMPS RESTANT
      </span>
      <span style={{ fontSize: 20, fontWeight: 700, minWidth: 34, textAlign: "right" }}>
        {reste}s
      </span>
      {/* Jauge : la proportion se lit d'un coup d'œil, sans compter les chiffres. */}
      <span style={{ position: "relative", width: 76, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.14)" }}>
        <span
          style={{
            position: "absolute", inset: 0, width: `${part * 100}%`,
            borderRadius: 3, background: teinte,
            transition: "width 250ms linear",
          }}
        />
      </span>
    </div>,
    document.body,
  );
}
