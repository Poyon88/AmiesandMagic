"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Locale = "fr" | "en";

// Shared with LandingPage so the toggle there persists into the auth'd
// surfaces of the app. Same storage key, same event name — keep them
// aligned if the landing copy moves.
const LOCALE_KEY = "am-landing-locale";
const LOCALE_EVENT = "am-landing-locale-change";

function subscribeLocale(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(LOCALE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(LOCALE_EVENT, cb);
  };
}

function readLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return v === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

export function useStoredLocale(): [Locale, (l: Locale) => void] {
  const locale = useSyncExternalStore(
    subscribeLocale,
    readLocale,
    () => "fr" as Locale,
  );
  const update = useCallback((l: Locale) => {
    try {
      localStorage.setItem(LOCALE_KEY, l);
      window.dispatchEvent(new Event(LOCALE_EVENT));
    } catch {
      /* ignore */
    }
  }, []);
  return [locale, update];
}
