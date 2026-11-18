"use client";

import Image from "next/image";
import Link from "next/link";
import HomeHeader from "@/components/home/HomeHeader";
import NewsBanner, { type BannerNews } from "@/components/NewsBanner";
import { useTranslations } from "next-intl";
import { isPlayerSellingEnabled } from "@/lib/auction/flags";
import { bricolage } from "@/components/vitrine/font";
import "@/components/vitrine/vitrine.css";

interface MainMenuProps {
  username: string;
  goldBalance: number;
  /** Dette de pièces d'or (remboursement dont l'or était déjà dépensé). */
  goldDebt?: number;
  news?: BannerNews[];
  /** Illustrations de cartes pour les cinq tuiles secondaires, dans l'ordre
   *  decks, collection, marché, tournois, règles. Une case vide retombe sur
   *  l'image historique de la tuile, ou sur un fond uni. */
  affiches?: string[];
}

/** Images d'avant la refonte, gardées en repli si le catalogue ne répond pas. */
const REPLIS = ["/images/home/decks-bg.png", "/images/home/collection-bg-v2.png", "/images/home/marche-bg.png"];

// Le hub du joueur, dans l'habit de la vitrine (« Le Mur des cartes ») : une
// grande tuile pour jouer, cinq affiches pour le reste. Chaque tuile est un
// vrai lien — clic du milieu, clic droit et clavier se comportent comme une
// navigation.
export default function MainMenu({ username, goldBalance, goldDebt = 0, news = [], affiches = [] }: MainMenuProps) {
  const t = useTranslations("home");

  // Illustration de la tuile n° i : la carte du jour, sinon l'image historique.
  const image = (i: number) => affiches[i] ?? REPLIS[i];

  return (
    <div className={`vt ${bricolage.variable}`}>
      <HomeHeader username={username} goldBalance={goldBalance} goldDebt={goldDebt} />

      <main id="main-content" className="vt-hub">
        <div className="vt-hub-tete">
          <h1 className="vt-hub-titre">
            {t("welcome")} {username}
          </h1>
          <p className="vt-hub-sous">{t("home_subtitle")}</p>
        </div>

        {/* Bandeau de news (rotation puis réduction en barre fine). */}
        <div className="vt-hub-news">
          <NewsBanner news={news} />
        </div>

        <nav aria-label="Armies of Legends">
          <ul className="vt-hub-grille">
            <li>
              <Link href="/play" className="vt-tuile vt-tuile--une">
                <Image
                  src="/images/home/jouez-bg.png"
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 1099px) 100vw, 50vw"
                />
                <h2 className="vt-tuile-nom">{t("play_label")}</h2>
                <p className="vt-tuile-desc">{t("play_desc")}</p>
                <span className="vt-tuile-fleche" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </Link>
            </li>
            {/* Routes écrites en clair : game-sections.test.ts les cherche ici. */}
            <li><Tuile href="/decks" nom={t("decks_label")} desc={t("decks_desc")} image={image(0)} /></li>
            <li><Tuile href="/collection-hub" nom={t("collection_label")} desc={t("collection_desc")} image={image(1)} /></li>
            <li><Tuile href="/auction" nom={t("market_label")} desc={isPlayerSellingEnabled() ? t("market_desc") : t("market_desc_buy")} image={image(2)} /></li>
            <li><Tuile href="/tournois" nom={t("tournaments_label")} desc={t("tournaments_desc")} image={image(3)} /></li>
            <li><Tuile href="/tutoriel" nom={t("tutorial_label")} desc={t("tutorial_desc")} image={image(4)} /></li>
          </ul>
        </nav>
      </main>
    </div>
  );
}

function Tuile({ href, nom, desc, image }: { href: string; nom: string; desc: string; image?: string }) {
  return (
    <Link href={href} className="vt-tuile">
      {image && <Image src={image} alt="" fill sizes="(max-width: 1099px) 50vw, 25vw" />}
      <h2 className="vt-tuile-nom">{nom}</h2>
      <p className="vt-tuile-desc">{desc}</p>
    </Link>
  );
}
