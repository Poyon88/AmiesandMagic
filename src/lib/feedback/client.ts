// Côté navigateur : ouverture de la fenêtre de retour, préparation et envoi
// des captures, contexte joint automatiquement.
import { create } from "zustand";
import { useGameStore } from "@/lib/store/gameStore";
import { MAX_ATTACHMENT_BYTES, type FeedbackContext } from "./types";

/** Fenêtre de retour : montée une fois dans le layout racine, ouverte de
 *  n'importe où (bouton flottant, réglages en partie, page « Mes retours »). */
export const useFeedbackStore = create<{
  open: boolean;
  /** Incrémenté à chaque envoi réussi : les listes s'y abonnent pour se rafraîchir. */
  sent: number;
  openModal: () => void;
  closeModal: () => void;
  notifySent: () => void;
}>((set) => ({
  open: false,
  sent: 0,
  openModal: () => set({ open: true }),
  closeModal: () => set({ open: false }),
  notifySent: () => set((s) => ({ sent: s.sent + 1 })),
}));

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
/** Au-delà, une capture est réduite avant l'envoi : une capture d'écran
 *  Retina en PNG dépasse vite la limite du bucket, et rien d'utile ne se lit
 *  au-delà de cette taille. */
const COTE_MAX = 2200;
const POIDS_SANS_RETOUCHE = 2 * 1024 * 1024;

async function reduire(fichier: File): Promise<Blob> {
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const toile = document.createElement("canvas");
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("canvas");
  // Fond opaque : une capture PNG transparente virerait au noir en JPEG.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, toile.width, toile.height);
  ctx.drawImage(image, 0, 0, toile.width, toile.height);
  image.close();
  return new Promise((resolve, reject) =>
    toile.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/jpeg", 0.86),
  );
}

export type ErreurPiece = "bad_format" | "too_big" | "quota" | "upload";

/** Prépare puis envoie une capture ; rend son chemin dans le Storage. */
export async function envoyerPiece(fichier: File): Promise<{ path: string } | { erreur: ErreurPiece }> {
  if (!fichier.type.startsWith("image/")) return { erreur: "bad_format" };

  let corps: Blob = fichier;
  let type = fichier.type;
  if (!TYPES[type] || fichier.size > POIDS_SANS_RETOUCHE) {
    try {
      corps = await reduire(fichier);
      type = "image/jpeg";
    } catch {
      // Format que le navigateur ne sait pas lire (HEIC hors Safari, par ex.).
      if (!TYPES[type]) return { erreur: "bad_format" };
    }
  }
  if (corps.size > MAX_ATTACHMENT_BYTES) return { erreur: "too_big" };

  try {
    const res = await fetch("/api/feedback/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ext: TYPES[type] }),
    });
    const cible = await res.json().catch(() => ({}));
    if (res.status === 429) return { erreur: "quota" };
    if (!res.ok || !cible.signedUrl) return { erreur: "upload" };
    const envoi = await fetch(cible.signedUrl, { method: "PUT", headers: { "Content-Type": type }, body: corps });
    if (!envoi.ok) return { erreur: "upload" };
    return { path: cible.path as string };
  } catch {
    return { erreur: "upload" };
  }
}

/** Contexte joint à un nouveau retour : la page, la fenêtre, le navigateur,
 *  et en partie l'identifiant du match et le tour — de quoi rejouer la partie. */
export function contexteCourant(): FeedbackContext {
  const ctx: FeedbackContext = {
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
  const partie = window.location.pathname.match(/^\/game\/([0-9a-f-]{36})/);
  if (partie) {
    ctx.matchId = partie[1];
    const tour = useGameStore.getState().gameState?.turnNumber;
    if (typeof tour === "number") ctx.turn = tour;
  }
  return ctx;
}
