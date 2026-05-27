import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AnalyticsTabs from "@/components/admin/analytics/AnalyticsTabs";

export const metadata = { title: "Équilibrage — Admin | Armies & Magic" };

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#0f0f1e" }}>
      <AnalyticsTabs />
    </div>
  );
}
