import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale } from "./config";

// Configuration de requête next-intl SANS routing URL.
// La langue est lue depuis le cookie `am-locale` (fallback FR). Chaque
// Server Component obtient ainsi la bonne locale au rendu SSR, sans flash.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
