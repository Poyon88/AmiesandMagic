import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DeckBuilder from "@/components/deck/DeckBuilder";

export const dynamic = "force-dynamic";

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

  // Fetch all cards and heroes
  const [{ data: cards }, { data: heroes }] = await Promise.all([
    supabase
      .from("cards")
      .select("*")
      .order("mana_cost")
      .order("name"),
    supabase
      .from("heroes")
      .select("*")
      .order("id"),
  ]);

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
      existingDeck = { id: deck.id, name: deck.name, hero_id: deck.hero_id };
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
      heroes={heroes ?? []}
      userId={user.id}
      existingDeck={existingDeck}
      existingDeckCards={existingDeckCards}
    />
  );
}
