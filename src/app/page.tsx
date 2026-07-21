import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MainMenu from "@/components/MainMenu";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallet }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
  ]);

  // Second point d'aiguillage vers le choix de pseudo (le premier est
  // /auth/callback). Le menu principal est le passage obligé après connexion :
  // un joueur qui arriverait ici sans pseudo validé — session déjà ouverte
  // avant la migration, ou callback court-circuité — y est rattrapé.
  //
  // `username_confirmed` peut être absent tant que la migration
  // supabase-migration-signup-username.sql n'est pas appliquée : on ne redirige
  // que sur un `false` explicite, pour ne pas envoyer TOUS les joueurs sur
  // l'écran de choix si le code est déployé avant la migration.
  if (profile && profile.username_confirmed === false) {
    redirect("/onboarding/pseudo");
  }

  // Choix de la faction offerte. Deux gardes indispensables :
  //   • `legacy_full_access` — un compte grand-père a déjà accès à tout ;
  //     l'envoyer choisir une faction lui RETIRERAIT des cartes ;
  //   • `=== false` explicite — tant que la migration des droits n'est pas
  //     appliquée la colonne est absente, et TOUS les joueurs seraient
  //     détournés vers un écran qui ne peut rien enregistrer.
  if (
    profile &&
    profile.legacy_full_access === false &&
    profile.starter_faction == null
  ) {
    redirect("/onboarding/faction");
  }

  // Le portefeuille est créé paresseusement à la première transaction
  // (adjust_wallet_balance fait un upsert) : son absence est normale pour un
  // compte neuf et vaut zéro.
  return (
    <MainMenu
      username={profile?.username ?? "Player"}
      goldBalance={wallet?.balance ?? 0}
    />
  );
}
