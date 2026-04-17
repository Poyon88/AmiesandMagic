import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PlayerManager from "@/components/admin/PlayerManager";

export const metadata = { title: "Joueurs — Admin | Armies & Magic" };

export default async function AdminPlayersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <PlayerManager />
    </div>
  );
}
