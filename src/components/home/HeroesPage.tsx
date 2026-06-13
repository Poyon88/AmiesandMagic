"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import HomeHeader from "@/components/home/HomeHeader";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import AmHeading from "@/components/ui/AmHeading";
import { useStoredLocale } from "@/lib/i18n/useLocale";
import { homeDict } from "@/lib/i18n/homeDict";
import { getFactionDisplayName } from "@/lib/card-engine/constants";

interface HeroesPageProps {
  username: string;
  goldBalance: number;
}

interface HeroRow {
  id: number;
  name: string;
  race: string | null;
  faction: string | null;
  rarity: string | null;
  thumbnail_url: string | null;
  power_name: string | null;
  power_description: string | null;
  power_image_url: string | null;
  is_default: boolean;
}

export default function HeroesPage({ username, goldBalance }: HeroesPageProps) {
  const [locale] = useStoredLocale();
  const t = homeDict[locale];

  const [heroes, setHeroes] = useState<HeroRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFaction, setSelectedFaction] = useState<string>("__all__");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/heroes/owned")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ heroes: HeroRow[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setHeroes(data.heroes);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t.heroes_load_error);
      });
    return () => {
      cancelled = true;
    };
  }, [t.heroes_load_error]);

  const factions = useMemo(() => {
    if (!heroes) return [];
    const set = new Set<string>();
    for (const h of heroes) {
      const key = h.faction ?? h.race;
      if (key) set.add(key);
    }
    return Array.from(set).sort();
  }, [heroes]);

  const visibleHeroes = useMemo(() => {
    if (!heroes) return [];
    if (selectedFaction === "__all__") return heroes;
    return heroes.filter((h) => (h.faction ?? h.race) === selectedFaction);
  }, [heroes, selectedFaction]);

  return (
    <div className="relative min-h-screen bg-am-bg-0 text-am-ink">
      <AmAtmosphere />

      <HomeHeader
        username={username}
        goldBalance={goldBalance}
        backHref="/collection-hub"
        backLabel={t.collection_title}
      />

      <main
        id="main-content"
        className="relative px-4 md:px-10 pt-28 md:pt-32 pb-20 md:pb-24 min-h-screen"
      >
        <div className="am-animate-rise mb-10 md:mb-14">
          <AmHeading as="h1" align="center">
            {t.heroes_title}
          </AmHeading>
        </div>

        {/* Faction filter */}
        {heroes && heroes.length > 0 && factions.length > 1 && (
          <div
            className="am-animate-fade max-w-5xl mx-auto mb-10 md:mb-12 flex flex-wrap items-center justify-center gap-2.5"
            style={{ animationDelay: "0.1s" }}
          >
            <button
              type="button"
              onClick={() => setSelectedFaction("__all__")}
              className={`font-display px-4 py-1.5 text-sm tracking-wide rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                selectedFaction === "__all__"
                  ? "border-am-gold bg-am-gold/20 text-am-gold-bright shadow-[0_0_18px_-4px_rgba(216,178,90,0.5)]"
                  : "border-am-gold/25 bg-am-gold/5 text-am-ink-soft hover:border-am-gold/60 hover:text-am-gold"
              }`}
              aria-pressed={selectedFaction === "__all__"}
            >
              {t.heroes_filter_all}
            </button>
            {factions.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSelectedFaction(f)}
                className={`font-display px-4 py-1.5 text-sm tracking-wide rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                  selectedFaction === f
                    ? "border-am-gold bg-am-gold/20 text-am-gold-bright shadow-[0_0_18px_-4px_rgba(216,178,90,0.5)]"
                    : "border-am-gold/25 bg-am-gold/5 text-am-ink-soft hover:border-am-gold/60 hover:text-am-gold"
                }`}
                aria-pressed={selectedFaction === f}
              >
                {getFactionDisplayName(f)}
              </button>
            ))}
          </div>
        )}

        <div className="max-w-6xl mx-auto" aria-live="polite">
          {error && (
            <p className="text-center text-am-ember mb-6" role="alert">
              {error}
            </p>
          )}
          {!heroes && !error && (
            <p className="text-center font-serif italic text-am-ink-soft">{t.heroes_loading}</p>
          )}
          {heroes && visibleHeroes.length === 0 && (
            <p className="text-center font-serif italic text-am-ink-soft">{t.heroes_empty}</p>
          )}
          {heroes && visibleHeroes.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {visibleHeroes.map((h, i) => (
                <li
                  key={h.id}
                  className="am-animate-rise"
                  style={{ animationDelay: `${Math.min(i * 0.06, 0.6)}s` }}
                >
                  <HeroCard hero={h} powerLabel={t.hero_power} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function HeroCard({ hero, powerLabel }: { hero: HeroRow; powerLabel: string }) {
  return (
    <article className="am-glass group relative overflow-hidden rounded-2xl border border-am-gold/20 transition-all duration-300 hover:border-am-gold/55 hover:-translate-y-1 hover:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.65),0_0_50px_-18px_rgba(154,107,255,0.45)]">
      {/* Gilded L-corner ornaments */}
      <div className="absolute top-3 left-3 w-7 h-7 border-t border-l border-am-gold/50 rounded-tl-sm pointer-events-none" aria-hidden="true" />
      <div className="absolute top-3 right-3 w-7 h-7 border-t border-r border-am-gold/50 rounded-tr-sm pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-3 left-3 w-7 h-7 border-b border-l border-am-gold/50 rounded-bl-sm pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-3 right-3 w-7 h-7 border-b border-r border-am-gold/50 rounded-br-sm pointer-events-none" aria-hidden="true" />

      <div className="relative z-[2] flex flex-col items-center text-center p-6 md:p-8 gap-3">
        {/* Portrait in an arcane-glow gilded frame */}
        <div className="relative w-[150px] h-[150px] md:w-[180px] md:h-[180px] rounded-full">
          <div
            className="absolute inset-0 rounded-full border border-am-gold/30 bg-am-bg-1/40 transition-all duration-300 group-hover:border-am-gold/60 group-hover:shadow-[0_0_36px_-6px_rgba(154,107,255,0.5)]"
            aria-hidden="true"
          />
          <div
            className="relative w-full h-full"
            style={{ filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.6))" }}
          >
            {hero.thumbnail_url ? (
              <Image
                src={hero.thumbnail_url}
                alt={`${hero.name} — portrait`}
                fill
                sizes="180px"
                className="object-contain"
                unoptimized
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full text-am-gold/60 text-5xl" aria-hidden="true">⚔</div>
            )}
          </div>
        </div>

        <h2
          className="am-foil-text font-display font-bold tracking-wide mt-1"
          style={{ fontSize: "clamp(18px, 1.9vw, 23px)", letterSpacing: "0.04em" }}
        >
          {hero.name}
        </h2>

        {(hero.faction || hero.race) && (
          <p className="font-serif italic text-am-arcane-bright/80 text-sm tracking-wide">
            {hero.faction ? getFactionDisplayName(hero.faction) : hero.race}
          </p>
        )}

        {/* Diamond divider before the power block */}
        {hero.power_name && (
          <div className="am-rule-diamond w-24 my-1" aria-hidden="true" />
        )}

        {hero.power_name && (
          <div className="am-gild-border w-full mt-1 px-4 py-3 rounded-lg bg-am-gold/[0.06]">
            <div className="flex items-center justify-center gap-2 mb-1.5 text-xs uppercase tracking-[0.2em] text-am-gold">
              <span aria-hidden="true">✦</span>
              <span>{powerLabel}</span>
            </div>
            <p className="font-display font-semibold text-am-ink text-sm">
              {hero.power_name}
            </p>
            {hero.power_description && (
              <p className="font-serif text-am-ink-soft text-xs mt-1.5 leading-relaxed">
                {hero.power_description}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
