import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EconomyManager from "@/components/admin/EconomyManager";
import FactionShopSettings from "@/components/admin/FactionShopSettings";

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
      {/* Les tarifs de la boutique de factions vivent ici plutôt que dans un
          onglet à eux : ce sont deux nombres, et c'est l'écran où l'on regarde
          déjà l'or circuler. */}
      <div style={{ padding: 16, paddingBottom: 0 }}>
        <FactionShopSettings />
      </div>
      <EconomyManager profiles={profiles ?? []} />
    </div>
  );
}
