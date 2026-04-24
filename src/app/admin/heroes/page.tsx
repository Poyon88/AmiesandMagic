import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HeroManager from "@/components/admin/HeroManager";

export const metadata = { title: "Héros — Admin | Armies & Magic" };

export default async function HeroesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <HeroManager />
    </div>
  );
}
