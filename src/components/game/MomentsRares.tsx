"use client";

// MOMENTS RARES — trois ponctuations qui rythment une partie sans la ralentir :
//   • le FACE-À-FACE des deux héros à l'ouverture ;
//   • la BANNIÈRE de tour, à chaque passage de main ;
//   • la FANFARE d'un palier de compteur (Conquête, Exploration).
//
// Comme MomentsForts : purement cosmétique, lit le store et le DOM, ne retarde
// aucun commit d'état. Tout est en `pointer-events: none` — rien ici ne bloque
// un clic — et sauté sous `prefers-reduced-motion`.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store/gameStore";
import { emitImpact } from "@/lib/fx/impactFx";
import { overlayRect } from "@/lib/fx/overlayMotion";
import { FACTIONS } from "@/lib/card-engine/constants";
import { MAX_CONQUETE, MAX_EPARGNE, MAX_FOI, MAX_INVENTIONS_MACHINE } from "@/lib/game/constants";
import type { HeroDefinition } from "@/lib/game/types";
import { useVocab } from "@/i18n/useVocab";
import { useHeroText } from "@/i18n/useHeroText";
import { HERO_IMAGES } from "./HeroPowerOverlay";

const CINZEL = "var(--font-cinzel), 'Cinzel', serif";

// ─── Face-à-face d'ouverture ─────────────────────────────────────────────────

const VERSUS_MS = 3000;

function Combattant({ heros, cote }: { heros: HeroDefinition | null; cote: "gauche" | "droite" }) {
  const vocab = useVocab();
  const { heroName } = useHeroText();
  const faction = heros?.faction ? FACTIONS[heros.faction] : undefined;
  const teinte = faction?.color ?? "#3b3355";
  const accent = faction?.accent ?? "#e8d9a8";
  const gauche = cote === "gauche";
  // Même repli que le portrait du plateau : l'image du héros, sinon celle de sa race.
  const portrait = heros?.thumbnailUrl || (heros?.race ? HERO_IMAGES[heros.race] : undefined);
  return (
    <motion.div
      style={{
        position: "absolute", top: 0, bottom: 0, [gauche ? "left" : "right"]: 0, width: "58%",
        // Coupe en biais : les deux panneaux s'emboîtent sur une diagonale.
        clipPath: gauche ? "polygon(0 0, 100% 0, 72% 100%, 0 100%)" : "polygon(28% 0, 100% 0, 100% 100%, 0 100%)",
        background: `linear-gradient(${gauche ? 110 : 250}deg, ${faction?.bg ?? "#0b0a14"} 0%, ${teinte} 135%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      initial={{ x: gauche ? "-100%" : "100%" }}
      animate={{ x: 0 }}
      exit={{ x: gauche ? "-100%" : "100%", transition: { duration: 0.4, ease: "easeIn" } }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
          marginLeft: gauche ? "-14%" : "14%",
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, delay: 0.25, ease: "easeOut" }}
      >
        <div
          style={{
            width: "min(30vh, 22vw)", height: "min(30vh, 22vw)", borderRadius: "50%", overflow: "hidden",
            border: `4px solid ${accent}`,
            boxShadow: `0 0 0 2px rgba(0,0,0,0.6), 0 0 46px 6px ${accent}66`,
            background: "#0b0a14",
          }}
        >
          {portrait && (
            // Portrait déjà en cache (c'est celui du plateau) : une simple image suffit.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portrait} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: CINZEL, fontWeight: 900, fontSize: "clamp(1.4rem, 3.2vw, 2.8rem)",
              color: "#f6eedb", letterSpacing: "0.05em", textShadow: "0 3px 10px rgba(0,0,0,0.9)",
            }}
          >
            {heros ? heroName(heros) : ""}
          </div>
          {heros?.faction && (
            <div style={{ fontFamily: CINZEL, fontSize: "clamp(0.8rem, 1.3vw, 1.1rem)", color: accent, letterSpacing: "0.16em", marginTop: 6, textTransform: "uppercase" }}>
              {vocab.factionName(heros.faction)}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * FACE-À-FACE : à l'ouverture de la partie, les deux héros entrent chacun de
 * son côté et un « VS » claque au centre, par-dessus la distribution du
 * mulligan. Joué une fois par partie et par onglet : un rechargement en plein
 * mulligan ne le rejoue pas.
 */
export function VersusOverlay() {
  const phase = useGameStore((s) => s.gameState?.phase);
  const reduced = useReducedMotion();
  const [combattants, setCombattants] = useState<{ moi: HeroDefinition | null; adversaire: HeroDefinition | null } | null>(null);
  const faitRef = useRef(false);

  useEffect(() => {
    if (phase !== "mulligan" || faitRef.current) return;
    faitRef.current = true;
    if (reduced) return;
    const cle = `am-versus:${window.location.pathname}`;
    try {
      if (sessionStorage.getItem(cle)) return;
      sessionStorage.setItem(cle, "1");
    } catch { /* stockage indisponible : on joue quand même */ }
    const { gameState, localPlayerId } = useGameStore.getState();
    if (!gameState) return;
    const moi = gameState.players.find((p) => p.id === localPlayerId);
    const adversaire = gameState.players.find((p) => p.id !== localPlayerId);
    if (!moi || !adversaire) return;
    const debut = setTimeout(() => setCombattants({ moi: moi.hero.heroDefinition, adversaire: adversaire.hero.heroDefinition }), 0);
    const choc = setTimeout(() => emitImpact({
      x: window.innerWidth / 2, y: window.innerHeight / 2, amount: 12, type: "fatal",
      dirX: 0, dirY: 0, big: true,
    }), 780);
    const fin = setTimeout(() => setCombattants(null), VERSUS_MS);
    return () => { clearTimeout(debut); clearTimeout(choc); clearTimeout(fin); };
  }, [phase, reduced]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {combattants && (
        <motion.div
          key="versus"
          // Sous la couche de particules (99) pour que le choc du « VS » éclate
          // par-dessus ; au-dessus du plateau et du mulligan.
          style={{ position: "fixed", inset: 0, zIndex: 97, pointerEvents: "none", overflow: "hidden" }}
          exit={{ opacity: 0, transition: { duration: 0.45, delay: 0.1 } }}
        >
          <motion.div
            style={{ position: "absolute", inset: 0, background: "#05040a" }}
            initial={{ opacity: 0 }} animate={{ opacity: 0.92 }} transition={{ duration: 0.25 }}
          />
          <Combattant heros={combattants.moi} cote="gauche" />
          <Combattant heros={combattants.adversaire} cote="droite" />
          {/* Éclair sur la diagonale, au moment du choc. */}
          <motion.div
            style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 50%, #fff 0%, rgba(255,214,140,0.7) 18%, transparent 55%)" }}
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 0] }}
            transition={{ duration: 1.3, times: [0, 0.58, 0.63, 1], ease: "easeOut" }}
          />
          <motion.div
            style={{
              position: "absolute", left: "50%", top: "50%",
              fontFamily: CINZEL, fontWeight: 900, fontSize: "clamp(4rem, 13vw, 11rem)", lineHeight: 1,
              color: "#fff3d6", WebkitTextStroke: "2px rgba(120,60,10,0.9)",
              textShadow: "0 0 30px rgba(255,170,60,0.9), 0 0 70px rgba(255,90,30,0.6), 0 6px 0 rgba(0,0,0,0.6)",
            }}
            initial={{ x: "-50%", y: "-50%", scale: 4.5, opacity: 0, rotate: -8 }}
            animate={{ x: "-50%", y: "-50%", scale: [4.5, 0.9, 1.08, 1], opacity: [0, 1, 1, 1], rotate: [-8, 2, 0, 0] }}
            exit={{ scale: 1.6, opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.55, delay: 0.5, times: [0, 0.5, 0.75, 1], ease: "easeOut" }}
          >
            VS
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Bannière de tour ────────────────────────────────────────────────────────

const BANNIERE_MS = 1700;

/**
 * BANNIÈRE DE TOUR : une bande traverse l'écran à chaque passage de main —
 * dorée et venue de la gauche pour son propre tour, rouge sombre et venue de
 * la droite pour celui de l'adversaire. `actif` la tient muette tant que le
 * plateau n'est pas dévoilé (mulligan) ou une fois la partie finie.
 */
export function BanniereDeTour({ actif }: { actif: boolean }) {
  const t = useTranslations("game");
  const joueurCourant = useGameStore((s) => s.gameState?.currentPlayerIndex);
  const tour = useGameStore((s) => s.gameState?.turnNumber);
  const reduced = useReducedMotion();
  const [banniere, setBanniere] = useState<{ cle: string; mien: boolean } | null>(null);
  const dernierRef = useRef<string | null>(null);

  useEffect(() => {
    if (!actif || joueurCourant == null) return;
    const cle = `${tour}-${joueurCourant}`;
    if (cle === dernierRef.current) return;
    dernierRef.current = cle;
    if (reduced) return;
    const { gameState, localPlayerId } = useGameStore.getState();
    if (!gameState || gameState.phase !== "playing") return;
    const mien = gameState.players[joueurCourant]?.id === localPlayerId;
    const debut = setTimeout(() => setBanniere({ cle, mien }), 0);
    const fin = setTimeout(() => setBanniere((b) => (b?.cle === cle ? null : b)), BANNIERE_MS);
    return () => { clearTimeout(debut); clearTimeout(fin); };
  }, [actif, joueurCourant, tour, reduced]);

  if (typeof document === "undefined") return null;
  const mien = banniere?.mien ?? true;
  const trait = mien ? "#e8c45a" : "#d05a4a";
  const fond = mien ? "rgba(46,32,6,0.92)" : "rgba(44,10,10,0.92)";

  return createPortal(
    <AnimatePresence>
      {banniere && (
        <motion.div
          key={banniere.cle}
          // Sous les modales (z 50) : une Découverte de début de tour reste lisible.
          style={{
            position: "fixed", left: 0, right: 0, top: "41%", height: "clamp(64px, 11vh, 110px)",
            zIndex: 45, pointerEvents: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `linear-gradient(90deg, transparent 0%, ${fond} 18%, ${fond} 82%, transparent 100%)`,
            borderTop: `2px solid ${trait}`, borderBottom: `2px solid ${trait}`,
            boxShadow: `0 0 40px 4px ${trait}44`,
            transformOrigin: mien ? "0% 50%" : "100% 50%",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          exit={{ opacity: 0, scaleY: 0.2, transition: { duration: 0.3, ease: "easeIn" } }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.span
            style={{
              fontFamily: CINZEL, fontWeight: 900, fontSize: "clamp(1.5rem, 4.4vw, 3.4rem)",
              color: mien ? "#fff3d0" : "#ffd9d2", textTransform: "uppercase",
              textShadow: `0 0 18px ${trait}, 0 3px 6px rgba(0,0,0,0.9)`, whiteSpace: "nowrap",
            }}
            initial={{ x: mien ? -140 : 140, opacity: 0, letterSpacing: "0.5em" }}
            animate={{ x: 0, opacity: 1, letterSpacing: "0.14em" }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          >
            {mien ? t("turn_banner_mine") : t("turn_banner_theirs")}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Fanfare des paliers de compteur ─────────────────────────────────────────

const FANFARE_MS = 1500;
type Compteur = "conquete" | "exploration" | "invention" | "epargne" | "foi";
const TEINTES: Record<Compteur, { hex: string; rgb: [number, number, number] }> = {
  conquete: { hex: "#f5a524", rgb: [245, 165, 36] },
  exploration: { hex: "#2dd4bf", rgb: [45, 212, 191] },
  invention: { hex: "#ff9f43", rgb: [255, 159, 67] },
  epargne: { hex: "#f1c40f", rgb: [241, 196, 15] },
  foi: { hex: "#bfdbfe", rgb: [191, 219, 254] },
};

/** Centre du médaillon d'un compteur dans l'orbite du héros ; à défaut (le
 *  médaillon d'Exploration disparaît quand il retombe à 0, pile au palier),
 *  le flanc de l'orbite elle-même. */
function ancreCompteur(compteur: Compteur, cote: "mine" | "theirs"): { x: number; y: number } | null {
  for (const el of Array.from(document.querySelectorAll(`[data-${compteur}-badge="${cote}"]`))) {
    const r = overlayRect(el);
    if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  for (const el of Array.from(document.querySelectorAll(`[data-hero-orbit="${cote}"]`))) {
    const r = overlayRect(el);
    if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}

interface Fanfare { cle: string; x: number; y: number; hex: string }

/**
 * FANFARE : quand un compteur atteint son palier — la Conquête arrive à son
 * maximum, l'Exploration boucle et fait piocher, la machine reçoit sa dernière
 * Invention — des rayons jaillissent du
 * médaillon et deux ondes en partent. Le « +N » ordinaire (EpargneGainOverlay)
 * continue de signaler chaque gain ; ceci ne marque que le palier.
 */
export function PalierOverlay() {
  const joueurs = useGameStore((s) => s.gameState?.players);
  const reduced = useReducedMotion();
  const [fanfares, setFanfares] = useState<Fanfare[]>([]);
  const avantRef = useRef<Record<string, { conquete: number; exploration: number; invention: number; epargne: number; foi: number }> | null>(null);
  const serieRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { for (const t of timersRef.current) clearTimeout(t); }, []);

  useEffect(() => {
    if (!joueurs) return;
    const avant = avantRef.current;
    const maintenant: Record<string, { conquete: number; exploration: number; invention: number; epargne: number; foi: number }> = {};
    for (const j of joueurs) maintenant[j.id] = { conquete: j.conquete ?? 0, exploration: j.exploration ?? 0, invention: j.machine?.inventions ?? 0, epargne: j.epargne ?? 0, foi: j.foi ?? 0 };
    avantRef.current = maintenant;
    if (!avant || reduced) return; // première observation : rien à comparer

    const localPlayerId = useGameStore.getState().localPlayerId;
    const atteints: Array<{ compteur: Compteur; cote: "mine" | "theirs" }> = [];
    for (const j of joueurs) {
      const a = avant[j.id];
      const m = maintenant[j.id];
      if (!a) continue;
      const cote = j.id === localPlayerId ? "mine" : "theirs";
      if (a.conquete < MAX_CONQUETE && m.conquete >= MAX_CONQUETE) atteints.push({ compteur: "conquete", cote });
      // Réserves : à leur plafond (Épargne 8, Foi 10). Redescendre puis y
      // revenir rejoue la fanfare.
      if (a.epargne < MAX_EPARGNE && m.epargne >= MAX_EPARGNE) atteints.push({ compteur: "epargne", cote });
      if (a.foi < MAX_FOI && m.foi >= MAX_FOI) atteints.push({ compteur: "foi", cote });
      // Machine complète : elle ne peut plus recevoir d'Invention.
      if (a.invention < MAX_INVENTIONS_MACHINE && m.invention >= MAX_INVENTIONS_MACHINE) atteints.push({ compteur: "invention", cote });
      // L'Exploration ne fait que monter : si elle baisse, c'est qu'elle a bouclé.
      if (a.exploration > 0 && m.exploration < a.exploration) atteints.push({ compteur: "exploration", cote });
    }
    if (atteints.length === 0) return;

    // Un instant de délai : le médaillon vient parfois d'être monté par ce rendu.
    timersRef.current.push(setTimeout(() => {
      const nouvelles: Fanfare[] = [];
      for (const { compteur, cote } of atteints) {
        const pos = ancreCompteur(compteur, cote);
        if (!pos) continue;
        const teinte = TEINTES[compteur];
        nouvelles.push({ cle: `${++serieRef.current}`, x: pos.x, y: pos.y, hex: teinte.hex });
        emitImpact({
          x: pos.x, y: pos.y, amount: 0, type: "summon_unique", palier: 4,
          dirX: 0, dirY: 0, big: true, teinte: teinte.rgb,
        });
      }
      if (nouvelles.length === 0) return;
      setFanfares((prev) => [...prev, ...nouvelles]);
      timersRef.current.push(setTimeout(
        () => setFanfares((prev) => prev.filter((f) => !nouvelles.includes(f))),
        FANFARE_MS,
      ));
    }, 60));
  }, [joueurs, reduced]);

  if (fanfares.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 98 }}>
      {fanfares.map((f) => (
        <div key={f.cle}>
          {/* Rayons : un disque en éventail qui tourne en s'ouvrant. */}
          <motion.div
            style={{
              position: "absolute", left: f.x - 150, top: f.y - 150, width: 300, height: 300, borderRadius: "50%",
              background: `repeating-conic-gradient(from 0deg, ${f.hex}cc 0deg 7deg, transparent 7deg 22deg)`,
              WebkitMaskImage: "radial-gradient(circle, transparent 12%, #000 22%, transparent 68%)",
              maskImage: "radial-gradient(circle, transparent 12%, #000 22%, transparent 68%)",
              mixBlendMode: "screen",
            }}
            initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
            animate={{ opacity: [0, 1, 0.8, 0], scale: [0.2, 1, 1.15, 1.3], rotate: 70 }}
            transition={{ duration: FANFARE_MS / 1000, times: [0, 0.18, 0.6, 1], ease: "easeOut" }}
          />
          {[0, 1].map((i) => (
            <motion.div
              key={i}
              style={{
                position: "absolute", left: f.x - 60, top: f.y - 60, width: 120, height: 120, borderRadius: "50%",
                border: `3px solid ${i === 0 ? "#fff7d6" : f.hex}`,
                boxShadow: `0 0 20px 3px ${f.hex}aa`,
              }}
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 1, 0], scale: [0.2, 1.1 + i * 0.3, 1.9 + i * 0.5] }}
              transition={{ duration: 0.9, delay: 0.08 + i * 0.16, times: [0, 0.25, 1], ease: "easeOut" }}
            />
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ─── Héros en danger ─────────────────────────────────────────────────────────

/** Part des PV de départ sous laquelle un héros est « en danger ». */
export const SEUIL_DANGER = 0.25;
export function herosEnDanger(pv: number, pvMax: number): boolean {
  return pv > 0 && pvMax > 0 && pv <= pvMax * SEUIL_DANGER;
}

/**
 * HÉROS EN DANGER : quand SON propre héros passe sous le quart de ses PV, les
 * bords de l'écran rougissent et battent comme un cœur. Rien pour le héros
 * adverse ici — c'est son médaillon qui pulse (cf. HeroPortrait), pas l'écran :
 * l'alarme plein écran est réservée à ce qui vous menace.
 *
 * Une seule couche fixe animée en CSS sur l'opacité : aucun coût par image.
 */
export function DangerOverlay({ actif }: { actif: boolean }) {
  const enDanger = useGameStore((s) => {
    const moi = s.gameState?.players.find((p) => p.id === s.localPlayerId);
    return !!moi && s.gameState?.phase === "playing" && herosEnDanger(moi.hero.hp, moi.hero.maxHp);
  });
  if (!actif || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {enDanger && (
        <motion.div
          key="danger"
          aria-hidden
          // Sous les bandeaux et les modales (z 50), au-dessus du plateau.
          style={{ position: "fixed", inset: 0, zIndex: 44, pointerEvents: "none" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div
            className="danger-anim"
            style={{
              position: "absolute", inset: 0,
              // Le centre reste intact : on ne voile jamais les cartes.
              background: "radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(150, 12, 18, 0.34) 82%, rgba(110, 0, 8, 0.62) 100%)",
              boxShadow: "inset 0 0 120px 30px rgba(170, 14, 22, 0.42)",
              animation: "danger-coeur 1.25s ease-in-out infinite",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
