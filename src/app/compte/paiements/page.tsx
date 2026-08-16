import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AmHeading from "@/components/ui/AmHeading";
import PaymentHistory from "@/components/payments/PaymentHistory";
import PageChrome from "@/components/shared/PageChrome";

export const metadata = { title: "Mes paiements — Armies & Magic" };

export default async function PaiementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <PageChrome>
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <AmHeading
          eyebrow="Compte"
          subtitle="Vos achats de tickets de tournoi et de pièces d'or."
        >
          Mes paiements
        </AmHeading>
        <div className="mt-10">
          <PaymentHistory />
        </div>
        <p className="mt-8 text-center text-xs text-am-ink-3">
          Pour toute question sur un paiement, contactez le support. Les pièces d&apos;or ne sont
          pas convertibles en euros ; seul le paiement d&apos;origine peut être remboursé.
        </p>
      </div>
    </PageChrome>
  );
}
