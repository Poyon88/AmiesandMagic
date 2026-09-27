// RECHERCHE dans les grilles de capacités (forge, éditeur de cartes) : la liste
// dépasse la centaine de puces, on la filtre au fil de la frappe.

/** Forme de comparaison : minuscules, sans accents ni ponctuation superflue.
 *  « Épargne X » et « epargne » se rejoignent. */
export function normaliserRecherche(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** La capacité correspond-elle à la recherche ? Chaque mot saisi doit
 *  apparaître dans l'un des libellés fournis (nom affiché, id moteur…), dans
 *  n'importe quel ordre. Recherche vide ⇒ tout correspond. */
export function correspondRecherche(recherche: string, ...libelles: (string | null | undefined)[]): boolean {
  const mots = normaliserRecherche(recherche).split(" ").filter(Boolean);
  if (mots.length === 0) return true;
  const cible = normaliserRecherche(libelles.filter(Boolean).join(" "));
  return mots.every((m) => cible.includes(m));
}
