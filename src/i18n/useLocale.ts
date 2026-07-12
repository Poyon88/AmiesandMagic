"use client";

import { useCallback, useEffect } from "react";
import { useLocale as useNextIntlLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "./setLocale";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  normalizeLocale,
  type Locale,
} from "./config";

// Ancienne clé localStorage du système maison (fr/en). On la migre une fois
// vers le cookie puis on la nettoie, pour préserver le choix des utilisateurs
// existants.
const LEGACY_LOCALE_KEY = "am-landing-locale";

function readCookieLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`));
  if (!match) return null;
  return normalizeLocale(decodeURIComponent(match.split("=")[1]));
}

// Hook de lecture/écriture de la langue active.
// - lecture : via le provider next-intl (SSR-correct, pas de flash) ;
// - écriture : Server Action (cookie) + router.refresh() pour re-rendre les
//   Server Components dans la nouvelle langue.
export function useLocale(): [Locale, (l: Locale) => void] {
  const locale = normalizeLocale(useNextIntlLocale());
  const router = useRouter();

  const setLocale = useCallback(
    (l: Locale) => {
      const next = normalizeLocale(l);
      // Cookie optimiste côté client pour un basculement instantané, avant
      // même le retour de la Server Action.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${
        60 * 60 * 24 * 365
      }; samesite=lax`;
      void setLocaleAction(next).then(() => router.refresh());
    },
    [router],
  );

  return [locale, setLocale];
}

// Migration one-shot : si l'ancienne clé localStorage existe et qu'aucun
// cookie de langue n'est encore posé, on sème le cookie depuis le choix
// legacy puis on supprime la clé. À monter une seule fois près de la racine.
export function useLegacyLocaleMigration(): void {
  const [, setLocale] = useLocale();

  useEffect(() => {
    try {
      if (readCookieLocale()) return; // cookie déjà présent, rien à migrer
      const legacy = localStorage.getItem(LEGACY_LOCALE_KEY);
      if (!legacy) return;
      const migrated = normalizeLocale(legacy);
      localStorage.removeItem(LEGACY_LOCALE_KEY);
      if (migrated !== DEFAULT_LOCALE) {
        setLocale(migrated);
      }
    } catch {
      /* localStorage inaccessible — on ignore */
    }
    // Migration unique au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
