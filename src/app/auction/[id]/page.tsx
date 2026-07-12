import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import AuctionDetail from "@/components/auction/AuctionDetail";

export async function generateMetadata() {
  const t = await getTranslations("auction");
  return { title: t("detail_page_title") };
}

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { id } = await params;

  return (
    <div style={{ height: "100vh", overflow: "auto", background: "#1a1a2e" }}>
      <AuctionDetail auctionId={id} userId={user.id} />
    </div>
  );
}
