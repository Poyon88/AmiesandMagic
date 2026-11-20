// Un fil de retour : le lire (et le marquer lu), y répondre.
//
// Les tables n'ont aucune policy : c'est le filtre `user_id` ci-dessous qui
// réserve un fil à son auteur. Un fil d'autrui répond 404, comme un fil
// inexistant — on ne confirme pas qu'il existe.
import { NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, getAuthUser } from "@/lib/admin/requireAdmin";
import { trierFil } from "@/lib/feedback/agent";
import { quotaOk, texteValide, urlsSignees, verifierPieces } from "@/lib/feedback/server";
import {
  playerOutcome,
  playerState,
  type FeedbackAttachmentRow,
  type FeedbackMessageRow,
  type FeedbackThreadRow,
  type PlayerThreadDetail,
} from "@/lib/feedback/types";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function monFil(supabase: SupabaseClient, id: string, userId: string): Promise<FeedbackThreadRow | null> {
  if (!UUID.test(id)) return null;
  const { data } = await supabase.from("feedback_threads").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return (data as FeedbackThreadRow | null) ?? null;
}

// GET /api/feedback/[id]
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();
  const thread = await monFil(supabase, (await params).id, user.id);
  if (!thread) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const [{ data: msgs }, { data: pjs }, { data: topic }] = await Promise.all([
    // Les brouillons de l'agent ne sont pas pour le joueur.
    supabase.from("feedback_messages").select("*").eq("thread_id", thread.id).eq("state", "sent").order("created_at"),
    supabase.from("feedback_attachments").select("*").eq("thread_id", thread.id).order("created_at"),
    thread.topic_id
      ? supabase.from("feedback_topics").select("status").eq("id", thread.topic_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const messages = (msgs ?? []) as FeedbackMessageRow[];
  const pieces = (pjs ?? []) as FeedbackAttachmentRow[];
  const urls = await urlsSignees(supabase, pieces.map((p) => p.path));

  if (thread.player_unread) {
    await supabase.from("feedback_threads").update({ player_unread: false }).eq("id", thread.id);
  }

  const detail: PlayerThreadDetail = {
    id: thread.id,
    kind: thread.kind_declared,
    state: playerState(thread.status),
    outcome: playerOutcome(topic?.status),
    excerpt: "",
    unread: false,
    created_at: thread.created_at,
    last_message_at: thread.last_message_at,
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      created_at: m.created_at,
      attachments: pieces
        .filter((p) => p.message_id === m.id && urls.has(p.path))
        .map((p) => ({ id: p.id, url: urls.get(p.path)! })),
    })),
  };
  return NextResponse.json({ thread: detail });
}

// POST /api/feedback/[id] — body { body, attachments?: string[] } : le joueur relance.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();
  const thread = await monFil(supabase, (await params).id, user.id);
  if (!thread) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const brut = await request.json().catch(() => null);
  const texte = texteValide(brut?.body);
  if (!texte) return NextResponse.json({ error: "message invalide", code: "bad_body" }, { status: 400 });
  const pieces = await verifierPieces(supabase, user.id, brut?.attachments);
  if (!pieces) return NextResponse.json({ error: "pièces jointes invalides", code: "bad_attachments" }, { status: 400 });

  if (!(await quotaOk(supabase, user.id, "feedback_reply"))) {
    return NextResponse.json({ error: "limite atteinte", code: "quota" }, { status: 429 });
  }

  const { data: message, error } = await supabase
    .from("feedback_messages")
    .insert({ thread_id: thread.id, author: "player", author_id: user.id, body: texte })
    .select("id")
    .single();
  if (error || !message) return NextResponse.json({ error: error?.message ?? "échec" }, { status: 500 });
  if (pieces.length) {
    const { error: errPj } = await supabase.from("feedback_attachments").insert(
      pieces.map((p) => ({ thread_id: thread.id, message_id: message.id, ...p })),
    );
    if (errPj) console.warn("[feedback] pièces non rattachées :", errPj.message);
  }

  // Un nouveau message rouvre le fil (même clos) et le renvoie au tri.
  const maintenant = new Date().toISOString();
  await supabase
    .from("feedback_threads")
    .update({
      status: "new",
      needs_triage: true,
      triage_attempts: 0,
      triage_error: null,
      last_message_at: maintenant,
      updated_at: maintenant,
    })
    .eq("id", thread.id);

  after(() => trierFil(getAdminClient(), thread.id));
  return NextResponse.json({ success: true });
}
