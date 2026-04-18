import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CollectionManager from "@/components/admin/CollectionManager";

export const metadata = { title: "Collections — Admin | Armies & Magic" };

export default async function CollectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch profiles, collectible cards, and boards
  const [{ data: profiles }, { data: cards }, { data: boards }] = await Promise.all([
    supabase.from("profiles").select("id, username, role").order("username"),
    supabase.from("cards").select("id, name, mana_cost, rarity, faction, race, card_type, set_id, card_year, card_month").order("name"),
    supabase.from("game_boards").select("id, name, rarity, max_prints, is_default, is_active").order("name"),
  ]);

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <CollectionManager
        profiles={profiles ?? []}
        allCards={cards ?? []}
        allBoards={boards ?? []}
      />
    </div>
  );
}
