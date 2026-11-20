import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import AmHeading from "@/components/ui/AmHeading";
import PageChrome from "@/components/shared/PageChrome";
import { FeedbackList } from "@/components/feedback/MyFeedback";

export const metadata = { title: "Mes retours — Armies of Legends" };

export default async function RetoursPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const t = await getTranslations("feedback");

  return (
    <PageChrome>
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <AmHeading eyebrow={t("page_eyebrow")} subtitle={t("page_subtitle")}>
          {t("page_title")}
        </AmHeading>
        <div className="mt-10">
          <FeedbackList />
        </div>
      </div>
    </PageChrome>
  );
}
