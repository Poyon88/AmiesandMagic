import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CardForge from "@/components/card-forge/CardForge";

export const metadata = { title: "Card Forge — Admin | Armies & Magic" };

export default async function CardForgePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <CardForge />
    </div>
  );
}
