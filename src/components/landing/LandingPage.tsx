"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, useScroll, useTransform, useInView, useMotionValue, useSpring, type MotionValue } from "framer-motion";
import type { Card } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";
import LanguageSelector from "@/components/shared/LanguageSelector";
import { useMessages } from "next-intl";

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
  hero_proof: string;
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
  /** Map faction landing key → hero thumbnail URL. When a key is
   *  present the landing card uses the default hero portrait instead
   *  of the generic SVG/PNG icon under `/images/heroes/*`. */
  factionHeroUrls?: Record<string, string>;
}

export default function LandingPage({ showcaseCards, factionHeroUrls }: LandingPageProps) {
  const router = useRouter();
  // Only a boolean threshold drives the navbar chrome now — setting it to
  // the same value bails out of a re-render, so the whole tree no longer
  // re-renders on every scroll frame (the floating hero cards are driven
  // by framer motion values instead, see HeroSection).
  const [scrolled, setScrolled] = useState(false);
  // Le dico du landing vit désormais dans le namespace `landing` des catalogues
  // next-intl (rempli par le pipeline). useMessages() renvoie l'objet brut de la
  // locale active — même forme que l'ancien Dict, donc passé tel quel aux enfants.
  const txt = (useMessages() as unknown as { landing: Dict }).landing;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const features = [
    { title: txt.f1_title, desc: txt.f1_desc, accent: "sword" },
    { title: txt.f2_title, desc: txt.f2_desc, accent: "cards" },
    { title: txt.f3_title, desc: txt.f3_desc, accent: "crown" },
    { title: txt.f4_title, desc: txt.f4_desc, accent: "trophy" },
  ] as const;

  const floatingCards = useMemo(() => showcaseCards.slice(0, 3), [showcaseCards]);

  return (
    <div className="bg-am-bg-0 text-am-ink min-h-screen overflow-x-hidden">

      {/* ── Navbar ────────────────────────────────────────────────────── */}
      <nav
        className="fixed top-0 inset-x-0 z-[100] flex justify-between items-center px-6 md:px-10 py-4 transition-all duration-500"
        style={{
          background: scrolled
            ? "linear-gradient(180deg, rgba(15,13,26,0.92), rgba(8,7,15,0.84))"
            : "transparent",
          borderBottom: scrolled ? "1px solid var(--am-gild)" : "1px solid transparent",
          boxShadow: scrolled ? "0 8px 34px rgba(0,0,0,0.5)" : "none",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="grid place-items-center w-9 h-9 rounded-lg shrink-0"
            style={{
              background: "linear-gradient(135deg, #f4e09a, #d8b25a 50%, #9a7730)",
              boxShadow: "0 4px 14px rgba(216,178,90,0.35), inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
            aria-hidden="true"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1408" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" />
            </svg>
          </span>
          <div className="am-foil-text font-[family-name:var(--font-cinzel),serif] text-xl md:text-2xl font-bold tracking-wider">
            Armies &amp; Magic
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <LanguageSelector />
          <button
            onClick={() => router.push("/login")}
            className="am-btn am-btn-gold am-btn-sheen px-5 md:px-6 py-2 md:py-2.5 text-sm md:text-base"
          >
            {txt.nav_play}
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <HeroSection
        txt={txt}
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
        factionHeroUrls={factionHeroUrls}
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
        /* Slow Ken Burns drift on the battlefield backdrop */
        @keyframes heroKenBurns {
          0%   { transform: scale(1.04) translate3d(0, 0, 0); }
          50%  { transform: scale(1.11) translate3d(-1.5%, -1%, 0); }
          100% { transform: scale(1.04) translate3d(0, 0, 0); }
        }
        /* Drifting volumetric light beams */
        @keyframes heroGodrays {
          0%   { opacity: 0.35; transform: translateX(-4%) rotate(0.5deg); }
          50%  { opacity: 0.6;  transform: translateX(4%) rotate(-0.5deg); }
          100% { opacity: 0.35; transform: translateX(-4%) rotate(0.5deg); }
        }
        /* Low fog sliding across the base of the hero */
        @keyframes heroFog {
          0%   { transform: translateX(-6%); opacity: 0.5; }
          50%  { transform: translateX(6%);  opacity: 0.8; }
          100% { transform: translateX(-6%); opacity: 0.5; }
        }
        /* One-shot foil highlight sweep across the hero title */
        @keyframes heroTitleSheen {
          0%   { background-position: 220% 0; }
          100% { background-position: -120% 0; }
        }
        /* Continuous showcase marquee — the track holds two card copies, so
           translating a full -50% loops back seamlessly. */
        @keyframes showcaseMarquee {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-kenburns, .hero-godrays, .hero-fog, .hero-floatcard { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────

interface HeroSectionProps {
  txt: Dict;
  floatingCards: Card[];
  onPlay: () => void;
}

// Respect the OS "reduce motion" preference — gates the ambient animation
// (particles, Ken Burns, god-rays, pointer parallax, card float).
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

// Foreground parallax card. Depth scales how strongly it reacts to the
// cursor; the whole thing lifts + fades out as the hero scrolls away.
const CARD_SLOTS = [
  { left: "6%", top: "16%", rot: -13, depth: 1.0 },
  { left: "78%", top: "20%", rot: 12, depth: 1.2 },
  { left: "44%", top: "64%", rot: -4, depth: 0.65 },
] as const;

function FloatingCard({
  card,
  index,
  px,
  py,
  scrollProgress,
  reduced,
}: {
  card: Card;
  index: number;
  px: MotionValue<number>;
  py: MotionValue<number>;
  scrollProgress: MotionValue<number>;
  reduced: boolean;
}) {
  const slot = CARD_SLOTS[index];
  const tiltY = useTransform(px, [-0.5, 0.5], [16, -16]);
  const tiltX = useTransform(py, [-0.5, 0.5], [-11, 11]);
  const parX = useTransform(px, [-0.5, 0.5], [slot.depth * 36, slot.depth * -36]);
  const parY = useTransform(py, [-0.5, 0.5], [slot.depth * 24, slot.depth * -24]);
  const lift = useTransform(scrollProgress, [0, 1], [0, slot.depth * -260]);
  const y = useTransform([parY, lift], ([p, l]) => (p as number) + (l as number));
  const opacity = useTransform(scrollProgress, [0, 0.35], [reduced ? 0.55 : 0.9, 0]);

  return (
    <motion.div
      className="absolute z-[3] pointer-events-none will-change-transform hidden md:block"
      style={{
        left: slot.left,
        top: slot.top,
        x: parX,
        y,
        rotateX: tiltX,
        rotateY: tiltY,
        rotateZ: slot.rot,
        opacity,
        transformPerspective: 1000,
        filter: "drop-shadow(0 26px 48px rgba(0,0,0,0.62))",
      }}
    >
      <div
        className="hero-floatcard"
        style={{
          animation: reduced ? undefined : `floatCard ${6 + index}s ease-in-out infinite`,
          animationDelay: `${index * 0.7}s`,
        }}
      >
        <GameCard card={card} size="sm" disabled />
      </div>
    </motion.div>
  );
}

function HeroSection({ txt, floatingCards, onPlay }: HeroSectionProps) {
  const heroRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "22%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const scrollIndicatorOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  // Pointer parallax — normalized to [-0.5, 0.5] then spring-smoothed so
  // every depth layer eases toward the cursor instead of snapping.
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const px = useSpring(rawX, { stiffness: 55, damping: 18, mass: 0.4 });
  const py = useSpring(rawY, { stiffness: 55, damping: 18, mass: 0.4 });

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (reduced) return;
      const r = heroRef.current?.getBoundingClientRect();
      if (!r) return;
      rawX.set((e.clientX - r.left) / r.width - 0.5);
      rawY.set((e.clientY - r.top) / r.height - 0.5);
    },
    [reduced, rawX, rawY],
  );
  const handlePointerLeave = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  // Layered cursor response: deep background drifts against the pointer,
  // foreground content nudges with it, particles sit in between.
  const bgTX = useTransform(px, [-0.5, 0.5], [20, -20]);
  const bgTY = useTransform(py, [-0.5, 0.5], [14, -14]);
  const contentTX = useTransform(px, [-0.5, 0.5], [-14, 14]);
  const contentTYbase = useTransform(py, [-0.5, 0.5], [-8, 8]);
  const contentScrollY = useTransform(scrollYProgress, [0, 1], [0, 220]);
  const contentY = useTransform(
    [contentTYbase, contentScrollY],
    ([m, s]) => (m as number) + (s as number),
  );
  const particleTX = useTransform(px, [-0.5, 0.5], [-9, 9]);
  const particleTY = useTransform(py, [-0.5, 0.5], [-7, 7]);

  return (
    <section
      ref={heroRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Battlefield background: scroll parallax (outer) + cursor drift (inner) */}
      <motion.div className="absolute inset-0 z-0" style={{ y: bgY }}>
        <motion.div className="absolute inset-0" style={{ x: bgTX, y: bgTY }}>
          {/* Ken Burns lives on its own wrapper, over-sized so the slow zoom
              never reveals an edge. */}
          <div className="absolute inset-[-6%]">
            <div
              className="relative w-full h-full hero-kenburns"
              style={{ animation: reduced ? undefined : "heroKenBurns 26s ease-in-out infinite" }}
            >
              <Image
                src="/images/battlefield.jpg"
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover object-center"
              />
            </div>
          </div>
        </motion.div>

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

      {/* Drifting god-rays + low fog (ambient light, skipped under reduce-motion) */}
      {!reduced && (
        <>
          <div
            className="absolute inset-0 z-[1] pointer-events-none hero-godrays"
            style={{
              mixBlendMode: "screen",
              animation: "heroGodrays 15s ease-in-out infinite",
              background:
                "repeating-linear-gradient(102deg, transparent 0, transparent 64px, rgba(216,178,90,0.05) 78px, rgba(216,178,90,0.10) 100px, transparent 128px)",
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-1/2 z-[1] pointer-events-none hero-fog"
            style={{
              animation: "heroFog 20s ease-in-out infinite",
              background:
                "radial-gradient(ellipse 75% 100% at 50% 130%, rgba(126,116,168,0.20), transparent 72%)",
            }}
          />
        </>
      )}

      {/* Particles (gentle cursor parallax), skipped under reduce-motion */}
      {!reduced && (
        <motion.div className="absolute inset-0 z-[2]" style={{ x: particleTX, y: particleTY }}>
          <ParticleCanvas />
        </motion.div>
      )}

      {/* Floating cards (interactive foreground parallax) */}
      {floatingCards.map((card, i) => (
        <FloatingCard
          key={card.id}
          card={card}
          index={i}
          px={px}
          py={py}
          scrollProgress={scrollYProgress}
          reduced={reduced}
        />
      ))}

      {/* Hero content */}
      <motion.div
        className="relative z-[10] text-center px-6 max-w-5xl mx-auto"
        style={{ x: contentTX, y: contentY, opacity: contentOpacity }}
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

        {/* Title: entrance fade/rise (framer) + living foil sheen (CSS) */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="font-[family-name:var(--font-cinzel),serif] font-black m-0 leading-[0.95]"
          style={{
            fontSize: "clamp(52px, 11vw, 140px)",
            letterSpacing: "0.04em",
            background:
              "linear-gradient(105deg, #b0883a 0%, #d8b25a 28%, #fff3c4 46%, #f6dd8a 54%, #d8b25a 72%, #b0883a 100%)",
            backgroundSize: "220% 100%",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
            filter:
              "drop-shadow(0 4px 30px rgba(0,0,0,0.85)) drop-shadow(0 0 70px rgba(200,168,78,0.4))",
            animation: reduced ? undefined : "heroTitleSheen 7s ease-in-out infinite alternate",
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
            className="am-btn am-btn-gold am-btn-sheen px-10 py-4 text-base md:text-lg"
            style={{
              boxShadow:
                "0 8px 40px rgba(216, 178, 90, 0.4), 0 0 60px rgba(216, 178, 90, 0.2), inset 0 1px 0 rgba(255,255,255,0.3)",
            }}
          >
            {txt.hero_cta}
          </button>
          <a
            href="#features"
            className="am-btn am-btn-ghost px-8 py-4 text-sm md:text-base"
          >
            {txt.hero_cta_secondary}
          </a>
        </motion.div>

        {/* Trust chip — surfaces the "400+ free cards" value prop up front */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.1 }}
          className="mt-7 flex items-center justify-center gap-2 text-[color:var(--am-ink-soft)]"
        >
          <span aria-hidden="true" className="text-[color:var(--am-gold)]">✦</span>
          <span
            className="font-[family-name:var(--font-crimson),serif] tracking-wide"
            style={{ fontSize: "clamp(12px, 1.4vw, 15px)" }}
          >
            {txt.hero_proof}
          </span>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 z-[10] -translate-x-1/2"
        style={{ opacity: scrollIndicatorOpacity }}
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
        className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold text-center mb-4"
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
          className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold mb-5 leading-tight"
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
  switch (accent) {
    case "sword":
      return (
        <div className="relative w-full h-full">
          <Image
            src="/images/landing/gameplay.png"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain p-3 md:p-4"
            priority={false}
          />
        </div>
      );
    case "cards":
      return (
        <div className="relative w-full h-full">
          <Image
            src="/images/landing/cards-grid-v2.png"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain p-3 md:p-4"
            priority={false}
          />
        </div>
      );
    case "crown":
      return (
        <div className="relative w-full h-full">
          <Image
            src="/images/landing/expert-decks.png"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain p-3 md:p-4"
            priority={false}
          />
        </div>
      );
    case "trophy":
      return (
        <div className="relative w-full h-full">
          <Image
            src="/images/landing/leaderboard-v2.png"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain p-3 md:p-4"
            priority={false}
          />
        </div>
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
  factionHeroUrls?: Record<string, string>;
}

function FactionsSection({ title, subtitle, factionLabels, factionHeroUrls }: FactionsSectionProps) {
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
        className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold text-center mb-4"
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
            heroUrl={factionHeroUrls?.[f.key]}
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
  heroUrl,
}: {
  index: number;
  factionKey: FactionKey;
  heroExt: "svg" | "png";
  bannerExt: "svg";
  name: string;
  tagline: string;
  heroUrl?: string;
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

      {/* Hero portrait — DB-served default hero thumbnail when available,
          else the generic /images/heroes asset for that faction. The
          portrait artwork carries its own frame, so we render it as-is
          (no clipping circle / border ring) and rely on object-contain
          + a drop-shadow for depth. */}
      <div className="relative z-[2] flex flex-col items-center justify-end h-full p-6 md:p-7 gap-3 transition-transform duration-500 group-hover:scale-[1.03]">
        <div className="flex-1 flex items-center justify-center pt-4">
          <div
            className="relative w-[220px] h-[220px] md:w-[280px] md:h-[280px] transition-transform duration-500 group-hover:scale-110"
            style={{ filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.7))" }}
          >
            <Image
              src={heroUrl ?? `/images/heroes/${factionKey}.${heroExt}`}
              alt={name}
              fill
              sizes="280px"
              className="object-contain"
              unoptimized={!!heroUrl}
            />
          </div>
        </div>

        <div className="text-center">
          <h3
            className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold tracking-wider"
            style={{ fontSize: "clamp(16px, 2vw, 21px)" }}
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
  const reduced = useReducedMotion();
  // The marquee needs two identical halves so a -50% translate loops back
  // seamlessly. Each half repeats the deck enough times to comfortably
  // exceed a wide viewport — otherwise a short deck would leave a visible
  // gap mid-scroll. ~288px is a `md` card + its right margin.
  const repeatsPerHalf = Math.max(1, Math.ceil(1600 / Math.max(1, cards.length * 288)));
  const marqueeCards = Array.from({ length: repeatsPerHalf * 2 }, () => cards).flat();
  // ~4.2s of travel per card keeps it a slow parade; scale with a half's
  // width so the pixel speed stays constant whatever the deck size.
  const marqueeDuration = Math.max(24, repeatsPerHalf * cards.length * 4.2);

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
        className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold text-center mb-4 px-6"
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

      {reduced ? (
        /* Reduced-motion: a plain, manually scrollable gallery (no auto-run).
           Generous vertical padding keeps the 1.5× hover-zoom from being
           clipped by overflow-y-hidden. */
        <div
          className="overflow-x-auto overflow-y-hidden"
          style={{
            scrollSnapType: "x mandatory",
            scrollbarWidth: "thin",
            scrollbarColor: "#3d3d5c #0a0a18",
          }}
        >
          <div className="flex gap-6 md:gap-8 px-6 md:px-12 py-24 min-w-max justify-start md:justify-center">
            {cards.map((card) => (
              <div
                key={card.id}
                style={{ scrollSnapAlign: "center", scrollSnapStop: "always" }}
                className="flex-none relative z-0 hover:z-30 transition-transform duration-300 hover:-translate-y-1"
              >
                <GameCard card={card} size="md" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Auto-scrolling marquee. The `group` container pauses the track on
           hover so a card can be inspected/zoomed; edge masks fade cards in
           and out. `py-24` gives the 1.5× hover-zoom vertical breathing room
           (overflow-y stays clipped, so the padding is what prevents it being
           cut off top/bottom). */
        <div
          className="group relative overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(90deg, transparent 0%, #000 7%, #000 93%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent 0%, #000 7%, #000 93%, transparent 100%)",
          }}
        >
          <div
            className="flex py-24 w-max will-change-transform group-hover:[animation-play-state:paused]"
            style={{ animation: `showcaseMarquee ${marqueeDuration}s linear infinite` }}
          >
            {marqueeCards.map((card, i) => (
              <div
                key={`${card.id}-${i}`}
                aria-hidden={i >= cards.length}
                // Per-card right margin (not flex `gap`) so one full copy's
                // width equals exactly the -50% translation → seamless loop.
                // relative + hover:z lifts the hovered card above its
                // neighbours so the 1.5× zoom is never overlapped.
                className="flex-none mr-6 md:mr-8 relative z-0 hover:z-30 transition-transform duration-300 hover:-translate-y-1"
              >
                <GameCard card={card} size="md" />
              </div>
            ))}
          </div>
        </div>
      )}
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
          className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold mb-4 leading-tight"
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
          className="am-btn am-btn-gold am-btn-sheen px-12 py-5 text-base md:text-lg"
          style={{
            boxShadow:
              "0 8px 40px rgba(216, 178, 90, 0.4), 0 0 80px rgba(216, 178, 90, 0.25), inset 0 1px 0 rgba(255,255,255,0.3)",
          }}
        >
          {btn}
        </button>
      </motion.div>
    </section>
  );
}
