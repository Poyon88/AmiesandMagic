import type { Capability } from '@/lib/game/types';

/** Contenus composés dont l'amplitude est un COUPLE +X/+Y, et dont les deux
 *  moitiés valent 0 quand le champ est absent (cf. resolveComposedEffect).
 *  `grant_keyword` en est volontairement exclu : là, un `y` absent laisse le
 *  moteur appliquer son repli (la Gloire conférée accorde 1 PV, pas 0). */
export const XY_COMPOSED_CONTENTS: ReadonlySet<string> = new Set(['buff', 'debuff']);

/** Matérialise les deux moitiés de l'amplitude d'un buff/debuff composé.
 *
 *  L'éditeur affiche « X 0 / Y 0 » mais n'écrit un champ que si le joueur y
 *  touche : une amplitude partait donc en base amputée de son `y`. Sans
 *  conséquence à la résolution (un `y` absent y vaut déjà 0), mais fatale aux
 *  AMPLIFICATEURS — Lune, Soleil et Chant majorent les champs PRÉSENTS et n'en
 *  font jamais naître un (un champ absent doit garder son repli moteur). Un
 *  Soleil ne boostait donc que l'attaque d'un buff composé, jamais la défense,
 *  là où le même Soleil boostait bien les deux moitiés d'un Renforcement.
 *
 *  Le garde-fou est au CONTRAT DE SORTIE : les deux éditeurs (Forge et
 *  CardEditor) passent par la route de sauvegarde, seul chemin qui écrit
 *  `capabilities[].composed`. */
export function fillXYMagnitude(c: Capability): Capability {
  const composed = c.composed;
  if (!composed || !XY_COMPOSED_CONTENTS.has(composed.content)) return c;
  return {
    ...c,
    composed: {
      ...composed,
      // Spread AVANT les deux moitiés : `magnitude` porte aussi les drapeaux
      // d'amplitude ALÉATOIRE (`randomX` / `randomY`). Reconstruire l'objet à
      // partir des seuls x/y les jetait en silence — la case « ? » cochée dans
      // l'éditeur revenait décochée après sauvegarde, sans la moindre erreur.
      magnitude: { ...composed.magnitude, x: composed.magnitude?.x ?? 0, y: composed.magnitude?.y ?? 0 },
    },
  };
}
