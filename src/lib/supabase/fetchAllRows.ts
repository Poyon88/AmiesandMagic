/** Lecture PAGINÉE d'une table entière.
 *
 *  PostgREST plafonne toute réponse à `db-max-rows` (1 000 lignes par défaut).
 *  Un `select()` sans `.range()` ne renvoie donc pas « la table » mais un
 *  sous-ensemble ARBITRAIRE dès qu'elle dépasse ce seuil — sans erreur, sans
 *  avertissement, sans même que le nombre de lignes paraisse anormal. La table
 *  `cards` a franchi ce seuil en août 2026 ; la première victime a été la garde
 *  anti-homonyme de la forge, qui déclarait « nom libre » un nom pris.
 *
 *  Toute lecture de table entière passe par ici. Deux exigences que le nom du
 *  paramètre ne dit pas :
 *
 *  1. `page` DOIT porter un ordre TOTAL (typiquement `.order('id')`, ou une
 *     colonne non unique SUIVIE de `id`). Sans lui, deux pages successives
 *     peuvent se recouvrir ou sauter une ligne — le trou qu'on croyait boucher
 *     revient, en pire, car il devient intermittent.
 *  2. On avance du nombre de lignes RÉELLEMENT reçues, jamais de `pageSize` :
 *     si le serveur plafonne plus bas que la page demandée, la boucle continue
 *     au lieu de se croire arrivée au bout.
 */
export type PagedResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PagedResult<T>>,
  options?: { pageSize?: number; label?: string },
): Promise<T[]> {
  const pageSize = options?.pageSize ?? 1000;
  const label = options?.label ?? 'Lecture paginée';
  const out: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`${label} : ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) return out;
    out.push(...rows);
    from += rows.length;
  }
}

/** Variante à SORTIE ANTICIPÉE : `visit` peut rendre une valeur pour arrêter
 *  net (une recherche n'a pas besoin de charger la suite). Rendre `undefined`
 *  demande la page suivante. Même contrat d'ordre total que `fetchAllRows`. */
export async function scanAllRows<T, R>(
  page: (from: number, to: number) => PromiseLike<PagedResult<T>>,
  visit: (rows: T[]) => R | undefined,
  options?: { pageSize?: number; label?: string },
): Promise<R | null> {
  const pageSize = options?.pageSize ?? 1000;
  const label = options?.label ?? 'Lecture paginée';
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`${label} : ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) return null;
    const found = visit(rows);
    if (found !== undefined) return found;
    from += rows.length;
  }
}
