// Renonciation au droit de rétractation, recueillie à CHAQUE achat.
//
// Un contenu numérique crédité tout de suite ne peut plus être rétracté — à
// condition que le consommateur ait DEMANDÉ l'exécution immédiate et RECONNU
// perdre son droit, avant de payer, par un geste exprès (case non précochée),
// et que cet accord lui soit confirmé par email. Sans l'un ou l'autre, il garde
// ses 14 jours : cf. « Droit de rétractation » dans les CGV.
//
// Trois maillons, tous ici ou appelés d'ici :
//   1. la case (`WithdrawalWaiverConfirm`), qui envoie `withdrawal_waiver: true` ;
//   2. ce refus serveur — une session Stripe ne s'ouvre jamais sans l'accord ;
//   3. la trace : date de l'accord et langue du joueur dans les metadata Stripe,
//      relues par le webhook pour l'email de confirmation.
import { NextResponse } from "next/server";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";
import { localeDuPays } from "@/lib/geo/locale";

type WaiverResult =
  | { error: NextResponse; metadata?: undefined }
  | { error?: undefined; metadata: { withdrawal_waiver_at: string; locale: Locale } };

export function requireWithdrawalWaiver(
  request: Request,
  body: unknown,
  country: string | null,
): WaiverResult {
  if ((body as { withdrawal_waiver?: unknown } | null)?.withdrawal_waiver !== true) {
    return {
      error: NextResponse.json(
        {
          error: "Votre accord sur le crédit immédiat de l'achat est nécessaire.",
          code: "waiver_required",
        },
        { status: 400 },
      ),
    };
  }
  return {
    metadata: {
      withdrawal_waiver_at: new Date().toISOString(),
      locale: requestLocale(request, country),
    },
  };
}

/** Langue du joueur, comme `src/i18n/request.ts` la choisit : le cookie, sinon
 *  le pays de connexion. Lue dans la requête et non par next-intl, pour que la
 *  route reste exécutable hors d'un rendu. */
function requestLocale(request: Request, country: string | null): Locale {
  const cookie = request.headers.get("cookie") ?? "";
  const choisie = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  if (isLocale(choisie)) return choisie;
  return localeDuPays(country);
}
