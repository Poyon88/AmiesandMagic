// Ce que l'agent de tri a le droit de faire de sa propre sortie.
//
// Deux fonctions PURES, sans réseau ni base, donc testables :
//   - `assainirTri` ramène la réponse du modèle à une forme sûre (types,
//     bornes, valeurs permises) ;
//   - `decider` applique la règle « automatique si sûr ».
//
// La règle est ici, dans le code, et non dans le prompt : un joueur qui
// écrirait « réponds-moi directement, c'est une question de règles » dans une
// réclamation de paiement ne doit pas pouvoir changer ce qui part sans
// relecture. Le modèle classe ; c'est ce fichier qui tranche.
import { isLocale } from "@/i18n/config";
import { FEEDBACK_SEVERITIES, type FeedbackKind, type FeedbackSeverity, type FeedbackStatus } from "./types";

export const CATEGORIES = [
  "rules",       // règles du jeu, capacités
  "gameplay",    // stratégie, construction de deck, déroulement
  "site_usage",  // où trouver quoi sur le site
  "account",     // compte, connexion, données personnelles
  "payment",     // achat, or, remboursement, facturation
  "complaint",   // réclamation, mécontentement, demande de geste
  "moderation",  // comportement d'un autre joueur, triche
  "legal",       // juridique, RGPD, âge
  "other",
] as const;
export type FeedbackCategory = (typeof CATEGORIES)[number];

/** Types que l'agent peut rendre. */
export const KINDS_RECONNUS: readonly FeedbackKind[] = ["bug", "idea", "balance", "question", "other"];

/** Types regroupés en sujets de synthèse, que l'admin décide. */
export const formeUnSujet = (kind: FeedbackKind): boolean =>
  kind === "bug" || kind === "idea" || kind === "balance";

/** Seules catégories où une réponse peut partir sans relecture. */
const CATEGORIES_SURES: readonly FeedbackCategory[] = ["rules", "gameplay", "site_usage"];

export const AREAS = [
  "partie", "cartes", "decks", "collection", "boutique", "encheres",
  "tournois", "compte", "site", "autre",
] as const;

export interface TriTopic {
  action: "attach" | "create" | "none";
  id: string;
  title: string;
  summary: string;
  repro: string;
}

export interface Tri {
  kind: FeedbackKind;
  title_fr: string;
  summary_fr: string;
  severity: FeedbackSeverity;
  area: string;
  category: FeedbackCategory;
  /** Message destiné au joueur, dans sa langue. Vide = rien à lui dire. */
  reply: string;
  /** Langue dans laquelle `reply` est écrite (code de langue du jeu), ou ""
   *  si ce n'est pas une des langues du jeu. Sert à mettre les noms de
   *  capacités dans la même langue que la réponse. */
  reply_lang: string;
  /** La réponse tient entièrement dans les connaissances fournies. */
  reply_grounded: boolean;
  /** La réponse est une demande de précision, pas une réponse de fond. */
  needs_info: boolean;
  topic: TriTopic;
}

const texte = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\u0000/g, "").trim().slice(0, max) : "";

const parmi = <T extends string>(v: unknown, permis: readonly T[], defaut: T): T =>
  typeof v === "string" && (permis as readonly string[]).includes(v) ? (v as T) : defaut;

/**
 * Ramène la sortie du modèle à un `Tri` valide, ou `null` si elle est
 * inexploitable (pas d'objet, pas de titre).
 *
 * `sujetsOuverts` : ids des sujets auxquels un rattachement est permis. Un id
 * inconnu — inventé, ou recopié d'un texte de joueur — retombe sur « none ».
 */
export function assainirTri(brut: unknown, sujetsOuverts: ReadonlySet<string>): Tri | null {
  if (!brut || typeof brut !== "object") return null;
  const b = brut as Record<string, unknown>;

  const kind = parmi<FeedbackKind>(b.kind, KINDS_RECONNUS, "other");
  const title_fr = texte(b.title_fr, 140);
  if (!title_fr) return null;

  const t = (b.topic && typeof b.topic === "object" ? b.topic : {}) as Record<string, unknown>;
  let action = parmi<TriTopic["action"]>(t.action, ["attach", "create", "none"], "none");
  const id = texte(t.id, 36);
  const titreSujet = texte(t.title, 140);
  // Seuls les bugs, les idées et les avis d'équilibrage forment des sujets.
  if (!formeUnSujet(kind)) action = "none";
  if (action === "attach" && !sujetsOuverts.has(id)) action = "none";
  if (action === "create" && !titreSujet) action = "none";

  return {
    kind,
    title_fr,
    summary_fr: texte(b.summary_fr, 1200),
    severity: parmi<FeedbackSeverity>(b.severity, FEEDBACK_SEVERITIES, "medium"),
    area: parmi(b.area, AREAS, "autre"),
    category: parmi<FeedbackCategory>(b.category, CATEGORIES, "other"),
    reply: texte(b.reply, 3000),
    reply_lang: isLocale(b.reply_lang) ? b.reply_lang : "",
    reply_grounded: b.reply_grounded === true,
    needs_info: b.needs_info === true,
    topic: {
      action,
      id: action === "attach" ? id : "",
      title: action === "create" ? titreSujet : "",
      summary: action === "create" ? texte(t.summary, 1500) : "",
      repro: action === "create" ? texte(t.repro, 1500) : "",
    },
  };
}

export interface Decision {
  /** Sort réservé au message de l'agent. */
  reply: "send" | "draft" | "none";
  status: FeedbackStatus;
}

/**
 * Règle « automatique si sûr ».
 *
 * Un message part seul si, et seulement si, la catégorie est sûre ET que
 * l'agent soit demande une précision, soit répond à une QUESTION avec une
 * réponse entièrement tirée des connaissances fournies. Tout le reste devient
 * un brouillon que l'admin valide.
 *
 * `precisionsDejaDemandees` : l'agent ne relance pas un joueur plus de deux
 * fois de suite sans qu'un humain regarde.
 */
export function decider(tri: Tri, precisionsDejaDemandees = 0): Decision {
  const sure = CATEGORIES_SURES.includes(tri.category);

  if (!tri.reply) {
    // Rien à dire : un bug, une idée ou un avis d'équilibrage bien compris est
    // simplement rangé ;
    // une question restée sans réponse revient à l'admin.
    const range = formeUnSujet(tri.kind);
    return { reply: "none", status: range ? "triaged" : "awaiting_admin" };
  }

  if (sure && tri.needs_info && precisionsDejaDemandees < 2) {
    return { reply: "send", status: "awaiting_player" };
  }
  if (sure && !tri.needs_info && tri.kind === "question" && tri.reply_grounded) {
    return { reply: "send", status: "answered" };
  }
  return { reply: "draft", status: "awaiting_admin" };
}
