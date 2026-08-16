import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TournamentManager from "@/components/admin/TournamentManager";

export const metadata = { title: "Tournois — Admin | Armies & Magic" };

export default async function TournamentsAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Le contrôle du rôle admin est fait par les routes API que l'écran appelle
  // (requireAdmin) : c'est là qu'il est load-bearing. Ici on ne barre que
  // l'anonyme, comme les autres écrans d'administration.
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <TournamentManager />
    </div>
  );
}
