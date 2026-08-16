import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Les factions dont un joueur détient les communes, lues dans
 * `user_faction_unlocks`.
 *
 * DÉGRADATION VOLONTAIRE : si la table n'existe pas encore (migration non
 * appliquée) ou si la lecture échoue, on renvoie une liste vide plutôt que de
 * propager l'erreur. Le calcul des droits retombe alors sur
 * `profiles.starter_faction`, qui est exactement l'état d'avant la boutique —
 * le joueur ne perd rien. Faire échouer la page entière pour un ornement de
 * collection serait le pire des deux mondes.
 *
 * Partagé par la collection et le constructeur de decks : les deux appliquent
 * la MÊME règle de possession (`isCardOwned`), et deux lectures divergentes
 * feraient qu'une carte visible en collection deviendrait impossible à mettre
 * dans un deck.
 */
export async function readFactionUnlocks(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_faction_unlocks")
    .select("faction")
    .eq("user_id", userId);

  if (error) {
    console.warn("[factionUnlocks] lecture impossible, repli sur la faction de départ :", error.message);
    return [];
  }

  // Le forfait est stocké comme une faction `'*'` ; ce n'est pas une faction
  // réelle et il ne doit jamais se retrouver dans l'ensemble comparé aux cartes.
  // Le droit qu'il confère passe par `profiles.all_commons_unlocked`.
  return (data ?? []).map((r) => r.faction as string).filter((f) => f !== "*");
}
