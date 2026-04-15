import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BoardManager from "@/components/admin/BoardManager";

export const metadata = { title: "Plateaux — Admin | Armies & Magic" };

export default async function BoardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <BoardManager />
    </div>
  );
}
