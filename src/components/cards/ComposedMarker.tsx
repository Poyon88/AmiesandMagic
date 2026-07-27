import { composedMarkerColor } from "@/lib/game/composed-display";
import type { KeywordMode } from "@/lib/game/types";

/** Marqueur ✦ (étincelle) posé dans le coin haut-droit d'une icône d'effet
 *  COMPOSÉ, coloré par le déclencheur — le signal statique « ceci est un effet
 *  composé » (les mots-clés classiques n'en ont pas). À placer comme enfant d'un
 *  wrapper `position: relative` entourant l'icône. `size` = taille du glyphe (px),
 *  à échelonner grossièrement sur la taille de l'icône (~0,5×). */
/** Facteur appliqué à TOUTES les tailles reçues. Le marqueur est répliqué sur
 *  une douzaine de rendus (carte en jeu, main, plateau, mulligan, aperçu,
 *  forge…) : le grossir ici évite d'avoir à retoucher chaque appel — et d'en
 *  oublier un, ce qui laisserait un ✦ à l'ancienne échelle sur un seul écran.
 *  `size` reste donc une taille de RÉFÉRENCE, pas une valeur en px finale. */
const MARKER_SCALE = 1.5;

export default function ComposedMarker({ mode, size = 7, color }: {
  mode: KeywordMode | undefined;
  /** Taille de référence, calée sur ~0,5× l'icône ; l'échelle commune s'applique par-dessus. */
  size?: number;
  /** Couleur imposée. Sert au marqueur de PORTÉE (capacité conférée à tous les
   *  alliés, en vert) : même signal discret dans le coin de l'icône, sans le
   *  pavé de couleur qui écrasait l'icône. */
  color?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        fontSize: size * MARKER_SCALE,
        lineHeight: 1,
        color: color ?? composedMarkerColor(mode),
        fontWeight: 900,
        pointerEvents: "none",
        // Ombre sombre + fine lueur : reste lisible sur fond clair comme foncé.
        textShadow: "0 0 1px #000, 0 0 1.5px #000, 0 0 3px rgba(0,0,0,0.7)",
      }}
    >
      ✦
    </span>
  );
}
