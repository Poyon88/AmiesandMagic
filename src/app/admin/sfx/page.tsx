import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SfxManager from "@/components/admin/SfxManager";

export const metadata = { title: "Bruitages — Admin | Armies & Magic" };

export default async function SfxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <SfxManager />
    </div>
  );
}
