/** Marqueur de PORTÉE « toutes » : un petit « A » (All) dans le coin
 *  BAS-GAUCHE de l'icône d'une capacité conférée à tous les alliés par une
 *  action, ou d'une capacité ciblée réglée sur « toutes les créatures » (d'un
 *  camp ou des deux — cf. lib/game/target-scope.ts).
 *
 *  Il remplace l'étincelle verte, qui se confondait avec l'étincelle ✦ des
 *  effets COMPOSÉS (coin haut-droit) : deux signaux distincts, deux coins
 *  distincts, deux formes distinctes. À placer comme enfant d'un wrapper
 *  `position: relative` entourant l'icône. `size` = hauteur de la lettre (px),
 *  ~0,4× la taille de l'icône.
 *
 *  `color` = la couleur de la CAPACITÉ (celle de son déclencheur, blanc pour
 *  un passif) : le « A » fait partie de l'icône, il n'a pas sa propre teinte. */
export default function AllAlliesMarker({ size = 9, color, label = "Tous les alliés" }: {
  size?: number;
  color?: string | null;
  /** Portée « toutes » d'une capacité ciblée : le « A » vaut aussi pour les
   *  ennemies ou les deux camps, seul le libellé lu change. */
  label?: string;
}) {
  return (
    <span
      aria-label={label}
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        fontSize: size,
        lineHeight: 1,
        fontWeight: 900,
        fontFamily: "'Cinzel', serif",
        color: color ?? "#fff",
        pointerEvents: "none",
        // Même contour sombre que les autres marqueurs d'icône : lisible sur
        // fond clair comme foncé.
        textShadow: "0 0 1px #000, 0 0 1.5px #000, 0 0 3px rgba(0,0,0,0.7)",
      }}
    >
      A
    </span>
  );
}
