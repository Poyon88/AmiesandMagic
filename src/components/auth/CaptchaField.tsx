"use client";

import { forwardRef } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

/** Clé publique Cloudflare. Absente en développement tant qu'elle n'est pas
 *  configurée : le widget ne s'affiche alors pas et rien n'est bloqué — utile
 *  pour travailler hors ligne. En production, l'absence de clé ferait échouer
 *  toute authentification si la protection est activée côté Supabase. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** La protection est-elle opérante sur ce déploiement ? */
export const captchaEnabled = TURNSTILE_SITE_KEY.length > 0;

// Widget Turnstile, partagé par les trois flux d'authentification.
//
// Supabase applique sa protection anti-robot à l'inscription, à la connexion ET
// à la réinitialisation de mot de passe — le réglage n'est pas décomposable par
// point d'entrée (cf. docs « Enable CAPTCHA Protection »). Un widget qui ne
// couvrirait que l'inscription rendrait donc la connexion impossible dès
// l'activation.
//
// Le jeton est à USAGE UNIQUE : après chaque tentative, réussie ou non, il faut
// réinitialiser le widget, sinon la tentative suivante est rejetée avec une
// erreur peu parlante (« timeout-or-duplicate »).
const CaptchaField = forwardRef<TurnstileInstance | undefined, {
  onToken: (token: string) => void;
  /** Rendu en cas d'expiration ou d'échec, pour ne pas laisser un jeton mort. */
  onInvalid: () => void;
}>(function CaptchaField({ onToken, onInvalid }, ref) {
  if (!captchaEnabled) return null;

  return (
    <div className="flex justify-center">
      <Turnstile
        ref={ref}
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={onToken}
        onExpire={onInvalid}
        onError={onInvalid}
        options={{
          theme: "dark",
          size: "flexible",
          // Le jeton expire au bout de quelques minutes : on le renouvelle sans
          // rien demander à l'utilisateur, qui peut très bien avoir laissé le
          // formulaire ouvert.
          refreshExpired: "auto",
        }}
      />
    </div>
  );
});

export default CaptchaField;
