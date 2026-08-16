import type { SupabaseClient } from "@supabase/supabase-js";

/** Objet d'enchère, réduit à ce dont l'enrichissement a besoin. */
interface ItemLike {
  source_type: string;
  source_id: number | null;
  print_number?: number | null;
  max_prints?: number | null;
}

interface AuctionLike {
  items?: ItemLike[] | null;
}

/**
 * Attache le NUMÉRO D'EXEMPLAIRE aux objets d'une enchère.
 *
 * Pourquoi ce détour plutôt qu'une jointure : `auction_items.source_id` est
 * POLYMORPHE — il désigne un `card_prints`, un `user_board_prints` ou un
 * `user_card_back_prints` selon `source_type`. Aucune clé étrangère ne peut
 * donc l'exprimer, et PostgREST n'a rien à embarquer. D'où une seconde requête,
 * filtrée sur les seuls objets de type `print`.
 *
 * Une enchère système (`source_type = 'admin'`) n'a pas de tirage : elle
 * ressort sans numéro, ce qui est exact — la carte n'est pas encore attribuée à
 * un exemplaire précis.
 *
 * Mutation en place : les lignes viennent d'être lues, personne d'autre ne les
 * tient, et recopier tout l'arbre pour ajouter deux champs coûterait plus cher
 * que ça ne clarifierait.
 */
export async function attachPrintNumbers<T extends AuctionLike>(
  supabase: SupabaseClient,
  auctions: T[],
): Promise<T[]> {
  const printIds = auctions
    .flatMap((a) => a.items ?? [])
    .filter((i) => i.source_type === "print" && i.source_id != null)
    .map((i) => i.source_id as number);

  if (printIds.length === 0) return auctions;

  const { data, error } = await supabase
    .from("card_prints")
    .select("id, print_number, max_prints")
    .in("id", [...new Set(printIds)]);

  // Un échec ici ne doit PAS faire échouer la liste des enchères : le numéro
  // est un ornement, l'enchère est l'information. On la sert sans.
  if (error) {
    console.warn("[auction/prints] numéros d'exemplaire indisponibles :", error.message);
    return auctions;
  }

  const parId = new Map(
    (data ?? []).map((p) => [p.id as number, p as { print_number: number | null; max_prints: number | null }]),
  );

  for (const auction of auctions) {
    for (const item of auction.items ?? []) {
      if (item.source_type !== "print" || item.source_id == null) continue;
      const p = parId.get(item.source_id);
      if (!p) continue;
      item.print_number = p.print_number;
      item.max_prints = p.max_prints;
    }
  }

  return auctions;
}
