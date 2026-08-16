import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TicketShop from "@/components/payments/TicketShop";
import GoldShop from "@/components/payments/GoldShop";
import FactionShop from "@/components/payments/FactionShop";
import { publicGoldPacks, publicTicketPacks } from "@/lib/payments/config";
import PageChrome from "@/components/shared/PageChrome";

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
  // Les factions EN TÊTE : c'est la seule section payable en or, donc la seule
  // qu'un nouveau joueur puisse s'offrir sans carte bancaire — et celle qui
  // ouvre le plus de jeu. Elle se charge côté client et disparaît d'elle-même
  // tant que la migration n'est pas appliquée.
  return (
    <PageChrome>
      <FactionShop />
      <div className="mx-auto max-w-5xl px-4">
        <div className="am-rule-diamond mx-auto w-40" aria-hidden="true" />
      </div>
      <TicketShop packs={publicTicketPacks()} />
      <div className="mx-auto max-w-5xl px-4">
        <div className="am-rule-diamond mx-auto w-40" aria-hidden="true" />
      </div>
      <GoldShop packs={publicGoldPacks()} />
    </PageChrome>
  );
}
