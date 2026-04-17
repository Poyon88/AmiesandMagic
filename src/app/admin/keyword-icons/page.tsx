import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import KeywordIconManager from "@/components/admin/KeywordIconManager";

export const metadata = { title: "Icônes Capacités — Admin | Armies & Magic" };

export default async function AdminKeywordIconsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <KeywordIconManager />
    </div>
  );
}
