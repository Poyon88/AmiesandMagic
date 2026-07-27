import { composedMarkerColor } from "@/lib/game/composed-display";
import type { KeywordMode } from "@/lib/game/types";

/** Marqueur ✦ (étincelle) posé dans le coin haut-droit d'une icône d'effet
 *  COMPOSÉ, coloré par le déclencheur — le signal statique « ceci est un effet
 *  composé » (les mots-clés classiques n'en ont pas). À placer comme enfant d'un
 *  wrapper `position: relative` entourant l'icône. `size` = taille du glyphe (px),
 *  à échelonner grossièrement sur la taille de l'icône (~0,5×). */
export default function ComposedMarker({ mode, size = 7, color }: {
  mode: KeywordMode | undefined;
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
        fontSize: size,
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
