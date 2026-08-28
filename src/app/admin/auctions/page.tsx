import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AuctionManager from "@/components/admin/AuctionManager";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";

type AuctionCard = React.ComponentProps<typeof AuctionManager>["cards"][number];

export const metadata = { title: "Enchères — Admin | Armies & Magic" };

export default async function AdminAuctionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Paginé par précaution : 59 lignes aujourd'hui (les non-Communes), donc sous
  // le plafond — mais c'est le même `select` de table filtrée que les trois
  // autres, et le jour où il le franchit rien ne le dirait.
  const cards = await fetchAllRows<AuctionCard>(
    (from, to) =>
      supabase
        .from("cards")
        .select("id, name, rarity, faction, card_type, mana_cost")
        .neq("rarity", "Commune")
        .order("name")
        .order("id")
        .range(from, to),
    { label: "Lecture du catalogue (enchères)" },
  );

  // Fetch first unassigned print for each card
  const { data: availablePrints } = await supabase
    .from("card_prints")
    .select("id, card_id, print_number, max_prints, owner_id")
    .is("owner_id", null)
    .order("print_number", { ascending: true });

  // Build a map: card_id -> first available print
  const firstAvailablePrint: Record<number, { print_id: number; print_number: number; max_prints: number }> = {};
  for (const print of availablePrints ?? []) {
    if (!firstAvailablePrint[print.card_id]) {
      firstAvailablePrint[print.card_id] = {
        print_id: print.id,
        print_number: print.print_number,
        max_prints: print.max_prints,
      };
    }
  }

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <AuctionManager cards={cards ?? []} firstAvailablePrint={firstAvailablePrint} />
    </div>
  );
}
