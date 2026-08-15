// La SIGNATURE d'un clan : les capacités qu'on y rencontre le plus souvent.
//
// Elle était d'abord lue dans `clanProfiles.likelyKeywords` — c'est-à-dire dans
// l'INTENTION du générateur, les capacités qu'il a le droit de tirer et avec
// quelle probabilité. Ce n'est pas la même chose que ce que le clan contient
// vraiment : les cartes sont créées à la main autant que tirées, et l'intention
// vieillit. L'Ordre de l'Aube visait Bénédiction en deuxième position ; une
// seule de ses cartes la porte.
//
// On compte donc les cartes elles-mêmes.
//
// Module pur : il reçoit des cartes, il rend un classement. Aucune requête.

/** Une capacité du classement. `spell` distingue les deux registres, qui ont
 *  chacun leurs icônes et leur espace de traduction — `incineration` existe
 *  des deux côtés et ne désigne pas la même chose. */
export interface SignatureEntry {
  id: string;
  spell: boolean;
  /** Nombre de cartes du clan qui la portent. Affiché : c'est lui qui rend le
   *  classement vérifiable, et qui évite de présenter comme emblématique une
   *  capacité vue une seule fois. */
  count: number;
}

/** Forme minimale attendue — volontairement plus lâche que `Card`, pour qu'on
 *  puisse n'aller chercher que ces colonnes en base. */
export interface CarteComptable {
  keywords?: string[] | null;
  spell_keywords?: { id?: string }[] | null;
}

export const SIGNATURE_MAX = 6;

/** Les capacités les plus présentes, la plus fréquente d'abord.
 *
 *  Une carte compte UNE FOIS par capacité, même si elle la porte en double :
 *  on mesure combien de cartes l'utilisent, pas combien d'exemplaires existent.
 *
 *  Les égalités sont fréquentes — sur un clan de trente cartes, les premières
 *  places tiennent souvent à une unité. Elles sont donc départagées par id,
 *  faute de quoi deux rendus successifs de la même page pourraient différer. */
export function signatureFromCards(
  cartes: CarteComptable[],
  max: number = SIGNATURE_MAX,
): SignatureEntry[] {
  const compte = new Map<string, number>();

  for (const carte of cartes) {
    const vues = new Set<string>();
    for (const kw of carte.keywords ?? []) {
      if (typeof kw === "string" && kw) vues.add(`c:${kw}`);
    }
    for (const sk of carte.spell_keywords ?? []) {
      if (sk?.id) vues.add(`s:${sk.id}`);
    }
    for (const cle of vues) compte.set(cle, (compte.get(cle) ?? 0) + 1);
  }

  return [...compte.entries()]
    .sort(([cleA, a], [cleB, b]) => b - a || cleA.localeCompare(cleB))
    .slice(0, max)
    .map(([cle, count]) => ({ id: cle.slice(2), spell: cle.startsWith("s:"), count }));
}
