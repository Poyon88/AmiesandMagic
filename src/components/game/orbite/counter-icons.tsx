/** Icônes au TRAIT des compteurs de l'orbite (viewBox 24, `currentColor`).
 *  Dessinées à la main plutôt que des émojis : elles se teintent en or comme
 *  le reste de l'orbite et gardent la même graisse d'un compteur à l'autre. */

export type CounterKind = "epargne" | "foi" | "conquete" | "exploration" | "invention";

const PATHS: Record<CounterKind, React.ReactNode> = {
  // Bourse nouée, frappée d'une pièce.
  epargne: (
    <>
      <path d="M9 3.5h6l-1.6 3h-2.8z" />
      <path d="M10.4 6.5C6.6 8.4 4.5 11.6 4.5 14.6c0 3.4 3 5.9 7.5 5.9s7.5-2.5 7.5-5.9c0-3-2.1-6.2-5.9-8.1" />
      <circle cx="12" cy="14.2" r="2.9" />
      <path d="M12 12.6v3.2" />
    </>
  ),
  // Cierge sur son bougeoir, flamme en goutte.
  foi: (
    <>
      <path d="M12 2.8c1.5 1.7 2 2.9 2 3.9a2 2 0 0 1-4 0c0-1 .5-2.2 2-3.9z" />
      <path d="M10 10.5h4v8h-4z" />
      <path d="M7 20.5h10M8.5 18.5h7" />
    </>
  ),
  // Fanion planté.
  conquete: (
    <>
      <path d="M6.5 21V3.5" />
      <path d="M6.5 4h11l-2.8 3.8 2.8 3.8h-11" />
    </>
  ),
  // Boussole : rose à deux pointes dans son cercle.
  exploration: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.6 8.4l-2.3 4.9-4.9 2.3 2.3-4.9z" />
      <circle cx="12" cy="12" r="0.9" />
    </>
  ),
  // Engrenage à huit dents.
  invention: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" />
      <circle cx="12" cy="12" r="6.2" />
    </>
  ),
};

export default function CounterIcon({ kind, size = 18 }: { kind: CounterKind; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[kind]}
    </svg>
  );
}
