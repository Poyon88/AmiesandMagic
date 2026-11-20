// Noms des capacités dans la langue de la réponse.
//
// Le livret est en français ; l'agent répond dans la langue du joueur. Signalé
// le 2026-11-20 : une réponse en français citait « Glory », « Command »,
// « Shadow » — l'agent avait pris les noms de la langue de l'INTERFACE (en
// anglais) alors que le joueur écrivait en français. Deux protections :
//   - la consigne dit quels noms employer selon la langue de la réponse ;
//   - ce module rattrape en code ce qui passerait quand même : tout nom
//     officiel écrit dans une autre langue connue est remis dans celle de la
//     réponse.
// Il ne rattrape que les noms OFFICIELS (ceux des fichiers de traduction) :
// une traduction inventée par le modèle (« Reinforcement » pour Renforcement,
// dont le nom anglais est « Strengthen ») lui échappe — d'où la consigne.

/** Noms officiels d'une langue, par identifiant de capacité, sans leur valeur
 *  (« Résistance X » → « Résistance »). */
export type NomsCapacites = ReadonlyMap<string, string>;

/** « Renforcement +X/+Y » → « Renforcement » : dans une phrase, la capacité est
 *  citée sans sa valeur, ou avec un nombre à la place de X. */
export function sansValeur(nom: string): string {
  return nom.replace(/\s*[+-]?X(\s*\/\s*[+-]?Y)?$/, "").trim();
}

const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Remet dans la langue `cible` les noms de capacités écrits dans une des
 * langues `autres`. Mot entier, casse respectée (un nom de capacité porte une
 * majuscule ; « charge » ou « silence » en minuscules sont des mots ordinaires).
 */
export function harmoniserNoms(texte: string, cible: NomsCapacites, autres: readonly NomsCapacites[]): string {
  if (!texte || cible.size === 0) return texte;
  // Un mot qui est DÉJÀ un nom dans la langue cible ne se remplace pas : en
  // anglais « Charge » nomme la Traque, mais si la cible avait elle aussi une
  // capacité « Charge », on ne saurait plus de laquelle il s'agit.
  const dejaCible = new Set(cible.values());
  const versCible = new Map<string, string>();
  for (const langue of autres) {
    for (const [id, nom] of langue) {
      const voulu = cible.get(id);
      if (!voulu || nom === voulu || dejaCible.has(nom) || versCible.has(nom)) continue;
      versCible.set(nom, voulu);
    }
  }
  if (versCible.size === 0) return texte;
  // Une seule passe, les noms les plus longs d'abord : « Force des ancêtres »
  // avant « Force », et jamais de remplacement en chaîne.
  const noms = [...versCible.keys()].sort((a, b) => b.length - a.length).map(echappe);
  const motif = new RegExp(`(?<![\\p{L}\\p{N}])(?:${noms.join("|")})(?![\\p{L}\\p{N}])`, "gu");
  return texte.replace(motif, (trouve) => versCible.get(trouve) ?? trouve);
}
