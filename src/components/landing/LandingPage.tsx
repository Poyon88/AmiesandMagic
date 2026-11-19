"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useMessages, useTranslations } from "next-intl";
import type { Card } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";
import { FACTIONS, LIMITED_PRINT_COUNTS } from "@/lib/card-engine/constants";
import { factionSlug } from "@/lib/game/faction-slug";
import { useFactionOwnership } from "@/components/factions/useFactionOwnership";
import TournamentStandings from "@/components/landing/TournamentStandings";
import Mur, { Frise } from "@/components/vitrine/Mur";
import VtLangue from "@/components/vitrine/VtLangue";
import { bricolage } from "@/components/vitrine/font";
import type { Affiche, RangeeDuMur } from "@/components/vitrine/types";
import { appliquerTextes } from "@/lib/vitrine/config";
import "@/components/vitrine/vitrine.css";
import Marque from "@/components/shared/Marque";

// ─── Textes ────────────────────────────────────────────────────────────────

// La page de garde ne porte QUE ses accroches. Les noms de faction, de race,
// de clan, de rareté et d'alignement viennent du catalogue `vocab`, traduit
// dans les 8 locales et déjà utilisé par le jeu.
type Dict = {
  nav_play: string;
  nav_factions: string;
  nav_limited: string;
  nav_tournaments: string;
  nav_language: string;
  hero_title: string;
  hero_claim: string;
  hero_sub: string;
  hero_cta: string;
  hero_cta_secondary: string;
  wall_pause: string;
  wall_play: string;
  factions_title: string;
  factions_sub: string;
  factions_see: string;
  limited_title: string;
  limited_desc: string;
  /** « {count} » est remplacé par le nombre d'exemplaires. */
  limited_run: string;
  limited_unique: string;
  f_icons_title: string;
  f_icons_desc: string;
  trailer_title: string;
  f4_title: string;
  f4_desc: string;
  f4_example: string;
  cta_title: string;
  cta_sub: string;
  cta_btn: string;
  footer: string;
  /** Accroches, clés par ID DE FACTION (`FACTIONS`), pas par slug maison. */
  factions: Record<string, { tagline: string }>;
};

type Vocab = {
  factions?: Record<string, { displayName?: string }>;
  rarities?: Record<string, string>;
  races?: Record<string, string>;
  clans?: Record<string, string>;
  alignments?: Record<string, string>;
};

/** Les factions présentées, dans l'ordre où le jeu les déclare.
 *
 *  DÉRIVÉE, jamais recopiée : une liste tenue à la main dérive dès qu'une
 *  faction est ajoutée ou absorbée. Mercenaires est écarté par son alignement
 *  « spéciale » : c'est un vivier partagé, pas une armée qu'on choisit. */
const SHOWCASE_FACTIONS: string[] = Object.entries(FACTIONS)
  .filter(([, def]) => def.alignment !== "spéciale")
  .map(([id]) => id);

/** Bannières de REPLI, par id de faction, quand ni carte ni héros illustré
 *  n'existe. Les fichiers portent d'anciens slugs — on ne renomme pas des
 *  assets pour ça. */
const BANNIERE_DE_REPLI: Record<string, string> = {
  Humains: "humans", Elfes: "elves", Nains: "dwarves", "Hommes-Bêtes": "beastmen",
  "Élémentaires": "giants", "Elfes Noirs": "dark_elves", "Morts-Vivants": "undead",
};

interface LandingPageProps {
  showcaseCards: Card[];
  factionHeroUrls: Record<string, string>;
  /** Carte du bloc « Lisibles d'un coup d'œil ». */
  iconCard: Card | null;
  rangees: RangeeDuMur[];
  vedettes: Affiche[];
  /** Illustration d'affiche par faction : sa carte la plus rare. */
  factionArt: Record<string, string>;
  /** Affiches que le mur ne montre pas, pour la frise de clôture. */
  frise: Affiche[];
  /** Cartes en tirage limité, rendues par le vrai composant du jeu. */
  cartesLimitees: Card[];
  /** Textes réécrits depuis l'admin, déjà résolus dans la langue du visiteur.
   *  Clés pointées de `messages.landing` ; absents ⇒ texte par défaut. */
  textes?: Record<string, string>;
}

export default function LandingPage({
  showcaseCards, factionHeroUrls, iconCard, rangees, vedettes, factionArt, frise, cartesLimitees, textes,
}: LandingPageProps) {
  const messages = useMessages() as unknown as {
    landing: Dict;
    legal: Record<string, string>;
    vocab?: Vocab;
  };
  const txt = useMemo(() => appliquerTextes(messages.landing, textes ?? {}), [messages.landing, textes]);
  // La locale du SITE, pas celle du navigateur : serveur et client doivent
  // écrire « 1 000 » de la même façon.
  const locale = useLocale();
  const vocab = messages.vocab ?? {};

  // Seul un booléen pilote l'habillage de la barre : le remettre à la même
  // valeur n'entraîne aucun rendu, donc le défilement ne re-rend pas la page.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Les cartes montrées en vrai : celle du bloc « lisibilité » d'abord, puis
  // les tirages limités. À défaut de tirage limité en base, la sélection
  // vitrine, de la plus rare à la plus commune.
  const cartes: Card[] = [];
  const suite = cartesLimitees.length > 0 ? cartesLimitees : [...showcaseCards].sort((a, b) => rang(a) - rang(b));
  for (const c of [iconCard, ...suite]) {
    if (c && !cartes.some((x) => x.id === c.id) && cartes.length < 8) cartes.push(c);
  }

  return (
    <div className={`vt ${bricolage.variable}`}>
      <header className="vt-nav" data-scrolled={scrolled}>
        <Link href="/landing" className="vt-brand" translate="no"><Marque /></Link>
        <nav className="vt-nav-links" aria-label="Armies of Legends">
          <a className="vt-nav-a" href="#factions">{txt.nav_factions}</a>
          <a className="vt-nav-a" href="#tirages">{txt.nav_limited}</a>
          <a className="vt-nav-a" href="#tournois">{txt.nav_tournaments}</a>
          <VtLangue label={txt.nav_language} />
          <Link href="/login" className="vt-btn vt-btn--ghost">{txt.nav_play}</Link>
        </nav>
      </header>

      <main>
        {/* ── Le mur ──────────────────────────────────────────────────── */}
        <section className="vt-hero">
          {/* Le texte AVANT le mur dans le HTML : au clavier, on atteint le
              bouton principal sans traverser quarante affiches. */}
          <div className="vt-propos">
            <h1 className="vt-h1">
              {/* Le nom du jeu ne se traduit pas, même par le traducteur du navigateur. */}
              <span translate="no">{txt.hero_title}.</span>
              <span>{txt.hero_claim}</span>
            </h1>
            <p className="vt-lede">{txt.hero_sub}</p>
            <div className="vt-actions">
              <Link href="/login" className="vt-btn vt-btn--lg">{txt.hero_cta}</Link>
              <a href="#factions" className="vt-link">{txt.hero_cta_secondary}</a>
            </div>
          </div>
          <Mur
            rangees={rangees}
            vedettes={vedettes}
            vocab={vocab}
            labels={{ pause: txt.wall_pause, play: txt.wall_play, voirFaction: txt.factions_see }}
          />
        </section>

        {/* ── Les neuf factions ───────────────────────────────────────── */}
        <FactionsSection
          txt={txt}
          vocab={vocab}
          factionArt={factionArt}
          factionHeroUrls={factionHeroUrls}
        />

        {/* ── Tirages limités : de vraies cartes ──────────────────────── */}
        <section id="tirages" className="vt-section">
          <div className="vt-tete">
            <div>
              <h2 className="vt-h2">{txt.limited_title}</h2>
              <p className="vt-corps">{txt.limited_desc}</p>
            </div>
            <div>
              <h3 className="vt-h3">{txt.f_icons_title}</h3>
              <p className="vt-corps">{txt.f_icons_desc}</p>
            </div>
          </div>
          {/* Une rangée du mur, mais en vraies cartes : le composant du jeu,
              avec ses icônes et son numéro de tirage. */}
          <div className="vt-cartes">
            {cartes.map((c) => (
              <figure key={c.id} className="vt-carte">
                <div className="vt-carte-cadre"><div><GameCard card={c} size="md" /></div></div>
                {/* Le tirage, écrit en clair : sur la carte il tient en six
                    pixels. Même test que GameCard — hors set et millésimée. */}
                <figcaption>{tirage(c, txt, locale)}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Rendue par le projet Remotion de `video/` (npm run render). Muette :
            aucune musique n'est livrée avec. `preload="none"` — les 8 Mo ne
            partent que si le visiteur lance la lecture. */}
        <section id="bande-annonce" className="vt-section">
            <h2 className="vt-h2">{txt.trailer_title}</h2>
            <div className="vt-film">
              <video
                controls
                playsInline
                preload="none"
                poster="/videos/bande-annonce.jpg"
                aria-label={txt.trailer_title}
              >
                <source src="/videos/bande-annonce.mp4" type="video/mp4" />
              </video>
            </div>
        </section>

        {/* ── Tournois ────────────────────────────────────────────────── */}
        <section id="tournois" className="vt-section">
          <div className="vt-duo">
            <div className="vt-duo-texte">
              <h2 className="vt-h2">{txt.f4_title}</h2>
              <p className="vt-corps">{txt.f4_desc}</p>
            </div>
            <figure className="vt-tournoi">
              <div className="vt-tournoi-cadre">
                <TournamentStandings factionHeroUrls={factionHeroUrls} factionNames={vocab.factions} />
              </div>
              {/* Les joueurs du tableau sont fictifs : on le dit. */}
              <figcaption>{txt.f4_example}</figcaption>
            </figure>
          </div>
        </section>

        {/* ── Clôture ─────────────────────────────────────────────────── */}
        <section className="vt-section vt-fin">
          <Frise affiches={frise} />
          <h2 className="vt-h2">{txt.cta_title}</h2>
          <p className="vt-corps">{txt.cta_sub}</p>
          <div className="vt-actions">
            <Link href="/login" className="vt-btn vt-btn--lg">{txt.cta_btn}</Link>
          </div>
        </section>
      </main>

      <footer className="vt-pied">
        <span>{txt.footer} — {new Date().getFullYear()}</span>
        {/* Accès aux mentions légales depuis la vitrine publique : c'est la
            seule page qu'un visiteur non connecté atteint avant /login. */}
        <nav aria-label={messages.legal.cgu_title}>
          <Link href="/legal/cgu">{messages.legal.cgu_title}</Link>
          <Link href="/legal/confidentialite">{messages.legal.privacy_title}</Link>
        </nav>
      </footer>
    </div>
  );
}

/** « 100 exemplaires », « Exemplaire unique », ou rien si la carte n'est pas
 *  en tirage limité. */
function tirage(c: Card, txt: Dict, locale: string): string {
  const n = !c.set_id && c.card_year && c.rarity ? LIMITED_PRINT_COUNTS[c.rarity] : undefined;
  if (!n) return "";
  return n === 1 ? txt.limited_unique : txt.limited_run.replace("{count}", new Intl.NumberFormat(locale).format(n));
}

const RANG: Record<string, number> = { "Légendaire": 0, "Épique": 1, Rare: 2, "Peu Commune": 3, Commune: 4 };
function rang(c: Card): number {
  // Une créature d'abord : une action montre moins bien le code d'icônes.
  return (RANG[c.rarity ?? ""] ?? 9) + (c.card_type === "creature" ? 0 : 10);
}

// ─── Factions ──────────────────────────────────────────────────────────────

function FactionsSection({
  txt, vocab, factionArt, factionHeroUrls,
}: {
  txt: Dict;
  vocab: Vocab;
  factionArt: Record<string, string>;
  factionHeroUrls: Record<string, string>;
}) {
  // UNE requête pour les neuf affiches. Silencieuse pour un visiteur anonyme :
  // sans compte, il n'y a aucune possession à montrer.
  const possession = useFactionOwnership();
  const tBadge = useTranslations("faction_action");
  const [ouverte, setOuverte] = useState<string>(SHOWCASE_FACTIONS[0]);

  return (
    // `id="factions"` : cible du « Voir les autres factions » depuis une page
    // de faction — on revient à la rangée, pas en haut de l'accueil.
    <section id="factions" className="vt-section">
      <h2 className="vt-h2">{txt.factions_title}</h2>
      <p className="vt-corps">{txt.factions_sub}</p>

      <div className="vt-factions">
        {SHOWCASE_FACTIONS.map((factionId) => {
          // Repli sur le nom FR du moteur si la locale n'a pas l'entrée : une
          // faction fraîchement ajoutée s'affiche, elle n'échoue pas.
          const nom = vocab.factions?.[factionId]?.displayName ?? FACTIONS[factionId].displayName;
          const repli = `/images/banners/${BANNIERE_DE_REPLI[factionId] ?? "default"}.svg`;
          const image = factionArt[factionId] ?? factionHeroUrls[factionId] ?? repli;
          const p = possession?.get(factionId);
          return (
            <Link
              key={factionId}
              // L'adresse est dérivée de l'ID, jamais du nom affiché : celui-ci
              // change avec la langue du visiteur.
              href={`/factions/${factionSlug(factionId)}`}
              className="vt-faction"
              data-ouverte={ouverte === factionId}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setOuverte(factionId); }}
              onFocus={() => setOuverte(factionId)}
            >
              <Image src={image} alt="" fill sizes="(max-width: 899px) 72vw, 34vw" />
              {/* Ne s'affiche que si l'on SAIT : pour un visiteur, l'affiche
                  reste nue plutôt que de porter un badge faux. */}
              {p?.owned && (
                <span className="vt-puce vt-faction-badge">
                  {p.starter ? tBadge("badge_starter") : tBadge("badge_owned")}
                </span>
              )}
              <div className="vt-faction-texte">
                {/* Affiche repliée : le nom se lit de bas en haut, comme sur
                    une tranche. Dépliée, il passe à l'horizontale. */}
                <span className="vt-faction-dos" aria-hidden="true">{nom}</span>
                <div className="vt-faction-plus">
                  <div>
                    <h3 className="vt-faction-nom">{nom}</h3>
                    <p className="vt-faction-accroche">{txt.factions[factionId]?.tagline ?? ""}</p>
                    <span className="vt-faction-voir">
                      {txt.factions_see}
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 8h10M9 4l4 4-4 4" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
