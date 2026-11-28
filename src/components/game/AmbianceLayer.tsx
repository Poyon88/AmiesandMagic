"use client";

// AMBIANCE DU PLATEAU — une vie discrète derrière les cartes : braises chez les
// Nains, lucioles chez les Elfes, âmes chez les Morts-Vivants… Chaque moitié du
// plateau porte l'ambiance de SON héros (l'adversaire en haut, soi en bas).
//
// Volontairement frugal, parce que cette couche ne dort jamais (contrairement à
// ImpactFxLayer, qui ne tourne que pendant un effet) :
//   • une cinquantaine de particules en tout, dessinées par sprite pré-rendu ;
//   • 30 images/s, toile à demi-résolution (des halos flous n'en demandent pas
//     plus) ;
//   • à l'arrêt quand l'onglet est caché, sous `prefers-reduced-motion`, et sur
//     écran tactile — même règle que la couche d'impact, pour ne pas charger
//     l'iPad dont le retard d'affichage décale les commits d'état.
// Rien ici ne lit ni ne touche l'état de partie.

import { useEffect, useRef } from "react";

type Genre = "braises" | "lucioles" | "ames" | "petales" | "pollen" | "cendres" | "poussiere" | "neige" | "embruns";

interface Recette {
  rgb: [number, number, number];
  /** Particules par moitié de plateau. */
  nombre: number;
  /** Vitesse verticale (px/s, toile pleine résolution ; négatif = monte). */
  vy: [number, number];
  /** Dérive horizontale moyenne (px/s). */
  vx: [number, number];
  taille: [number, number];
  alpha: number;
  /** Amplitude du balancement latéral (px/s). */
  balance: number;
  /** Clignotement (lucioles, braises) : 0 = lumière constante. */
  clignote: number;
}

const RECETTES: Record<Genre, Recette> = {
  braises:   { rgb: [255, 140, 50],  nombre: 26, vy: [-70, -25], vx: [-8, 8],   taille: [3, 7],  alpha: 0.5,  balance: 14, clignote: 0.6 },
  lucioles:  { rgb: [210, 255, 120], nombre: 22, vy: [-12, 12],  vx: [-14, 14], taille: [4, 8],  alpha: 0.55, balance: 26, clignote: 1 },
  ames:      { rgb: [150, 235, 220], nombre: 18, vy: [-28, -10], vx: [-5, 5],   taille: [6, 12], alpha: 0.32, balance: 12, clignote: 0.5 },
  petales:   { rgb: [255, 175, 200], nombre: 22, vy: [22, 55],   vx: [12, 34],  taille: [4, 8],  alpha: 0.42, balance: 30, clignote: 0 },
  pollen:    { rgb: [215, 230, 130], nombre: 26, vy: [-14, 8],   vx: [6, 22],   taille: [3, 6],  alpha: 0.4,  balance: 16, clignote: 0.2 },
  cendres:   { rgb: [175, 150, 215], nombre: 24, vy: [12, 38],   vx: [-10, 6],  taille: [3, 7],  alpha: 0.34, balance: 18, clignote: 0 },
  poussiere: { rgb: [255, 225, 150], nombre: 24, vy: [-10, 6],   vx: [-6, 10],  taille: [3, 6],  alpha: 0.36, balance: 10, clignote: 0.3 },
  neige:     { rgb: [235, 245, 255], nombre: 30, vy: [26, 60],   vx: [-16, 4],  taille: [3, 7],  alpha: 0.5,  balance: 22, clignote: 0 },
  embruns:   { rgb: [120, 210, 255], nombre: 24, vy: [-36, -12], vx: [-8, 8],   taille: [3, 7],  alpha: 0.4,  balance: 14, clignote: 0.4 },
};

const PAR_FACTION: Record<string, Genre> = {
  Elfes: "lucioles",
  Nains: "braises",
  Humains: "poussiere",
  "Morts-Vivants": "ames",
  EmpireDuMilieu: "petales",
  "Hommes-Bêtes": "pollen",
  "Elfes Noirs": "cendres",
  RoyaumesDuSoleil: "poussiere",
};

// Les Élémentaires se distinguent par leur clan, pas par leur faction.
const PAR_CLAN: Record<string, Genre> = {
  "La Colère des Flammes": "braises",
  "La Vague Sans Fin": "embruns",
  "Le Souffle des Cimes": "neige",
  "Le Socle du Monde": "poussiere",
};

export function genreAmbiance(faction?: string | null, clan?: string | null): Genre {
  return (clan && PAR_CLAN[clan]) || (faction && PAR_FACTION[faction]) || "poussiere";
}

interface Grain {
  x: number; y: number; vx: number; vy: number;
  taille: number; phase: number;
  /** 0 = moitié haute (adversaire), 1 = moitié basse (soi). */
  moitie: 0 | 1;
}

/** Résolution de la toile par rapport au plateau : des halos flous n'ont pas
 *  besoin de mieux, et le remplissage additif coûte au pixel. */
const ECHELLE = 0.5;
const IMAGE_MS = 1000 / 30;
const SPRITE = 24;

function sprite(rgb: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE * 2;
  const g = c.getContext("2d")!;
  const d = g.createRadialGradient(SPRITE, SPRITE, 0, SPRITE, SPRITE, SPRITE);
  d.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
  d.addColorStop(0.35, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.45)`);
  d.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = d;
  g.fillRect(0, 0, SPRITE * 2, SPRITE * 2);
  return c;
}

interface Props {
  /** Dimensions du plateau en pixels de dessin (avant mise à l'échelle). */
  largeur: number;
  hauteur: number;
  /** Ambiance de la moitié haute (héros adverse) et basse (son propre héros). */
  haut: Genre;
  bas: Genre;
}

export default function AmbianceLayer({ largeur, hauteur, haut, bas }: Props) {
  const toileRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const toile = toileRef.current;
    const ctx = toile?.getContext("2d");
    if (!toile || !ctx) return;

    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)");
    const tactile = window.matchMedia("(pointer: coarse)");

    const L = largeur * ECHELLE;
    const H = hauteur * ECHELLE;
    const demi = H / 2;
    toile.width = Math.round(L);
    toile.height = Math.round(H);

    const genres: [Genre, Genre] = [haut, bas];
    const sprites = [sprite(RECETTES[haut].rgb), sprite(RECETTES[bas].rgb)];
    const entre = (b: [number, number]) => b[0] + Math.random() * (b[1] - b[0]);

    const grains: Grain[] = [];
    for (const moitie of [0, 1] as const) {
      const r = RECETTES[genres[moitie]];
      for (let i = 0; i < r.nombre; i++) {
        grains.push({
          x: Math.random() * L,
          y: moitie * demi + Math.random() * demi,
          vx: entre(r.vx) * ECHELLE,
          vy: entre(r.vy) * ECHELLE,
          taille: entre(r.taille) * ECHELLE,
          phase: Math.random() * Math.PI * 2,
          moitie,
        });
      }
    }

    let raf: number | null = null;
    let dernier = 0;
    let temps = 0;

    const image = (maintenant: number) => {
      raf = requestAnimationFrame(image);
      const ecoule = maintenant - dernier;
      if (ecoule < IMAGE_MS) return; // plafonné à 30 images/s
      dernier = maintenant;
      const dt = Math.min(ecoule, 100) / 1000;
      temps += dt;

      ctx.clearRect(0, 0, L, H);
      ctx.globalCompositeOperation = "lighter";
      for (const g of grains) {
        const r = RECETTES[genres[g.moitie]];
        g.x += (g.vx + Math.sin(temps * 0.9 + g.phase) * r.balance * ECHELLE) * dt;
        g.y += g.vy * dt;
        // Chaque grain reste dans sa moitié : sorti d'un bord, il rentre par l'autre.
        const haut0 = g.moitie * demi;
        if (g.y < haut0) g.y += demi;
        else if (g.y > haut0 + demi) g.y -= demi;
        if (g.x < -20) g.x += L + 40;
        else if (g.x > L + 20) g.x -= L + 40;

        // Fondu aux bords de la moitié : pas de naissance ni de mort visibles,
        // et les deux ambiances se fondent à la ligne médiane au lieu de s'y couper.
        const bord = Math.min(g.y - haut0, haut0 + demi - g.y) / (demi * 0.22);
        const fondu = bord >= 1 ? 1 : Math.max(0, bord);
        const lueur = r.clignote > 0
          ? 1 - r.clignote * (0.5 + 0.5 * Math.sin(temps * 2.3 + g.phase * 3))
          : 1;
        ctx.globalAlpha = r.alpha * fondu * lueur;
        const t = g.taille * 2.4;
        ctx.drawImage(sprites[g.moitie], g.x - t, g.y - t, t * 2, t * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const arreter = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
      ctx.clearRect(0, 0, L, H);
    };
    const regler = () => {
      const actif = !reduit.matches && !tactile.matches && document.visibilityState === "visible";
      if (actif && raf == null) { dernier = performance.now(); raf = requestAnimationFrame(image); }
      else if (!actif) arreter();
    };
    regler();
    reduit.addEventListener("change", regler);
    tactile.addEventListener("change", regler);
    document.addEventListener("visibilitychange", regler);
    return () => {
      arreter();
      reduit.removeEventListener("change", regler);
      tactile.removeEventListener("change", regler);
      document.removeEventListener("visibilitychange", regler);
    };
  }, [largeur, hauteur, haut, bas]);

  return (
    <canvas
      ref={toileRef}
      aria-hidden
      // zIndex -1 comme le décor, mais placé après lui dans le DOM : au-dessus
      // de l'illustration, sous les cartes et toute l'interface.
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none" }}
    />
  );
}
