import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GoldShop from "@/components/payments/GoldShop";
import { publicGoldPacks } from "@/lib/payments/config";

export const metadata = { title: "Boutique — Armies & Magic" };

export default async function BoutiquePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // `publicGoldPacks` retire les `price_id` et les noms de variables
  // d'environnement : le navigateur ne voit que le catalogue, jamais la
  // configuration de facturation.
  return (
    <div className="min-h-screen bg-am-bg-0">
      <GoldShop packs={publicGoldPacks()} />
    </div>
  );
}
