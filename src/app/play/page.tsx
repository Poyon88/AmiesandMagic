import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MatchmakingQueue from "@/components/game/MatchmakingQueue";
import { objetsParDeck } from "@/lib/decks/objetsParDeck";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch user's valid decks (50 cards) and formats
  const [{ data: decks }, { data: formats }] = await Promise.all([
    supabase
      .from("decks")
      .select(
        `
        *,
        deck_cards (card_id, quantity)
      `
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("formats")
      .select("*")
      .eq("is_active", true)
      .order("id"),
  ]);

  // Un deck qui contient encore des objets (enregistré avant la règle) ne se
  // lance pas : la page des decks le signale, le constructeur dit quoi retirer.
  const objets = await objetsParDeck(
    supabase,
    (decks ?? []) as { id: number; deck_cards: { card_id: number; quantity: number }[] }[],
  );

  const validDecks = (decks ?? [])
    .filter((deck) => !objets.has(deck.id as number))
    .map((deck) => ({
      ...deck,
      cardCount: (deck.deck_cards as { quantity: number }[]).reduce(
        (sum: number, dc: { quantity: number }) => sum + dc.quantity,
        0
      ),
    }))
    .filter((deck) => deck.cardCount === 50);

  return <MatchmakingQueue userId={user.id} validDecks={validDecks} formats={formats ?? []} />;
}
