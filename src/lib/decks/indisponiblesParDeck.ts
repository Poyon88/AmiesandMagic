import type { SupabaseClient } from "@supabase/supabase-js";
import { estIndisponible } from "@/lib/game/deck-rules";
import type { CardStatus } from "@/lib/game/types";

/** Nombre d'exemplaires INDISPONIBLES par deck (clé : id du deck) — cartes
 *  passées Retirée/Exclue après coup, cf. supabase-migration-card-status.sql.
 *
 *  Même contrat que `objetsParDeck` : le deck reste intact en base, il est
 *  signalé (liste des decks) et écarté du lancement tant que le joueur ne l'a
 *  pas corrigé — et redevient valide tout seul si la carte revient.
 *
 *  Une carte du deck que la requête ne renvoie PAS est un brouillon que la RLS
 *  cache à ce compte : elle compte comme indisponible (un admin/testeur, qui
 *  lit les brouillons, la voit revenir avec son statut et peut la jouer). */
export async function indisponiblesParDeck(
  supabase: SupabaseClient,
  decks: { id: number; deck_cards: { card_id: number; quantity: number }[] }[],
): Promise<Map<number, number>> {
  const ids = [...new Set(decks.flatMap((d) => d.deck_cards.map((dc) => dc.card_id)))];
  const parDeck = new Map<number, number>();
  if (ids.length === 0) return parDeck;
  const { data, error } = await supabase.from("cards").select("id, status").in("id", ids);
  // Lecture en échec : on ne déclare rien d'invalide sur une erreur réseau, le
  // RPC de matchmaking reste le verrou de dernier ressort.
  if (error) {
    console.warn("[decks] statut des cartes illisible :", error.message);
    return parDeck;
  }
  const lues = new Map((data ?? []).map((r) => [r.id as number, r.status as CardStatus | null]));
  const indispo = (id: number) => !lues.has(id) || estIndisponible({ status: lues.get(id) });
  for (const d of decks) {
    const n = d.deck_cards.reduce((s, dc) => s + (indispo(dc.card_id) ? dc.quantity : 0), 0);
    if (n > 0) parDeck.set(d.id, n);
  }
  return parDeck;
}
