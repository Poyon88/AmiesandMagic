"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, type Locale } from "./config";

// Server Action : écrit le choix de langue dans le cookie `am-locale`.
// Appelée par le hook client `useLocale().setLocale`, qui déclenche ensuite
// un router.refresh() pour re-rendre les Server Components dans la nouvelle
// langue.
export async function setLocaleAction(locale: Locale): Promise<void> {
  const value = normalizeLocale(locale);
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 an
    sameSite: "lax",
  });
}
