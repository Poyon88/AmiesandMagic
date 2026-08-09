import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin/requireAdmin';

/** Bruitage par CAPACITÉ (table `keyword_sfx`, une ligne par ability).
 *
 *  Miroir de `api/keyword-icon-assets` : même bucket de stockage que les autres
 *  bruitages (`sfx-tracks`), sous le préfixe `keywords/`.
 *
 *  GET est ouvert (le client charge la table au démarrage pour précharger les
 *  fichiers, comme `sfx_tracks`) ; PUT et DELETE passent par requireAdmin. */

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('keyword_sfx')
    .select('keyword, file_url');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Rendu en Record<keyword, url> : c'est la forme que consomme le store audio
  // et celle des sons standards (standardSfxUrls).
  const urls: Record<string, string> = {};
  for (const row of data ?? []) urls[row.keyword] = row.file_url;
  return NextResponse.json(urls);
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;

  try {
    const { keyword, audioBase64, mimeType } = await request.json();
    if (!keyword || !audioBase64 || !mimeType) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    const buffer = Buffer.from(audioBase64, 'base64');
    const ext = mimeType.split('/')[1]?.replace('mpeg', 'mp3') || 'mp3';
    const safeKw = String(keyword).replace(/[^a-z0-9_]/gi, '');
    const filePath = `keywords/${safeKw}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('sfx-tracks')
      .upload(filePath, buffer, { upsert: true, contentType: mimeType, cacheControl: '31536000' });
    if (upErr) throw new Error(`Upload : ${upErr.message}`);

    const file_url = supabase.storage.from('sfx-tracks').getPublicUrl(filePath).data.publicUrl;

    // upsert : remplacer le son d'une capacité est le geste courant, et la clé
    // primaire est le mot-clé lui-même.
    const { error } = await supabase
      .from('keyword_sfx')
      .upsert({ keyword, file_url, updated_at: new Date().toISOString() }, { onConflict: 'keyword' });
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, file_url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;

  try {
    const { keyword } = await request.json();
    if (!keyword) return NextResponse.json({ error: 'Mot-clé requis' }, { status: 400 });

    // Le fichier reste dans le bucket : un même son peut avoir été réutilisé
    // ailleurs, et l'espace est négligeable devant le risque de casser un lien.
    const { error } = await supabase.from('keyword_sfx').delete().eq('keyword', keyword);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}
