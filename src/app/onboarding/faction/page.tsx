import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FactionPicker from "@/components/auth/FactionPicker";

export const metadata = { title: "Choisis ta faction | Armies & Magic" };

// Deuxième et dernier écran d'onboarding, après le choix du pseudo. Le joueur
// y choisit la faction dont il reçoit les communes.
//
// Ordre volontaire pseudo → faction : le pseudo est une formalité, la faction
// est un choix de jeu définitif. Le demander en second, une fois le compte
// vraiment établi, évite de le faire trancher dans la foulée d'un formulaire
// d'inscription.
export default async function OnboardingFactionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Le pseudo passe d'abord : sans lui, l'aiguillage de la page d'accueil
  // renverrait aussitôt le joueur en arrière.
  if (profile?.username_confirmed === false) redirect("/onboarding/pseudo");

  // Déjà choisie : on ne repropose pas un choix définitif.
  if (profile?.starter_faction) redirect("/");

  // Comptes grand-père : ils ont déjà accès à tout, leur demander de choisir
  // une faction leur RETIRERAIT des cartes. On ne les fait jamais passer ici.
  if (profile?.legacy_full_access) redirect("/");

  return <FactionPicker />;
}
