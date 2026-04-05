import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CollectionView from "@/components/cards/CollectionView";

export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: cards }, { data: sets }, { data: formats }, { data: formatSets }] = await Promise.all([
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
  ]);

  return <CollectionView cards={cards ?? []} sets={sets ?? []} formats={formats ?? []} formatSets={formatSets ?? []} />;
}
