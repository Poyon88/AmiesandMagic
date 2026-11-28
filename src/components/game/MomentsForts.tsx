"use client";

// MOMENTS FORTS — les deux mises en scène réservées aux instants rares d'une
// partie : l'entrée en jeu d'une carte Unique et le coup fatal porté à un héros.
//
// Purement cosmétique : ces overlays LISENT le store et le DOM, ils ne retardent
// aucun commit d'état (rien ici n'est sur le chemin de `dispatchAction`). Les
// particules passent par la couche Canvas partagée (`emitImpact`), le reste est
// du DOM léger en `position: fixed`, porté dans <body> pour échapper au
// conteneur transformé du plateau.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useGameStore } from "@/lib/store/gameStore";
import { emitImpact } from "@/lib/fx/impactFx";
import { findInstanceEl, overlayRect, hashRandom, lent } from "@/lib/fx/overlayMotion";
import { FACTIONS, RARITY_MAP } from "@/lib/card-engine/constants";

/** Identifiant interne de la rareté affichée « Unique ». */
const RARETE_UNIQUE = "Légendaire";
const RARETE_EPIQUE = "Épique";
const OR_UNIQUE = RARITY_MAP[RARETE_UNIQUE]?.color ?? "#ffd54f";
const MAUVE_EPIQUE = RARITY_MAP[RARETE_EPIQUE]?.color ?? "#ce93d8";
const BLEU_RARE = RARITY_MAP["Rare"]?.color ?? "#4fc3f7";

function hexVersRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ─── Entrée d'une Unique ─────────────────────────────────────────────────────

/** Ralenti propre aux entrées. Essayé à 1,5 (50 % plus lentes) puis ramené à 1,
 *  la cadence d'origine : le ralenti pesait sur le rythme de la partie. Le
 *  réglage reste unique — faisceau, ondes, assombrissement ET particules
 *  (cf. `lenteur` de l'effet) le suivent ensemble. */
export const LENTEUR_ENTREE = 1;
const lentE = (duree: number): number => lent(duree) * LENTEUR_ENTREE;
/** Durée totale de la mise en scène d'entrée (ms). */
const ENTREE_MS = lentE(1500);
/** Laisse la carte se monter et glisser vers sa place avant de la viser. */
const ENTREE_VISEE_MS = lent(130);

interface Entree {
  key: string;
  x: number;
  y: number;
  bas: number; // ordonnée du pied de la carte (onde au sol)
  couleur: string;
  /** Unique : mise en scène complète. Épique : version courte, sans
   *  assombrissement ni secousse. */
  unique: boolean;
  /** Rare : une seule onde au sol, plus petite, sans trait de lumière. */
  rare: boolean;
}

/**
 * LE POIDS D'UNE ENTRÉE EN JEU CROÎT AVEC LA RARETÉ. Jouée une seule fois par
 * instance, qu'elle soit posée depuis la main ou invoquée par un effet.
 *  • TOUTES : poussière chassée au pied de la carte, teintée à la couleur de
 *    sa faction — plus dense à chaque palier de rareté.
 *  • RARE : une onde bleue au sol et quelques motes.
 *  • UNIQUE : le plateau s'assombrit autour de la carte, un faisceau à la
 *    couleur de sa faction s'abat, deux ondes partent au sol, le plateau
 *    tressaille.
 *  • ÉPIQUE : un trait de lumière mauve et une onde au sol — visible, mais
 *    nettement en dessous de l'Unique.
 */
export function EntreeUniqueOverlay() {
  const entryEvents = useGameStore((s) => s.entryEvents);
  const summonEvents = useGameStore((s) => s.summonEvents);
  const reduced = useReducedMotion();
  const [entrees, setEntrees] = useState<Entree[]>([]);
  // Le plateau, pour savoir QUAND la carte y est réellement : le store annonce
  // une créature jouée (entryEvents) AVANT de la poser — elle ne monte qu'en
  // phase d'impact. On garde donc l'annonce en attente jusqu'à son arrivée.
  const plateaux = useGameStore((s) => s.gameState?.players);
  const enAttenteRef = useRef<Set<string>>(new Set());
  const dejaVuesRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { for (const t of timersRef.current) clearTimeout(t); }, []);

  useEffect(() => {
    if (reduced) return;
    for (const id of [...entryEvents, ...summonEvents]) {
      // Le store repose parfois le même lot sur deux phases : une instance ne
      // fait son entrée qu'une fois.
      if (!dejaVuesRef.current.has(id)) enAttenteRef.current.add(id);
    }
    if (!plateaux || enAttenteRef.current.size === 0) return;
    for (const id of [...enAttenteRef.current]) {
      const creature = plateaux.flatMap((p) => p.board).find((c) => c.instanceId === id);
      if (!creature) continue; // pas encore posée : on réessaiera au prochain état
      enAttenteRef.current.delete(id);
      dejaVuesRef.current.add(id);
      const palier = RARITY_MAP[creature.card.rarity ?? ""]?.tier ?? 0;
      const unique = palier >= 4;
      const rare = palier === 2;
      const faction = creature.card.faction ? FACTIONS[creature.card.faction] : undefined;
      const teinteFaction = faction ? hexVersRgb(faction.accent) ?? undefined : undefined;
      const couleur = unique ? faction?.accent ?? OR_UNIQUE : rare ? BLEU_RARE : MAUVE_EPIQUE;

      timersRef.current.push(setTimeout(() => {
        const el = findInstanceEl(id);
        if (!el) return;
        const r = overlayRect(el);
        const entree: Entree = {
          key: id,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          bas: r.top + r.height,
          couleur,
          unique,
          rare,
        };
        // Poussière au pied de la carte : toutes raretés. Les Communes et Peu
        // communes s'arrêtent là — une pose sèche, sans lumière.
        timersRef.current.push(setTimeout(() => {
          emitImpact({
            x: entree.x, y: entree.bas, amount: 3 + palier * 2.2, type: "poussiere",
            dirX: 0, dirY: 0, big: false, teinte: teinteFaction, lenteur: LENTEUR_ENTREE,
          });
        }, palier >= 3 ? lentE(220) : lent(160)));
        if (palier < 2) return;
        setEntrees((prev) => [...prev, entree]);
        // L'impact : le faisceau touche la carte ~220 ms après son départ.
        timersRef.current.push(setTimeout(() => {
          emitImpact({
            x: entree.x, y: entree.y, amount: 0, type: "summon_unique",
            dirX: 0, dirY: 0, big: unique, palier,
            ...(unique ? { secousse: 6 } : {}),
            teinte: hexVersRgb(couleur) ?? undefined,
            lenteur: LENTEUR_ENTREE,
          });
        }, lentE(220)));
        timersRef.current.push(setTimeout(
          () => setEntrees((prev) => prev.filter((e) => e.key !== id)),
          ENTREE_MS + 100,
        ));
      }, ENTREE_VISEE_MS));
    }
  }, [entryEvents, summonEvents, plateaux, reduced]);

  if (entrees.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    // z 98 : sous la couche de particules (99) et les chiffres (100).
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 98 }}>
      {entrees.map((e) => (
        <div key={e.key}>
          {/* Le plateau s'efface autour de la carte (Unique seulement). */}
          {e.unique && <motion.div
            style={{
              position: "absolute", inset: 0,
              background: `radial-gradient(circle at ${e.x}px ${e.y}px, transparent 0, transparent 150px, rgba(4,3,10,0.62) 460px)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: ENTREE_MS / 1000, times: [0, 0.14, 0.62, 1], ease: "easeOut" }}
          />}
          {/* Faisceau : s'abat du haut de l'écran jusqu'au pied de la carte.
              Épique : un trait plus étroit, parti de 430 px au-dessus.
              Rare : pas de lumière, l'onde seule. */}
          {!e.rare && <motion.div
            style={{
              position: "absolute",
              left: e.x - (e.unique ? 110 : 60), width: e.unique ? 220 : 120,
              top: e.unique ? 0 : Math.max(0, e.bas - 430), height: e.unique ? e.bas : Math.min(e.bas, 430),
              ...(e.unique ? {} : { WebkitMaskImage: "linear-gradient(180deg, transparent, #000 45%)", maskImage: "linear-gradient(180deg, transparent, #000 45%)" }),
              background: `linear-gradient(90deg, transparent 0%, ${e.couleur}55 28%, #fffbe8 50%, ${e.couleur}55 72%, transparent 100%)`,
              mixBlendMode: "screen",
              transformOrigin: "50% 0%",
            }}
            initial={{ opacity: 0, scaleX: 0.05, scaleY: 0 }}
            animate={{ opacity: [0, 1, 0.85, 0], scaleX: [0.05, 0.5, 1, 0.1], scaleY: [0, 1, 1, 1] }}
            transition={{ duration: lentE(1.05), times: [0, 0.2, 0.4, 1], ease: "easeOut" }}
          />}
          {/* Onde au sol, aplatie en perspective, au pied de la carte. */}
          {(e.unique ? [0, 1] : [0]).map((i) => (
            <motion.div
              key={i}
              style={{
                position: "absolute",
                left: e.x - (e.unique ? 230 : e.rare ? 125 : 160), top: e.bas - (e.unique ? 62 : e.rare ? 34 : 44),
                width: e.unique ? 460 : e.rare ? 250 : 320, height: e.unique ? 124 : e.rare ? 68 : 88,
                borderRadius: "50%",
                border: `${e.rare ? 2 : 3}px solid ${i === 0 && !e.rare ? "#fff7d6" : e.couleur}`,
                boxShadow: `0 0 22px 4px ${e.couleur}aa, inset 0 0 18px ${e.couleur}66`,
              }}
              initial={{ opacity: 0, scale: 0.1 }}
              animate={{ opacity: [0, 0.95, 0], scale: [0.1, 0.7 + i * 0.1, 1.15 + i * 0.25] }}
              transition={{ duration: lentE(0.8), delay: lentE(0.22 + i * 0.12), times: [0, 0.2, 1], ease: "easeOut" }}
            />
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ─── Coup fatal ──────────────────────────────────────────────────────────────

/** Montée des fissures avant l'explosion (ms). */
const FATAL_CHARGE_MS = 1050;
/** Durée totale avant de rendre la main à l'écran de fin (ms). */
const FATAL_TOTAL_MS = 2400;
const NB_FISSURES = 11;

interface Vise { x: number; y: number; rayon: number }

/** Fissures déterministes rayonnant du héros : lignes brisées en 4 segments. */
function traceFissures(v: Vise): string[] {
  const traces: string[] = [];
  for (let i = 0; i < NB_FISSURES; i++) {
    const angle = (i / NB_FISSURES) * Math.PI * 2 + (hashRandom(i, 1) - 0.5) * 0.45;
    const longueur = v.rayon * (1.25 + hashRandom(i, 2) * 1.5);
    let d = "";
    for (let k = 0; k <= 4; k++) {
      // Part du bord intérieur du médaillon, dévie de plus en plus en s'éloignant.
      const dist = v.rayon * 0.25 + (longueur * k) / 4;
      const derive = k === 0 ? 0 : (hashRandom(i * 7 + k, 3) - 0.5) * 0.3;
      const px = v.x + Math.cos(angle + derive) * dist;
      const py = v.y + Math.sin(angle + derive) * dist;
      d += `${k === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)} `;
    }
    traces.push(d);
  }
  return traces;
}

interface CoupFatalProps {
  /** La mise en scène commence : le plateau peut se désaturer. */
  onDebut: () => void;
  /** La mise en scène est finie (ou n'a pas lieu) : l'écran de fin peut venir. */
  onFin: () => void;
}

/**
 * COUP FATAL : quand la partie se termine parce qu'un héros tombe à 0 PV, le
 * plateau s'éteint autour de lui, des fissures de lumière le parcourent, puis
 * il explose — et seulement alors vient l'écran de victoire ou de défaite.
 *
 * Ne se joue que si la fin est OBSERVÉE en cours de partie (pas au rechargement
 * d'une partie déjà finie) et qu'un héros est bien à 0 PV (pas sur abandon).
 */
export function CoupFatalOverlay({ onDebut, onFin }: CoupFatalProps) {
  const phase = useGameStore((s) => s.gameState?.phase);
  const reduced = useReducedMotion();
  const [vises, setVises] = useState<Vise[] | null>(null);
  const [explose, setExplose] = useState(false);
  // Phase vue au montage : une partie chargée déjà terminée ne rejoue rien.
  const phaseInitialeRef = useRef(phase);
  const lanceRef = useRef(false);
  const rappelsRef = useRef({ onDebut, onFin });
  useEffect(() => { rappelsRef.current = { onDebut, onFin }; });

  useEffect(() => {
    if (phase !== "finished" || lanceRef.current) return;
    lanceRef.current = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finir = () => rappelsRef.current.onFin();

    const { gameState, localPlayerId } = useGameStore.getState();
    const cibles: Vise[] = [];
    if (gameState && phaseInitialeRef.current !== "finished" && !reduced) {
      for (const joueur of gameState.players) {
        if (joueur.hero.hp > 0) continue;
        const sentinelle = joueur.id === localPlayerId ? "friendly_hero" : "enemy_hero";
        const el = document.querySelector(`[data-target-id="${sentinelle}"]`);
        if (!el) continue;
        const r = overlayRect(el);
        // Portrait 2D : la zone tactile ne couvre que ~55 % du médaillon, on en
        // déduit son rayon. Héros 3D : la zone est le cadre entier — d'où le
        // plafond, pour que les fissures restent à l'échelle du héros.
        const rayon = Math.min(130, Math.max(60, r.width / 0.55 / 2));
        cibles.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, rayon });
      }
    }
    if (cibles.length === 0) {
      timers.push(setTimeout(finir, 0));
      return () => { for (const t of timers) clearTimeout(t); };
    }

    timers.push(setTimeout(() => {
      rappelsRef.current.onDebut();
      setVises(cibles);
    }, 0));
    // Frémissements pendant la montée, puis l'explosion.
    timers.push(setTimeout(() => emitImpact({ x: 0, y: 0, amount: 0, type: "secousse", dirX: 0, dirY: 0, big: false, secousse: 3 }), 350));
    timers.push(setTimeout(() => emitImpact({ x: 0, y: 0, amount: 0, type: "secousse", dirX: 0, dirY: 0, big: false, secousse: 5 }), 720));
    timers.push(setTimeout(() => {
      setExplose(true);
      cibles.forEach((c, i) => emitImpact({
        x: c.x, y: c.y, amount: 12, type: "fatal", dirX: 0, dirY: 0, big: true,
        ...(i === 0 ? { secousse: 16 } : {}),
      }));
    }, FATAL_CHARGE_MS));
    // Réplique : une seconde gerbe, sans secousse.
    timers.push(setTimeout(() => {
      for (const c of cibles) emitImpact({ x: c.x, y: c.y, amount: 12, type: "fatal", dirX: 0, dirY: 0, big: true });
    }, FATAL_CHARGE_MS + 260));
    timers.push(setTimeout(finir, FATAL_TOTAL_MS));
    return () => { for (const t of timers) clearTimeout(t); };
  }, [phase, reduced]);

  if (!vises || typeof document === "undefined") return null;
  const foyer = vises[0];

  return createPortal(
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 98 }}>
      {/* Le monde s'éteint, seul le héros condamné reste éclairé. */}
      <motion.div
        style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(circle at ${foyer.x}px ${foyer.y}px, transparent 0, transparent ${foyer.rayon * 1.2}px, rgba(3,2,8,0.86) ${foyer.rayon * 4.2}px)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      {vises.map((v, n) => (
        <div key={n}>
          {/* Lueur qui enfle sous le médaillon puis sature à l'explosion. */}
          <motion.div
            style={{
              position: "absolute", left: v.x - v.rayon * 1.6, top: v.y - v.rayon * 1.6,
              width: v.rayon * 3.2, height: v.rayon * 3.2, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,236,200,0.95) 0%, rgba(255,110,50,0.55) 38%, transparent 70%)",
              mixBlendMode: "screen",
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={explose
              ? { opacity: [1, 0], scale: [1.3, 2.6] }
              : { opacity: [0, 0.35, 0.25, 0.6, 0.45, 0.9], scale: [0.5, 0.8, 0.78, 0.95, 0.92, 1.1] }}
            transition={explose
              ? { duration: 0.7, ease: "easeOut" }
              : { duration: FATAL_CHARGE_MS / 1000, ease: "easeIn" }}
          />
          {/* Fissures de lumière : elles gagnent du terrain puis s'évanouissent. */}
          <motion.svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
            animate={{ opacity: explose ? 0 : 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {traceFissures(v).map((d, i) => (
              <g key={i}>
                <motion.path
                  d={d} fill="none" stroke="rgba(255,90,40,0.75)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                  transition={{ duration: 0.55 + hashRandom(i, 4) * 0.35, delay: 0.12 + hashRandom(i, 5) * 0.4, ease: "easeOut" }}
                />
                <motion.path
                  d={d} fill="none" stroke="#fff6e0" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                  transition={{ duration: 0.55 + hashRandom(i, 4) * 0.35, delay: 0.12 + hashRandom(i, 5) * 0.4, ease: "easeOut" }}
                />
              </g>
            ))}
          </motion.svg>
        </div>
      ))}
      {/* L'éclair blanc de l'explosion. */}
      {explose && (
        <motion.div
          style={{
            position: "absolute", inset: 0,
            background: `radial-gradient(circle at ${foyer.x}px ${foyer.y}px, #ffffff 0%, rgba(255,226,170,0.92) 24%, rgba(255,120,60,0.5) 55%, rgba(120,10,10,0.2) 100%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.5, 0] }}
          transition={{ duration: 0.85, times: [0, 0.08, 0.35, 1], ease: "easeOut" }}
        />
      )}
    </div>,
    document.body,
  );
}

// ─── L'âme rejoint le cimetière ──────────────────────────────────────────────

const AME_MS = lent(1050);
/** L'âme part après l'éclat de la mort, pas en même temps. */
const AME_DEPART_MS = lent(320);

interface Ame { key: string; x: number; y: number; versX: number; versY: number; teinte: string }

/**
 * Quand une unité meurt et rejoint un cimetière, une lueur quitte l'endroit où
 * elle est tombée et file vers la pile de ce cimetière : on VOIT où part la
 * carte. Rien pour une unité qui disparaît sans y aller (exil, jeton dissipé,
 * dévoration) — l'absence de lueur dit alors, à sa façon, qu'elle ne reviendra pas.
 */
export function AmesOverlay() {
  const deathEvents = useGameStore((s) => s.deathEvents);
  const reduced = useReducedMotion();
  const [ames, setAmes] = useState<Ame[]>([]);
  const dernierLotRef = useRef<typeof deathEvents | null>(null);
  const serieRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { for (const t of timersRef.current) clearTimeout(t); }, []);

  useEffect(() => {
    if (deathEvents === dernierLotRef.current) return;
    dernierLotRef.current = deathEvents;
    if (reduced || deathEvents.length === 0) return;
    const { gameState, localPlayerId } = useGameStore.getState();
    if (!gameState) return;
    const serie = ++serieRef.current;
    const nouvelles: Ame[] = [];
    deathEvents.forEach((ev, i) => {
      if (ev.x < -9000) return;
      const proprietaire = gameState.players.find((p) => p.graveyard.some((c) => c.instanceId === ev.instanceId));
      if (!proprietaire) return; // n'a rejoint aucun cimetière
      const pile = document.querySelector(`[data-graveyard-pile="${proprietaire.id === localPlayerId ? "my" : "opponent"}"]`);
      if (!pile) return;
      const r = overlayRect(pile);
      nouvelles.push({
        key: `${serie}-${i}`,
        x: ev.x, y: ev.y,
        versX: r.left + r.width / 2, versY: r.top + r.height / 2,
        teinte: ev.poisoned ? "#86efac" : "#e8e4ff",
      });
    });
    if (nouvelles.length === 0) return;
    timersRef.current.push(setTimeout(() => setAmes((prev) => [...prev, ...nouvelles]), AME_DEPART_MS));
    timersRef.current.push(setTimeout(() => {
      // Arrivée : un souffle sur la pile.
      for (const a of nouvelles) {
        emitImpact({ x: a.versX, y: a.versY, amount: 0, type: "cast_hit", dirX: 0, dirY: 0, big: false, paletteKey: "death" });
      }
      setAmes((prev) => prev.filter((a) => !nouvelles.includes(a)));
    }, AME_DEPART_MS + AME_MS));
  }, [deathEvents, reduced]);

  if (ames.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 98 }}>
      {ames.map((a) => {
        // Trajet en arc : l'âme s'élève d'abord, puis plonge vers la pile.
        const dx = a.versX - a.x;
        const dy = a.versY - a.y;
        const sommet = -Math.min(120, 40 + Math.hypot(dx, dy) * 0.18);
        return (
          <motion.div
            key={a.key}
            style={{
              position: "absolute", left: a.x - 9, top: a.y - 9, width: 18, height: 18, borderRadius: "50%",
              background: `radial-gradient(circle, #ffffff 0%, ${a.teinte} 35%, transparent 72%)`,
              boxShadow: `0 0 14px 5px ${a.teinte}99, 0 0 34px 12px ${a.teinte}44`,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{
              x: [0, dx * 0.3, dx],
              y: [0, dy * 0.3 + sommet, dy],
              opacity: [0, 1, 1, 0],
              scale: [0.3, 1.25, 0.55],
            }}
            transition={{
              duration: AME_MS / 1000,
              x: { duration: AME_MS / 1000, times: [0, 0.35, 1], ease: ["easeOut", "easeIn"] },
              y: { duration: AME_MS / 1000, times: [0, 0.35, 1], ease: ["easeOut", "easeIn"] },
              scale: { duration: AME_MS / 1000, times: [0, 0.3, 1] },
              opacity: { duration: AME_MS / 1000, times: [0, 0.12, 0.85, 1] },
            }}
          />
        );
      })}
    </div>,
    document.body,
  );
}
