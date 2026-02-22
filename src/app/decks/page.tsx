import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DeckList from "@/components/deck/DeckList";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: decks } = await supabase
    .from("decks")
    .select(
      `
      *,
      deck_cards (
        quantity
      )
    `
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const decksWithCount = (decks ?? []).map((deck) => ({
    ...deck,
    cardCount: (deck.deck_cards as { quantity: number }[]).reduce(
      (sum: number, dc: { quantity: number }) => sum + dc.quantity,
      0
    ),
  }));

  return <DeckList decks={decksWithCount} />;
}
