"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import HomeHeader from "@/components/home/HomeHeader";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import AmHeading from "@/components/ui/AmHeading";
import { useStoredLocale } from "@/lib/i18n/useLocale";
import { homeDict } from "@/lib/i18n/homeDict";
import { getFactionDisplayName, RARITIES } from "@/lib/card-engine/constants";
import useLongPress, { LONG_PRESS_RESET_STYLE } from "@/hooks/useLongPress";

const RARITY_COLOR: Record<string, string> = Object.fromEntries(
  RARITIES.map((r) => [r.id, r.color])
);

interface HeroesPageProps {
  username: string;
  goldBalance: number;
}

interface HeroRow {
  id: number;
  name: string;
  race: string | null;
  faction: string | null;
  clan: string | null;
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
  const [selectedClan, setSelectedClan] = useState<string>("__all__");
  const [selectedRarity, setSelectedRarity] = useState<string>("__all__");
  // Right-click on a hero card opens a popover next to it showing the power
  // visual (custom illustration, falling back to the race-generic icon).
  const [powerView, setPowerView] = useState<{ hero: HeroRow; x: number; y: number } | null>(null);

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

  // Clans restricted to the selected faction: only clans borne by heroes of
  // that faction appear, so the clan row stays relevant. With no faction
  // selected, every clan present is offered.
  const clans = useMemo(() => {
    if (!heroes) return [];
    const set = new Set<string>();
    for (const h of heroes) {
      if (!h.clan) continue;
      if (selectedFaction !== "__all__" && (h.faction ?? h.race) !== selectedFaction) continue;
      set.add(h.clan);
    }
    return Array.from(set).sort();
  }, [heroes, selectedFaction]);

  // Selecting a faction resets the clan: the previous clan may not belong to
  // the new faction, which would silently empty the grid. Event-driven (not an
  // effect) so there's no cascading re-render.
  const handleSelectFaction = (faction: string) => {
    setSelectedFaction(faction);
    setSelectedClan("__all__");
  };

  // Rarities actually present, ordered by the canonical rarity tiers.
  const rarities = useMemo(() => {
    if (!heroes) return [];
    const present = new Set<string>();
    for (const h of heroes) present.add(h.rarity ?? "Commune");
    return RARITIES.filter((r) => present.has(r.id)).map((r) => r.id);
  }, [heroes]);

  const visibleHeroes = useMemo(() => {
    if (!heroes) return [];
    return heroes.filter((h) => {
      if (selectedFaction !== "__all__" && (h.faction ?? h.race) !== selectedFaction) return false;
      if (selectedClan !== "__all__" && h.clan !== selectedClan) return false;
      if (selectedRarity !== "__all__" && (h.rarity ?? "Commune") !== selectedRarity) return false;
      return true;
    });
  }, [heroes, selectedFaction, selectedClan, selectedRarity]);

  const handleShowPower = (hero: HeroRow, rect: DOMRect) => {
    if (!hero.power_name && !hero.power_image_url) return;
    const W = 280;
    const margin = 12;
    // Prefer the right of the card, flip to its left, else center (mobile, where
    // the card spans the full width so neither side fits).
    let x: number;
    if (rect.right + margin + W <= window.innerWidth) x = rect.right + margin;
    else if (rect.left - margin - W >= 0) x = rect.left - margin - W;
    else x = (window.innerWidth - W) / 2;
    const y = Math.min(rect.top, Math.max(margin, window.innerHeight - 280));
    setPowerView({ hero, x: Math.max(margin, x), y: Math.max(margin, y) });
  };

  // Dismiss the popover on Escape, scroll, or resize (it is anchored to a
  // fixed viewport position, so it would otherwise detach from the card).
  useEffect(() => {
    if (!powerView) return;
    const close = () => setPowerView(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [powerView]);

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

        {/* Filters: faction / clan / rarity */}
        {heroes && heroes.length > 0 && (factions.length > 1 || clans.length > 0 || rarities.length > 1) && (
          <div
            className="am-animate-fade max-w-5xl mx-auto mb-10 md:mb-12 flex flex-col items-center gap-3"
            style={{ animationDelay: "0.1s" }}
          >
            {factions.length > 1 && (
              <FilterPills
                label={t.heroes_label_faction}
                allLabel={t.heroes_filter_all}
                value={selectedFaction}
                options={factions}
                onSelect={handleSelectFaction}
                display={getFactionDisplayName}
              />
            )}
            {clans.length > 0 && (
              <FilterPills
                label={t.heroes_label_clan}
                allLabel={t.heroes_filter_all}
                value={selectedClan}
                options={clans}
                onSelect={setSelectedClan}
              />
            )}
            {rarities.length > 1 && (
              <FilterPills
                label={t.heroes_label_rarity}
                allLabel={t.heroes_filter_all}
                value={selectedRarity}
                options={rarities}
                onSelect={setSelectedRarity}
                colorFor={(id) => RARITY_COLOR[id]}
              />
            )}
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
                  <HeroCard hero={h} powerLabel={t.hero_power} onShowPower={handleShowPower} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {powerView && (
        <div
          className="fixed inset-0 z-[70]"
          onClick={() => setPowerView(null)}
          onContextMenu={(e) => { e.preventDefault(); setPowerView(null); }}
        >
          <HeroPowerPopover
            hero={powerView.hero}
            x={powerView.x}
            y={powerView.y}
            powerLabel={t.hero_power}
          />
        </div>
      )}
    </div>
  );
}

function FilterPills({
  label,
  allLabel,
  value,
  options,
  onSelect,
  display = (id) => id,
  colorFor,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  display?: (id: string) => string;
  colorFor?: (id: string) => string | undefined;
}) {
  const renderPill = (id: string, text: string) => {
    const active = value === id;
    const c = active && colorFor ? colorFor(id) : undefined;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelect(id)}
        aria-pressed={active}
        style={c ? { borderColor: c, color: c, backgroundColor: `${c}22` } : undefined}
        className={`font-display px-4 py-1.5 text-sm tracking-wide rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
          active
            ? c
              ? ""
              : "border-am-gold bg-am-gold/20 text-am-gold-bright shadow-[0_0_18px_-4px_rgba(216,178,90,0.5)]"
            : "border-am-gold/25 bg-am-gold/5 text-am-ink-soft hover:border-am-gold/60 hover:text-am-gold"
        }`}
      >
        {text}
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="font-display text-am-ink-soft text-xs uppercase tracking-[0.18em] mr-1">
        {label}
      </span>
      {renderPill("__all__", allLabel)}
      {options.map((o) => renderPill(o, display(o)))}
    </div>
  );
}

function HeroCard({
  hero,
  powerLabel,
  onShowPower,
}: {
  hero: HeroRow;
  powerLabel: string;
  onShowPower: (hero: HeroRow, rect: DOMRect) => void;
}) {
  const articleRef = useRef<HTMLElement>(null);
  // Touch equivalent of right-click: a long-press opens the same power popover.
  const longPress = useLongPress(() => {
    if (articleRef.current) onShowPower(hero, articleRef.current.getBoundingClientRect());
  });
  return (
    <article
      ref={articleRef}
      {...longPress.handlers}
      onContextMenu={(e) => {
        e.preventDefault();
        onShowPower(hero, e.currentTarget.getBoundingClientRect());
      }}
      style={LONG_PRESS_RESET_STYLE}
      className="am-glass group relative overflow-hidden rounded-2xl border border-am-gold/20 transition-all duration-300 hover:border-am-gold/55 hover:-translate-y-1 hover:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.65),0_0_50px_-18px_rgba(154,107,255,0.45)]">
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

        {(hero.faction || hero.race || hero.clan) && (
          <p className="font-serif italic text-am-arcane-bright/80 text-sm tracking-wide">
            {[hero.faction ? getFactionDisplayName(hero.faction) : hero.race, hero.clan]
              .filter(Boolean)
              .join(" · ")}
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

function HeroPowerPopover({
  hero,
  x,
  y,
  powerLabel,
}: {
  hero: HeroRow;
  x: number;
  y: number;
  powerLabel: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  // Per-hero illustration wins; fall back to the race-generic power icon.
  const src = hero.power_image_url ?? (hero.race ? `/images/powers/${hero.race}.svg` : null);
  return (
    <div
      role="dialog"
      aria-label={`${powerLabel} — ${hero.power_name ?? hero.name}`}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className="am-glass am-animate-fade fixed z-[80] w-[280px] rounded-xl border border-am-gold/40 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.75)] overflow-hidden"
      style={{ left: x, top: y }}
    >
      {src && !imgFailed ? (
        <div className="relative w-full h-40 bg-am-bg-1/60">
          <Image
            src={src}
            alt={hero.power_name ?? "Pouvoir"}
            fill
            sizes="280px"
            className="object-contain"
            unoptimized
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center w-full h-40 bg-am-bg-1/60 text-am-gold/50 text-5xl" aria-hidden="true">
          ✦
        </div>
      )}
      <div className="p-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1.5 text-xs uppercase tracking-[0.2em] text-am-gold">
          <span aria-hidden="true">✦</span>
          <span>{powerLabel}</span>
        </div>
        {hero.power_name && (
          <p className="font-display font-semibold text-am-ink text-sm">{hero.power_name}</p>
        )}
        {hero.power_description && (
          <p className="font-serif text-am-ink-soft text-xs mt-1.5 leading-relaxed">
            {hero.power_description}
          </p>
        )}
      </div>
    </div>
  );
}
