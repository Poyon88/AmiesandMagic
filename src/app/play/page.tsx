import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MatchmakingQueue from "@/components/game/MatchmakingQueue";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch user's valid decks (50 cards)
  const { data: decks } = await supabase
    .from("decks")
    .select(
      `
      *,
      deck_cards (quantity)
    `
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const validDecks = (decks ?? [])
    .map((deck) => ({
      ...deck,
      cardCount: (deck.deck_cards as { quantity: number }[]).reduce(
        (sum: number, dc: { quantity: number }) => sum + dc.quantity,
        0
      ),
    }))
    .filter((deck) => deck.cardCount === 50);

  return <MatchmakingQueue userId={user.id} validDecks={validDecks} />;
}
