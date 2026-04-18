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

  // Fetch all cards, heroes, sets, formats, format_sets, profile, collection, and boards
  const [{ data: cards }, { data: heroes }, { data: sets }, { data: formats }, { data: formatSets }, { data: profile }, { data: userCollection }, { data: ownedPrints }, { data: allBoards }, { data: ownedBoardPrints }] = await Promise.all([
    supabase
      .from("cards")
      .select("*")
      .order("mana_cost")
      .order("name"),
    supabase
      .from("heroes")
      .select("*")
      .order("id"),
    supabase
      .from("sets")
      .select("*")
      .order("name"),
    supabase
      .from("formats")
      .select("*")
      .eq("is_active", true)
      .order("id"),
    supabase
      .from("format_sets")
      .select("format_id, set_id"),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("user_collections")
      .select("card_id")
      .eq("user_id", user.id),
    supabase
      .from("card_prints")
      .select("card_id")
      .eq("owner_id", user.id),
    supabase
      .from("game_boards")
      .select("id, name, image_url, rarity, max_prints, is_default")
      .eq("is_active", true),
    supabase
      .from("user_board_prints")
      .select("id, board_id, print_number, max_prints")
      .eq("owner_id", user.id),
  ]);

  const isTester = profile?.role === "testeur";
  const printCardIds = (ownedPrints ?? []).map(r => r.card_id);
  const collectedCardIds = [...new Set([
    ...(userCollection ?? []).map(r => r.card_id),
    ...printCardIds,
  ])];

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
      existingDeck = { id: deck.id, name: deck.name, hero_id: deck.hero_id, format_id: deck.format_id ?? null, board_id: deck.board_id ?? null };
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
      sets={sets ?? []}
      formats={formats ?? []}
      formatSets={formatSets ?? []}
      collectedCardIds={collectedCardIds}
      isTester={isTester}
      boards={allBoards ?? []}
      ownedBoardPrints={ownedBoardPrints ?? []}
    />
  );
}
