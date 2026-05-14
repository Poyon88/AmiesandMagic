import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CollectionHub from "@/components/home/CollectionHub";

export const metadata = { title: "Ma collection | Armies & Magic" };

export default async function CollectionHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallet }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
  ]);

  return (
    <CollectionHub
      username={profile?.username ?? "Player"}
      goldBalance={wallet?.balance ?? 0}
    />
  );
}
