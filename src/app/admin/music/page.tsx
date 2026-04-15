import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MusicManager from "@/components/admin/MusicManager";

export const metadata = { title: "Musiques — Admin | Armies & Magic" };

export default async function MusicPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <MusicManager />
    </div>
  );
}
