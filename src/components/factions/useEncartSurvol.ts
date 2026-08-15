"use client";

// L'ANCRAGE d'un encart au survol, sur les pages de faction.
//
// Ce qui se partage entre les capacités emblématiques, les coûts additionnels
// et le héros d'un clan, ce n'est pas le CONTENU de l'encart — une pastille de
// capacité et une fiche de héros n'ont ni la même forme ni les mêmes champs —
// mais sa MÉCANIQUE : basculer au-dessus ou en dessous selon la place, se
// recadrer pour ne pas sortir de la fenêtre, et vivre dans un portail parce que
// les blocs sont peints dans une grille qui rognerait un débordement.
//
// C'est cette mécanique-là qui n'a aucune raison d'exister en trois exemplaires.
// Forcer les trois contenus dans un composant unique aurait demandé une poignée
// de champs optionnels servant chacun un seul appelant — le piège inverse.

import { useCallback, useRef, useState } from "react";
import { overlayRect } from "@/lib/fx/overlayMotion";

/** Au-dessus par défaut ; en dessous quand le haut de fenêtre est trop proche.
 *  La première section de clan est haute dans la page, et un encart ancré vers
 *  le haut y sortirait de l'écran. */
const MARGE_HAUTE_PAR_DEFAUT = 210;

export interface EncartSurvol<T> {
  /** L'élément dont l'encart est ouvert, s'il y en a un. */
  ouverte: T | null;
  /** Ouvre l'encart pour `valeur`, ancré sur `el`. */
  montrer: (valeur: T, el: HTMLElement | null) => void;
  fermer: () => void;
  /** Vrai si l'encart de `cle` est ouvert — pour l'état visuel du déclencheur. */
  estOuvert: (egal: (v: T) => boolean) => boolean;
  /** Style de positionnement à poser sur l'encart, largeur comprise. */
  stylePosition: (largeur: number) => React.CSSProperties;
}

export function useEncartSurvol<T>(margeHaute = MARGE_HAUTE_PAR_DEFAUT): EncartSurvol<T> {
  const [ouverte, setOuverte] = useState<T | null>(null);
  const ancre = useRef<{ x: number; y: number; dessous: boolean } | null>(null);

  const montrer = useCallback((valeur: T, el: HTMLElement | null) => {
    if (!el) return;
    const r = overlayRect(el);
    const dessous = r.top < margeHaute;
    ancre.current = { x: r.left + r.width / 2, y: dessous ? r.top + r.height : r.top, dessous };
    setOuverte(valeur);
  }, [margeHaute]);

  const fermer = useCallback(() => setOuverte(null), []);

  const estOuvert = useCallback(
    (egal: (v: T) => boolean) => ouverte !== null && egal(ouverte),
    [ouverte],
  );

  const stylePosition = useCallback((largeur: number): React.CSSProperties => {
    const a = ancre.current;
    if (!a) return { display: "none" };
    const demi = largeur / 2;
    const bord = typeof window !== "undefined" ? window.innerWidth : 1200;
    return {
      position: "fixed",
      // Recadrage horizontal : sans lui, un encart déclenché en bord de colonne
      // déborderait de la fenêtre et forcerait un défilement latéral.
      left: Math.min(Math.max(a.x, demi + 8), bord - demi - 8),
      top: a.y + (a.dessous ? 10 : -10),
      transform: `translate(-50%, ${a.dessous ? "0" : "-100%"})`,
      width: largeur,
      zIndex: 60,
      pointerEvents: "none",
    };
  }, []);

  return { ouverte, montrer, fermer, estOuvert, stylePosition };
}
