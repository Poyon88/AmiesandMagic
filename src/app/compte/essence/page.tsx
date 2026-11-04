import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AmHeading from "@/components/ui/AmHeading";
import EssenceHistory from "@/components/essence/EssenceHistory";
import PageChrome from "@/components/shared/PageChrome";

export const metadata = { title: "Mon essence — Armies & Magic" };

export default async function EssencePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <PageChrome backHref="/boutique#forge" backLabel="Forge">
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <AmHeading eyebrow="Compte" subtitle="Vos gains d'essence et vos forges.">
          Mon essence
        </AmHeading>
        <div className="mt-10">
          <EssenceHistory />
        </div>
      </div>
    </PageChrome>
  );
}
