import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CollectionManager from "@/components/admin/CollectionManager";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";

export const metadata = { title: "Collections — Admin | Armies & Magic" };

export default async function CollectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch profiles, collectible cards, and boards
  const [{ data: profiles }, { data: cards }, { data: boards }, { data: cardBacks }] = await Promise.all([
    supabase.from("profiles").select("id, username, role").order("username"),
    // Paginé : `name` seul ne suffit pas à ordonner (homonymes), d'où l'`id`.
    fetchAllRows(
      (from, to) =>
        supabase
          .from("cards")
          .select("id, name, mana_cost, rarity, faction, race, card_type, set_id, card_year, card_month")
          .order("name")
          .order("id")
          .range(from, to),
      { label: "Lecture du catalogue" },
    ).then((data) => ({ data })),
    supabase.from("game_boards").select("id, name, rarity, max_prints, is_default, is_active").order("name"),
    supabase.from("card_backs").select("id, name, rarity, max_prints, is_default, is_active").order("name"),
  ]);

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <CollectionManager
        profiles={profiles ?? []}
        allCards={cards ?? []}
        allBoards={boards ?? []}
        allCardBacks={cardBacks ?? []}
      />
    </div>
  );
}
