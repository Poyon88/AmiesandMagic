import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CollectionHub from "@/components/home/CollectionHub";
import { getHubBgCandidates } from "@/lib/collection/hubBackgrounds";

export const metadata = { title: "Ma collection | Armies & Magic" };
export const dynamic = "force-dynamic";

export default async function CollectionHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallet }, bgCandidates] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
    getHubBgCandidates(supabase, user.id),
  ]);

  return (
    <CollectionHub
      username={profile?.username ?? "Player"}
      goldBalance={wallet?.balance ?? 0}
      bgCandidates={bgCandidates}
    />
  );
}
