"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Card } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";

// ─── Translations ───────────────────────────────────────────────────────────

const t = {
  fr: {
    nav_play: "Jouer",
    hero_title: "Armies & Magic",
    hero_sub: "Le jeu de cartes à collectionner fantasy",
    hero_cta: "Jouer maintenant",
    features_title: "Pourquoi Armies & Magic ?",
    f1_title: "Le meilleur des TCG, réinventé.",
    f1_desc: "Armies & Magic combine la profondeur stratégique des classiques du genre avec des mécaniques inédites pensées pour les joueurs d'aujourd'hui.",
    f2_title: "Jouez pleinement, dès la première partie.",
    f2_desc: "L'intégralité des cartes du mode classique vous est offerte à l'installation. Expérimentez toutes les stratégies, construisez les decks qui vous ressemblent, et plongez immédiatement dans l'essentiel : le plaisir de jouer.",
    f3_title: "Aucun deck n'est identique. Aucun joueur n'est avantagé.",
    f3_desc: "Les cartes en exemplaires limités rendent chaque deck Expert unique — et le quota commun garantit que seule votre stratégie fait la différence.",
    f4_title: "Une scène compétitive inédite sur mobile.",
    f4_desc: "Armies & Magic introduit des tournois récompensés en cartes rares et en dotations financières — un niveau d'enjeu réservé jusqu'ici aux plus grands TCG desktop. Votre maîtrise mérite mieux qu'un simple classement.",
    showcase_title: "Découvrez les cartes",
    cta_title: "Prêt à forger votre légende ?",
    cta_sub: "Rejoignez des milliers de joueurs dans l'arène.",
    cta_btn: "Commencer l'aventure",
    footer: "Armies & Magic — Tous droits réservés",
  },
  en: {
    nav_play: "Play",
    hero_title: "Armies & Magic",
    hero_sub: "A fantasy collectible card game",
    hero_cta: "Play now",
    features_title: "Why Armies & Magic?",
    f1_title: "The best of TCGs, reinvented.",
    f1_desc: "Armies & Magic combines the strategic depth of genre classics with fresh mechanics designed for today's players.",
    f2_title: "Play fully, from your first game.",
    f2_desc: "Every card in classic mode is yours from the start. Explore all strategies, build decks that match your style, and dive straight into what matters: the joy of playing.",
    f3_title: "No two decks are alike. No player has the edge.",
    f3_desc: "Limited-edition cards make every Expert deck unique — and the shared quota ensures only your strategy makes the difference.",
    f4_title: "An unprecedented competitive scene on mobile.",
    f4_desc: "Armies & Magic introduces tournaments rewarded with rare cards and cash prizes — a level of stakes previously reserved for top desktop TCGs. Your mastery deserves more than just a ranking.",
    showcase_title: "Discover the cards",
    cta_title: "Ready to forge your legend?",
    cta_sub: "Join thousands of players in the arena.",
    cta_btn: "Begin the adventure",
    footer: "Armies & Magic — All rights reserved",
  },
};

type Locale = "fr" | "en";

// ─── Particle Canvas ────────────────────────────────────────────────────────

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
      const count = Math.floor((w * h) / 8000);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.8 + 0.3,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.1 - 0.05,
          alpha: Math.random() * 0.6 + 0.1,
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
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Scroll-triggered fade-in ───────────────────────────────────────────────

function FadeInSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: `opacity 0.8s ease ${delay}s, transform 0.8s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Feature icons ──────────────────────────────────────────────────────────

const FEATURE_ICONS = ["⚔️", "🃏", "🛡️", "🏆"];

// ─── Main Component ─────────────────────────────────────────────────────────

interface LandingPageProps {
  showcaseCards: Card[];
}

export default function LandingPage({ showcaseCards }: LandingPageProps) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("fr");
  const [scrollY, setScrollY] = useState(0);
  const txt = t[locale];

  const handleScroll = useCallback(() => {
    setScrollY(window.scrollY);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const features = [
    { icon: FEATURE_ICONS[0], title: txt.f1_title, desc: txt.f1_desc },
    { icon: FEATURE_ICONS[1], title: txt.f2_title, desc: txt.f2_desc },
    { icon: FEATURE_ICONS[2], title: txt.f3_title, desc: txt.f3_desc },
    { icon: FEATURE_ICONS[3], title: txt.f4_title, desc: txt.f4_desc },
  ];

  return (
    <div style={{ background: "#0a0a18", color: "#e0e0e0", minHeight: "100vh", overflow: "hidden" }}>

      {/* ── Navbar ── */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 40px",
          background: scrollY > 50 ? "rgba(10, 10, 24, 0.95)" : "transparent",
          backdropFilter: scrollY > 50 ? "blur(12px)" : "none",
          borderBottom: scrollY > 50 ? "1px solid rgba(200, 168, 78, 0.15)" : "1px solid transparent",
          transition: "all 0.4s ease",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: 22,
            fontWeight: 700,
            color: "#c8a84e",
            letterSpacing: 1,
            textShadow: "0 0 20px rgba(200, 168, 78, 0.3)",
          }}
        >
          Armies & Magic
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
            style={{
              padding: "6px 14px",
              background: "rgba(200, 168, 78, 0.1)",
              border: "1px solid rgba(200, 168, 78, 0.3)",
              borderRadius: 6,
              color: "#c8a84e",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {locale === "fr" ? "EN" : "FR"}
          </button>
          <button
            onClick={() => router.push("/login")}
            style={{
              padding: "8px 24px",
              background: "linear-gradient(135deg, #c8a84e, #a08030)",
              border: "none",
              borderRadius: 8,
              color: "#0a0a18",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "var(--font-cinzel), serif",
              letterSpacing: 0.5,
              boxShadow: "0 4px 20px rgba(200, 168, 78, 0.3)",
              transition: "all 0.2s",
            }}
          >
            {txt.nav_play}
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section
        style={{
          position: "relative",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "radial-gradient(ellipse at 50% 30%, #1a1a3e 0%, #0d0d1a 50%, #0a0a18 100%)",
        }}
      >
        <ParticleCanvas />

        {/* Floating showcase cards in background */}
        {showcaseCards.slice(0, 5).map((card, i) => {
          const positions = [
            { left: "5%", top: "15%", rot: -12, delay: 0 },
            { left: "80%", top: "10%", rot: 8, delay: 0.5 },
            { left: "85%", top: "55%", rot: -5, delay: 1 },
            { left: "2%", top: "60%", rot: 10, delay: 1.5 },
            { left: "45%", top: "75%", rot: -3, delay: 0.8 },
          ];
          const p = positions[i];
          const parallaxOffset = scrollY * (0.1 + i * 0.03);
          return (
            <div
              key={card.id}
              style={{
                position: "absolute",
                left: p.left,
                top: p.top,
                zIndex: 2,
                transform: `rotate(${p.rot}deg) translateY(${-parallaxOffset}px)`,
                opacity: 0.25,
                filter: "blur(1px)",
                animation: `cardFloat${i} ${6 + i}s ease-in-out infinite`,
                animationDelay: `${p.delay}s`,
                pointerEvents: "none",
              }}
            >
              <GameCard card={card} size="sm" disabled />
            </div>
          );
        })}

        {/* Hero content */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            textAlign: "center",
            transform: `translateY(${scrollY * 0.2}px)`,
            opacity: Math.max(0, 1 - scrollY / 600),
          }}
        >
          {/* Decorative line */}
          <div
            style={{
              width: 60,
              height: 1,
              background: "linear-gradient(90deg, transparent, #c8a84e, transparent)",
              margin: "0 auto 20px",
            }}
          />

          <h1
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "clamp(40px, 8vw, 80px)",
              fontWeight: 900,
              color: "#c8a84e",
              letterSpacing: 4,
              lineHeight: 1.1,
              margin: 0,
              textShadow: "0 0 60px rgba(200, 168, 78, 0.4), 0 4px 30px rgba(0,0,0,0.8)",
            }}
          >
            {txt.hero_title}
          </h1>

          <p
            style={{
              fontFamily: "var(--font-crimson), serif",
              fontSize: "clamp(16px, 2.5vw, 22px)",
              color: "rgba(224, 224, 224, 0.7)",
              marginTop: 16,
              fontStyle: "italic",
              letterSpacing: 2,
            }}
          >
            {txt.hero_sub}
          </p>

          {/* Decorative line */}
          <div
            style={{
              width: 120,
              height: 1,
              background: "linear-gradient(90deg, transparent, #c8a84e55, transparent)",
              margin: "24px auto 32px",
            }}
          />

          <button
            onClick={() => router.push("/login")}
            style={{
              padding: "16px 48px",
              background: "linear-gradient(135deg, #c8a84e, #a08030)",
              border: "none",
              borderRadius: 12,
              color: "#0a0a18",
              fontWeight: 800,
              fontSize: 18,
              cursor: "pointer",
              fontFamily: "var(--font-cinzel), serif",
              letterSpacing: 1,
              boxShadow: "0 8px 40px rgba(200, 168, 78, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
              transition: "all 0.3s ease",
              position: "relative",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 12px 50px rgba(200, 168, 78, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 8px 40px rgba(200, 168, 78, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)";
            }}
          >
            {txt.hero_cta}
          </button>
        </div>

        {/* Scroll indicator */}
        <div
          style={{
            position: "absolute",
            bottom: 30,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            opacity: Math.max(0, 1 - scrollY / 200),
            animation: "scrollBounce 2s ease-in-out infinite",
          }}
        >
          <div
            style={{
              width: 24,
              height: 40,
              border: "2px solid rgba(200, 168, 78, 0.4)",
              borderRadius: 12,
              display: "flex",
              justifyContent: "center",
              paddingTop: 8,
            }}
          >
            <div
              style={{
                width: 3,
                height: 8,
                borderRadius: 2,
                background: "#c8a84e",
                animation: "scrollDot 2s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section
        style={{
          position: "relative",
          padding: "120px 40px",
          background: "linear-gradient(180deg, #0a0a18, #0f0f24 50%, #0a0a18)",
        }}
      >
        {/* Section divider */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "10%",
            right: "10%",
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.3), transparent)",
          }}
        />

        <FadeInSection>
          <h2
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 700,
              color: "#c8a84e",
              textAlign: "center",
              marginBottom: 80,
              letterSpacing: 2,
              textShadow: "0 0 30px rgba(200, 168, 78, 0.2)",
            }}
          >
            {txt.features_title}
          </h2>
        </FadeInSection>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 40,
            maxWidth: 1200,
            margin: "0 auto",
          }}
        >
          {features.map((f, i) => (
            <FadeInSection key={i} delay={i * 0.15}>
              <div
                style={{
                  padding: "40px 32px",
                  background: "linear-gradient(160deg, rgba(42, 42, 69, 0.5), rgba(26, 26, 46, 0.3))",
                  border: "1px solid rgba(61, 61, 92, 0.5)",
                  borderRadius: 16,
                  transition: "all 0.4s ease",
                  cursor: "default",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(200, 168, 78, 0.4)";
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 20px 60px rgba(0,0,0,0.3), 0 0 40px rgba(200, 168, 78, 0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(61, 61, 92, 0.5)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                {/* Glow accent */}
                <div
                  style={{
                    position: "absolute",
                    top: -1,
                    left: "20%",
                    right: "20%",
                    height: 1,
                    background: "linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.4), transparent)",
                  }}
                />
                <div style={{ fontSize: 36, marginBottom: 20 }}>{f.icon}</div>
                <h3
                  style={{
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: 17,
                    fontWeight: 700,
                    color: "#c8a84e",
                    marginBottom: 14,
                    lineHeight: 1.3,
                    letterSpacing: 0.5,
                  }}
                >
                  {f.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-crimson), serif",
                    fontSize: 16,
                    color: "rgba(224, 224, 224, 0.7)",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  {f.desc}
                </p>
              </div>
            </FadeInSection>
          ))}
        </div>
      </section>

      {/* ── Showcase Section ── */}
      {showcaseCards.length > 0 && (
        <section
          style={{
            position: "relative",
            padding: "100px 40px",
            background: "radial-gradient(ellipse at 50% 50%, #141430 0%, #0a0a18 70%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "10%",
              right: "10%",
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.3), transparent)",
            }}
          />

          <FadeInSection>
            <h2
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "clamp(28px, 4vw, 42px)",
                fontWeight: 700,
                color: "#c8a84e",
                textAlign: "center",
                marginBottom: 60,
                letterSpacing: 2,
                textShadow: "0 0 30px rgba(200, 168, 78, 0.2)",
              }}
            >
              {txt.showcase_title}
            </h2>
          </FadeInSection>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 24,
              flexWrap: "wrap",
              maxWidth: 1400,
              margin: "0 auto",
            }}
          >
            {showcaseCards.map((card, i) => (
              <FadeInSection key={card.id} delay={i * 0.1}>
                <div
                  style={{
                    transition: "transform 0.4s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-8px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <GameCard card={card} size="md" />
                </div>
              </FadeInSection>
            ))}
          </div>
        </section>
      )}

      {/* ── Final CTA Section ── */}
      <section
        style={{
          position: "relative",
          padding: "120px 40px",
          textAlign: "center",
          background: "linear-gradient(180deg, #0a0a18, #0d0d24 50%, #0a0a18)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "10%",
            right: "10%",
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.3), transparent)",
          }}
        />

        <FadeInSection>
          <h2
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "clamp(28px, 5vw, 48px)",
              fontWeight: 700,
              color: "#c8a84e",
              marginBottom: 16,
              letterSpacing: 2,
              textShadow: "0 0 40px rgba(200, 168, 78, 0.3)",
            }}
          >
            {txt.cta_title}
          </h2>
          <p
            style={{
              fontFamily: "var(--font-crimson), serif",
              fontSize: "clamp(16px, 2vw, 20px)",
              color: "rgba(224, 224, 224, 0.6)",
              fontStyle: "italic",
              marginBottom: 40,
            }}
          >
            {txt.cta_sub}
          </p>
          <button
            onClick={() => router.push("/login")}
            style={{
              padding: "18px 56px",
              background: "linear-gradient(135deg, #c8a84e, #a08030)",
              border: "none",
              borderRadius: 12,
              color: "#0a0a18",
              fontWeight: 800,
              fontSize: 20,
              cursor: "pointer",
              fontFamily: "var(--font-cinzel), serif",
              letterSpacing: 1,
              boxShadow: "0 8px 40px rgba(200, 168, 78, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 12px 50px rgba(200, 168, 78, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 8px 40px rgba(200, 168, 78, 0.35)";
            }}
          >
            {txt.cta_btn}
          </button>
        </FadeInSection>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          padding: "24px 40px",
          textAlign: "center",
          borderTop: "1px solid rgba(61, 61, 92, 0.3)",
          background: "#08081a",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-crimson), serif",
            fontSize: 13,
            color: "rgba(224, 224, 224, 0.3)",
            margin: 0,
          }}
        >
          {txt.footer} — {new Date().getFullYear()}
        </p>
      </footer>

      {/* ── CSS Animations ── */}
      <style jsx global>{`
        @keyframes scrollBounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(8px); }
        }
        @keyframes scrollDot {
          0%, 100% { opacity: 1; transform: translateY(0); }
          50% { opacity: 0.3; transform: translateY(6px); }
        }
        @keyframes cardFloat0 {
          0%, 100% { transform: rotate(-12deg) translateY(0px); }
          50% { transform: rotate(-10deg) translateY(-15px); }
        }
        @keyframes cardFloat1 {
          0%, 100% { transform: rotate(8deg) translateY(0px); }
          50% { transform: rotate(10deg) translateY(-12px); }
        }
        @keyframes cardFloat2 {
          0%, 100% { transform: rotate(-5deg) translateY(0px); }
          50% { transform: rotate(-3deg) translateY(-18px); }
        }
        @keyframes cardFloat3 {
          0%, 100% { transform: rotate(10deg) translateY(0px); }
          50% { transform: rotate(12deg) translateY(-10px); }
        }
        @keyframes cardFloat4 {
          0%, 100% { transform: rotate(-3deg) translateY(0px); }
          50% { transform: rotate(-1deg) translateY(-14px); }
        }
      `}</style>
    </div>
  );
}
