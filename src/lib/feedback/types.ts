// Retours des joueurs : types partagés entre les routes, l'agent de tri et
// les écrans (joueur et admin). Les tables sont décrites dans
// supabase-migration-feedback.sql.

export const FEEDBACK_KINDS = ["bug", "idea", "question"] as const;
/** Ce que le joueur coche en ouvrant un retour. */
export type FeedbackKindDeclared = (typeof FEEDBACK_KINDS)[number];
/** Ce que l'agent reconnaît vraiment (« other » : ni bug, ni idée, ni question). */
export type FeedbackKind = FeedbackKindDeclared | "other";

export type FeedbackStatus =
  | "new"             // pas encore trié
  | "triaged"         // trié, rien à dire au joueur (bug ou idée bien reçus)
  | "awaiting_admin"  // un brouillon attend la validation de l'admin
  | "awaiting_player" // l'agent a demandé une précision
  | "answered"        // une réponse est partie
  | "closed";

export const FEEDBACK_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export type FeedbackAuthor = "player" | "agent" | "admin";

export const TOPIC_STATUSES = ["proposed", "accepted", "rejected", "deferred", "fixed", "shipped"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export type TopicKind = "bug" | "improvement";

/** Contexte joint automatiquement à l'ouverture d'un retour. */
export interface FeedbackContext {
  path?: string;
  userAgent?: string;
  viewport?: string;
  matchId?: string;
  turn?: number;
  /** SHA du commit déployé (posé par le serveur). */
  commit?: string;
}

export interface FeedbackThreadRow {
  id: string;
  user_id: string;
  kind_declared: FeedbackKindDeclared;
  kind: FeedbackKind;
  status: FeedbackStatus;
  locale: string;
  title_fr: string;
  summary_fr: string;
  severity: FeedbackSeverity | null;
  area: string;
  category: string;
  context: FeedbackContext;
  topic_id: string | null;
  needs_triage: boolean;
  triage_attempts: number;
  triage_error: string | null;
  player_unread: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

export interface FeedbackMessageRow {
  id: string;
  thread_id: string;
  author: FeedbackAuthor;
  author_id: string | null;
  body: string;
  state: "sent" | "draft";
  created_at: string;
}

export interface FeedbackAttachmentRow {
  id: string;
  thread_id: string;
  message_id: string;
  path: string;
  mime: string;
  size: number;
}

export interface FeedbackTopicRow {
  id: string;
  kind: TopicKind;
  title: string;
  summary: string;
  repro: string;
  severity: FeedbackSeverity;
  area: string;
  status: TopicStatus;
  decision_note: string;
  commit_sha: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

// ─── Ce que voit le joueur ────────────────────────────────────────────────

/** État simplifié montré au joueur : il n'a pas à connaître la cuisine interne. */
export type PlayerThreadState = "received" | "answered" | "closed";

/** Suite donnée à un bug ou une idée, quand elle vaut d'être annoncée. */
export type PlayerOutcome = "accepted" | "shipped" | null;

export interface PlayerThreadSummary {
  id: string;
  kind: FeedbackKindDeclared;
  state: PlayerThreadState;
  outcome: PlayerOutcome;
  excerpt: string;
  unread: boolean;
  created_at: string;
  last_message_at: string;
}

export interface PlayerMessage {
  id: string;
  author: FeedbackAuthor;
  body: string;
  created_at: string;
  attachments: { id: string; url: string }[];
}

export interface PlayerThreadDetail extends PlayerThreadSummary {
  messages: PlayerMessage[];
}

export function playerState(status: FeedbackStatus): PlayerThreadState {
  if (status === "closed") return "closed";
  if (status === "answered" || status === "awaiting_player") return "answered";
  return "received";
}

export function playerOutcome(topicStatus: TopicStatus | null | undefined): PlayerOutcome {
  if (topicStatus === "shipped") return "shipped";
  if (topicStatus === "accepted" || topicStatus === "fixed") return "accepted";
  return null;
}

// ─── Limites ──────────────────────────────────────────────────────────────

export const FEEDBACK_BUCKET = "feedback-attachments";
export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_BODY_CHARS = 4000;
export const MIN_BODY_CHARS = 5;
export const ATTACHMENT_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;
