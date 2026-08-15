"use client";

import HomeHeader from "@/components/home/HomeHeader";
import MenuTile from "@/components/home/MenuTile";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import NewsBanner, { type BannerNews } from "@/components/NewsBanner";
import { useTranslations } from "next-intl";
import { isPlayerSellingEnabled } from "@/lib/auction/flags";

interface MainMenuProps {
  username: string;
  goldBalance: number;
  /** Dette de pièces d'or (remboursement dont l'or était déjà dépensé). */
  goldDebt?: number;
  news?: BannerNews[];
}

export default function MainMenu({ username, goldBalance, goldDebt = 0, news = [] }: MainMenuProps) {
  const t = useTranslations("home");

  return (
    <div className="min-h-screen text-am-ink">
      <AmAtmosphere />
      <HomeHeader username={username} goldBalance={goldBalance} goldDebt={goldDebt} />

      <main
        id="main-content"
        className="relative px-4 md:px-10 pt-28 md:pt-32 pb-16 min-h-screen"
      >
        {/* Title */}
        <div className="text-center mb-10 md:mb-14">
          <span
            className="am-animate-fade font-[family-name:var(--font-cinzel),serif] text-[10px] md:text-xs tracking-[0.34em] uppercase text-am-arcane-bright/80 block mb-4"
            style={{ animationDelay: "0.05s" }}
          >
            {t('welcome')} {username}
          </span>
          <h1
            className="am-foil-text am-animate-rise font-[family-name:var(--font-cinzel),serif] font-bold"
            style={{
              fontSize: "clamp(36px, 6vw, 64px)",
              letterSpacing: "0.06em",
              animationDelay: "0.1s",
            }}
          >
            Armies &amp; Magic
          </h1>
          <p
            className="am-animate-rise font-[family-name:var(--font-crimson),serif] italic text-am-ink-soft mt-3"
            style={{ fontSize: "clamp(15px, 1.8vw, 20px)", animationDelay: "0.2s" }}
          >
            {t('home_subtitle')}
          </p>
          <div
            className="am-rule-diamond am-animate-fade mx-auto mt-6 w-40"
            style={{ animationDelay: "0.3s" }}
            aria-hidden="true"
          />
        </div>

        {/* Bandeau de news (rotation puis réduction en barre fine). */}
        <div className="am-animate-rise" style={{ animationDelay: "0.32s" }}>
          <NewsBanner news={news} />
        </div>

        {/* 2×2 grid (1 column on small mobile) */}
        <nav aria-label="Sections principales" className="max-w-6xl mx-auto am-animate-rise" style={{ animationDelay: "0.35s" }}>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-7 items-start">
            <li>
              <MenuTile
                href="/play"
                accent="play"
                label={t('play_label')}
                description={t('play_desc')}
                bgImage="/images/home/jouez-bg.png"
              />
            </li>
            <li>
              <MenuTile
                href="/auction"
                accent="market"
                label={t('market_label')}
                description={isPlayerSellingEnabled() ? t('market_desc') : t('market_desc_buy')}
                bgImage="/images/home/marche-bg.png"
              />
            </li>
            <li>
              <MenuTile
                href="/collection-hub"
                accent="collection"
                label={t('collection_label')}
                description={t('collection_desc')}
                bgImage="/images/home/collection-bg-v2.png"
              />
            </li>
            <li>
              <MenuTile
                href="/decks"
                accent="decks"
                label={t('decks_label')}
                description={t('decks_desc')}
                bgImage="/images/home/decks-bg.png"
              />
            </li>
            {/* Circuit payant. Libellés en dur et non traduits : les 8 locales
                seront alimentées quand le moteur de tournoi existera et que le
                vocabulaire sera arrêté — traduire maintenant reviendrait à
                retraduire. */}
            <li>
              <MenuTile
                href="/tournois"
                accent="market"
                label="Tournois"
                description="Le circuit payant. Entrée 2,50 €, gains en pièces d'or."
                glyph={
                  <svg width="52" height="52" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10h24v10a12 12 0 0 1-24 0V10Z" />
                    <path d="M20 14h-8v4a8 8 0 0 0 8 8M44 14h8v4a8 8 0 0 1-8 8" />
                    <path d="M32 32v12M24 52h16M28 44h8" />
                  </svg>
                }
              />
            </li>
            <li>
              <MenuTile
                href="/tutoriel"
                accent="heroes"
                label={t('tutorial_label')}
                description={t('tutorial_desc')}
                glyph={
                  <svg width="52" height="52" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M32 16 Q22 10 10 12 V48 Q22 46 32 52 Q42 46 54 48 V12 Q42 10 32 16 Z" />
                    <path d="M32 16 V52" />
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
