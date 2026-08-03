// Symbole du coût d'EXIL : une carte coupée en deux.
//
// Dessiné en SVG et non pris dans les emoji : aucun n'existe pour une carte
// déchirée, et 🃏 sert déjà au coût de défausse — les deux coûts doivent rester
// distinguables d'un coup d'œil.
//
// Formes PLEINES plutôt que contours : la pastille l'affiche autour de 11 px,
// taille à laquelle un trait fin disparaît. Les deux moitiés s'écartent de 9°
// autour de leur propre centre, ce qui suffit à lire la coupure sans creuser un
// vide qui ferait perdre la silhouette de carte.
export default function ExileGlyph({
  size = 12,
  color = "currentColor",
  className = "",
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <g fill={color}>
        {/* Moitié gauche : coins arrondis à l'extérieur, tranche nette au centre. */}
        <path d="M10.4 2 H6 a2 2 0 0 0 -2 2 v16 a2 2 0 0 0 2 2 h4.4 Z" transform="rotate(-9 8 12)" />
        {/* Moitié droite, en miroir. */}
        <path d="M13.6 2 H18 a2 2 0 0 1 2 2 v16 a2 2 0 0 1 -2 2 h-4.4 Z" transform="rotate(9 16 12)" />
      </g>
    </svg>
  );
}
