"use client";

import { useEffect, useState } from "react";
import HomeHeader from "@/components/home/HomeHeader";
import MenuTile from "@/components/home/MenuTile";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import AmHeading from "@/components/ui/AmHeading";
import { useTranslations } from "next-intl";

type BgCategory = "cards" | "heroes" | "cardBacks" | "boards";

interface CollectionHubProps {
  username: string;
  goldBalance: number;
  bgCandidates: Record<BgCategory, string[]>;
}

const EMPTY_BG: Record<BgCategory, string | undefined> = {
  cards: undefined,
  heroes: undefined,
  cardBacks: undefined,
  boards: undefined,
};

export default function CollectionHub({ username, goldBalance, bgCandidates }: CollectionHubProps) {
  const t = useTranslations("home");

  // Per-session tile artwork: pick one image at random from each category's
  // highest-rarity pool, frozen in sessionStorage so it stays stable while the
  // player navigates within the session (re-rolls on a new session / login).
  const [bg, setBg] = useState<Record<BgCategory, string | undefined>>(EMPTY_BG);
  useEffect(() => {
    const pick = (cat: BgCategory): string | undefined => {
      const pool = bgCandidates[cat] ?? [];
      if (pool.length === 0) return undefined;
      const key = `collhub:bg:v1:${cat}`;
      try {
        const stored = sessionStorage.getItem(key);
        if (stored && pool.includes(stored)) return stored;
      } catch { /* sessionStorage unavailable */ }
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      try { sessionStorage.setItem(key, chosen); } catch { /* ignore */ }
      return chosen;
    };
    // Deferred to a post-mount effect on purpose: the pick relies on
    // sessionStorage + Math.random, so it must run only on the client to keep
    // the first render identical to the server HTML (no hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBg({
      cards: pick("cards"),
      heroes: pick("heroes"),
      cardBacks: pick("cardBacks"),
      boards: pick("boards"),
    });
  }, [bgCandidates]);

  return (
    <div className="relative min-h-screen bg-am-bg-0 text-am-ink">
      <AmAtmosphere />

      <HomeHeader
        username={username}
        goldBalance={goldBalance}
        backHref="/"
        backLabel={t('collection_back')}
      />

      <main
        id="main-content"
        className="relative px-4 md:px-10 pt-28 md:pt-32 pb-20 md:pb-24 min-h-screen"
      >
        {/* Title */}
        <div className="am-animate-rise mb-12 md:mb-16">
          <AmHeading as="h1" align="center">
            {t('collection_title')}
          </AmHeading>
        </div>

        <nav aria-label="Sous-sections de la collection" className="max-w-6xl mx-auto">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 items-start">
            <li className="am-animate-rise" style={{ animationDelay: "0.05s" }}>
              <MenuTile
                href="/collection"
                accent="cards"
                label={t('my_cards')}
                description={t('my_cards_desc')}
                bgImage={bg.cards}
                glyph={
                  <svg width="52" height="52" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="14" y="10" width="22" height="32" rx="2" transform="rotate(-10 25 26)" />
                    <rect x="28" y="18" width="22" height="32" rx="2" transform="rotate(8 39 34)" />
                  </svg>
                }
              />
            </li>
            <li className="am-animate-rise" style={{ animationDelay: "0.12s" }}>
              <MenuTile
                href="/heroes"
                accent="heroes"
                label={t('my_heroes')}
                description={t('my_heroes_desc')}
                bgImage={bg.heroes}
                glyph={
                  <svg width="52" height="52" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="32" cy="22" r="8" />
                    <path d="M16 52 Q16 38 32 38 Q48 38 48 52" />
                    <path d="M22 14 L26 8 L32 12 L38 8 L42 14" />
                  </svg>
                }
              />
            </li>
            <li className="am-animate-rise" style={{ animationDelay: "0.19s" }}>
              <MenuTile
                href="/card-backs"
                accent="card_backs"
                label={t('my_card_backs')}
                description={t('my_card_backs_desc')}
                bgImage={bg.cardBacks}
                glyph={
                  <svg width="52" height="52" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="18" y="10" width="28" height="44" rx="3" />
                    <path d="M26 22 L38 22 M22 32 L42 32 M26 42 L38 42" />
                  </svg>
                }
              />
            </li>
            <li className="am-animate-rise" style={{ animationDelay: "0.26s" }}>
              <MenuTile
                href="/boards"
                accent="boards"
                label={t('my_boards')}
                description={t('my_boards_desc')}
                bgImage={bg.boards}
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
