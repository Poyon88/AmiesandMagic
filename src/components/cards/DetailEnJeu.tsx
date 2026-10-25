"use client";

// Descriptif d'une carte EN PARTIE (plateau, main, mulligan) : la carte de la
// COLLECTION, verso ouvert, à la taille de la carte survolée.
//
// Les surfaces de jeu avaient chacune leur propre copie du descriptif (texte
// minuscule, ordre et pastilles qui dérivaient d'une copie à l'autre). Elles
// rendent désormais GameCard elle-même, mise à l'échelle par `zoom` (le texte
// reste net, les écus en cqw suivent), et lui passent l'état de partie
// (`enJeu`) : statuts, caractéristiques courantes, X conférés, coût réduit.
//
// AGRANDISSEMENT : molette (souris) ou pincement (iPad) sur la carte ouverte.
// Au-delà de 1×, la carte agrandie est peinte dans un portail, recalée dans
// l'écran : dans la carte hôte, elle serait rognée par la main ou le plateau.
// Le portail laisse passer la souris : le survol reste celui de la carte hôte,
// qui garde donc la main sur l'ouverture et la fermeture.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GameCard, { type CarteEnJeu } from "./GameCard";
import { lireAgrandissement, regleAgrandissement, useAgrandissement } from "./agrandissement-detail";
import type { Card } from "@/lib/game/types";

/** Largeur de la carte « md » de la collection, que l'on met à l'échelle. */
const LARGEUR_MD = 260;
const MARGE_ECRAN = 8;

const KEYFRAMES = "@keyframes am-detail-en-jeu { from { opacity: 0 } to { opacity: 1 } }";

const ecart = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export default function DetailEnJeu({ visible, largeur, card, enJeu, effectiveManaCost, rayon = 10, onAwaken, awakenTitle }: {
  visible: boolean;
  /** Écu d'Éveil cliquable (carte en main) — le bouton reste actif même dans
   *  la copie agrandie, dont il réactive seul les pointeurs. */
  onAwaken?: () => void;
  awakenTitle?: string;
  /** Largeur intérieure de la carte hôte, en px CSS non zoomés. */
  largeur: number;
  card: Card;
  enJeu?: CarteEnJeu;
  effectiveManaCost?: number;
  rayon?: number;
}) {
  const k = useAgrandissement();
  const ancre = useRef<HTMLDivElement>(null);
  const [cadre, setCadre] = useState<DOMRect | null>(null);

  // Position de la carte hôte À L'ÉCRAN (zooms des ancêtres compris).
  useLayoutEffect(() => {
    if (visible && k > 1 && ancre.current) setCadre(ancre.current.getBoundingClientRect());
  }, [visible, k]);

  // Écouteurs NATIFS non passifs : il faut pouvoir empêcher le défilement de
  // la page (molette) et le zoom du navigateur (pincement) sur la carte.
  useEffect(() => {
    const el = ancre.current;
    if (!visible || !el) return;
    const surMolette = (e: WheelEvent) => {
      e.preventDefault();
      // Pas exponentiel : un cran de molette ≈ ±12 %, un pavé tactile (petits
      // deltas en rafale) varie en douceur.
      regleAgrandissement(lireAgrandissement() * Math.exp(-e.deltaY * 0.0012));
    };
    let depart: { d: number; k: number } | null = null;
    const surDebut = (e: TouchEvent) => {
      if (e.touches.length === 2) { e.preventDefault(); depart = { d: ecart(e.touches), k: lireAgrandissement() }; }
    };
    const surMouvement = (e: TouchEvent) => {
      if (!depart || e.touches.length !== 2) return;
      e.preventDefault();
      regleAgrandissement(depart.k * (ecart(e.touches) / depart.d));
    };
    const surFin = (e: TouchEvent) => { if (e.touches.length < 2) depart = null; };
    // Safari : geste de zoom propriétaire, annulé sur la carte.
    const sansZoomSafari = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", surMolette, { passive: false });
    el.addEventListener("touchstart", surDebut, { passive: false });
    el.addEventListener("touchmove", surMouvement, { passive: false });
    el.addEventListener("touchend", surFin);
    el.addEventListener("touchcancel", surFin);
    el.addEventListener("gesturestart", sansZoomSafari);
    el.addEventListener("gesturechange", sansZoomSafari);
    return () => {
      el.removeEventListener("wheel", surMolette);
      el.removeEventListener("touchstart", surDebut);
      el.removeEventListener("touchmove", surMouvement);
      el.removeEventListener("touchend", surFin);
      el.removeEventListener("touchcancel", surFin);
      el.removeEventListener("gesturestart", sansZoomSafari);
      el.removeEventListener("gesturechange", sansZoomSafari);
    };
  }, [visible]);

  // Monté seulement quand il s'affiche : un plateau plein compte une dizaine de
  // cartes, inutile d'y garder autant de GameCard cachées.
  if (!visible) return null;

  const carte = (zoom: number) => (
    <div style={{ zoom }}>
      <GameCard card={card} size="md" showDetails disableHoverZoom enJeu={enJeu ?? {}} effectiveManaCost={effectiveManaCost}
        onAwaken={onAwaken} awakenTitle={awakenTitle} />
    </div>
  );

  const agrandie = k > 1 && cadre != null && typeof document !== "undefined";
  let portail: React.ReactNode = null;
  if (agrandie) {
    const w = cadre.width * k;
    const h = cadre.height * k;
    const vw = window.innerWidth, vh = window.innerHeight;
    // Centrée sur la carte hôte, puis ramenée dans l'écran.
    const left = Math.min(Math.max(MARGE_ECRAN, cadre.left + cadre.width / 2 - w / 2), Math.max(MARGE_ECRAN, vw - w - MARGE_ECRAN));
    const top = Math.min(Math.max(MARGE_ECRAN, cadre.top + cadre.height / 2 - h / 2), Math.max(MARGE_ECRAN, vh - h - MARGE_ECRAN));
    portail = createPortal(
      <div style={{
        position: "fixed", left, top, width: w, height: h, zIndex: 220,
        pointerEvents: "none", borderRadius: rayon * k, overflow: "hidden",
        filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.75))",
      }}>
        {carte(w / LARGEUR_MD)}
      </div>,
      document.body,
    );
  }

  return (
    <div ref={ancre} style={{
      position: "absolute", inset: 0, zIndex: 6,
      borderRadius: rayon, overflow: "hidden",
      animation: "am-detail-en-jeu 0.2s ease",
      // Le pincement appartient à la carte, pas au zoom de la page.
      touchAction: "none",
    }}>
      <style>{KEYFRAMES}</style>
      {/* À 1×, la carte reste dans son hôte (pastilles survolables). Agrandie,
          l'hôte ne garde que la zone qui capte molette et pincement. */}
      {!agrandie && carte(largeur / LARGEUR_MD)}
      {portail}
    </div>
  );
}
