// FILTRE PAR POUVOIR (collection, constructeur de deck, éditeur de cartes).
//
// Un pouvoir vit à trois endroits d'une carte : les mots-clés (`keywords`), les
// mécaniques de sort (`spell_keywords`) et les effets COMPOSÉS
// (`capabilities[].composed`). Le filtre ne regardait que les deux premiers :
// une carte qui paralyse par un effet composé n'apparaissait pas sous
// « Entrave », alors qu'elle en porte l'icône et le nom.
//
// Règle : un effet composé répond au pouvoir dont il affiche l'ICÔNE — la même
// correspondance que le rendu (`composedIcon`), donc ce que le joueur voit sur
// la carte est ce que le filtre trouve. La clé d'icône `spell_x` désigne la
// mécanique de sort `x`, qui partage son id avec le filtre.

import { composedCapsOf, composedIcon } from "./composed-display";
import type { Card } from "./types";

/** Ids de pouvoir dont les effets composés d'une carte empruntent l'icône. */
export function composedAbilityIds(capabilities: Card["capabilities"] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const cap of composedCapsOf(capabilities)) {
    const key = composedIcon(cap).keyword;
    if (key) ids.add(key.startsWith("spell_") ? key.slice("spell_".length) : key);
  }
  return [...ids];
}

/** La carte porte-t-elle ce pouvoir — en mot-clé, en mécanique de sort, ou
 *  par un effet composé qui en affiche l'icône ? */
export function cardHasAbility(
  card: { keywords?: readonly string[] | null; spell_keywords?: Card["spell_keywords"]; capabilities?: Card["capabilities"] },
  id: string,
): boolean {
  if ((card.keywords ?? []).includes(id)) return true;
  if (Array.isArray(card.spell_keywords) && card.spell_keywords.some((sk) => sk?.id === id)) return true;
  return composedAbilityIds(card.capabilities).includes(id);
}
