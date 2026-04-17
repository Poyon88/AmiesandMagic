import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ShowcaseManager from "@/components/admin/ShowcaseManager";

export const metadata = { title: "Showcase — Admin | Armies & Magic" };

export default async function AdminShowcasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: cards } = await supabase
    .from("cards")
    .select("id, name, rarity, faction, card_type, mana_cost, image_url")
    .order("name");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <ShowcaseManager cards={cards ?? []} />
    </div>
  );
}
