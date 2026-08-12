"use client";

// Bandeau de news du hub joueur. Les news actives (déjà localisées côté
// serveur — cf. src/app/page.tsx) tournent en crossfade ; après
// AUTO_COLLAPSE_MS le bandeau se réduit en une fine barre cliquable qui le
// rouvre. Cliquer la news en cours ouvre /news/<slug>.
//
// Persistance :
//  - sessionStorage am-news-collapsed : rester réduit pour la session
//    (réduction auto OU manuelle) ;
//  - localStorage am-news-seen : ids déjà vus — une news active inédite force
//    la réouverture même si la session était réduite.
// Accès storage uniquement en useEffect + try/catch (SSR, navigation privée).
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

/** News prête à afficher (résolue dans la locale du joueur côté serveur). */
export interface BannerNews {
  id: number;
  slug: string;
  title: string;
  teaser: string;
  imageUrl: string | null;
}

/** Rotation entre deux news (crossfade). */
const ROTATION_MS = 8000;
/** « Quelques minutes » avant la réduction automatique. */
const AUTO_COLLAPSE_MS = 120000;
const SEEN_KEY = "am-news-seen";
const COLLAPSED_KEY = "am-news-collapsed";

function readSeenIds(): number[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === "number") : [];
  } catch {
    return [];
  }
}

// Abonnements useSyncExternalStore (SSR-safe, sans setState synchrone en effect).
const noopSubscribe = () => () => {};
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function readReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function NewsBanner({ news }: { news: BannerNews[] }) {
  const t = useTranslations("home");
  // État réduit/ouvert : null tant que ni le joueur ni le timer n'ont tranché —
  // on retombe alors sur l'état mémorisé (session réduite SAUF news inédite).
  // Serveur : réduit (pas de flash d'un bandeau qui se refermerait).
  const [userChoice, setUserChoice] = useState<"open" | "collapsed" | null>(null);
  const storedCollapsed = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        if (sessionStorage.getItem(COLLAPSED_KEY) !== "1") return false;
        const seen = new Set(readSeenIds());
        return !news.some((n) => !seen.has(n.id));
      } catch {
        return false;
      }
    },
    () => true,
  );
  const collapsed = userChoice === null ? storedCollapsed : userChoice === "collapsed";
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markSeen = useCallback(() => {
    try {
      const seen = new Set(readSeenIds());
      for (const n of news) seen.add(n.id);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
    } catch {
      /* stockage indisponible : tant pis, purement cosmétique */
    }
  }, [news]);

  const collapse = useCallback(() => {
    setUserChoice("collapsed");
    markSeen();
    try {
      sessionStorage.setItem(COLLAPSED_KEY, "1");
    } catch {
      /* idem */
    }
  }, [markSeen]);

  const expand = useCallback(() => {
    setUserChoice("open");
    try {
      sessionStorage.removeItem(COLLAPSED_KEY);
    } catch {
      /* idem */
    }
  }, []);

  // Rotation automatique.
  useEffect(() => {
    if (collapsed || paused || reducedMotion || news.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % news.length), ROTATION_MS);
    return () => clearInterval(timer);
  }, [collapsed, paused, reducedMotion, news.length]);

  // Réduction automatique après AUTO_COLLAPSE_MS d'affichage.
  useEffect(() => {
    if (collapsed) return;
    collapseTimer.current = setTimeout(collapse, AUTO_COLLAPSE_MS);
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, [collapsed, collapse]);

  if (news.length === 0) return null;

  if (collapsed) {
    return (
      <div className="max-w-6xl mx-auto mb-8 md:mb-10">
        <button
          type="button"
          onClick={expand}
          aria-expanded={false}
          className="am-glass w-full h-9 px-4 rounded-[var(--am-r-md)] flex items-center gap-2 text-am-ink-soft hover:text-am-ink transition-colors text-sm font-[family-name:var(--font-cinzel),serif] tracking-wide cursor-pointer"
          title={t("news_banner_open")}
        >
          <span aria-hidden="true">📣</span>
          <span>{t("news_banner_label")}</span>
          <span className="ml-auto text-xs text-am-ink-faint">{news.length}</span>
        </button>
      </div>
    );
  }

  return (
    <section
      role="region"
      aria-label={t("news_banner_label")}
      className="max-w-6xl mx-auto mb-8 md:mb-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="am-glass relative overflow-hidden rounded-[var(--am-r-lg)] h-32 md:h-44">
        {/* Couches de news superposées — crossfade sur opacity. */}
        {news.map((n, i) => (
          <div
            key={n.id}
            aria-hidden={i !== index}
            className="absolute inset-0"
            style={{
              opacity: i === index ? 1 : 0,
              transition: reducedMotion ? "none" : "opacity 600ms ease",
              pointerEvents: i === index ? "auto" : "none",
            }}
          >
            {n.imageUrl ? (
              <Image
                src={n.imageUrl}
                alt=""
                fill
                sizes="(max-width: 1152px) 100vw, 1152px"
                className="object-cover"
                priority={i === 0}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(120deg, var(--am-bg-3), var(--am-arcane-deep) 55%, var(--am-bg-2))",
                }}
              />
            )}
            {/* Voile de lisibilité + texte superposé (traduit côté serveur). */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(180deg, rgba(8,7,15,0.15) 30%, rgba(8,7,15,0.85))",
              }}
            />
            <Link
              href={`/news/${n.slug}`}
              className="absolute inset-0 flex flex-col justify-end p-4 md:p-6 group"
              tabIndex={i === index ? 0 : -1}
            >
              <span className="font-[family-name:var(--font-cinzel),serif] font-bold text-am-gold-bright text-base md:text-xl leading-tight group-hover:underline decoration-am-gold/50 underline-offset-4">
                {n.title}
              </span>
              {n.teaser && (
                <span className="font-[family-name:var(--font-crimson),serif] italic text-am-ink-soft text-sm md:text-base mt-1 line-clamp-1">
                  {n.teaser}
                </span>
              )}
              <span className="sr-only">{t("news_read_more")}</span>
            </Link>
          </div>
        ))}

        {/* Bouton réduire. */}
        <button
          type="button"
          onClick={collapse}
          aria-expanded={true}
          title={t("news_banner_collapse")}
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full am-glass text-am-ink-soft hover:text-am-ink text-sm leading-none cursor-pointer"
        >
          <span aria-hidden="true">−</span>
          <span className="sr-only">{t("news_banner_collapse")}</span>
        </button>

        {/* Points de navigation. */}
        {news.length > 1 && (
          <div className="absolute bottom-2 right-3 z-10 flex gap-1.5">
            {news.map((n, i) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={n.title}
                aria-current={i === index}
                className="w-2 h-2 rounded-full transition-colors cursor-pointer"
                style={{
                  background: i === index ? "var(--am-gold)" : "var(--am-line-strong)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
