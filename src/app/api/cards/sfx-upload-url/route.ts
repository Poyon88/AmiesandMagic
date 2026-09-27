import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';

// POST /api/cards/sfx-upload-url — ADMIN
//
// URL d'upload SIGNÉE vers le bucket `sfx-tracks`, sur le modèle de
// /api/boards/upload-url : le fichier part directement du navigateur vers
// Supabase Storage, sans transiter par le corps d'une Netlify Function (~6 Mo
// max) ni exiger d'ouvrir le bucket en écriture (politique RLS publique).
//
// Réservée aux admins (requireAdmin), comme /api/cards/save : un son de carte
// est joué chez tous les joueurs.
//
// Entrée : { path?: string, upsert?: boolean }
//   - path : chemin DANS le bucket, sous `voices/` ou `cards/`, extension audio
//     (mp3, wav, ogg, m4a, webm). Ex. « voices/Nain/Homme/Let_them_come_3.mp3 ».
//     Absent : nom généré « cards/sfx_play_url_<horodatage>_<aléa>.mp3 ».
//   - upsert : remplace un fichier existant au même chemin (défaut false).
// Sortie : { signedUrl, token, path, publicUrl }
//
// Envoi du fichier : PUT sur `signedUrl` avec le fichier en corps et les en-têtes
// `content-type` (ex. audio/mpeg) et `cache-control: max-age=31536000` — même
// cache d'un an que les autres sons (cf. /api/cards/save). Avec supabase-js :
// storage.from('sfx-tracks').uploadToSignedUrl(path, token, file,
// { contentType: 'audio/mpeg', cacheControl: '31536000' }).
// Puis écrire `sfx_play_url = publicUrl` via /api/cards/save (partial).

const CHEMIN_VALIDE = /^(voices|cards)\/[A-Za-z0-9À-ÿ _.'()-]+(\/[A-Za-z0-9À-ÿ _.'()-]+)*\.(mp3|wav|ogg|m4a|webm)$/;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;

  const body = await request.json().catch(() => ({}));
  const demande = typeof body?.path === 'string' ? body.path.trim() : '';
  if (demande && (!CHEMIN_VALIDE.test(demande) || demande.includes('..'))) {
    return NextResponse.json(
      { error: 'Chemin refusé : attendu voices/… ou cards/… avec une extension audio (mp3, wav, ogg, m4a, webm), sans « .. ».' },
      { status: 400 },
    );
  }
  const path = demande || `cards/sfx_play_url_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`;

  const { data, error } = await supabase.storage
    .from('sfx-tracks')
    .createSignedUploadUrl(path, { upsert: body?.upsert === true });
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Impossible de créer l'URL signée" },
      { status: error?.message?.includes('exists') ? 409 : 500 },
    );
  }

  const { data: urlData } = supabase.storage.from('sfx-tracks').getPublicUrl(path);
  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: urlData.publicUrl,
  });
}
