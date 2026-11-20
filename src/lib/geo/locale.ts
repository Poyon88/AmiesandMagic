// Langue proposée d'office à un visiteur qui n'en a pas encore choisi : celle
// de son pays de connexion, quand le jeu la parle ; l'anglais partout ailleurs
// (et quand le pays est inconnu). Le choix fait dans le sélecteur — cookie
// `am-locale` — passe toujours devant : ceci n'est qu'un point de départ.
import type { Locale } from "@/i18n/config";

/** Langue d'un visiteur dont on ne sait rien, ou dont le pays parle une langue
 *  que le jeu n'a pas. */
export const LOCALE_SANS_PAYS: Locale = "en";

// Un pays à plusieurs langues officielles reçoit la plus parlée chez lui, si le
// jeu l'a : Suisse → allemand, Canada → anglais (absent de la liste), Belgique
// et Luxembourg → français (ni néerlandais ni luxembourgeois au catalogue),
// Maghreb → arabe.
const PAYS_PAR_LANGUE: Record<Exclude<Locale, "en">, string> = {
  fr: "FR BE LU MC GP MQ GF RE YT NC PF PM WF BL MF SN CI ML BF NE TG BJ CM GA CG CD MG HT",
  es: "ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR GQ",
  de: "DE AT CH LI",
  it: "IT SM VA",
  pt: "PT BR AO MZ CV GW ST TL",
  ja: "JP",
  zh: "CN",
  "zh-TW": "TW HK MO",
  ko: "KR",
  tr: "TR",
  pl: "PL",
  ru: "RU BY KZ KG",
  ar: "SA AE EG IQ JO KW LB LY OM QA SY YE BH PS SD MA DZ TN MR",
};

const LANGUE_DU_PAYS = new Map<string, Locale>(
  Object.entries(PAYS_PAR_LANGUE).flatMap(([langue, pays]) =>
    pays.split(" ").map((code) => [code, langue as Locale] as const),
  ),
);

/** Langue par défaut pour un pays (ISO 3166-1 alpha-2, tel que le rend
 *  `requestCountry`). */
export function localeDuPays(pays: string | null | undefined): Locale {
  return LANGUE_DU_PAYS.get((pays ?? "").trim().toUpperCase()) ?? LOCALE_SANS_PAYS;
}
