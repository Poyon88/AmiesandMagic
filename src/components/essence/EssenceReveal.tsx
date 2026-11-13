"use client";

// Révélation d'une forge d'essence, en QUATRE temps : rareté → faction → clan
// → carte (ou héros). Inspiré du reveal Sorare, sans indices.
//
// Le résultat est déjà acquis côté serveur quand ce composant s'ouvre : il ne
// fait que DÉVOILER. Chaque étape avance seule (~1,6 s) ou au clic ; « Passer »
// saute directement à la carte. Fermer n'est possible qu'à la dernière étape,
// pour qu'un clic impatient n'escamote pas la carte.
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import GameCard from "@/components/cards/GameCard";
import PremiumAura from "@/components/heroes/PremiumAura";
import { HaloBloom, ExpandingRing, OrbitingSparkles, RadialFlash } from "@/components/game/OverlayPrimitives";
import { RARITY_MAP, getFactionDisplayName, getRarityLabel } from "@/lib/card-engine/constants";
import type { Card } from "@/lib/game/types";
import type { CraftResult } from "@/lib/economy/types";

const STEP_MS = 1600;
const DERNIERE = 3;

function rgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Libellé de rareté de l'étape 1 : un héros est annoncé comme tel. */
function libelleRarete(r: CraftResult): string {
  return r.kind === "hero" ? "Héros unique" : getRarityLabel(r.rarity);
}

export default function EssenceReveal({
  result,
  onClose,
}: {
  result: CraftResult;
  onClose: () => void;
}) {
  const [etape, setEtape] = useState(0);
  const rar = RARITY_MAP[result.rarity] ?? RARITY_MAP["Peu Commune"];
  const couleur = rgb(rar.color);
  // Plus la rareté est haute, plus l'effet est appuyé.
  const intensite = 1 + (rar.tier ?? 1) + (result.kind === "hero" ? 1 : 0);

  const avancer = useCallback(() => setEtape((e) => Math.min(DERNIERE, e + 1)), []);

  useEffect(() => {
    if (etape >= DERNIERE) return;
    // La première étape dure un peu plus : c'est le moment du suspense.
    const t = setTimeout(avancer, etape === 0 ? STEP_MS + 600 : STEP_MS);
    return () => clearTimeout(t);
  }, [etape, avancer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && etape >= DERNIERE) onClose();
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); avancer(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [etape, avancer, onClose]);

  const indices: { label: string; valeur: string }[] = [
    { label: "Rareté", valeur: libelleRarete(result) },
    { label: "Faction", valeur: result.faction ? getFactionDisplayName(result.faction) : "Sans faction" },
    { label: "Clan", valeur: result.clan ?? "Sans clan" },
  ];

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Révélation de la forge d'essence"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-black/90 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => (etape < DERNIERE ? avancer() : undefined)}
    >
      {/* Effets d'ambiance, rejoués à chaque étape (clé = étape). */}
      <div key={`fx-${etape}`} className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <RadialFlash color={couleur} duration={1.6} />
        <HaloBloom color={couleur} size={260 + intensite * 40} duration={1.8} />
        <ExpandingRing color={couleur} size={160} duration={1.2} />
        {etape === 0 && intensite >= 3 && (
          <OrbitingSparkles
            count={6 + intensite * 3}
            lightColor="#fff"
            hexColor={rar.color}
            baseRadius={140}
            spread={80}
          />
        )}
      </div>

      {/* Bandeau des indices déjà révélés */}
      <div className="relative z-10 mb-8 flex flex-wrap justify-center gap-3">
        {indices.slice(0, Math.min(etape + 1, 3)).map((it, i) => (
          <motion.div
            key={it.label}
            initial={{ opacity: 0, y: -14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: "backOut" }}
            className="rounded-lg border px-4 py-2 text-center"
            style={{
              borderColor: `rgba(${couleur}, 0.6)`,
              background: `rgba(${couleur}, 0.08)`,
              boxShadow: i === etape ? `0 0 24px rgba(${couleur}, 0.45)` : undefined,
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.22em] text-am-ink-3">{it.label}</div>
            <div className="font-display text-sm md:text-base" style={{ color: i === 0 ? rar.color : undefined }}>
              {it.valeur}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Scène centrale */}
      <div className="relative z-10 flex min-h-[360px] items-center justify-center">
        <AnimatePresence mode="wait">
          {etape < DERNIERE ? (
            <motion.div
              key={`etape-${etape}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.15 }}
              transition={{ duration: 0.5, ease: "backOut" }}
              className="text-center"
            >
              <div className="mb-3 text-xs uppercase tracking-[0.3em] text-am-ink-3">{indices[etape].label}</div>
              <div
                className="font-display text-4xl md:text-6xl"
                style={{ color: rar.color, textShadow: `0 0 30px rgba(${couleur}, 0.8)` }}
              >
                {indices[etape].valeur}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="objet"
              initial={{ opacity: 0, rotateY: 90, scale: 0.7 }}
              animate={{ opacity: 1, rotateY: 0, scale: 1 }}
              transition={{ duration: 0.7, ease: "backOut" }}
              className="flex flex-col items-center gap-4"
              style={{ perspective: 1000 }}
            >
              {result.kind === "card" && result.card ? (
                <GameCard
                  card={result.card as unknown as Card}
                  size="lg"
                  printNumber={result.print_number}
                  maxPrints={result.max_prints}
                  forceRarityFrame
                  disableHoverZoom
                />
              ) : result.kind === "hero" && result.hero ? (
                <PremiumAura rarete="Légendaire">
                  <div className="flex h-72 w-56 flex-col items-center justify-end overflow-hidden rounded-2xl border border-amber-300/60 bg-am-bg-1">
                    {result.hero.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.hero.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                </PremiumAura>
              ) : null}
              <div className="text-center">
                <div className="font-display text-xl text-am-ink-1">
                  {result.kind === "hero" ? result.hero?.name : (result.card as { name?: string } | undefined)?.name}
                </div>
                <div className="text-sm text-am-ink-3">
                  Exemplaire n°{result.print_number} / {result.max_prints}
                </div>
                {result.fallback && (
                  <div className="mt-1 text-xs text-am-ink-3">
                    La rareté tirée était épuisée : la forge est descendue d&apos;un cran.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-10 mt-10 flex gap-3">
        {etape < DERNIERE ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEtape(DERNIERE); }}
            className="am-btn am-btn-ghost px-4 py-2 text-xs"
          >
            Passer
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="am-btn am-btn-gold px-6 py-2 text-sm"
            autoFocus
          >
            Continuer
          </button>
        )}
      </div>
    </motion.div>
  );
}
