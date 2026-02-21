import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MainMenu from "@/components/MainMenu";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return <MainMenu username={profile?.username ?? "Player"} />;
}
