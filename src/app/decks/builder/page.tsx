import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DeckBuilder from "@/components/deck/DeckBuilder";

export default async function DeckBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch all cards
  const { data: cards } = await supabase
    .from("cards")
    .select("*")
    .order("mana_cost")
    .order("name");

  // If editing, fetch existing deck
  const params = await searchParams;
  const deckId = params.id ? parseInt(params.id) : null;
  let existingDeck = null;
  let existingDeckCards: { card_id: number; quantity: number }[] = [];

  if (deckId) {
    const { data: deck } = await supabase
      .from("decks")
      .select("*")
      .eq("id", deckId)
      .eq("user_id", user.id)
      .single();

    if (deck) {
      existingDeck = deck;
      const { data: deckCards } = await supabase
        .from("deck_cards")
        .select("card_id, quantity")
        .eq("deck_id", deckId);
      existingDeckCards = deckCards ?? [];
    }
  }

  return (
    <DeckBuilder
      cards={cards ?? []}
      userId={user.id}
      existingDeck={existingDeck}
      existingDeckCards={existingDeckCards}
    />
  );
}
