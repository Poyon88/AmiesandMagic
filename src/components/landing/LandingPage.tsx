"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import type { Card } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";

// ─── Translations ───────────────────────────────────────────────────────────

type FactionDict = {
  name: string;
  tagline: string;
};

type Dict = {
  nav_play: string;
  hero_eyebrow: string;
  hero_title: string;
  hero_sub: string;
  hero_cta: string;
  hero_cta_secondary: string;
  features_title: string;
  f1_title: string; f1_desc: string;
  f2_title: string; f2_desc: string;
  f3_title: string; f3_desc: string;
  f4_title: string; f4_desc: string;
  factions_title: string;
  factions_sub: string;
  showcase_title: string;
  showcase_sub: string;
  cta_title: string;
  cta_sub: string;
  cta_btn: string;
  footer: string;
  factions: {
    humans: FactionDict;
    elves: FactionDict;
    dwarves: FactionDict;
    halflings: FactionDict;
    beastmen: FactionDict;
    giants: FactionDict;
    dark_elves: FactionDict;
    orcs_goblins: FactionDict;
    undead: FactionDict;
  };
};

const t: Record<"fr" | "en", Dict> = {
  fr: {
    nav_play: "Jouer",
    hero_eyebrow: "Fantasy TCG — Nouvelle génération",
    hero_title: "Armies & Magic",
    hero_sub: "Forge ta légende. Mène ta faction. Écris ton histoire.",
    hero_cta: "Entrer dans l'arène",
    hero_cta_secondary: "Découvrir",
    features_title: "Pourquoi Armies & Magic",
    f1_title: "La profondeur des légendes.",
    f1_desc: "Armies & Magic unit la stratégie des TCG cultes à des mécaniques pensées pour les champions d'aujourd'hui.",
    f2_title: "Toutes les cartes. Dès la première partie.",
    f2_desc: "Le mode classique est intégral dès l'installation. Explorez chaque archétype, forgez le deck qui vous ressemble.",
    f3_title: "Chaque deck Expert, une œuvre unique.",
    f3_desc: "Les cartes en tirage limité rendent chaque deck Expert singulier. Le quota commun garantit que seule votre stratégie décide.",
    f4_title: "L'arène mobile, enfin à la hauteur.",
    f4_desc: "Des tournois récompensés en cartes rares et en dotations financières — un niveau d'enjeu jusqu'ici réservé aux plus grands TCG desktop.",
    factions_title: "Neuf factions. Une légende.",
    factions_sub: "Chaque race porte sa propre voie. Laquelle sera la tienne ?",
    showcase_title: "Un bestiaire. Des milliers de combinaisons.",
    showcase_sub: "De la créature la plus humble au héros mythique, chaque carte compte.",
    cta_title: "L'arène t'attend.",
    cta_sub: "Rejoins les invocateurs dans la bataille.",
    cta_btn: "Commencer l'aventure",
    footer: "Armies & Magic — Tous droits réservés",
    factions: {
      humans: { name: "Humains", tagline: "Unis sous la bannière" },
      elves: { name: "Elfes", tagline: "Gardiens de la sylve éternelle" },
      dwarves: { name: "Nains", tagline: "Forgés dans la pierre" },
      halflings: { name: "Halflings", tagline: "Petits par la taille, grands par le cœur" },
      beastmen: { name: "Hommes-bêtes", tagline: "Fureur des terres sauvages" },
      giants: { name: "Géants", tagline: "Les montagnes se lèvent" },
      dark_elves: { name: "Elfes noirs", tagline: "Les ombres ont un nom" },
      orcs_goblins: { name: "Orcs & Gobelins", tagline: "Le cri des hordes" },
      undead: { name: "Morts-vivants", tagline: "Le silence des tombeaux s'est rompu" },
    },
  },
  en: {
    nav_play: "Play",
    hero_eyebrow: "Next-gen Fantasy TCG",
    hero_title: "Armies & Magic",
    hero_sub: "Forge your legend. Lead your faction. Write your own saga.",
    hero_cta: "Enter the arena",
    hero_cta_secondary: "Discover",
    features_title: "Why Armies & Magic",
    f1_title: "The depth of legends.",
    f1_desc: "Armies & Magic unites the strategy of iconic TCGs with mechanics built for today's champions.",
    f2_title: "Every card. From your first game.",
    f2_desc: "Classic mode is yours in full from the very start. Explore every archetype, forge the deck that fits you.",
    f3_title: "Every Expert deck, a singular work.",
    f3_desc: "Limited-print cards make every Expert deck unique. A shared quota ensures only your strategy decides.",
    f4_title: "Mobile, at last worthy of the stakes.",
    f4_desc: "Tournaments rewarded with rare cards and cash prizes — a level of stakes once reserved for desktop TCGs.",
    factions_title: "Nine factions. One legend.",
    factions_sub: "Each race walks its own path. Which will be yours?",
    showcase_title: "A bestiary. Thousands of combinations.",
    showcase_sub: "From the humblest creature to mythic heroes, every card matters.",
    cta_title: "The arena awaits.",
    cta_sub: "Join the summoners on the battlefield.",
    cta_btn: "Begin the adventure",
    footer: "Armies & Magic — All rights reserved",
    factions: {
      humans: { name: "Humans", tagline: "United under the banner" },
      elves: { name: "Elves", tagline: "Keepers of the eternal wood" },
      dwarves: { name: "Dwarves", tagline: "Forged in stone" },
      halflings: { name: "Halflings", tagline: "Small in stature, grand in heart" },
      beastmen: { name: "Beastmen", tagline: "Fury of the wild lands" },
      giants: { name: "Giants", tagline: "The mountains rise" },
      dark_elves: { name: "Dark Elves", tagline: "The shadows bear a name" },
      orcs_goblins: { name: "Orcs & Goblins", tagline: "The horde's cry" },
      undead: { name: "Undead", tagline: "The silence of tombs broken" },
    },
  },
};

type Locale = "fr" | "en";
type FactionKey = keyof Dict["factions"];

// ─── Factions catalog ──────────────────────────────────────────────────────

const FACTION_ORDER: { key: FactionKey; heroExt: "svg" | "png"; bannerExt: "svg" }[] = [
  { key: "humans", heroExt: "svg", bannerExt: "svg" },
  { key: "elves", heroExt: "png", bannerExt: "svg" },
  { key: "dwarves", heroExt: "svg", bannerExt: "svg" },
  { key: "halflings", heroExt: "svg", bannerExt: "svg" },
  { key: "beastmen", heroExt: "svg", bannerExt: "svg" },
  { key: "giants", heroExt: "svg", bannerExt: "svg" },
  { key: "dark_elves", heroExt: "svg", bannerExt: "svg" },
  { key: "orcs_goblins", heroExt: "svg", bannerExt: "svg" },
  { key: "undead", heroExt: "png", bannerExt: "svg" },
];

// ─── Locale persistence ────────────────────────────────────────────────────

const LOCALE_KEY = "am-landing-locale";
const LOCALE_EVENT = "am-landing-locale-change";

function subscribeLocale(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(LOCALE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(LOCALE_EVENT, cb);
  };
}

function readLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return v === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

function useStoredLocale(): [Locale, (l: Locale) => void] {
  const locale = useSyncExternalStore(
    subscribeLocale,
    readLocale,
    () => "fr" as Locale,
  );
  const update = useCallback((l: Locale) => {
    try {
      localStorage.setItem(LOCALE_KEY, l);
      window.dispatchEvent(new Event(LOCALE_EVENT));
    } catch {
      // ignore
    }
  }, []);
  return [locale, update];
}

// ─── Particle Canvas ───────────────────────────────────────────────────────

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let w = 0, h = 0;

    interface Particle {
      x: number; y: number; r: number; vx: number; vy: number;
      alpha: number; pulse: number; pulseSpeed: number;
    }

    const particles: Particle[] = [];

    function resize() {
      w = canvas!.width = window.innerWidth;
      h = canvas!.height = window.innerHeight;
    }

    function init() {
      resize();
      particles.length = 0;
      const count = Math.floor((w * h) / 9000);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.6 + 0.3,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.08 - 0.04,
          alpha: Math.random() * 0.5 + 0.1,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.02 + 0.005,
        });
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        const a = p.alpha * (0.5 + 0.5 * Math.sin(p.pulse));
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(200, 168, 78, ${a})`;
        ctx!.fill();
      }
      animId = requestAnimationFrame(draw);
    }

    init();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[2] pointer-events-none"
    />
  );
}

// ─── Decorative divider ────────────────────────────────────────────────────

function GoldenRule({ width = 120 }: { width?: number }) {
  return (
    <div
      className="mx-auto h-px my-6"
      style={{
        width,
        background: "linear-gradient(90deg, transparent, #c8a84e, transparent)",
      }}
    />
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

interface LandingPageProps {
  showcaseCards: Card[];
}

export default function LandingPage({ showcaseCards }: LandingPageProps) {
  const router = useRouter();
  const [locale, setLocale] = useStoredLocale();
  const [scrollY, setScrollY] = useState(0);
  const txt = t[locale];

  const handleScroll = useCallback(() => setScrollY(window.scrollY), []);
  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const features = [
    { title: txt.f1_title, desc: txt.f1_desc, accent: "sword" },
    { title: txt.f2_title, desc: txt.f2_desc, accent: "cards" },
    { title: txt.f3_title, desc: txt.f3_desc, accent: "crown" },
    { title: txt.f4_title, desc: txt.f4_desc, accent: "trophy" },
  ] as const;

  const floatingCards = useMemo(() => showcaseCards.slice(0, 3), [showcaseCards]);

  return (
    <div className="bg-[#0a0a18] text-[#e0e0e0] min-h-screen overflow-x-hidden">

      {/* ── Navbar ────────────────────────────────────────────────────── */}
      <nav
        className="fixed top-0 inset-x-0 z-[100] flex justify-between items-center px-6 md:px-10 py-4 transition-all duration-500"
        style={{
          background: scrollY > 50 ? "rgba(10, 10, 24, 0.9)" : "transparent",
          borderBottom: scrollY > 50 ? "1px solid rgba(200, 168, 78, 0.15)" : "1px solid transparent",
          boxShadow: scrollY > 50 ? "0 4px 30px rgba(0,0,0,0.4)" : "none",
        }}
      >
        <div
          className="font-[family-name:var(--font-cinzel),serif] text-xl md:text-2xl font-bold tracking-wider text-[#c8a84e]"
          style={{ textShadow: "0 0 20px rgba(200, 168, 78, 0.3)" }}
        >
          Armies & Magic
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
            className="px-3 py-1.5 text-xs md:text-sm font-semibold text-[#c8a84e] rounded-md border border-[#c8a84e]/30 bg-[#c8a84e]/10 hover:bg-[#c8a84e]/20 transition-colors"
          >
            {locale === "fr" ? "EN" : "FR"}
          </button>
          <button
            onClick={() => router.push("/login")}
            className="font-[family-name:var(--font-cinzel),serif] px-5 md:px-6 py-2 md:py-2.5 text-sm md:text-base font-bold text-[#0a0a18] rounded-lg tracking-wide transition-transform hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #c8a84e, #a08030)",
              boxShadow: "0 4px 20px rgba(200, 168, 78, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            {txt.nav_play}
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <HeroSection
        txt={txt}
        scrollY={scrollY}
        floatingCards={floatingCards}
        onPlay={() => router.push("/login")}
      />

      {/* ── Features (editorial alternating) ─────────────────────────── */}
      <FeaturesSection
        id="features"
        title={txt.features_title}
        features={features}
      />

      {/* ── Factions ─────────────────────────────────────────────────── */}
      <FactionsSection
        title={txt.factions_title}
        subtitle={txt.factions_sub}
        factionLabels={txt.factions}
      />

      {/* ── Showcase cards ───────────────────────────────────────────── */}
      {showcaseCards.length > 0 && (
        <ShowcaseSection
          title={txt.showcase_title}
          subtitle={txt.showcase_sub}
          cards={showcaseCards}
        />
      )}

      {/* ── CTA final ───────────────────────────────────────────────── */}
      <CtaFinalSection
        title={txt.cta_title}
        subtitle={txt.cta_sub}
        btn={txt.cta_btn}
        onClick={() => router.push("/login")}
      />

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="px-6 md:px-10 py-6 text-center border-t border-[#3d3d5c]/30 bg-[#08081a]">
        <p
          className="font-[family-name:var(--font-crimson),serif] text-xs md:text-sm text-[#e0e0e0]/30 m-0"
        >
          {txt.footer} — {new Date().getFullYear()}
        </p>
      </footer>

      {/* ── Global CSS keyframes ────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes scrollBounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(8px); }
        }
        @keyframes scrollDot {
          0%, 100% { opacity: 1; transform: translateY(0); }
          50% { opacity: 0.3; transform: translateY(6px); }
        }
        @keyframes floatCard {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
      `}</style>
    </div>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────

interface HeroSectionProps {
  txt: Dict;
  scrollY: number;
  floatingCards: Card[];
  onPlay: () => void;
}

function HeroSection({ txt, scrollY, floatingCards, onPlay }: HeroSectionProps) {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "25%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  const cardPositions = [
    { left: "8%", top: "18%", rot: -14, speedMul: 0.25 },
    { left: "78%", top: "22%", rot: 11, speedMul: 0.35 },
    { left: "46%", top: "68%", rot: -4, speedMul: 0.18 },
  ];

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Battlefield background with parallax */}
      <motion.div
        className="absolute inset-0 z-0"
        style={{ y: bgY }}
      >
        <Image
          src="/images/battlefield.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Heavy vertical gradient for legibility + fade to next section */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,24,0.55) 0%, rgba(10,10,24,0.35) 30%, rgba(10,10,24,0.7) 70%, #0a0a18 100%)",
          }}
        />
        {/* Radial vignette focusing the center */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 45%, transparent 0%, rgba(10,10,24,0.35) 70%, rgba(10,10,24,0.75) 100%)",
          }}
        />
      </motion.div>

      {/* Particles above the darkening overlay */}
      <ParticleCanvas />

      {/* Floating cards (foreground parallax) */}
      {floatingCards.map((card, i) => {
        const p = cardPositions[i];
        const offset = scrollY * p.speedMul;
        return (
          <div
            key={card.id}
            className="absolute z-[3] pointer-events-none will-change-transform"
            style={{
              left: p.left,
              top: p.top,
              transform: `translateY(${-offset}px) rotate(${p.rot}deg)`,
              opacity: Math.max(0, 0.4 - scrollY / 1200),
              filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.6))",
              animation: `floatCard ${6 + i}s ease-in-out infinite`,
              animationDelay: `${i * 0.7}s`,
            }}
          >
            <GameCard card={card} size="sm" disabled />
          </div>
        );
      })}

      {/* Hero content */}
      <motion.div
        className="relative z-[10] text-center px-6 max-w-5xl mx-auto"
        style={{ y: contentY, opacity: contentOpacity }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="inline-block mb-6 px-4 py-1.5 rounded-full border border-[#c8a84e]/30 bg-[#c8a84e]/5 backdrop-blur-sm"
        >
          <span className="font-[family-name:var(--font-cinzel),serif] text-[10px] md:text-xs tracking-[0.25em] uppercase text-[#c8a84e]">
            {txt.hero_eyebrow}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="font-[family-name:var(--font-cinzel),serif] font-black text-[#f1d77a] m-0 leading-[0.95]"
          style={{
            fontSize: "clamp(52px, 11vw, 140px)",
            letterSpacing: "0.04em",
            textShadow:
              "0 0 60px rgba(200, 168, 78, 0.5), 0 4px 30px rgba(0,0,0,0.9), 0 0 120px rgba(200, 168, 78, 0.2)",
          }}
        >
          {txt.hero_title}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <GoldenRule width={200} />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="font-[family-name:var(--font-crimson),serif] italic text-[#e0e0e0]/75 mt-2 mb-10"
          style={{ fontSize: "clamp(17px, 2.4vw, 24px)", letterSpacing: "0.05em" }}
        >
          {txt.hero_sub}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <button
            onClick={onPlay}
            className="font-[family-name:var(--font-cinzel),serif] px-10 py-4 text-base md:text-lg font-extrabold text-[#0a0a18] rounded-xl tracking-wide transition-transform hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #e8c664, #c8a84e 45%, #a08030)",
              boxShadow:
                "0 8px 40px rgba(200, 168, 78, 0.4), 0 0 60px rgba(200, 168, 78, 0.2), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            {txt.hero_cta}
          </button>
          <a
            href="#features"
            className="font-[family-name:var(--font-cinzel),serif] px-8 py-4 text-sm md:text-base font-semibold text-[#c8a84e] tracking-wide border border-[#c8a84e]/40 rounded-xl bg-[#0a0a18]/30 hover:bg-[#c8a84e]/10 hover:border-[#c8a84e]/70 transition-colors"
          >
            {txt.hero_cta_secondary}
          </a>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 z-[10] -translate-x-1/2"
        style={{ opacity: useTransform(scrollYProgress, [0, 0.15], [1, 0]) }}
      >
        <div
          className="flex justify-center"
          style={{ animation: "scrollBounce 2s ease-in-out infinite" }}
        >
          <div className="w-6 h-10 border-2 border-[#c8a84e]/40 rounded-full flex justify-center pt-2">
            <div
              className="w-[3px] h-2 rounded-sm bg-[#c8a84e]"
              style={{ animation: "scrollDot 2s ease-in-out infinite" }}
            />
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ─── Features ──────────────────────────────────────────────────────────────

interface FeaturesSectionProps {
  id?: string;
  title: string;
  features: readonly { title: string; desc: string; accent: string }[];
}

function FeaturesSection({ id, title, features }: FeaturesSectionProps) {
  return (
    <section
      id={id}
      className="relative px-6 md:px-10 py-24 md:py-32"
      style={{
        background:
          "linear-gradient(180deg, #0a0a18 0%, #0d0d22 40%, #0d0d22 60%, #0a0a18 100%)",
      }}
    >
      <div
        className="absolute top-0 left-[10%] right-[10%] h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(200,168,78,0.3), transparent)" }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8 }}
        className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e] text-center mb-4"
        style={{
          fontSize: "clamp(28px, 4vw, 44px)",
          letterSpacing: "0.1em",
          textShadow: "0 0 30px rgba(200, 168, 78, 0.25)",
        }}
      >
        {title}
      </motion.h2>
      <GoldenRule width={120} />

      <div className="max-w-6xl mx-auto mt-16 md:mt-24 space-y-24 md:space-y-32">
        {features.map((f, i) => (
          <FeatureBlock key={i} index={i} feature={f} />
        ))}
      </div>
    </section>
  );
}

function FeatureBlock({
  index,
  feature,
}: {
  index: number;
  feature: { title: string; desc: string; accent: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reversed = index % 2 === 1;

  return (
    <div
      ref={ref}
      className={`grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center ${
        reversed ? "md:[&>*:first-child]:order-2" : ""
      }`}
    >
      {/* Visual panel */}
      <motion.div
        initial={{ opacity: 0, x: reversed ? 40 : -40 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="relative aspect-[4/3] md:aspect-[5/4] overflow-hidden rounded-xl border border-[#c8a84e]/15"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(200,168,78,0.10) 0%, rgba(26,26,46,0.6) 50%, rgba(10,10,24,0.9) 100%)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(200,168,78,0.1)",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <FeatureGlyph accent={feature.accent} />
        </div>
        {/* Corner ornaments */}
        <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-[#c8a84e]/50" />
        <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-[#c8a84e]/50" />
        <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-[#c8a84e]/50" />
        <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-[#c8a84e]/50" />
      </motion.div>

      {/* Text panel */}
      <motion.div
        initial={{ opacity: 0, x: reversed ? -40 : 40 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
      >
        <div
          className="h-px w-16 mb-6"
          style={{ background: "linear-gradient(90deg, #c8a84e, transparent)" }}
        />
        <h3
          className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e] mb-5 leading-tight"
          style={{
            fontSize: "clamp(22px, 3vw, 34px)",
            letterSpacing: "0.02em",
            textShadow: "0 0 20px rgba(200, 168, 78, 0.15)",
          }}
        >
          {feature.title}
        </h3>
        <p
          className="font-[family-name:var(--font-crimson),serif] text-[#e0e0e0]/75 leading-relaxed"
          style={{ fontSize: "clamp(15px, 1.6vw, 18px)" }}
        >
          {feature.desc}
        </p>
      </motion.div>
    </div>
  );
}

function FeatureGlyph({ accent }: { accent: string }) {
  const common = "w-24 h-24 md:w-32 md:h-32 text-[#c8a84e]/70";
  switch (accent) {
    case "sword":
      return (
        <svg viewBox="0 0 64 64" className={common} fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M32 4 L32 44 M24 36 L40 36 M28 48 L36 48 L36 56 L28 56 Z M32 4 L28 10 M32 4 L36 10" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="32" cy="32" r="26" opacity="0.15" />
        </svg>
      );
    case "cards":
      return (
        <svg viewBox="0 0 64 64" className={common} fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="16" y="12" width="22" height="32" rx="2" transform="rotate(-10 27 28)" />
          <rect x="26" y="18" width="22" height="32" rx="2" transform="rotate(8 37 34)" />
          <circle cx="32" cy="32" r="26" opacity="0.15" />
        </svg>
      );
    case "crown":
      return (
        <svg viewBox="0 0 64 64" className={common} fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 40 L14 18 L24 30 L32 14 L40 30 L50 18 L54 40 Z" strokeLinejoin="round" />
          <path d="M10 46 L54 46" />
          <circle cx="32" cy="32" r="26" opacity="0.15" />
        </svg>
      );
    case "trophy":
      return (
        <svg viewBox="0 0 64 64" className={common} fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M20 12 L44 12 L44 28 C44 36 38 42 32 42 C26 42 20 36 20 28 Z" strokeLinejoin="round" />
          <path d="M20 18 L12 18 L12 24 C12 28 16 30 20 30 M44 18 L52 18 L52 24 C52 28 48 30 44 30" />
          <path d="M32 42 L32 50 M24 54 L40 54" strokeLinecap="round" />
          <circle cx="32" cy="32" r="26" opacity="0.15" />
        </svg>
      );
    default:
      return null;
  }
}

// ─── Factions ──────────────────────────────────────────────────────────────

interface FactionsSectionProps {
  title: string;
  subtitle: string;
  factionLabels: Dict["factions"];
}

function FactionsSection({ title, subtitle, factionLabels }: FactionsSectionProps) {
  return (
    <section
      className="relative px-6 md:px-10 py-24 md:py-32"
      style={{
        background:
          "radial-gradient(ellipse at 50% 40%, #151533 0%, #0a0a18 75%)",
      }}
    >
      <div
        className="absolute top-0 left-[10%] right-[10%] h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(200,168,78,0.3), transparent)" }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8 }}
        className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e] text-center mb-4"
        style={{
          fontSize: "clamp(28px, 4.5vw, 48px)",
          letterSpacing: "0.08em",
          textShadow: "0 0 30px rgba(200, 168, 78, 0.3)",
        }}
      >
        {title}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="font-[family-name:var(--font-crimson),serif] italic text-center text-[#e0e0e0]/55 max-w-2xl mx-auto"
        style={{ fontSize: "clamp(15px, 1.8vw, 19px)" }}
      >
        {subtitle}
      </motion.p>

      <div className="max-w-6xl mx-auto mt-14 md:mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-7">
        {FACTION_ORDER.map((f, i) => (
          <FactionCard
            key={f.key}
            index={i}
            factionKey={f.key}
            heroExt={f.heroExt}
            bannerExt={f.bannerExt}
            name={factionLabels[f.key].name}
            tagline={factionLabels[f.key].tagline}
          />
        ))}
      </div>
    </section>
  );
}

function FactionCard({
  index,
  factionKey,
  heroExt,
  bannerExt,
  name,
  tagline,
}: {
  index: number;
  factionKey: FactionKey;
  heroExt: "svg" | "png";
  bannerExt: "svg";
  name: string;
  tagline: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: "easeOut", delay: (index % 3) * 0.08 }}
      className="group relative overflow-hidden rounded-xl border border-[#c8a84e]/20 hover:border-[#c8a84e]/70 transition-all duration-500 cursor-pointer"
      style={{
        aspectRatio: "5/6",
        background:
          "linear-gradient(160deg, rgba(35,35,60,0.7) 0%, rgba(15,15,28,0.9) 100%)",
      }}
    >
      {/* Banner backdrop */}
      <div
        className="absolute inset-0 opacity-25 group-hover:opacity-40 transition-opacity duration-500"
        style={{ mixBlendMode: "luminosity" }}
      >
        <Image
          src={`/images/banners/${factionKey}.${bannerExt}`}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover object-center"
        />
      </div>

      {/* Dark overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,10,24,0.3) 0%, rgba(10,10,24,0.85) 80%)",
        }}
      />

      {/* Glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(200,168,78,0.25) 0%, transparent 60%)",
        }}
      />

      {/* Hero portrait */}
      <div className="relative z-[2] flex flex-col items-center justify-end h-full p-6 md:p-7 gap-3 transition-transform duration-500 group-hover:scale-[1.03]">
        <div className="flex-1 flex items-center justify-center pt-4">
          <div
            className="relative w-[110px] h-[110px] md:w-[140px] md:h-[140px] transition-transform duration-500 group-hover:scale-110"
            style={{ filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.7))" }}
          >
            <Image
              src={`/images/heroes/${factionKey}.${heroExt}`}
              alt={name}
              fill
              sizes="140px"
              className="object-contain"
            />
          </div>
        </div>

        <div className="text-center">
          <h3
            className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e] tracking-wider"
            style={{
              fontSize: "clamp(16px, 2vw, 21px)",
              textShadow: "0 0 15px rgba(200, 168, 78, 0.3)",
            }}
          >
            {name}
          </h3>
          <div
            className="mx-auto mt-2 h-px w-10 group-hover:w-20 transition-all duration-500"
            style={{ background: "linear-gradient(90deg, transparent, #c8a84e, transparent)" }}
          />
          <p
            className="font-[family-name:var(--font-crimson),serif] italic text-[#e0e0e0]/60 mt-2"
            style={{ fontSize: "clamp(12px, 1.3vw, 14px)" }}
          >
            {tagline}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Showcase ──────────────────────────────────────────────────────────────

interface ShowcaseSectionProps {
  title: string;
  subtitle: string;
  cards: Card[];
}

function ShowcaseSection({ title, subtitle, cards }: ShowcaseSectionProps) {
  return (
    <section
      className="relative py-24 md:py-32"
      style={{
        background:
          "radial-gradient(ellipse at 50% 50%, #141430 0%, #0a0a18 75%)",
      }}
    >
      <div
        className="absolute top-0 left-[10%] right-[10%] h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(200,168,78,0.3), transparent)" }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8 }}
        className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e] text-center mb-4 px-6"
        style={{
          fontSize: "clamp(26px, 4vw, 42px)",
          letterSpacing: "0.06em",
          textShadow: "0 0 30px rgba(200, 168, 78, 0.25)",
        }}
      >
        {title}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="font-[family-name:var(--font-crimson),serif] italic text-center text-[#e0e0e0]/55 max-w-2xl mx-auto px-6 mb-12 md:mb-16"
        style={{ fontSize: "clamp(15px, 1.8vw, 19px)" }}
      >
        {subtitle}
      </motion.p>

      {/* Horizontal scroll-snap gallery */}
      <div
        className="overflow-x-auto overflow-y-hidden pb-8"
        style={{
          scrollSnapType: "x mandatory",
          scrollbarWidth: "thin",
          scrollbarColor: "#3d3d5c #0a0a18",
        }}
      >
        <div className="flex gap-6 md:gap-8 px-6 md:px-12 pt-4 pb-2 min-w-max justify-start md:justify-center">
          {cards.map((card, i) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, delay: (i % 6) * 0.08 }}
              style={{ scrollSnapAlign: "center", scrollSnapStop: "always" }}
              className="flex-none transition-transform duration-300 hover:-translate-y-2"
            >
              <GameCard card={card} size="md" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ─────────────────────────────────────────────────────────────

interface CtaFinalSectionProps {
  title: string;
  subtitle: string;
  btn: string;
  onClick: () => void;
}

function CtaFinalSection({ title, subtitle, btn, onClick }: CtaFinalSectionProps) {
  return (
    <section
      className="relative px-6 md:px-10 py-28 md:py-40 text-center overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #0a0a18, #0b0b1f 50%, #08081a)",
      }}
    >
      {/* Radial beam of light */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 100% at 50% 50%, rgba(200,168,78,0.18) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute top-0 left-[10%] right-[10%] h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(200,168,78,0.3), transparent)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.9 }}
        className="relative z-[2]"
      >
        <h2
          className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e] mb-4 leading-tight"
          style={{
            fontSize: "clamp(32px, 5.5vw, 56px)",
            letterSpacing: "0.05em",
            textShadow: "0 0 40px rgba(200, 168, 78, 0.35)",
          }}
        >
          {title}
        </h2>
        <p
          className="font-[family-name:var(--font-crimson),serif] italic text-[#e0e0e0]/65 mb-10"
          style={{ fontSize: "clamp(16px, 2vw, 22px)" }}
        >
          {subtitle}
        </p>
        <button
          onClick={onClick}
          className="font-[family-name:var(--font-cinzel),serif] px-12 py-5 text-base md:text-lg font-extrabold text-[#0a0a18] rounded-xl tracking-wide transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #e8c664, #c8a84e 45%, #a08030)",
            boxShadow:
              "0 8px 40px rgba(200, 168, 78, 0.4), 0 0 80px rgba(200, 168, 78, 0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          {btn}
        </button>
      </motion.div>
    </section>
  );
}
