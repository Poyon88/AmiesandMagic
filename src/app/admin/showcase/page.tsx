import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ShowcaseManager from "@/components/admin/ShowcaseManager";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";

type ShowcaseCard = React.ComponentProps<typeof ShowcaseManager>["cards"][number];

export const metadata = { title: "Showcase — Admin | Armies & Magic" };

export default async function AdminShowcasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Paginé : 1 713 cartes en base, PostgREST en rendait 1 000 en silence.
  // `id` en dernier pour un ordre TOTAL (cf. fetchAllRows).
  const cards = await fetchAllRows<ShowcaseCard>(
    (from, to) =>
      supabase
        .from("cards")
        .select("id, name, rarity, faction, card_type, mana_cost, image_url")
        .order("name")
        .order("id")
        .range(from, to),
    { label: "Lecture du catalogue (showcase)" },
  );

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <ShowcaseManager cards={cards} />
    </div>
  );
}
