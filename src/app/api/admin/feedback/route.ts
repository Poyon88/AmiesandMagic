// Revue des retours joueurs (admin).
//
//   GET  ?view=topics  [&status=]            sujets de synthèse + nombre de retours et de joueurs
//   GET  ?view=drafts                        réponses de l'agent en attente de validation
//   GET  ?view=threads [&status=&kind=&page=] tous les retours
//   GET  ?topic=<id>                         un sujet et ses retours
//   GET  ?thread=<id>                        un fil complet (brouillons compris)
//   POST { action, … }                       toutes les décisions — voir ACTIONS plus bas
import { NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, requireAdmin } from "@/lib/admin/requireAdmin";
import { trierFil } from "@/lib/feedback/agent";
import { notifierJoueur, urlsSignees } from "@/lib/feedback/server";
import {
  FEEDBACK_SEVERITIES,
  MAX_BODY_CHARS,
  type FeedbackAttachmentRow,
  type FeedbackMessageRow,
  type FeedbackThreadRow,
  type FeedbackTopicRow,
} from "@/lib/feedback/types";

export const maxDuration = 60;

const PAR_PAGE = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const texte = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const erreur = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Pseudos des auteurs. `profiles` n'est lié par clé étrangère à aucune table
 *  de retours : on les lit à part, comme partout dans le projet. */
async function pseudos(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const uniques = [...new Set(ids)];
  if (uniques.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id, username").in("id", uniques);
  return new Map((data ?? []).map((p) => [p.id as string, (p.username as string) ?? "?"]));
}

/** Premier message de chaque fil, abrégé. */
async function extraits(supabase: SupabaseClient, threadIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (threadIds.length === 0) return out;
  const { data } = await supabase
    .from("feedback_messages").select("thread_id, body, created_at")
    .in("thread_id", threadIds).eq("author", "player").order("created_at");
  for (const m of data ?? []) {
    if (!out.has(m.thread_id)) out.set(m.thread_id, (m.body as string).replace(/\s+/g, " ").slice(0, 280));
  }
  return out;
}

async function compteurs(supabase: SupabaseClient) {
  const compter = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [proposes, brouillons, attente, erreurs] = await Promise.all([
    compter(supabase.from("feedback_topics").select("id", { count: "exact", head: true }).eq("status", "proposed")),
    compter(supabase.from("feedback_messages").select("id", { count: "exact", head: true }).eq("state", "draft")),
    compter(supabase.from("feedback_threads").select("id", { count: "exact", head: true }).eq("status", "awaiting_admin")),
    compter(supabase.from("feedback_threads").select("id", { count: "exact", head: true }).not("triage_error", "is", null)),
  ]);
  return { proposes, brouillons, attente, erreurs };
}

async function filComplet(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("feedback_threads").select("*").eq("id", id).maybeSingle();
  const thread = data as FeedbackThreadRow | null;
  if (!thread) return null;
  const [{ data: msgs }, { data: pjs }, noms, { data: topic }] = await Promise.all([
    supabase.from("feedback_messages").select("*").eq("thread_id", id).order("created_at"),
    supabase.from("feedback_attachments").select("*").eq("thread_id", id).order("created_at"),
    pseudos(supabase, [thread.user_id]),
    thread.topic_id
      ? supabase.from("feedback_topics").select("id, title, status, kind").eq("id", thread.topic_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const pieces = (pjs ?? []) as FeedbackAttachmentRow[];
  const urls = await urlsSignees(supabase, pieces.map((p) => p.path));
  return {
    ...thread,
    username: noms.get(thread.user_id) ?? "?",
    topic,
    messages: ((msgs ?? []) as FeedbackMessageRow[]).map((m) => ({
      ...m,
      attachments: pieces
        .filter((p) => p.message_id === m.id && urls.has(p.path))
        .map((p) => ({ id: p.id, url: urls.get(p.path)! })),
    })),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;
  const q = new URL(request.url).searchParams;

  const threadId = q.get("thread");
  if (threadId) {
    if (!uuid(threadId)) return erreur("identifiant invalide");
    const fil = await filComplet(supabase, threadId);
    return fil ? NextResponse.json({ thread: fil }) : erreur("introuvable", 404);
  }

  const topicId = q.get("topic");
  if (topicId) {
    if (!uuid(topicId)) return erreur("identifiant invalide");
    const { data: topic } = await supabase.from("feedback_topics").select("*").eq("id", topicId).maybeSingle();
    if (!topic) return erreur("introuvable", 404);
    const { data: fils } = await supabase
      .from("feedback_threads").select("*").eq("topic_id", topicId).order("created_at", { ascending: false }).limit(200);
    const threads = (fils ?? []) as FeedbackThreadRow[];
    const ids = threads.map((t) => t.id);
    const [noms, debuts, { data: pjs }] = await Promise.all([
      pseudos(supabase, threads.map((t) => t.user_id)),
      extraits(supabase, ids),
      ids.length
        ? supabase.from("feedback_attachments").select("*").in("thread_id", ids).order("created_at")
        : Promise.resolve({ data: [] }),
    ]);
    const pieces = (pjs ?? []) as FeedbackAttachmentRow[];
    const urls = await urlsSignees(supabase, pieces.map((p) => p.path));
    return NextResponse.json({
      topic,
      threads: threads.map((t) => ({
        id: t.id,
        username: noms.get(t.user_id) ?? "?",
        title_fr: t.title_fr,
        excerpt: debuts.get(t.id) ?? "",
        context: t.context,
        locale: t.locale,
        created_at: t.created_at,
        attachments: pieces
          .filter((p) => p.thread_id === t.id && urls.has(p.path))
          .map((p) => ({ id: p.id, url: urls.get(p.path)! })),
      })),
    });
  }

  const view = q.get("view") ?? "topics";

  if (view === "topics") {
    const status = q.get("status") ?? "proposed";
    let req = supabase.from("feedback_topics").select("*").order("updated_at", { ascending: false }).limit(300);
    if (status !== "all") req = req.eq("status", status);
    const { data, error } = await req;
    if (error) return erreur(error.message, 500);
    const topics = (data ?? []) as FeedbackTopicRow[];
    const ids = topics.map((t) => t.id);
    const { data: liens } = ids.length
      ? await supabase.from("feedback_threads").select("topic_id, user_id").in("topic_id", ids).limit(5000)
      : { data: [] as { topic_id: string; user_id: string }[] };
    const retours = new Map<string, number>();
    const joueurs = new Map<string, Set<string>>();
    for (const l of liens ?? []) {
      retours.set(l.topic_id, (retours.get(l.topic_id) ?? 0) + 1);
      if (!joueurs.has(l.topic_id)) joueurs.set(l.topic_id, new Set());
      joueurs.get(l.topic_id)!.add(l.user_id);
    }
    return NextResponse.json({
      topics: topics.map((t) => ({ ...t, threads: retours.get(t.id) ?? 0, players: joueurs.get(t.id)?.size ?? 0 })),
      counts: await compteurs(supabase),
    });
  }

  if (view === "drafts") {
    // Les fils qui attendent l'admin : avec un brouillon de l'agent, ou sans
    // (question à laquelle l'agent n'a rien su proposer).
    const { data, error } = await supabase
      .from("feedback_threads").select("*").eq("status", "awaiting_admin")
      .order("last_message_at").limit(100);
    if (error) return erreur(error.message, 500);
    const threads = (data ?? []) as FeedbackThreadRow[];
    const ids = threads.map((t) => t.id);
    const [noms, debuts, { data: brouillons }] = await Promise.all([
      pseudos(supabase, threads.map((t) => t.user_id)),
      extraits(supabase, ids),
      ids.length
        ? supabase.from("feedback_messages").select("*").in("thread_id", ids).eq("state", "draft")
        : Promise.resolve({ data: [] }),
    ]);
    const parFil = new Map(((brouillons ?? []) as FeedbackMessageRow[]).map((m) => [m.thread_id, m]));
    return NextResponse.json({
      drafts: threads.map((t) => ({
        thread_id: t.id,
        username: noms.get(t.user_id) ?? "?",
        kind: t.kind,
        category: t.category,
        locale: t.locale,
        title_fr: t.title_fr,
        summary_fr: t.summary_fr,
        excerpt: debuts.get(t.id) ?? "",
        last_message_at: t.last_message_at,
        draft: parFil.get(t.id) ? { id: parFil.get(t.id)!.id, body: parFil.get(t.id)!.body } : null,
      })),
      counts: await compteurs(supabase),
    });
  }

  if (view === "threads") {
    const page = Math.max(1, parseInt(q.get("page") ?? "1") || 1);
    let req = supabase
      .from("feedback_threads").select("*", { count: "exact" })
      .order("last_message_at", { ascending: false })
      .range((page - 1) * PAR_PAGE, page * PAR_PAGE - 1);
    const status = q.get("status");
    const kind = q.get("kind");
    if (status === "error") req = req.not("triage_error", "is", null);
    else if (status) req = req.eq("status", status);
    if (kind) req = req.eq("kind", kind);
    const { data, error, count } = await req;
    if (error) return erreur(error.message, 500);
    const threads = (data ?? []) as FeedbackThreadRow[];
    const [noms, debuts] = await Promise.all([
      pseudos(supabase, threads.map((t) => t.user_id)),
      extraits(supabase, threads.map((t) => t.id)),
    ]);
    return NextResponse.json({
      threads: threads.map((t) => ({
        id: t.id,
        username: noms.get(t.user_id) ?? "?",
        kind: t.kind,
        status: t.status,
        severity: t.severity,
        area: t.area,
        title_fr: t.title_fr,
        excerpt: debuts.get(t.id) ?? "",
        topic_id: t.topic_id,
        triage_error: t.triage_error,
        last_message_at: t.last_message_at,
      })),
      total: count ?? 0,
      page,
      per_page: PAR_PAGE,
      counts: await compteurs(supabase),
    });
  }

  return erreur("vue inconnue");
}

/** Envoie un message de l'équipe dans un fil et prévient le joueur. */
async function publier(supabase: SupabaseClient, thread: FeedbackThreadRow) {
  const maintenant = new Date().toISOString();
  await supabase
    .from("feedback_threads")
    .update({
      status: "answered",
      player_unread: true,
      // Une réponse humaine solde le tri en attente : l'agent n'a plus à passer.
      needs_triage: false,
      triage_error: null,
      last_message_at: maintenant,
      updated_at: maintenant,
    })
    .eq("id", thread.id);
  await notifierJoueur(supabase, thread, "feedback_reply");
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const maintenant = new Date().toISOString();

  const fil = async (id: unknown): Promise<FeedbackThreadRow | null> => {
    if (!uuid(id)) return null;
    const { data } = await supabase.from("feedback_threads").select("*").eq("id", id).maybeSingle();
    return (data as FeedbackThreadRow | null) ?? null;
  };

  switch (b.action) {
    // ── Sujets ────────────────────────────────────────────────────────────
    case "topic_decide": {
      const status = b.status;
      if (!uuid(b.id) || !["proposed", "accepted", "rejected", "deferred"].includes(status as string)) {
        return erreur("décision invalide");
      }
      const { error } = await supabase
        .from("feedback_topics")
        .update({
          status,
          decision_note: texte(b.note, 1000),
          decided_at: status === "proposed" ? null : maintenant,
          updated_at: maintenant,
        })
        .eq("id", b.id);
      return error ? erreur(error.message, 500) : NextResponse.json({ success: true });
    }

    case "topic_edit": {
      if (!uuid(b.id)) return erreur("identifiant invalide");
      const titre = texte(b.title, 140);
      if (!titre) return erreur("titre requis");
      const severity = FEEDBACK_SEVERITIES.includes(b.severity as never) ? b.severity : "medium";
      const { error } = await supabase
        .from("feedback_topics")
        .update({ title: titre, summary: texte(b.summary, 1500), repro: texte(b.repro, 1500), severity, updated_at: maintenant })
        .eq("id", b.id);
      return error ? erreur(error.message, 500) : NextResponse.json({ success: true });
    }

    case "topic_merge": {
      // Les retours de `from` rejoignent `into`, puis `from` disparaît.
      if (!uuid(b.from) || !uuid(b.into) || b.from === b.into) return erreur("fusion invalide");
      const { data: cible } = await supabase.from("feedback_topics").select("id").eq("id", b.into).maybeSingle();
      if (!cible) return erreur("sujet cible introuvable", 404);
      const { error } = await supabase.from("feedback_threads").update({ topic_id: b.into }).eq("topic_id", b.from);
      if (error) return erreur(error.message, 500);
      await supabase.from("feedback_topics").delete().eq("id", b.from);
      await supabase.from("feedback_topics").update({ updated_at: maintenant }).eq("id", b.into);
      return NextResponse.json({ success: true });
    }

    case "topic_ship": {
      // « Livré » : le changement est en ligne, on prévient chaque joueur concerné.
      if (!uuid(b.id)) return erreur("identifiant invalide");
      const { data: topic } = await supabase.from("feedback_topics").select("status").eq("id", b.id).maybeSingle();
      if (!topic) return erreur("introuvable", 404);
      if (topic.status === "shipped") return erreur("déjà livré");
      const { error } = await supabase
        .from("feedback_topics").update({ status: "shipped", updated_at: maintenant }).eq("id", b.id);
      if (error) return erreur(error.message, 500);
      const { data: fils } = await supabase.from("feedback_threads").select("*").eq("topic_id", b.id);
      // Une notification par joueur, même s'il a signalé la chose plusieurs fois.
      const vus = new Set<string>();
      let prevenus = 0;
      for (const t of (fils ?? []) as FeedbackThreadRow[]) {
        if (vus.has(t.user_id)) continue;
        vus.add(t.user_id);
        await notifierJoueur(supabase, t, "feedback_shipped");
        prevenus++;
      }
      return NextResponse.json({ success: true, notified: prevenus });
    }

    // ── Réponses ──────────────────────────────────────────────────────────
    case "draft_send": {
      // Valide le brouillon de l'agent, tel quel ou corrigé.
      if (!uuid(b.message_id)) return erreur("identifiant invalide");
      const { data: m } = await supabase
        .from("feedback_messages").select("*").eq("id", b.message_id).eq("state", "draft").maybeSingle();
      if (!m) return erreur("brouillon introuvable", 404);
      const corps = texte(b.body, MAX_BODY_CHARS) || (m.body as string);
      const thread = await fil(m.thread_id);
      if (!thread) return erreur("fil introuvable", 404);
      const { error } = await supabase
        .from("feedback_messages")
        // Corrigé par l'admin, le message est signé de l'admin ; envoyé tel
        // quel, il reste celui de l'agent. La date devient celle de l'envoi.
        .update({
          state: "sent",
          body: corps,
          created_at: maintenant,
          ...(corps !== m.body ? { author: "admin", author_id: auth.user.id } : {}),
        })
        .eq("id", m.id);
      if (error) return erreur(error.message, 500);
      await publier(supabase, thread);
      return NextResponse.json({ success: true });
    }

    case "reply": {
      const thread = await fil(b.thread_id);
      if (!thread) return erreur("fil introuvable", 404);
      const corps = texte(b.body, MAX_BODY_CHARS);
      if (!corps) return erreur("message vide");
      // Une réponse écrite à la main remplace le brouillon de l'agent.
      await supabase.from("feedback_messages").delete().eq("thread_id", thread.id).eq("state", "draft");
      const { error } = await supabase
        .from("feedback_messages")
        .insert({ thread_id: thread.id, author: "admin", author_id: auth.user.id, body: corps });
      if (error) return erreur(error.message, 500);
      await publier(supabase, thread);
      return NextResponse.json({ success: true });
    }

    // ── Fils ──────────────────────────────────────────────────────────────
    case "thread_close": {
      // Clôt sans répondre : le brouillon éventuel est abandonné.
      const thread = await fil(b.thread_id);
      if (!thread) return erreur("fil introuvable", 404);
      await supabase.from("feedback_messages").delete().eq("thread_id", thread.id).eq("state", "draft");
      const { error } = await supabase
        .from("feedback_threads")
        .update({ status: "closed", needs_triage: false, triage_error: null, updated_at: maintenant })
        .eq("id", thread.id);
      return error ? erreur(error.message, 500) : NextResponse.json({ success: true });
    }

    case "thread_retriage": {
      const thread = await fil(b.thread_id);
      if (!thread) return erreur("fil introuvable", 404);
      await supabase
        .from("feedback_threads")
        .update({ needs_triage: true, triage_attempts: 0, triage_error: null, updated_at: maintenant })
        .eq("id", thread.id);
      after(() => trierFil(getAdminClient(), thread.id));
      return NextResponse.json({ success: true });
    }

    case "thread_set_topic": {
      // Rattache un retour à un autre sujet, ou le détache (topic_id nul).
      const thread = await fil(b.thread_id);
      if (!thread) return erreur("fil introuvable", 404);
      const cible = b.topic_id == null ? null : b.topic_id;
      if (cible !== null) {
        if (!uuid(cible)) return erreur("sujet invalide");
        const { data: t } = await supabase.from("feedback_topics").select("id").eq("id", cible).maybeSingle();
        if (!t) return erreur("sujet introuvable", 404);
      }
      const { error } = await supabase
        .from("feedback_threads").update({ topic_id: cible, updated_at: maintenant }).eq("id", thread.id);
      return error ? erreur(error.message, 500) : NextResponse.json({ success: true });
    }

    default:
      return erreur("action inconnue");
  }
}
