import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import AuctionHouse from "@/components/auction/AuctionHouse";

export async function generateMetadata() {
  const t = await getTranslations("auction");
  return { title: t("page_title") };
}

export default async function AuctionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100vh", overflow: "auto" }} className="bg-am-bg-0">
      <AuctionHouse userId={user.id} />
    </div>
  );
}
