// Outils serveur des retours joueurs : quota, validation des pièces jointes,
// URL signées, notification. Tout passe par le client service_role (les
// tables n'ont aucune policy) ; l'appartenance d'un fil à son joueur est donc
// vérifiée ICI, à chaque lecture.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/config";
import {
  ATTACHMENT_EXTENSIONS,
  FEEDBACK_BUCKET,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_BODY_CHARS,
  MIN_BODY_CHARS,
  type FeedbackContext,
} from "./types";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function mimeOf(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? null;
}

/** Chemin d'une capture : `<id du joueur>/<aléa>.<ext>`. Le dossier porte
 *  l'id de son auteur, ce qui permet de refuser un chemin emprunté à un autre. */
export function nouveauChemin(userId: string, ext: string): string {
  return `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

const CHEMIN = new RegExp(`^[0-9a-f-]{36}/[0-9]+_[a-z0-9]+\\.(${ATTACHMENT_EXTENSIONS.join("|")})$`);

export function extensionValide(ext: unknown): ext is string {
  return typeof ext === "string" && (ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext);
}

// ─── Quota ────────────────────────────────────────────────────────────────

export type FeedbackQuotaKind = "feedback_submit" | "feedback_reply" | "feedback_upload";

const QUOTAS: Record<FeedbackQuotaKind, number> = {
  feedback_submit: 10,
  feedback_reply: 30,
  feedback_upload: 60,
};

/** Vrai si l'envoi est permis. Réutilise le compteur des générations IA
 *  (`check_ai_quota`), qui enregistre l'événement de façon atomique. Comme
 *  lui, laisse passer si la base ne répond pas : un souci d'infra ne doit pas
 *  empêcher un joueur de signaler… un souci. */
export async function quotaOk(supabase: SupabaseClient, userId: string, kind: FeedbackQuotaKind): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_ai_quota", {
    p_user_id: userId,
    p_kind: kind,
    p_limit: QUOTAS[kind],
    p_window: "24 hours",
  });
  if (error) {
    console.warn(`[feedback] quota indisponible (${kind}) :`, error.message);
    return true;
  }
  return data !== false;
}

// ─── Saisie ───────────────────────────────────────────────────────────────

export function texteValide(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const propre = body.replace(/\u0000/g, "").trim();
  if (propre.length < MIN_BODY_CHARS || propre.length > MAX_BODY_CHARS) return null;
  return propre;
}

const court = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;

/** Ne garde du contexte envoyé par le navigateur que les champs attendus,
 *  bornés : c'est du JSON libre, lu plus tard par l'agent et par l'admin. */
export function contextePropre(brut: unknown): FeedbackContext {
  const c = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const ctx: FeedbackContext = {};
  const path = court(c.path, 300);
  if (path?.startsWith("/")) ctx.path = path;
  ctx.userAgent = court(c.userAgent, 300);
  const viewport = court(c.viewport, 20);
  if (viewport && /^\d+x\d+$/.test(viewport)) ctx.viewport = viewport;
  const matchId = court(c.matchId, 36);
  if (matchId && /^[0-9a-f-]{36}$/.test(matchId)) ctx.matchId = matchId;
  if (typeof c.turn === "number" && Number.isInteger(c.turn) && c.turn >= 0 && c.turn < 1000) ctx.turn = c.turn;
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (commit) ctx.commit = commit.slice(0, 12);
  return ctx;
}

export interface PieceVerifiee {
  path: string;
  mime: string;
  size: number;
}

/** Vérifie les chemins annoncés par le navigateur : ils sont dans le dossier
 *  du joueur, le fichier est bien arrivé, et il n'est rattaché à aucun autre
 *  message. Renvoie `null` si l'un d'eux ne tient pas. */
export async function verifierPieces(
  supabase: SupabaseClient,
  userId: string,
  chemins: unknown,
): Promise<PieceVerifiee[] | null> {
  if (chemins == null) return [];
  if (!Array.isArray(chemins) || chemins.length > MAX_ATTACHMENTS) return null;
  const uniques = [...new Set(chemins)];
  if (uniques.length !== chemins.length) return null;
  if (uniques.length === 0) return [];
  for (const p of uniques) {
    if (typeof p !== "string" || !CHEMIN.test(p) || !p.startsWith(`${userId}/`)) return null;
  }
  const paths = uniques as string[];

  const { data: fichiers, error } = await supabase.storage.from(FEEDBACK_BUCKET).list(userId, { limit: 1000 });
  if (error) return null;
  const parNom = new Map((fichiers ?? []).map((f) => [f.name, f]));

  const pieces: PieceVerifiee[] = [];
  for (const path of paths) {
    const fichier = parNom.get(path.split("/")[1]);
    const mime = mimeOf(path);
    if (!fichier || !mime) return null;
    const size = Number((fichier.metadata as { size?: number } | null)?.size ?? 0);
    if (size > MAX_ATTACHMENT_BYTES) return null;
    pieces.push({ path, mime, size });
  }

  const { data: dejaPris } = await supabase.from("feedback_attachments").select("path").in("path", paths);
  if (dejaPris?.length) return null;
  return pieces;
}

/** URL signées de lecture (une heure). Les chemins illisibles sont omis. */
export async function urlsSignees(supabase: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data } = await supabase.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 3600);
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return urls;
}

// ─── Notification ─────────────────────────────────────────────────────────

/** Textes de l'espace `feedback` dans une langue donnée. Chargés à la main :
 *  la configuration next-intl du projet lit la langue dans le cookie de la
 *  requête, or on écrit ici au joueur depuis la requête d'un autre (l'admin
 *  qui valide une réponse) ou sans requête du tout (le cron). */
export async function textesFeedback(locale: string): Promise<Record<string, string>> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const charger = async (code: string) =>
    ((await import(`../../../messages/${code}.json`)).default.feedback ?? {}) as Record<string, string>;
  // Le français comble une langue pas encore traduite.
  return { ...(await charger(DEFAULT_LOCALE)), ...(l === DEFAULT_LOCALE ? {} : await charger(l)) };
}

/** Prévient le joueur par la cloche, dans SA langue (celle du fil). */
export async function notifierJoueur(
  supabase: SupabaseClient,
  thread: { id: string; user_id: string; locale: string },
  type: "feedback_reply" | "feedback_shipped",
): Promise<void> {
  const t = await textesFeedback(thread.locale);
  const { error } = await supabase.from("notifications").insert({
    user_id: thread.user_id,
    type,
    title: t[type === "feedback_reply" ? "notif_reply_title" : "notif_shipped_title"] ?? "",
    message: t[type === "feedback_reply" ? "notif_reply_body" : "notif_shipped_body"] ?? "",
    metadata: { thread_id: thread.id },
  });
  if (error) console.warn("[feedback] notification non envoyée :", error.message);
}
