import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();
  const url = new URL(request.url);
  const eventType = url.searchParams.get("event_type");

  let query = supabase.from("sfx_tracks").select("*").order("event_type");

  if (eventType) {
    query = query.in("event_type", eventType.split(","));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { event_type, name, audioBase64, audioMimeType } = await request.json();
    if (!event_type || !name || !audioBase64 || !audioMimeType) {
      return NextResponse.json({ error: "Type, nom et fichier audio requis" }, { status: 400 });
    }

    // Delete existing track for this event type
    const { data: existing } = await supabase
      .from("sfx_tracks")
      .select("id, file_url")
      .eq("event_type", event_type)
      .single();

    if (existing?.file_url) {
      const oldUrl = new URL(existing.file_url);
      const oldPath = oldUrl.pathname.split("/sfx-tracks/")[1];
      if (oldPath) {
        await supabase.storage.from("sfx-tracks").remove([oldPath]);
      }
      await supabase.from("sfx_tracks").delete().eq("id", existing.id);
    }

    // Upload new file
    const buffer = Buffer.from(audioBase64, "base64");
    const ext = audioMimeType.split("/")[1]?.replace("mpeg", "mp3") || "mp3";
    const filePath = `standard/${event_type}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("sfx-tracks")
      .upload(filePath, buffer, { upsert: true, contentType: audioMimeType });
    if (uploadErr) throw new Error(`Upload: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from("sfx-tracks").getPublicUrl(filePath);

    const { error } = await supabase.from("sfx_tracks").insert({
      event_type,
      name,
      file_url: urlData.publicUrl,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    const { data: track } = await supabase.from("sfx_tracks").select("file_url").eq("id", id).single();
    if (track?.file_url) {
      const url = new URL(track.file_url);
      const storagePath = url.pathname.split("/sfx-tracks/")[1];
      if (storagePath) {
        await supabase.storage.from("sfx-tracks").remove([storagePath]);
      }
    }

    const { error } = await supabase.from("sfx_tracks").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
