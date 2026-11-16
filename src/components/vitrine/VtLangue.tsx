"use client";

import { useLocale } from "@/i18n/useLocale";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";

/** Sélecteur de langue de la vitrine : une liste native, habillée aux couleurs
 *  du mur. Même branchement que le sélecteur du jeu (cookie `am-locale` via
 *  `useLocale`), donc le choix suit le visiteur une fois connecté. */
export default function VtLangue({ label }: { label: string }) {
  const [locale, setLocale] = useLocale();
  return (
    <label className="vt-langue">
      <span className="vt-sr">{label}</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
        ))}
      </select>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5 5 6.5 8 3.5" />
      </svg>
    </label>
  );
}
