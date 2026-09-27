"use client";

/** Bouton « ∞ » d'un coût OPTIONNEL : bascule entre « n'importe quel coût »
 *  (X absent) et X = 1. Placé à côté du champ X / Y, dans la forge, l'éditeur
 *  et les pouvoirs composés : vider un champ numérique au doigt (iPad) n'a rien
 *  d'évident, et rien ne signalait que c'était possible tant qu'il affichait 1.
 *  `compact` : le seul symbole, pour les emplacements étroits (pastilles). */
export default function BoutonCoutLibre({
  libre, onToggle, label, title, compact = false,
}: {
  libre: boolean;
  onToggle: () => void;
  label: string;
  title: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-pressed={libre}
      title={title}
      style={{
        padding: compact ? "1px 5px" : "1px 7px", borderRadius: 4, fontSize: compact ? 10 : 11,
        cursor: "pointer", fontFamily: "'Cinzel',serif", lineHeight: 1.4, whiteSpace: "nowrap",
        border: `1px solid ${libre ? "#b3541e" : "#e0d4b8"}`,
        background: libre ? "#b3541e" : "transparent", color: libre ? "#fff" : "#8a6d3b",
      }}
    >
      {compact ? "∞" : `∞ ${label}`}
    </button>
  );
}
