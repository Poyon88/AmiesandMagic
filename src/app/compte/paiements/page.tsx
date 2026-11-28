import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import AmHeading from "@/components/ui/AmHeading";
import PaymentHistory from "@/components/payments/PaymentHistory";
import PageChrome from "@/components/shared/PageChrome";

export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: `${t("payments_title")} — Armies of Legends` };
}

export default async function PaiementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const t = await getTranslations("account");

  return (
    <PageChrome>
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <AmHeading
          eyebrow={t("eyebrow")}
          subtitle={t("payments_subtitle")}
        >
          {t("payments_title")}
        </AmHeading>
        <div className="mt-10">
          <PaymentHistory />
        </div>
        <p className="mt-8 text-center text-xs text-am-ink-3">
          {t("payments_note")}
        </p>
      </div>
    </PageChrome>
  );
}
