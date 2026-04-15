import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AuctionManager from "@/components/admin/AuctionManager";

export const metadata = { title: "Enchères — Admin | Armies & Magic" };

export default async function AdminAuctionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: cards } = await supabase
    .from("cards")
    .select("id, name, rarity, faction, card_type, mana_cost")
    .neq("rarity", "Commune")
    .order("name");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <AuctionManager cards={cards ?? []} />
    </div>
  );
}
