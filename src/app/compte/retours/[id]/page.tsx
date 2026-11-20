import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import PageChrome from "@/components/shared/PageChrome";
import { FeedbackThread } from "@/components/feedback/MyFeedback";

export const metadata = { title: "Mes retours — Armies of Legends" };

export default async function RetourPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const t = await getTranslations("feedback");
  const { id } = await params;

  return (
    <PageChrome backHref="/compte/retours" backLabel={t("page_title")}>
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <FeedbackThread id={id} />
      </div>
    </PageChrome>
  );
}
