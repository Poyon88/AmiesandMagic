import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { getAllRaces } from '@/lib/card-engine/constants';
import { cheminVoix, extensionFichier, isVoiceGender, nomVoix } from '@/lib/audio/voice-sfx';

// /api/voice-sfx — ADMIN — bibliothèque des voix d'entrée en jeu (table voice_sfx).
//
// Import en deux temps, pour que le fichier parte directement du navigateur
// vers Supabase Storage (pas de limite de corps de fonction) :
//   1. POST { race, gender, filename } → nom calculé + URL d'upload signée
//      (409 si le nom existe déjà : le fichier est ignoré, jamais écrasé) ;
//   2. PUT  { race, gender, filename } → après l'upload, vérifie que le fichier
//      est bien dans le bucket puis inscrit la ligne.
// PATCH { id, race?, gender? } : recalcule le nom, sans déplacer le fichier
// (des cartes peuvent y pointer). DELETE { id } : refusé si une carte l'utilise.

const BUCKET = 'sfx-tracks';
const COLONNES = 'id, name, race, gender, source_filename, file_path, file_url, created_at';

function valider(body: Record<string, unknown>) {
  const race = typeof body.race === 'string' ? body.race : '';
  const gender = body.gender;
  const filename = typeof body.filename === 'string' ? body.filename : '';
  if (!getAllRaces().includes(race)) return { error: `Race inconnue : ${race || '(vide)'}` };
  if (!isVoiceGender(gender)) return { error: 'Genre attendu : M, F ou N' };
  const ext = extensionFichier(filename);
  if (!ext) return { error: `Extension non audio : ${filename}` };
  const name = nomVoix(race, gender, filename);
  return { race, gender, filename, ext, name, path: cheminVoix(race, gender, name, ext) };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;
  const { searchParams } = new URL(request.url);

  let q = supabase.from('voice_sfx').select(COLONNES).order('race').order('gender').order('name');
  const race = searchParams.get('race');
  const gender = searchParams.get('gender');
  if (race) q = q.eq('race', race);
  if (gender) q = q.eq('gender', gender);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cartes qui utilisent chaque fichier comme son d'entrée en jeu. On lit les
  // cartes munies d'un son (quelques centaines) plutôt que de filtrer par la
  // liste des URL, qui rendrait la requête trop longue (400).
  const parUrl = new Map<string, { id: number; name: string }[]>();
  for (let from = 0; ; from += 1000) {
    const { data: cartes, error: e2 } = await supabase
      .from('cards').select('id, name, sfx_play_url').not('sfx_play_url', 'is', null)
      .order('id').range(from, from + 999);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    for (const c of cartes ?? []) {
      const l = parUrl.get(c.sfx_play_url) ?? [];
      l.push({ id: c.id, name: c.name });
      parUrl.set(c.sfx_play_url, l);
    }
    if ((cartes?.length ?? 0) < 1000) break;
  }
  return NextResponse.json((data ?? []).map((v) => ({ ...v, used_by: parUrl.get(v.file_url) ?? [] })));
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;
  const v = valider(await request.json().catch(() => ({})));
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const { data: deja } = await supabase.from('voice_sfx').select('id').eq('name', v.name).maybeSingle();
  if (deja) return NextResponse.json({ error: 'Déjà présent', name: v.name }, { status: 409 });

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(v.path);
  if (error || !data) {
    const existe = error?.message?.toLowerCase().includes('exist');
    return NextResponse.json(
      { error: existe ? 'Un fichier existe déjà à ce chemin' : (error?.message ?? "Impossible de créer l'URL signée"), name: v.name },
      { status: existe ? 409 : 500 },
    );
  }
  return NextResponse.json({ name: v.name, path: v.path, signedUrl: data.signedUrl, token: data.token });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;
  const v = valider(await request.json().catch(() => ({})));
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });

  // Le fichier doit avoir été uploadé au chemin attendu.
  const dossier = v.path.slice(0, v.path.lastIndexOf('/'));
  const fichier = v.path.slice(v.path.lastIndexOf('/') + 1);
  const { data: liste } = await supabase.storage.from(BUCKET).list(dossier, { search: fichier });
  if (!liste?.some((o) => o.name === fichier)) {
    return NextResponse.json({ error: 'Fichier introuvable dans le stockage' }, { status: 400 });
  }

  const { data: url } = supabase.storage.from(BUCKET).getPublicUrl(v.path);
  const { data, error } = await supabase.from('voice_sfx').insert({
    name: v.name, race: v.race, gender: v.gender, source_filename: v.filename,
    file_path: v.path, file_url: url.publicUrl,
  }).select(COLONNES).single();
  if (error) {
    return NextResponse.json({ error: error.code === '23505' ? 'Déjà présent' : error.message }, { status: error.code === '23505' ? 409 : 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id manquant' }, { status: 400 });

  const { data: actuel } = await supabase.from('voice_sfx').select(COLONNES).eq('id', id).maybeSingle();
  if (!actuel) return NextResponse.json({ error: 'Son introuvable' }, { status: 404 });

  const race = body.race ?? actuel.race;
  const gender = body.gender ?? actuel.gender;
  if (!getAllRaces().includes(race)) return NextResponse.json({ error: `Race inconnue : ${race}` }, { status: 400 });
  if (!isVoiceGender(gender)) return NextResponse.json({ error: 'Genre attendu : M, F ou N' }, { status: 400 });
  const name = nomVoix(race, gender, actuel.source_filename ?? actuel.file_path);

  const { data, error } = await supabase.from('voice_sfx').update({ race, gender, name }).eq('id', id).select(COLONNES).single();
  if (error) {
    return NextResponse.json({ error: error.code === '23505' ? `Le nom ${name} existe déjà` : error.message }, { status: error.code === '23505' ? 409 : 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id manquant' }, { status: 400 });

  const { data: actuel } = await supabase.from('voice_sfx').select('id, file_path, file_url').eq('id', id).maybeSingle();
  if (!actuel) return NextResponse.json({ error: 'Son introuvable' }, { status: 404 });

  const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('sfx_play_url', actuel.file_url);
  if (count) return NextResponse.json({ error: `Utilisé par ${count} carte(s) : suppression refusée` }, { status: 409 });

  const { error } = await supabase.from('voice_sfx').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.storage.from(BUCKET).remove([actuel.file_path]);
  return NextResponse.json({ ok: true });
}
