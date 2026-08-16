import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DeckList from "@/components/deck/DeckList";
import { entitlementsFromProfile } from "@/lib/game/collection";
import { readFactionUnlocks } from "@/lib/game/factionUnlocks";
import { deckPlayability } from "@/lib/game/deckPlayability";

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
        card_id,
        quantity
      )
    `
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  // JOUABILITÉ — un deck n'est construit qu'avec des cartes possédées, mais une
  // faction reprise après remboursement peut le rendre injouable APRÈS coup. On
  // le garde, on le signale, et on dit quoi racheter.
  //
  // Le rôle spécial (testeur/admin) possède tout par construction : inutile de
  // charger quoi que ce soit pour lui, et le calcul l'aurait de toute façon
  // déclaré jouable.
  const { data: profile } = await supabase
    .from("profiles")
    // select("*") comme les autres écrans : nommer les colonnes ferait échouer
    // la requête entière tant que la migration des droits n'est pas appliquée.
    .select("*")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "player";
  const ownsEverything = role === "testeur" || role === "admin";

  const playabilityByDeck = new Map<number, ReturnType<typeof deckPlayability>>();

  if (!ownsEverything) {
    const deckCardIds = [
      ...new Set(
        (decks ?? []).flatMap((d) =>
          (d.deck_cards as { card_id: number }[]).map((dc) => dc.card_id),
        ),
      ),
    ];

    if (deckCardIds.length > 0) {
      const [{ data: deckCards }, { data: userCollection }, { data: ownedPrints }, factionUnlocks] =
        await Promise.all([
          supabase.from("cards").select("id, faction, rarity, set_id").in("id", deckCardIds),
          supabase.from("user_collections").select("card_id").eq("user_id", user.id),
          supabase.from("card_prints").select("card_id").eq("owner_id", user.id),
          readFactionUnlocks(supabase, user.id),
        ]);

      const cardById = new Map(
        (deckCards ?? []).map((c) => [c.id as number, c as Parameters<typeof deckPlayability>[0][number]]),
      );
      const ctx = {
        ownsEverything: false,
        collectedCardIds: new Set([
          ...(userCollection ?? []).map((r) => r.card_id as number),
          ...(ownedPrints ?? []).map((r) => r.card_id as number),
        ]),
        ...entitlementsFromProfile(profile, factionUnlocks),
      };

      for (const deck of decks ?? []) {
        const cards = (deck.deck_cards as { card_id: number }[])
          .map((dc) => cardById.get(dc.card_id))
          .filter((c): c is NonNullable<typeof c> => c != null);
        playabilityByDeck.set(deck.id as number, deckPlayability(cards, ctx));
      }
    }
  }

  // Format names for the per-deck badge + the format filter. Separate lookup
  // (not an embedded FK join) per the project's Supabase guidelines. `code` is
  // the stable key used to localise the format label client-side (vocab.formats).
  const formatById = new Map<number, { code: string; name: string }>();
  const { data: formats } = await supabase
    .from("formats")
    .select("id, code, name")
    .order("id");
  for (const f of (formats ?? []) as { id: number; code: string; name: string }[]) {
    formatById.set(f.id, { code: f.code, name: f.name });
  }

  // Hero thumbnails fetched via a separate lookup (decks.hero_id → heroes.id),
  // not an embedded FK join, per the project's Supabase guidelines.
  const heroIds = [
    ...new Set(
      (decks ?? [])
        .map((d) => d.hero_id as number | null)
        .filter((id): id is number => id != null)
    ),
  ];
  const heroThumbById = new Map<number, string | null>();
  if (heroIds.length > 0) {
    const { data: heroes } = await supabase
      .from("heroes")
      .select("id, thumbnail_url")
      .in("id", heroIds);
    for (const h of (heroes ?? []) as { id: number; thumbnail_url: string | null }[]) {
      heroThumbById.set(h.id, h.thumbnail_url ?? null);
    }
  }

  const decksWithCount = (decks ?? []).map((deck) => {
    const formatId = (deck.format_id as number | null) ?? null;
    return {
      ...deck,
      cardCount: (deck.deck_cards as { quantity: number }[]).reduce(
        (sum: number, dc: { quantity: number }) => sum + dc.quantity,
        0
      ),
      heroThumbnail:
        deck.hero_id != null ? heroThumbById.get(deck.hero_id) ?? null : null,
      formatId,
      formatCode: formatId != null ? formatById.get(formatId)?.code ?? null : null,
      formatName: formatId != null ? formatById.get(formatId)?.name ?? null : null,
      // Absent de la table ⇒ jouable : c'est le cas de l'immense majorité, et
      // le défaut ne doit jamais être « injouable ».
      missingFactions: playabilityByDeck.get(deck.id as number)?.missingFactions ?? [],
      missingCount: playabilityByDeck.get(deck.id as number)?.missingCount ?? 0,
    };
  });

  return <DeckList decks={decksWithCount} />;
}
