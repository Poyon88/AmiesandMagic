"use client";


/**
 * Essence — cristal arcanique dessiné (même principe que <GoldCoin /> : pas
 * d'emoji, dont le rendu dépend de la police du système).
 *
 * Décoratif par défaut ; passer `title` le rend annonçable.
 */
export default function EssenceIcon({
  size = 16,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  // Identifiant FIXE, et non `useId` : `useId` dépend de la position dans
  // l'arbre React, qui différait entre le rendu serveur et le navigateur
  // (erreur d'hydratation sur l'accueil). Le dégradé est le même pour toutes
  // les icônes : des `id` répétés y renvoient tous au même dessin, et si un
  // `<defs>` est démonté, le navigateur se rabat sur le suivant.
  const face = "am-ess-face";
  const side = "am-ess-side";

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
        <linearGradient id={face} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f1e4ff" />
          <stop offset="45%" stopColor="#b48cff" />
          <stop offset="100%" stopColor="#6a35d6" />
        </linearGradient>
        <linearGradient id={side} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8f5cf2" />
          <stop offset="100%" stopColor="#3f1d8f" />
        </linearGradient>
      </defs>
      {/* Facettes : la droite plus sombre donne le volume. */}
      <path d="M12 1.5 L19.5 9 L12 22.5 L4.5 9 Z" fill={`url(#${face})`} />
      <path d="M12 1.5 L19.5 9 L12 22.5 Z" fill={`url(#${side})`} fillOpacity="0.85" />
      <path d="M4.5 9 L19.5 9" stroke="#f1e4ff" strokeOpacity="0.55" strokeWidth="0.8" />
      <path d="M12 1.5 L9 9 L12 22.5 L15 9 Z" fill="#ffffff" fillOpacity="0.12" />
      <ellipse cx="9.2" cy="6.4" rx="1.6" ry="0.9" fill="#ffffff" fillOpacity="0.6" transform="rotate(-40 9.2 6.4)" />
    </svg>
  );
}
