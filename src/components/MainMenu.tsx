"use client";

import HomeHeader from "@/components/home/HomeHeader";
import MenuTile from "@/components/home/MenuTile";
import { useStoredLocale } from "@/lib/i18n/useLocale";
import { homeDict } from "@/lib/i18n/homeDict";

interface MainMenuProps {
  username: string;
  goldBalance: number;
}

export default function MainMenu({ username, goldBalance }: MainMenuProps) {
  const [locale] = useStoredLocale();
  const t = homeDict[locale];

  return (
    <div className="min-h-screen bg-[#0a0a18] text-[#e0e0e0]">
      <HomeHeader username={username} goldBalance={goldBalance} />

      <main
        id="main-content"
        className="relative px-4 md:px-10 pt-28 md:pt-32 pb-16 min-h-screen"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(21,21,51,0.95) 0%, #0a0a18 75%)",
        }}
      >
        {/* Title */}
        <div className="text-center mb-10 md:mb-14">
          <h1
            className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e]"
            style={{
              fontSize: "clamp(36px, 6vw, 64px)",
              letterSpacing: "0.06em",
              textShadow: "0 0 32px rgba(200, 168, 78, 0.35)",
            }}
          >
            Armies &amp; Magic
          </h1>
          <p
            className="font-[family-name:var(--font-crimson),serif] italic text-[#e0e0e0]/65 mt-3"
            style={{ fontSize: "clamp(15px, 1.8vw, 20px)" }}
          >
            {t.home_subtitle}
          </p>
          <div
            className="mx-auto mt-5 h-px w-32"
            style={{ background: "linear-gradient(90deg, transparent, #c8a84e, transparent)" }}
            aria-hidden="true"
          />
        </div>

        {/* 2×2 grid (1 column on small mobile) */}
        <nav aria-label="Sections principales" className="max-w-6xl mx-auto">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-7 items-start">
            <li>
              <MenuTile
                href="/play"
                accent="play"
                label={t.play_label}
                description={t.play_desc}
                bgImage="/images/home/jouez-bg.png"
              />
            </li>
            <li>
              <MenuTile
                href="/auction"
                accent="market"
                label={t.market_label}
                description={t.market_desc}
                bgImage="/images/home/marche-bg.png"
              />
            </li>
            <li>
              <MenuTile
                href="/collection-hub"
                accent="collection"
                label={t.collection_label}
                description={t.collection_desc}
                bgImage="/images/home/collection-bg-v2.png"
              />
            </li>
            <li>
              <MenuTile
                href="/decks"
                accent="decks"
                label={t.decks_label}
                description={t.decks_desc}
                bgImage="/images/home/decks-bg.png"
              />
            </li>
          </ul>
        </nav>
      </main>
    </div>
  );
}
