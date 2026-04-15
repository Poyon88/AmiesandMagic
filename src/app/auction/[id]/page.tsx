import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AuctionDetail from "@/components/auction/AuctionDetail";

export const metadata = { title: "Détail Enchère — Armies & Magic" };

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { id } = await params;

  return (
    <div style={{ height: "100vh", overflow: "auto", background: "#1a1a2e" }}>
      <AuctionDetail auctionId={id} userId={user.id} />
    </div>
  );
}
