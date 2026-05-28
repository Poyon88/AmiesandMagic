"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import HomeHeader from "@/components/home/HomeHeader";
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
    <div className="min-h-screen bg-[#0a0a18] text-[#e0e0e0]">
      <HomeHeader
        username={username}
        goldBalance={goldBalance}
        backHref="/collection-hub"
        backLabel={t.collection_title}
      />

      <main
        id="main-content"
        className="relative px-4 md:px-10 pt-28 md:pt-32 pb-16 min-h-screen"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(21,21,51,0.95) 0%, #0a0a18 75%)",
        }}
      >
        <div className="text-center mb-8 md:mb-12">
          <h1
            className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e]"
            style={{
              fontSize: "clamp(32px, 5vw, 52px)",
              letterSpacing: "0.06em",
              textShadow: "0 0 28px rgba(200, 168, 78, 0.3)",
            }}
          >
            {t.heroes_title}
          </h1>
          <div
            className="mx-auto mt-4 h-px w-28"
            style={{ background: "linear-gradient(90deg, transparent, #c8a84e, transparent)" }}
            aria-hidden="true"
          />
        </div>

        {/* Faction filter */}
        {heroes && heroes.length > 0 && factions.length > 1 && (
          <div className="max-w-5xl mx-auto mb-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedFaction("__all__")}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a84e] ${
                selectedFaction === "__all__"
                  ? "border-[#c8a84e] bg-[#c8a84e]/20 text-[#c8a84e]"
                  : "border-[#c8a84e]/25 bg-[#c8a84e]/5 text-[#e0e0e0]/70 hover:border-[#c8a84e]/60"
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
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a84e] ${
                  selectedFaction === f
                    ? "border-[#c8a84e] bg-[#c8a84e]/20 text-[#c8a84e]"
                    : "border-[#c8a84e]/25 bg-[#c8a84e]/5 text-[#e0e0e0]/70 hover:border-[#c8a84e]/60"
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
            <p className="text-center text-[#e74c3c] mb-6" role="alert">
              {error}
            </p>
          )}
          {!heroes && !error && (
            <p className="text-center text-[#e0e0e0]/60">{t.heroes_loading}</p>
          )}
          {heroes && visibleHeroes.length === 0 && (
            <p className="text-center text-[#e0e0e0]/60">{t.heroes_empty}</p>
          )}
          {heroes && visibleHeroes.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-7">
              {visibleHeroes.map((h) => (
                <li key={h.id}>
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
    <article
      className="relative overflow-hidden rounded-2xl border border-[#c8a84e]/20 hover:border-[#c8a84e]/55 transition-colors"
      style={{
        background:
          "linear-gradient(160deg, rgba(35,35,60,0.7) 0%, rgba(15,15,28,0.92) 100%)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
      }}
    >
      <div className="absolute top-3 left-3 w-7 h-7 border-t-2 border-l-2 border-[#c8a84e]/50" aria-hidden="true" />
      <div className="absolute top-3 right-3 w-7 h-7 border-t-2 border-r-2 border-[#c8a84e]/50" aria-hidden="true" />
      <div className="absolute bottom-3 left-3 w-7 h-7 border-b-2 border-l-2 border-[#c8a84e]/50" aria-hidden="true" />
      <div className="absolute bottom-3 right-3 w-7 h-7 border-b-2 border-r-2 border-[#c8a84e]/50" aria-hidden="true" />

      <div className="relative z-[2] flex flex-col items-center text-center p-5 md:p-7 gap-3">
        <div
          className="relative w-[140px] h-[140px] md:w-[180px] md:h-[180px]"
          style={{ filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.6))" }}
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
            <div className="flex items-center justify-center w-full h-full text-[#c8a84e]/60 text-5xl" aria-hidden="true">⚔</div>
          )}
        </div>

        <h2
          className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e] tracking-wide"
          style={{
            fontSize: "clamp(17px, 1.8vw, 22px)",
            textShadow: "0 0 14px rgba(200, 168, 78, 0.25)",
          }}
        >
          {hero.name}
        </h2>

        {(hero.faction || hero.race) && (
          <p className="font-[family-name:var(--font-crimson),serif] italic text-[#e0e0e0]/60 text-sm">
            {hero.faction ? getFactionDisplayName(hero.faction) : hero.race}
          </p>
        )}

        {hero.power_name && (
          <div
            className="w-full mt-2 px-3 py-2 rounded-lg border border-[#c8a84e]/20"
            style={{ background: "rgba(200,168,78,0.06)" }}
          >
            <div className="flex items-center justify-center gap-2 mb-1 text-xs uppercase tracking-wider text-[#c8a84e]/80">
              <span aria-hidden="true">✦</span>
              <span>{powerLabel}</span>
            </div>
            <p className="font-[family-name:var(--font-cinzel),serif] font-semibold text-[#e0e0e0] text-sm">
              {hero.power_name}
            </p>
            {hero.power_description && (
              <p className="font-[family-name:var(--font-crimson),serif] text-[#e0e0e0]/65 text-xs mt-1 leading-relaxed">
                {hero.power_description}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
