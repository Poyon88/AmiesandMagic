import { createClient } from "@/lib/supabase/server";
import HomeHeader from "@/components/home/HomeHeader";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import type { ReactNode } from "react";

/**
 * Cadre commun des pages hors-jeu : l'en-tête du site avec son lien de retour,
 * l'ambiance de fond, et le décalage qui évite que le contenu passe sous
 * l'en-tête (celui-ci est en `position: fixed`).
 *
 * Composant SERVEUR : il lit lui-même le pseudo, le solde d'or et la dette,
 * plutôt que d'obliger chaque page à refaire ces deux requêtes et à se souvenir
 * de les transmettre. Une page qui oubliait le `goldDebt` affichait un solde
 * flatteur à un joueur bloqué.
 *
 * `backHref` par défaut à `/` : ces pages sont des culs-de-sac de navigation,
 * et sans lien de retour le joueur n'a que le bouton du navigateur.
 */
export default async function PageChrome({
  children,
  backHref = "/",
  backLabel = "Accueil",
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: wallet }] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", user?.id ?? "").maybeSingle(),
    supabase.from("wallets").select("balance, gold_debt").eq("user_id", user?.id ?? "").maybeSingle(),
  ]);

  return (
    <div className="relative min-h-screen bg-am-bg-0 text-am-ink">
      <AmAtmosphere />
      <HomeHeader
        username={profile?.username ?? "Player"}
        goldBalance={wallet?.balance ?? 0}
        goldDebt={wallet?.gold_debt ?? 0}
        backHref={backHref}
        backLabel={backLabel}
      />
      <main id="main-content" className="relative pt-24 md:pt-28">
        {children}
      </main>
    </div>
  );
}
