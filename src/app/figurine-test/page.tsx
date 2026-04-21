import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FigurineTestView from "@/components/figurine/FigurineTestView";

export const dynamic = "force-dynamic";

export default async function FigurineTestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" && profile?.role !== "testeur") {
    redirect("/");
  }

  const { data: cards } = await supabase
    .from("cards")
    .select("id, name, image_url, card_type, faction, race, rarity")
    .eq("card_type", "creature")
    .not("image_url", "is", null)
    .order("name");

  return <FigurineTestView cards={cards ?? []} />;
}
