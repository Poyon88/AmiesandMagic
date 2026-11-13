"use client";

// Icônes des récompenses de tournoi — dessinées en SVG, comme <GoldCoin /> et
// <EssenceIcon /> : rendu identique partout, aucune image à régénérer.

// Le jeton de crédit sert aussi hors tournois (en-tête, enchères) : il vit
// dans components/shared, réexporté ici.
export { default as CreditIcon } from "@/components/shared/CreditIcon";

type IconProps = { size?: number; className?: string; title?: string };

function a11y(title?: string) {
  return {
    role: title ? "img" : undefined,
    "aria-hidden": title ? undefined : true,
    "aria-label": title,
    style: { display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0 } as const,
  };
}

/** Golden Ticket : billet doré à encoches, étoile centrale. */
export function GoldenTicketIcon({ size = 16, className, title }: IconProps) {
  // Identifiant FIXE, et non `useId` : `useId` dépend de la position dans
  // l'arbre React, qui différait entre le rendu serveur et le navigateur
  // (erreur d'hydratation sur l'accueil). Le dégradé est le même pour toutes
  // les icônes : des `id` répétés y renvoient tous au même dessin, et si un
  // `<defs>` est démonté, le navigateur se rabat sur le suivant.
  const uid = "am";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...a11y(title)}>
      <defs>
        <linearGradient id={`gt-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4e09a" />
          <stop offset="45%" stopColor="#d8b25a" />
          <stop offset="100%" stopColor="#9a7730" />
        </linearGradient>
      </defs>
      <path
        d="M3 6.5 H21 V10 A2 2 0 0 0 21 14 V17.5 H3 V14 A2 2 0 0 0 3 10 Z"
        fill={`url(#gt-${uid})`}
        transform="rotate(-12 12 12)"
      />
      <g transform="rotate(-12 12 12)">
        <path d="M16 7.5 V16.5" stroke="#1a1408" strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="1.2 1.2" />
        <path d="M10 8.6 L11 11 L13.6 11.1 L11.6 12.7 L12.3 15.2 L10 13.8 L7.7 15.2 L8.4 12.7 L6.4 11.1 L9 11 Z" fill="#1a1408" fillOpacity="0.8" />
      </g>
    </svg>
  );
}

/** Cosmétique en édition limitée : losange facetté. */
export function CosmeticIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...a11y(title)}>
      <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 6.5 L17.5 12 L12 17.5 L6.5 12 Z" fill="currentColor" fillOpacity="0.85" />
    </svg>
  );
}
