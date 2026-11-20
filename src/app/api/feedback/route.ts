// Retours du joueur connecté : ouvrir un retour, lister les siens.
import { NextResponse, after } from "next/server";
import { getLocale } from "next-intl/server";
import { getAdminClient, getAuthUser } from "@/lib/admin/requireAdmin";
import { trierFil } from "@/lib/feedback/agent";
import { contextePropre, quotaOk, texteValide, verifierPieces } from "@/lib/feedback/server";
import {
  FEEDBACK_KINDS,
  playerOutcome,
  playerState,
  type FeedbackKindDeclared,
  type FeedbackThreadRow,
  type PlayerThreadSummary,
  type TopicStatus,
} from "@/lib/feedback/types";

// Le tri par l'agent se poursuit après la réponse (`after`).
export const maxDuration = 60;

// GET /api/feedback — mes retours, du plus récent au plus ancien.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("feedback_threads")
    .select("*")
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const threads = (data ?? []) as FeedbackThreadRow[];
  if (threads.length === 0) return NextResponse.json({ threads: [] });

  const ids = threads.map((t) => t.id);
  const topicIds = [...new Set(threads.map((t) => t.topic_id).filter((v): v is string => !!v))];
  const [{ data: premiers }, { data: topics }] = await Promise.all([
    supabase.from("feedback_messages").select("thread_id, body, created_at")
      .in("thread_id", ids).eq("author", "player").order("created_at"),
    topicIds.length
      ? supabase.from("feedback_topics").select("id, status").in("id", topicIds)
      : Promise.resolve({ data: [] as { id: string; status: TopicStatus }[] }),
  ]);
  const extrait = new Map<string, string>();
  for (const m of premiers ?? []) {
    if (!extrait.has(m.thread_id)) extrait.set(m.thread_id, m.body.replace(/\s+/g, " ").slice(0, 160));
  }
  const statutSujet = new Map((topics ?? []).map((t) => [t.id, t.status as TopicStatus]));

  const out: PlayerThreadSummary[] = threads.map((t) => ({
    id: t.id,
    kind: t.kind_declared,
    state: playerState(t.status),
    outcome: playerOutcome(t.topic_id ? statutSujet.get(t.topic_id) : null),
    excerpt: extrait.get(t.id) ?? "",
    unread: t.player_unread,
    created_at: t.created_at,
    last_message_at: t.last_message_at,
  }));
  return NextResponse.json({ threads: out });
}

// POST /api/feedback — body { kind, body, attachments?: string[], context? }.
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brut = await request.json().catch(() => null);
  const kind = brut?.kind as FeedbackKindDeclared;
  if (!FEEDBACK_KINDS.includes(kind)) {
    return NextResponse.json({ error: "type invalide", code: "bad_kind" }, { status: 400 });
  }
  const texte = texteValide(brut?.body);
  if (!texte) return NextResponse.json({ error: "message invalide", code: "bad_body" }, { status: 400 });

  const supabase = getAdminClient();
  const pieces = await verifierPieces(supabase, user.id, brut?.attachments);
  if (!pieces) return NextResponse.json({ error: "pièces jointes invalides", code: "bad_attachments" }, { status: 400 });

  if (!(await quotaOk(supabase, user.id, "feedback_submit"))) {
    return NextResponse.json({ error: "limite atteinte", code: "quota" }, { status: 429 });
  }

  const { data: thread, error } = await supabase
    .from("feedback_threads")
    .insert({
      user_id: user.id,
      kind_declared: kind,
      kind,
      locale: await getLocale(),
      context: contextePropre(brut?.context),
    })
    .select("id")
    .single();
  if (error || !thread) return NextResponse.json({ error: error?.message ?? "échec" }, { status: 500 });

  const { data: message, error: errMsg } = await supabase
    .from("feedback_messages")
    .insert({ thread_id: thread.id, author: "player", author_id: user.id, body: texte })
    .select("id")
    .single();
  if (errMsg || !message) {
    await supabase.from("feedback_threads").delete().eq("id", thread.id);
    return NextResponse.json({ error: errMsg?.message ?? "échec" }, { status: 500 });
  }
  if (pieces.length) {
    const { error: errPj } = await supabase.from("feedback_attachments").insert(
      pieces.map((p) => ({ thread_id: thread.id, message_id: message.id, ...p })),
    );
    if (errPj) console.warn("[feedback] pièces non rattachées :", errPj.message);
  }

  after(() => trierFil(getAdminClient(), thread.id));
  return NextResponse.json({ id: thread.id });
}
