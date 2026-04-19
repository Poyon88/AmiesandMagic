import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CardBackCollectionView from "@/components/card-backs/CardBackCollectionView";

export const dynamic = "force-dynamic";

export default async function CardBacksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: cardBacks }, { data: ownedPrints }] = await Promise.all([
    supabase
      .from("card_backs")
      .select("id, name, image_url, rarity, max_prints, is_default, is_active")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("user_card_back_prints")
      .select("id, card_back_id, print_number, max_prints, is_tradeable")
      .eq("owner_id", user.id)
      .order("print_number"),
  ]);

  return (
    <CardBackCollectionView
      cardBacks={cardBacks ?? []}
      ownedPrints={ownedPrints ?? []}
    />
  );
}
