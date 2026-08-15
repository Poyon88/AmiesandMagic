import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AmHeading from "@/components/ui/AmHeading";
import PaymentHistory from "@/components/payments/PaymentHistory";

export const metadata = { title: "Mes paiements — Armies & Magic" };

export default async function PaiementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-am-bg-0">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <AmHeading
          eyebrow="Compte"
          subtitle="Vos achats de pièces d'or et vos inscriptions aux tournois payants."
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
    </div>
  );
}
