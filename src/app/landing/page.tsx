import { createClient } from "@/lib/supabase/server";
import LandingPage from "@/components/landing/LandingPage";
import type { Card } from "@/lib/game/types";

export const metadata = {
  title: "Armies & Magic — A Fantasy Collectible Card Game",
  description: "Collectionnez, combattez, échangez. Le jeu de cartes à collectionner fantasy qui réinvente le genre.",
};

export default async function Landing() {
  const supabase = await createClient();

  const { data: showcaseData } = await supabase
    .from("showcase_cards")
    .select("card_id, sort_order, card:cards(*)")
    .order("sort_order");

  const showcaseCards: Card[] = (showcaseData ?? [])
    .map(s => s.card as unknown as Card)
    .filter(Boolean);

  return <LandingPage showcaseCards={showcaseCards} />;
}
