"use client";

import { useId } from "react";

/**
 * Pièce d'or — SVG dessiné, et non l'emoji 🪙.
 *
 * L'emoji est rendu par la police du système : sur macOS il sort ARGENTÉ, ce
 * qui contredit le nom même de la monnaie. Un dessin nous rend la couleur, et
 * accessoirement la même pièce sur toutes les plateformes.
 *
 * Décorative par défaut (`aria-hidden`) : elle accompagne toujours un nombre
 * déjà lisible, et un lecteur d'écran n'a pas à annoncer deux fois la monnaie.
 * Passer un `title` la rend annonçable quand elle apparaît seule.
 */
export default function GoldCoin({
  size = 16,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  // `useId` : plusieurs pièces coexistent sur un même écran (la boutique en
  // affiche trois). Des identifiants de dégradé en dur seraient dupliqués, et
  // un `<defs>` démonté emporterait la teinte des pièces restantes.
  const uid = useId().replace(/:/g, "");
  const face = `coin-face-${uid}`;
  const rim = `coin-rim-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0 }}
    >
      <defs>
        {/* Lumière en haut à gauche, ombre en bas à droite : c'est ce décalage
            qui fait lire un disque plutôt qu'un rond plat. */}
        <radialGradient id={face} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fdf1b8" />
          <stop offset="45%" stopColor="#e8c25a" />
          <stop offset="100%" stopColor="#a9761a" />
        </radialGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6dd8e" />
          <stop offset="100%" stopColor="#8a5f13" />
        </linearGradient>
      </defs>

      {/* Tranche */}
      <circle cx="12" cy="12" r="11" fill={`url(#${rim})`} />
      {/* Face */}
      <circle cx="12" cy="12" r="9.2" fill={`url(#${face})`} />
      {/* Cercle intérieur gravé — disparaît proprement aux petites tailles. */}
      <circle cx="12" cy="12" r="6.6" fill="none" stroke="#8a5f13" strokeOpacity="0.45" strokeWidth="0.9" />
      {/* Losange central : le même motif que les filets décoratifs du site. */}
      <path d="M12 8.2 L14.6 12 L12 15.8 L9.4 12 Z" fill="#8a5f13" fillOpacity="0.5" />
      {/* Reflet */}
      <ellipse cx="8.8" cy="8.2" rx="2.6" ry="1.7" fill="#fffdf0" fillOpacity="0.45" transform="rotate(-35 8.8 8.2)" />
    </svg>
  );
}
