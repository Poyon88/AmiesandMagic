import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/admin/requireAdmin';

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

/** Téléverse l'icône d'un set et rend son URL publique.
 *
 *  Réutilise le bucket des icônes de mots-clés plutôt que d'en créer un
 *  nouveau : un bucket de plus, c'est une manipulation Supabase manuelle de
 *  plus à ne pas oublier avant le déploiement. Le préfixe `set_` suffit à les
 *  distinguer. */
async function uploadSetIcon(
  supabase: ReturnType<typeof getAdminClient>,
  code: string,
  iconBase64: string,
  iconMimeType: string,
): Promise<string> {
  const buffer = Buffer.from(iconBase64, 'base64');
  const ext = iconMimeType.split('/')[1] || 'webp';
  const safeCode = (code || 'set').toLowerCase().replace(/[^a-z0-9]/g, '');
  const filePath = `set_${safeCode}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { error } = await supabase.storage
    .from('keyword-icon-images')
    .upload(filePath, buffer, { upsert: true, contentType: iconMimeType, cacheControl: '31536000' });
  if (error) throw new Error(`Icône : ${error.message}`);
  return supabase.storage.from('keyword-icon-images').getPublicUrl(filePath).data.publicUrl;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sets')
    .select('*')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = auth.supabase;

  try {
    const { name, code, icon, released_at, type, iconBase64, iconMimeType } = await request.json();
    if (!name || !code) return NextResponse.json({ error: 'Nom et code requis' }, { status: 400 });
    const icon_url = iconBase64 && iconMimeType
      ? await uploadSetIcon(supabase, code, iconBase64, iconMimeType)
      : null;
    // Valeur inconnue → 'base'. La contrainte SQL refuserait la ligne, autant
    // ne pas dépendre d'une erreur 500 pour une faute de frappe côté client.
    const setType = type === 'special' ? 'special' : 'base';

    const { error } = await supabase.from('sets').insert({ name, code: code.toUpperCase(), icon: icon || '⚔️', released_at: released_at || null, type: setType, icon_url });
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = auth.supabase;

  try {
    const { id, name, code, icon, released_at, type, iconBase64, iconMimeType, clearIcon } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    // Trois cas distincts : nouvelle image, retrait explicite, ou rien à
    // changer. Le troisième doit laisser la colonne intacte — un `?? null`
    // effacerait l'icône à chaque simple renommage.
    const iconUrlPatch = iconBase64 && iconMimeType
      ? { icon_url: await uploadSetIcon(supabase, code ?? '', iconBase64, iconMimeType) }
      : clearIcon ? { icon_url: null } : {};

    const { error } = await supabase.from('sets').update({
      name, code: code?.toUpperCase(), icon, released_at: released_at ?? null,
      // `type` absent du corps ⇒ on n'y touche pas (mise à jour partielle).
      ...(type === undefined ? {} : { type: type === 'special' ? 'special' : 'base' }),
      ...iconUrlPatch,
    }).eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = auth.supabase;

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    // Check if any cards use this set
    const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('set_id', id);
    if (count && count > 0) {
      return NextResponse.json({ error: `${count} carte(s) utilisent ce set` }, { status: 400 });
    }

    const { error } = await supabase.from('sets').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
