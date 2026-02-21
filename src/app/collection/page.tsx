import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CollectionView from "@/components/cards/CollectionView";

export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: cards } = await supabase
    .from("cards")
    .select("*")
    .order("mana_cost")
    .order("name");

  return <CollectionView cards={cards ?? []} />;
}
