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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
