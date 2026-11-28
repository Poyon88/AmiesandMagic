import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import AmHeading from "@/components/ui/AmHeading";
import EssenceHistory from "@/components/essence/EssenceHistory";
import PageChrome from "@/components/shared/PageChrome";

export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: `${t("essence_title")} — Armies of Legends` };
}

export default async function EssencePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const t = await getTranslations("account");

  return (
    <PageChrome backHref="/boutique#forge" backLabel={t("essence_back")}>
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <AmHeading eyebrow={t("eyebrow")} subtitle={t("essence_subtitle")}>
          {t("essence_title")}
        </AmHeading>
        <div className="mt-10">
          <EssenceHistory />
        </div>
      </div>
    </PageChrome>
  );
}
