"use client";

import HomeHeader from "@/components/home/HomeHeader";
import MenuTile from "@/components/home/MenuTile";
import TournamentTileBackdrop from "@/components/tournaments/TournamentTileBackdrop";
import RulesTileBackdrop from "@/components/tutorial/RulesTileBackdrop";
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
            Armies of Legends
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
            <li>
              <MenuTile
                href="/tournois"
                accent="market"
                label={t('tournaments_label')}
                description={t('tournaments_desc')}
                bgContent={<TournamentTileBackdrop />}
              />
            </li>
            <li>
              <MenuTile
                href="/tutoriel"
                accent="heroes"
                label={t('tutorial_label')}
                description={t('tutorial_desc')}
                bgContent={<RulesTileBackdrop />}
                bgContentTitleTop={38}
              />
            </li>
          </ul>
        </nav>
      </main>
    </div>
  );
}
