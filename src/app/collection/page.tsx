import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CollectionView from "@/components/cards/CollectionView";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: cards }, { data: sets }, { data: formats }, { data: formatSets }, { data: profile }, { data: userCollection }, { data: ownedPrints }] = await Promise.all([
    supabase
      .from("cards")
      .select("*")
      .order("mana_cost")
      .order("name"),
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
  ]);

  const isTester = profile?.role === "testeur";
  const printCardIds = (ownedPrints ?? []).map(r => r.card_id);
  const collectedCardIds = [...new Set([
    ...(userCollection ?? []).map(r => r.card_id),
    ...printCardIds,
  ])];

  console.log("[Collection] user:", user.id, "profile:", profile, "isTester:", isTester, "collectedCardIds:", collectedCardIds.length, "totalCards:", cards?.length);

  return (
    <CollectionView
      cards={cards ?? []}
      sets={sets ?? []}
      formats={formats ?? []}
      formatSets={formatSets ?? []}
      collectedCardIds={collectedCardIds}
      isTester={isTester}
    />
  );
}
