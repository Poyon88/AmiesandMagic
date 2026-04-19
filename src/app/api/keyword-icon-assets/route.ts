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
    },
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

// GET /api/keyword-icon-assets?keyword=xxx — list assets, optionally filtered
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword");
  const activeRes = await supabase
    .from("keyword_icons")
    .select("keyword, icon_url");
  const activeMap: Record<string, string> = {};
  for (const row of activeRes.data ?? []) {
    if (row.icon_url) activeMap[row.keyword] = row.icon_url;
  }

  let query = supabase
    .from("keyword_icon_assets")
    .select("*")
    .order("created_at", { ascending: false });
  if (keyword) query = query.eq("keyword", keyword);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const assets = (data ?? []).map((a) => ({
    ...a,
    is_active: activeMap[a.keyword] === a.icon_url,
  }));
  return NextResponse.json({ assets });
}

// POST /api/keyword-icon-assets — create a new asset (uploads image)
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { name, imageBase64, imageMimeType, keyword_type, keyword, style, prompt } = await request.json();
    if (!name || !imageBase64 || !imageMimeType || !keyword_type || !keyword) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }
    if (keyword_type !== "creature" && keyword_type !== "spell") {
      return NextResponse.json({ error: "keyword_type invalide" }, { status: 400 });
    }

    const buffer = Buffer.from(imageBase64, "base64");
    const ext = imageMimeType.split("/")[1] || "webp";
    const filePath = `kw_${keyword}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("keyword-icon-images")
      .upload(filePath, buffer, { upsert: true, contentType: imageMimeType });
    if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from("keyword-icon-images").getPublicUrl(filePath);
    const icon_url = urlData.publicUrl;

    const { data: inserted, error } = await supabase
      .from("keyword_icon_assets")
      .insert({ name, icon_url, keyword_type, keyword, style, prompt })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // First icon ever for this keyword? Auto-activate it so the game picks
    // up something immediately.
    const { data: existing } = await supabase
      .from("keyword_icons")
      .select("icon_url")
      .eq("keyword", keyword)
      .maybeSingle();
    if (!existing) {
      await supabase.from("keyword_icons").upsert({ keyword, icon_url });
    }

    return NextResponse.json({ success: true, id: inserted?.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}

// PATCH /api/keyword-icon-assets — activate an asset (make it the icon for its keyword)
export async function PATCH(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const { data: asset } = await supabase
      .from("keyword_icon_assets")
      .select("keyword, icon_url")
      .eq("id", id)
      .maybeSingle();
    if (!asset) return NextResponse.json({ error: "Asset introuvable" }, { status: 404 });

    await supabase.from("keyword_icons").upsert({
      keyword: asset.keyword,
      icon_url: asset.icon_url,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}

// DELETE /api/keyword-icon-assets — remove an asset + its stored image
export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const { data: asset } = await supabase
      .from("keyword_icon_assets")
      .select("icon_url, keyword")
      .eq("id", id)
      .maybeSingle();
    if (!asset) return NextResponse.json({ error: "Asset introuvable" }, { status: 404 });

    // Remove the stored image
    if (asset.icon_url) {
      const url = new URL(asset.icon_url);
      const storagePath = url.pathname.split("/keyword-icon-images/")[1];
      if (storagePath) {
        await supabase.storage.from("keyword-icon-images").remove([storagePath]);
      }
    }

    // If this asset was the active one for its keyword, clear the cache so
    // the game falls back to the emoji default.
    const { data: activeRow } = await supabase
      .from("keyword_icons")
      .select("icon_url")
      .eq("keyword", asset.keyword)
      .maybeSingle();
    if (activeRow?.icon_url === asset.icon_url) {
      await supabase.from("keyword_icons").delete().eq("keyword", asset.keyword);
    }

    const { error } = await supabase.from("keyword_icon_assets").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
