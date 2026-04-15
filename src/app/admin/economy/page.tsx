import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EconomyManager from "@/components/admin/EconomyManager";

export const metadata = { title: "Économie — Admin | Armies & Magic" };

export default async function EconomyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, role")
    .order("username");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <EconomyManager profiles={profiles ?? []} />
    </div>
  );
}
