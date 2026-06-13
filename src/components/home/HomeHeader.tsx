"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GoldBalance from "@/components/shared/GoldBalance";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import { useStoredLocale } from "@/lib/i18n/useLocale";
import { homeDict } from "@/lib/i18n/homeDict";

interface HomeHeaderProps {
  username: string;
  goldBalance: number;
  /** When set, an "← back" link is shown at the far left, taking
   *  precedence over the title. Used by /collection-hub and /heroes. */
  backHref?: string;
  backLabel?: string;
}

// Shared header for the authenticated home + sub-pages. Mirrors the
// landing's navbar pattern (translucent → opaque at scroll, Cinzel
// title in gold) so the visual transition feels continuous. All
// interactive items expose aria-labels for screen readers.
export default function HomeHeader({ username, goldBalance, backHref, backLabel }: HomeHeaderProps) {
  const router = useRouter();
  const supabase = createClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [locale, setLocale] = useStoredLocale();
  const t = homeDict[locale];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Skip-link — only visible on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-md focus:bg-[#c8a84e] focus:text-[#0a0a18] focus:font-bold"
      >
        {t.skip_to_content}
      </a>

      <header
        className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between px-4 md:px-8 py-3 md:py-4 transition-all duration-500"
        style={{
          background: scrolled
            ? "linear-gradient(180deg, rgba(15,13,26,0.92), rgba(8,7,15,0.86))"
            : "linear-gradient(180deg, rgba(15,13,26,0.45), rgba(8,7,15,0.1))",
          borderBottom: scrolled
            ? "1px solid var(--am-gild)"
            : "1px solid transparent",
          boxShadow: scrolled ? "0 8px 34px rgba(0,0,0,0.5)" : "none",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
        role="banner"
      >
        {/* Gilded hairline that glows in once scrolled */}
        <div
          className="absolute inset-x-0 bottom-0 h-px pointer-events-none transition-opacity duration-500"
          style={{
            opacity: scrolled ? 1 : 0,
            background: "linear-gradient(90deg, transparent, var(--am-gild-strong), transparent)",
          }}
          aria-hidden="true"
        />

        <div className="flex items-center gap-3 md:gap-5 min-w-0">
          {backHref ? (
            <Link
              href={backHref}
              className="group inline-flex items-center gap-2 text-sm md:text-base text-am-ink-soft hover:text-am-gold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 rounded px-2 py-1"
              aria-label={backLabel ?? t.collection_back}
            >
              <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">←</span>
              <span className="hidden sm:inline font-display tracking-wide">{backLabel ?? t.collection_back}</span>
            </Link>
          ) : (
            <Link
              href="/landing"
              className="group flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 rounded"
              aria-label="Armies & Magic — Landing page"
            >
              {/* Sigil mark */}
              <span
                className="grid place-items-center w-8 h-8 md:w-9 md:h-9 rounded-lg shrink-0 transition-transform group-hover:rotate-[8deg]"
                style={{
                  background: "linear-gradient(135deg, #f4e09a, #d8b25a 50%, #9a7730)",
                  boxShadow: "0 4px 14px rgba(216,178,90,0.35), inset 0 1px 0 rgba(255,255,255,0.4)",
                }}
                aria-hidden="true"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1408" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" />
                </svg>
              </span>
              <span
                className="am-foil-text font-display text-base md:text-xl font-bold tracking-wider truncate"
              >
                Armies &amp; Magic
              </span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <span className="hidden md:inline text-sm text-am-ink-soft mr-1">
            {t.welcome}{" "}
            <span className="am-foil-text font-display font-semibold">
              {username}
            </span>
          </span>

          <div
            className="px-3 py-1.5 rounded-lg am-gild-border bg-am-bg-0/60"
            aria-label={`${goldBalance} or`}
          >
            <GoldBalance amount={goldBalance} size="sm" />
          </div>

          <NotificationBell />

          <button
            type="button"
            onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
            className="px-3 py-1.5 text-xs md:text-sm font-display font-semibold text-am-gold rounded-lg am-gild-border bg-am-gold/[0.06] hover:bg-am-gold/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold"
            aria-label={`Langue : ${locale === "fr" ? "Français" : "English"} — cliquer pour basculer`}
          >
            {locale === "fr" ? "EN" : "FR"}
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="grid place-items-center w-9 h-9 text-am-gold am-gild-border bg-am-gold/[0.06] hover:bg-am-gold/15 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold"
            aria-label={t.settings}
            title={t.settings}
          >
            <span aria-hidden="true" className="text-base">⚙</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-display font-semibold text-am-ink-soft hover:text-am-ember am-gild-border bg-am-gold/[0.06] hover:bg-am-ember/10 hover:border-am-ember/40 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold"
            aria-label={t.logout}
          >
            {t.logout}
          </button>
        </div>
      </header>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
