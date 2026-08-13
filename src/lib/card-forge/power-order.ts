// Réordonnancement des pouvoirs d'une créature.
//
// L'ordre qui compte est celui de `keywords[]` : c'est de lui que
// `capability-adapter` dérive les `capabilities`, donc l'ordre dans lequel le
// moteur enchaîne les effets (cf. capability-order.test.ts). Le panneau
// « Déclenchement des pouvoirs » de l'éditeur n'affiche cependant que les
// mots-clés CURÉS — ceux qui se déclenchent — alors que `keywords[]` contient
// aussi les passifs (Armure, Vol, Ombre…).
//
// D'où cette fonction : elle échange deux ids dans le tableau COMPLET au lieu de
// réordonner la sous-liste affichée. Les passifs intercalés gardent leur place et
// aucun mot-clé n'est perdu — ce qui serait arrivé en reconstruisant le tableau
// depuis la seule liste visible.

/** Déplace `kw` d'un rang parmi ses `voisins` (les pouvoirs affichés), en
 *  échangeant sa position avec celle du voisin visé dans `keywords`.
 *
 *  Rend un NOUVEAU tableau, ou le tableau d'origine inchangé si le déplacement
 *  est impossible (bout de liste, id introuvable).
 *
 *  @param keywords Tableau complet `keywords[]` de la carte.
 *  @param kw       Id du pouvoir à déplacer.
 *  @param sens     -1 pour résoudre plus tôt, +1 pour plus tard.
 *  @param voisins  Pouvoirs affichés, dans leur ordre d'affichage. */
export function movePowerInKeywords(
  keywords: readonly string[],
  kw: string,
  sens: -1 | 1,
  voisins: readonly string[],
): string[] {
  const rang = voisins.indexOf(kw);
  if (rang === -1) return [...keywords];
  const cible = voisins[rang + sens];
  if (cible === undefined) return [...keywords]; // déjà en bout de liste

  const suivant = [...keywords];
  const i = suivant.indexOf(kw);
  const j = suivant.indexOf(cible);
  if (i === -1 || j === -1) return [...keywords];
  [suivant[i], suivant[j]] = [suivant[j], suivant[i]];
  return suivant;
}
