/** Mise à l'échelle du TITRE d'une carte pour qu'il tienne en deux lignes.
 *
 *  Le problème : `-webkit-line-clamp: 2` coupe proprement, mais couper le nom
 *  d'une carte lui retire son identité — « Intendant Suprême du… » ne désigne
 *  plus rien. On préfère donc réduire la police jusqu'à ce que le nom ENTIER
 *  tienne, plutôt que d'en montrer un morceau.
 *
 *  Pourquoi simuler le retour à la ligne plutôt que compter les caractères :
 *  c'est la coupure des MOTS qui décide, pas la longueur. « Mobilisation des
 *  Profondeurs » et « Intendant Suprême du Royaume » font tous deux 28
 *  caractères ; le premier tient en deux lignes, le second en réclame trois.
 *
 *  Volontairement SANS mesure DOM : pas de `getBoundingClientRect`, donc pas de
 *  second rendu ni de reflow, et un résultat identique sur les deux clients —
 *  une carte ne doit pas s'afficher différemment selon la machine. */

/** Paliers de réduction, du plus grand au plus petit. Le dernier sert de
 *  plancher : au-delà le titre deviendrait illisible, et mieux vaut alors
 *  laisser la troncature faire son travail. */
const PALIERS = [1, 0.88, 0.78, 0.7] as const;

/** Largeur utile de la bande de titre, exprimée en CARACTÈRES à la taille de
 *  police nominale. Calibrée sur la grande carte : « MOBILISATION DES » (16)
 *  tient sur une ligne, « INTENDANT SUPRÊME » (17) non. */
export const TITLE_CHARS_PER_LINE = 16;

/** Nombre de lignes qu'occupe `nom` pour une largeur donnée, en simulant le
 *  retour à la ligne gourmand du navigateur (les mots ne se coupent pas). */
export function wrappedLineCount(nom: string, charsPerLine: number): number {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 0;
  let lignes = 1;
  let courante = 0;
  for (const mot of mots) {
    if (courante === 0) {
      courante = mot.length;
      // Un mot seul plus long que la ligne déborde : le navigateur le laisse
      // dépasser plutôt que de le couper. Il occupe sa ligne, sans plus.
      continue;
    }
    if (courante + 1 + mot.length <= charsPerLine) {
      courante += 1 + mot.length;
    } else {
      lignes += 1;
      courante = mot.length;
    }
  }
  return lignes;
}

/** Facteur d'échelle à appliquer à la taille de police du titre pour que `nom`
 *  tienne en `maxLines` lignes. Rend 1 quand rien n'est nécessaire — le cas de
 *  l'immense majorité des cartes, qui ne doivent pas bouger d'un pixel. */
export function titleFontScale(
  nom: string | null | undefined,
  opts?: { charsPerLine?: number; maxLines?: number },
): number {
  if (!nom) return 1;
  const base = opts?.charsPerLine ?? TITLE_CHARS_PER_LINE;
  const maxLines = opts?.maxLines ?? 2;
  for (const palier of PALIERS) {
    // Une police plus petite fait tenir PLUS de caractères par ligne, dans la
    // même largeur — d'où la division.
    if (wrappedLineCount(nom, Math.floor(base / palier)) <= maxLines) return palier;
  }
  return PALIERS[PALIERS.length - 1];
}
