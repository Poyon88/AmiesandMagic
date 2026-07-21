import { createClient } from "@/lib/supabase/server";
import { entitlementsFromProfile } from "@/lib/game/collection";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import DeckBuilder from "@/components/deck/DeckBuilder";
import { localizeCardsInPlace } from "@/lib/cards/localizeCard";
import { normalizeLocale } from "@/i18n/config";

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

  // Fetch all cards, heroes, sets, formats, profile, collection, and boards
  const [{ data: cards }, { data: heroes }, { data: sets }, { data: formats }, { data: profile }, { data: userCollection }, { data: ownedPrints }, { data: allBoards }, { data: ownedBoardPrints }, { data: allCardBacks }, { data: ownedCardBackPrints }] = await Promise.all([
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
      .from("profiles")
      // select("*") volontaire : tant que la migration du modèle de droits
      // n'est pas appliquée, nommer les colonnes ferait ÉCHOUER la requête
      // entière — et le joueur perdrait aussi son `role` au passage.
      .select("*")
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
      .select("id, name, image_url, rarity, max_prints, is_default, faction")
      .eq("is_active", true),
    supabase
      .from("user_board_prints")
      .select("id, board_id, print_number, max_prints")
      .eq("owner_id", user.id),
    supabase
      .from("card_backs")
      .select("id, name, image_url, rarity, max_prints, is_default, faction")
      .eq("is_active", true),
    supabase
      .from("user_card_back_prints")
      .select("id, card_back_id, print_number, max_prints")
      .eq("owner_id", user.id),
  ]);

  // i18n : traduit nom + ambiance en place (surface d'affichage ; effect_text
  // reste FR canonique pour la reconstruction d'effet).
  const locale = normalizeLocale(await getLocale());
  const localizedCards = await localizeCardsInPlace(supabase, cards ?? [], locale);

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
      existingDeck = { id: deck.id, name: deck.name, hero_id: deck.hero_id, format_id: deck.format_id ?? null, board_id: deck.board_id ?? null, card_back_id: deck.card_back_id ?? null };
      const { data: deckCards } = await supabase
        .from("deck_cards")
        .select("card_id, quantity")
        .eq("deck_id", deckId);
      existingDeckCards = deckCards ?? [];
    }
  }

  return (
    <DeckBuilder
      cards={localizedCards}
      heroes={heroes ?? []}
      userId={user.id}
      existingDeck={existingDeck}
      existingDeckCards={existingDeckCards}
      sets={sets ?? []}
      formats={formats ?? []}
      collectedCardIds={collectedCardIds}
      isTester={isTester}
      entitlements={entitlementsFromProfile(profile)}
      boards={allBoards ?? []}
      ownedBoardPrints={ownedBoardPrints ?? []}
      cardBacks={allCardBacks ?? []}
      ownedCardBackPrints={ownedCardBackPrints ?? []}
    />
  );
}
