import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AmHeading from "@/components/ui/AmHeading";
import CreditLedger from "@/components/credits/CreditLedger";
import PageChrome from "@/components/shared/PageChrome";

export const metadata = { title: "Mes crédits marché — Armies & Magic" };

export default async function CreditsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <PageChrome backHref="/auction" backLabel="Enchères">
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <AmHeading eyebrow="Compte" subtitle="Vos lots de crédits, leurs échéances et leurs mouvements.">
          Mes crédits marché
        </AmHeading>
        <div className="mt-10">
          <CreditLedger />
        </div>
      </div>
    </PageChrome>
  );
}
