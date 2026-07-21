import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Point d'atterrissage de TOUS les flux qui repassent par un email ou un
// provider externe : confirmation d'inscription, OAuth Google/Discord,
// réinitialisation de mot de passe (`?next=/auth/reset-password`).
//
// Toute sortie en échec renvoie vers /login avec un code dans `?error=`, que la
// page de login traduit et affiche. Auparavant elle ignorait ce paramètre : un
// OAuth annulé ramenait l'utilisateur au formulaire sans le moindre message.

/** `next` est concaténé à l'origine : n'accepter qu'un chemin interne. `//host`
 *  est rejeté car il serait lu comme une URL protocol-relative. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

/** Première étape d'onboarding qui reste à faire, ou `null` si le joueur peut
 *  entrer directement.
 *
 *  Chaque test exige une valeur EXPLICITE : tant que les migrations ne sont pas
 *  appliquées, les colonnes sont absentes et personne ne doit être détourné
 *  vers un écran incapable d'enregistrer quoi que ce soit.
 *
 *  `legacy_full_access` court-circuite le choix de faction : un compte
 *  grand-père a déjà accès à tout, lui en faire choisir une lui retirerait
 *  des cartes. */
async function nextOnboardingStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (!data) return null;
  if (data.username_confirmed === false) return "/onboarding/pseudo";
  if (data.legacy_full_access === false && data.starter_faction == null) {
    return "/onboarding/faction";
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // Le provider peut refuser AVANT tout échange de code : annulation par
  // l'utilisateur, application non autorisée, scope refusé. Il renvoie alors
  // `error` / `error_description` et aucun code.
  const providerError = searchParams.get("error");
  if (providerError) {
    const url = new URL(`${origin}/login`);
    // `access_denied` = l'utilisateur a annulé : ce n'est pas une panne, le
    // message doit être doux. Le reste est traité comme un échec générique.
    url.searchParams.set("error", providerError === "access_denied" ? "oauth_cancelled" : "oauth_failed");
    return NextResponse.redirect(url);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Onboarding, premier des deux points d'aiguillage (l'autre est la page
      // d'accueil). On ne détourne PAS un `next` explicite : la
      // réinitialisation de mot de passe passe par ici et doit aboutir sur son
      // formulaire, pas sur un écran de bienvenue.
      if (next === "/" && data.user) {
        const step = await nextOnboardingStep(supabase, data.user.id);
        if (step) return NextResponse.redirect(`${origin}${step}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Code présent mais inutilisable : lien de confirmation déjà consommé ou
    // expiré. Distinct d'un échec provider — l'utilisateur doit redemander un
    // email, pas retenter le même lien.
    const url = new URL(`${origin}/login`);
    url.searchParams.set("error", "link_expired");
    return NextResponse.redirect(url);
  }

  const url = new URL(`${origin}/login`);
  url.searchParams.set("error", "auth_failed");
  return NextResponse.redirect(url);
}
