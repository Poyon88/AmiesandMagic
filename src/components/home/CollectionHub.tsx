"use client";

import HomeHeader from "@/components/home/HomeHeader";
import MenuTile from "@/components/home/MenuTile";
import { useStoredLocale } from "@/lib/i18n/useLocale";
import { homeDict } from "@/lib/i18n/homeDict";

interface CollectionHubProps {
  username: string;
  goldBalance: number;
}

export default function CollectionHub({ username, goldBalance }: CollectionHubProps) {
  const [locale] = useStoredLocale();
  const t = homeDict[locale];

  return (
    <div className="min-h-screen bg-[#0a0a18] text-[#e0e0e0]">
      <HomeHeader
        username={username}
        goldBalance={goldBalance}
        backHref="/"
        backLabel={t.collection_back}
      />

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
              fontSize: "clamp(32px, 5vw, 52px)",
              letterSpacing: "0.06em",
              textShadow: "0 0 28px rgba(200, 168, 78, 0.3)",
            }}
          >
            {t.collection_title}
          </h1>
          <div
            className="mx-auto mt-4 h-px w-28"
            style={{ background: "linear-gradient(90deg, transparent, #c8a84e, transparent)" }}
            aria-hidden="true"
          />
        </div>

        <nav aria-label="Sous-sections de la collection" className="max-w-6xl mx-auto">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-7 items-start">
            <li>
              <MenuTile
                href="/collection"
                accent="cards"
                label={t.my_cards}
                description={t.my_cards_desc}
                glyph={
                  <svg width="52" height="52" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="14" y="10" width="22" height="32" rx="2" transform="rotate(-10 25 26)" />
                    <rect x="28" y="18" width="22" height="32" rx="2" transform="rotate(8 39 34)" />
                  </svg>
                }
              />
            </li>
            <li>
              <MenuTile
                href="/heroes"
                accent="heroes"
                label={t.my_heroes}
                description={t.my_heroes_desc}
                glyph={
                  <svg width="52" height="52" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="32" cy="22" r="8" />
                    <path d="M16 52 Q16 38 32 38 Q48 38 48 52" />
                    <path d="M22 14 L26 8 L32 12 L38 8 L42 14" />
                  </svg>
                }
              />
            </li>
            <li>
              <MenuTile
                href="/card-backs"
                accent="card_backs"
                label={t.my_card_backs}
                description={t.my_card_backs_desc}
                glyph={
                  <svg width="52" height="52" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="18" y="10" width="28" height="44" rx="3" />
                    <path d="M26 22 L38 22 M22 32 L42 32 M26 42 L38 42" />
                  </svg>
                }
              />
            </li>
            <li>
              <MenuTile
                href="/boards"
                accent="boards"
                label={t.my_boards}
                description={t.my_boards_desc}
                glyph={
                  <svg width="52" height="52" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="8" y="20" width="48" height="24" rx="2" />
                    <path d="M8 32 H56 M20 20 V44 M32 20 V44 M44 20 V44" />
                  </svg>
                }
              />
            </li>
          </ul>
        </nav>
      </main>
    </div>
  );
}
