import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin/requireAdmin";

// Garde de RÔLE des pages /admin/* (composants serveur). Pendant de
// `requireAdmin()` pour les routes d'API : non connecté → /login, connecté sans
// le rôle `admin` → accueil, comme le reste du site.
//
// Appelée par le layout de l'administration ET par les pages qui lisent en
// service_role : un layout n'est pas re-rendu à chaque navigation, il ne peut
// donc pas être l'unique verrou d'une page qui sert des données privilégiées.
// `cache` : une seule lecture du profil par requête, quel que soit le nombre
// d'appelants.
export const requireAdminPage = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await getAdminClient()
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  return user;
});
