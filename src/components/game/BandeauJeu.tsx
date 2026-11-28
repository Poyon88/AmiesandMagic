"use client";

// BANDEAU DE JEU — le cartouche des messages incrustés en haut du plateau
// (« l'adversaire fait un choix », « choisissez une cible »…). Une seule
// facture pour tous : plaque sombre, filet d'or, losanges d'angle, titre en
// Cinzel — la matière du bouton « Fin de tour » et des médaillons, à la place
// des pavés bleu / violet / gris d'origine qui juraient avec le reste.
//
// Le TON ne change que la lueur intérieure et la couleur du sur-titre ; le
// cadre doré reste le même, pour que tous se lisent comme une même famille.

import { motion } from "framer-motion";

type Ton = "attente" | "cible" | "arcane";

const LUEUR: Record<Ton, string> = {
  attente: "148, 163, 184", // acier : rien à faire, on patiente
  cible: "96, 165, 250", //   bleu : à vous de désigner
  arcane: "168, 85, 247", //  violet : ciblage d'un sort ou d'un pouvoir
};

/** Les libellés traduits commencent parfois par un pictogramme (« ⏳ », « 🎯 »).
 *  Il dépend de la police du système et tranche avec la plaque : on le retire,
 *  l'ornement du bandeau en tient lieu. */
function sansPictogramme(texte: string): string {
  return texte.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "");
}

function Losange({ tourne }: { tourne: boolean }) {
  return (
    <motion.span
      aria-hidden
      style={{
        display: "inline-block", width: 9, height: 9, flex: "none",
        background: "linear-gradient(135deg, var(--am-gold-bright), var(--am-gold-deep))",
        boxShadow: "0 0 8px rgba(244, 224, 154, 0.7)",
        rotate: 45,
      }}
      animate={tourne ? { rotate: [45, 225, 225, 405], scale: [1, 1.25, 1, 1.25, 1] } : undefined}
      transition={tourne ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : undefined}
    />
  );
}

interface Props {
  ton?: Ton;
  /** Petite ligne au-dessus du message (« Cible 1/2 »). */
  surtitre?: string;
  /** Décalage sous le chrono de choix, qui occupe le même point d'ancrage. */
  sousLeChrono?: boolean;
  children: string;
}

export default function BandeauJeu({ ton = "cible", surtitre, sousLeChrono = false, children }: Props) {
  const lueur = LUEUR[ton];
  return (
    // Centrage par un conteneur fixe pleine largeur : le `transform` reste libre
    // pour l'animation d'entrée (un translate -50 % s'y serait fait écraser).
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: sousLeChrono ? 72 : 16 }}
    >
      <motion.div
        role="status"
        initial={{ opacity: 0, y: -14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "relative",
          maxWidth: "min(92vw, 720px)",
          padding: "3px",
          borderRadius: 6,
          // Jante dorée : un dégradé derrière la plaque, visible sur 3 px.
          background: "linear-gradient(180deg, var(--am-gold-bright) 0%, var(--am-gold) 35%, var(--am-gold-deep) 100%)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.65), 0 0 22px rgba(216, 178, 90, 0.28)",
        }}
      >
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            padding: surtitre ? "8px 30px 10px" : "11px 30px",
            borderRadius: 4,
            background: `radial-gradient(120% 140% at 50% 0%, rgba(${lueur}, 0.26) 0%, rgba(${lueur}, 0) 60%), linear-gradient(180deg, var(--am-bg-3) 0%, var(--am-bg-1) 55%, var(--am-bg-0) 100%)`,
            // Filet intérieur : la gravure qui double la jante.
            boxShadow: "inset 0 0 0 1px rgba(244, 224, 154, 0.22), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {surtitre && (
            <span
              style={{
                fontFamily: "var(--font-cinzel), serif", fontSize: 11, fontWeight: 700,
                letterSpacing: "0.22em", textTransform: "uppercase",
                color: `rgb(${lueur})`, filter: "brightness(1.35)",
              }}
            >
              {surtitre}
            </span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Losange tourne={ton === "attente"} />
            <span
              style={{
                fontFamily: "var(--font-cinzel), serif", fontWeight: 700,
                fontSize: "clamp(0.95rem, 1.5vw, 1.2rem)", letterSpacing: "0.05em",
                color: "var(--am-ink)", textAlign: "center", lineHeight: 1.25,
                textShadow: `0 0 14px rgba(${lueur}, 0.55), 0 2px 3px rgba(0,0,0,0.9)`,
              }}
            >
              {sansPictogramme(children)}
            </span>
            <Losange tourne={ton === "attente"} />
          </span>
        </div>
      </motion.div>
    </div>
  );
}
