import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TicketShop from "@/components/payments/TicketShop";
import GoldShop from "@/components/payments/GoldShop";
import { publicGoldPacks, publicTicketPacks } from "@/lib/payments/config";

export const metadata = { title: "Boutique — Armies & Magic" };

export default async function BoutiquePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Les deux catalogues sont servis SANS `price_id` ni nom de variable
  // d'environnement : le navigateur voit ce qu'il y a à vendre, jamais la
  // configuration de facturation.
  //
  // Les tickets d'abord : c'est le seul moyen d'entrer en tournoi, donc la
  // raison la plus fréquente de venir ici. L'or ne sert qu'aux enchères.
  return (
    <div className="min-h-screen bg-am-bg-0">
      <TicketShop packs={publicTicketPacks()} />
      <div className="mx-auto max-w-5xl px-4">
        <div className="am-rule-diamond mx-auto w-40" aria-hidden="true" />
      </div>
      <GoldShop packs={publicGoldPacks()} />
    </div>
  );
}
