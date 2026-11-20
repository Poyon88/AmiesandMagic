import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "./config";
import { requestCountry } from "@/lib/geo/country";
import { localeDuPays } from "@/lib/geo/locale";

// Configuration de requête next-intl SANS routing URL.
// La langue est celle du cookie `am-locale` — le choix du joueur. Sans cookie
// (première visite), celle du pays de connexion, et l'anglais si le jeu ne la
// parle pas ou si le pays est inconnu. Rien n'est écrit ici : tant que le
// joueur n'a pas choisi, la langue suit son pays. Chaque Server Component
// obtient ainsi la bonne locale au rendu SSR, sans flash.
export default getRequestConfig(async () => {
  const choisie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(choisie) ? choisie : localeDuPays(requestCountry(await headers()));

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
