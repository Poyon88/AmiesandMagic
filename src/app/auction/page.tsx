import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AuctionHouse from "@/components/auction/AuctionHouse";

export const metadata = { title: "Hôtel des Enchères — Armies & Magic" };

export default async function AuctionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100vh", overflow: "auto" }} className="bg-am-bg-0">
      <AuctionHouse userId={user.id} />
    </div>
  );
}
