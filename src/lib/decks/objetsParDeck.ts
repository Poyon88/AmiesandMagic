import type { SupabaseClient } from "@supabase/supabase-js";

/** Nombre d'exemplaires d'OBJETS par deck (clé : id du deck).
 *
 *  Les objets ne se mettent plus dans un deck (cf. `estAjoutableAuDeck`). Les
 *  decks enregistrés avant la règle restent intacts en base ; ce comptage sert
 *  à les signaler (liste des decks) et à les écarter du lancement de partie
 *  tant que le joueur ne les a pas corrigés.
 *
 *  Une seule requête sur `cards`, filtrée sur le type : on ne ramène que les ids
 *  des objets, pas le catalogue. Un deck absent de la table n'en contient pas. */
export async function objetsParDeck(
  supabase: SupabaseClient,
  decks: { id: number; deck_cards: { card_id: number; quantity: number }[] }[],
): Promise<Map<number, number>> {
  const ids = [...new Set(decks.flatMap((d) => d.deck_cards.map((dc) => dc.card_id)))];
  const parDeck = new Map<number, number>();
  if (ids.length === 0) return parDeck;
  const { data } = await supabase.from("cards").select("id").in("id", ids).eq("card_type", "item");
  const objets = new Set((data ?? []).map((r) => r.id as number));
  if (objets.size === 0) return parDeck;
  for (const d of decks) {
    const n = d.deck_cards.reduce((s, dc) => s + (objets.has(dc.card_id) ? dc.quantity : 0), 0);
    if (n > 0) parDeck.set(d.id, n);
  }
  return parDeck;
}
