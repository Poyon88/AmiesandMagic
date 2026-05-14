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
          background: scrolled ? "rgba(10, 10, 24, 0.9)" : "rgba(10, 10, 24, 0.4)",
          borderBottom: scrolled
            ? "1px solid rgba(200, 168, 78, 0.15)"
            : "1px solid transparent",
          boxShadow: scrolled ? "0 4px 30px rgba(0,0,0,0.4)" : "none",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        role="banner"
      >
        <div className="flex items-center gap-3 md:gap-5 min-w-0">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-sm md:text-base text-[#e0e0e0]/80 hover:text-[#c8a84e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a84e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a18] rounded px-2 py-1"
              aria-label={backLabel ?? t.collection_back}
            >
              <span aria-hidden="true">←</span>
              <span className="hidden sm:inline">{backLabel ?? t.collection_back}</span>
            </Link>
          ) : (
            <Link
              href="/"
              className="font-[family-name:var(--font-cinzel),serif] text-base md:text-xl font-bold tracking-wider text-[#c8a84e] truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a84e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a18] rounded"
              style={{ textShadow: "0 0 18px rgba(200, 168, 78, 0.3)" }}
              aria-label="Armies & Magic — Accueil"
            >
              Armies &amp; Magic
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <span className="hidden md:inline text-sm text-[#e0e0e0]/70 mr-2">
            {t.welcome}{" "}
            <span
              className="font-[family-name:var(--font-cinzel),serif] text-[#c8a84e] font-semibold"
              style={{ textShadow: "0 0 12px rgba(200, 168, 78, 0.25)" }}
            >
              {username}
            </span>
          </span>

          <div
            className="px-3 py-1 rounded-lg border border-[#c8a84e]/20 bg-[#0a0a18]/60"
            aria-label={`${goldBalance} or`}
          >
            <GoldBalance amount={goldBalance} size="sm" />
          </div>

          <NotificationBell />

          <button
            type="button"
            onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
            className="px-3 py-1.5 text-xs md:text-sm font-semibold text-[#c8a84e] rounded-md border border-[#c8a84e]/25 bg-[#c8a84e]/10 hover:bg-[#c8a84e]/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a84e]"
            aria-label={`Langue : ${locale === "fr" ? "Français" : "English"} — cliquer pour basculer`}
          >
            {locale === "fr" ? "EN" : "FR"}
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="px-3 py-1.5 text-sm border border-[#c8a84e]/25 bg-[#c8a84e]/10 hover:bg-[#c8a84e]/20 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a84e]"
            aria-label={t.settings}
            title={t.settings}
          >
            <span aria-hidden="true">⚙</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-semibold text-[#e0e0e0]/80 hover:text-[#c8a84e] border border-[#c8a84e]/25 bg-[#c8a84e]/10 hover:bg-[#c8a84e]/20 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a84e]"
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
