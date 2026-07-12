"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n/useLocale";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";

// Sélecteur de langue 6 langues, branché sur le cookie `am-locale` (via le hook
// useLocale : écriture cookie + router.refresh()). Remplace l'ancien toggle
// FR/EN. Toute l'app (collection, deck builder, cartes en partie) suit le
// choix ; les chaînes d'UI non encore traduites retombent proprement sur le FR.
export default function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const [locale, setLocale] = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur + touche Échap.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (l: Locale) => {
    setOpen(false);
    if (l !== locale) setLocale(l);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-display font-semibold text-am-gold rounded-lg am-gild-border bg-am-gold/[0.06] hover:bg-am-gold/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Langue : ${LOCALE_LABELS[locale]} — changer de langue`}
        title={LOCALE_LABELS[locale]}
      >
        <span aria-hidden="true" className="text-sm leading-none">🌐</span>
        <span>{compact ? locale.toUpperCase() : LOCALE_LABELS[locale]}</span>
        <span aria-hidden="true" className="text-[0.6em] opacity-70">▼</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choix de la langue"
          className="absolute right-0 mt-2 min-w-[9rem] py-1 rounded-lg am-gild-border shadow-2xl z-[120] overflow-hidden"
          style={{
            background: "linear-gradient(180deg, rgba(20,17,34,0.98), rgba(10,9,18,0.98))",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          {SUPPORTED_LOCALES.map((l) => {
            const active = l === locale;
            return (
              <li key={l} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => choose(l)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-xs md:text-sm font-display transition-colors ${
                    active
                      ? "text-am-gold bg-am-gold/15"
                      : "text-am-ink-soft hover:text-am-gold hover:bg-am-gold/10"
                  }`}
                >
                  <span>{LOCALE_LABELS[l]}</span>
                  {active && <span aria-hidden="true" className="text-am-gold">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
