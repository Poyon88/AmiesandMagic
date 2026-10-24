// Taille du descriptif EN PARTIE choisie par le joueur (molette / pincement),
// partagée par toutes les cartes et retenue d'une partie à l'autre.
//
// Petit magasin module + useSyncExternalStore : le réglage doit valoir pour
// TOUTES les cartes à la fois (on agrandit une carte, la suivante s'ouvre à la
// même taille), sans faire re-rendre la main ni le plateau à chaque cran.
import { useSyncExternalStore } from "react";

export const AGRANDISSEMENT_MIN = 1;
export const AGRANDISSEMENT_MAX = 2.2;
const CLE = "am:agrandissement-detail";

const borner = (k: number) => Math.min(AGRANDISSEMENT_MAX, Math.max(AGRANDISSEMENT_MIN, k));

function lireStocke(): number {
  try {
    const v = Number(window.localStorage.getItem(CLE));
    return Number.isFinite(v) && v > 0 ? borner(v) : AGRANDISSEMENT_MIN;
  } catch {
    return AGRANDISSEMENT_MIN;
  }
}

let valeur: number | null = null;
const abonnes = new Set<() => void>();

export function lireAgrandissement(): number {
  if (valeur == null) valeur = typeof window === "undefined" ? AGRANDISSEMENT_MIN : lireStocke();
  return valeur;
}

export function regleAgrandissement(k: number) {
  const n = borner(k);
  if (n === valeur) return;
  valeur = n;
  try { window.localStorage.setItem(CLE, String(n)); } catch { /* navigation privée : réglage de session */ }
  abonnes.forEach((f) => f());
}

export function useAgrandissement(): number {
  return useSyncExternalStore(
    (f) => { abonnes.add(f); return () => abonnes.delete(f); },
    lireAgrandissement,
    () => AGRANDISSEMENT_MIN,
  );
}
