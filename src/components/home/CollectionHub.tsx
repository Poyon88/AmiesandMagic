"use client";

import { useEffect, useState } from "react";
import HomeHeader from "@/components/home/HomeHeader";
import Image from "next/image";
import Link from "next/link";
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
    <div className="relative min-h-screen">
      <HomeHeader
        username={username}
        goldBalance={goldBalance}
        backHref="/"
        backLabel={t('collection_back')}
      />

      <main id="main-content" className="vt-hub">
        <div className="vt-hub-tete">
          <h1 className="vt-hub-titre">{t('collection_title')}</h1>
        </div>

        <nav aria-label={t('collection_title')}>
          <ul className="vt-coll-grille">
            <li><Tuile href="/collection" nom={t('my_cards')} desc={t('my_cards_desc')} image={bg.cards} /></li>
            <li><Tuile href="/heroes" nom={t('my_heroes')} desc={t('my_heroes_desc')} image={bg.heroes} /></li>
            <li><Tuile href="/card-backs" nom={t('my_card_backs')} desc={t('my_card_backs_desc')} image={bg.cardBacks} /></li>
            <li><Tuile href="/boards" nom={t('my_boards')} desc={t('my_boards_desc')} image={bg.boards} /></li>
          </ul>
        </nav>
      </main>
    </div>
  );
}

/** Même affiche que sur le hub du joueur : l'illustration porte la couleur,
 *  le texte se lit sur le voile du bas. */
function Tuile({ href, nom, desc, image }: { href: string; nom: string; desc: string; image?: string }) {
  return (
    <Link href={href} className="vt-tuile">
      {image && <Image src={image} alt="" fill sizes="(max-width: 699px) 100vw, 50vw" />}
      <h2 className="vt-tuile-nom">{nom}</h2>
      <p className="vt-tuile-desc">{desc}</p>
    </Link>
  );
}
