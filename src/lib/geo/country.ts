// Pays de CONNEXION d'une requête.
//
// Vercel pose `x-vercel-ip-country` (ISO 3166-1 alpha-2) sur chaque requête.
// C'est ce pays qui décide des fonctions ouvertes au joueur. Aucune lutte
// anti-VPN : la loi demande des mesures raisonnables, pas une barrière
// infranchissable — contourner une restriction viole les CGU.

/** Code de la règle par défaut : « tous les autres pays », et pays inconnu. */
export const DEFAULT_COUNTRY = "ZZ";

const ISO2 = /^[A-Z]{2}$/;

/** Normalise un code pays ; `null` s'il n'en est pas un. */
export function normalizeCountry(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return ISO2.test(code) ? code : null;
}

/** Pays de connexion. Hors production (pas d'en-tête Vercel en local), repli
 *  sur `GEO_DEV_COUNTRY` pour pouvoir essayer chaque cas ; sinon `ZZ`. */
export function requestCountry(headers: Headers): string {
  const fromHeader = normalizeCountry(headers.get("x-vercel-ip-country"));
  if (fromHeader) return fromHeader;
  if (process.env.NODE_ENV !== "production") {
    const dev = normalizeCountry(process.env.GEO_DEV_COUNTRY);
    if (dev) return dev;
  }
  return DEFAULT_COUNTRY;
}
