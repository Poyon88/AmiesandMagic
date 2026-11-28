import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import AmHeading from "@/components/ui/AmHeading";
import CreditLedger from "@/components/credits/CreditLedger";
import PageChrome from "@/components/shared/PageChrome";

export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: `${t("credits_title")} — Armies of Legends` };
}

export default async function CreditsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const t = await getTranslations("account");

  return (
    <PageChrome backHref="/auction" backLabel={t("credits_back")}>
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <AmHeading eyebrow={t("eyebrow")} subtitle={t("credits_subtitle")}>
          {t("credits_title")}
        </AmHeading>
        <div className="mt-10">
          <CreditLedger />
        </div>
      </div>
    </PageChrome>
  );
}
