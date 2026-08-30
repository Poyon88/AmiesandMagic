import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { fillXYMagnitude } from '@/lib/cards/composedMagnitude';
import { isTokenFiringTrigger } from '@/lib/game/capability-adapter';
import type { Capability } from '@/lib/game/types';

/** Normalise les capacités COMPOSÉES d'un token. Miroir de `sanitizeComposed`
 *  côté cartes (uid stables préfixés `cx_`, amplitudes +X/+Y complétées), à une
 *  vérification près qui n'existe que pour les jetons.
 *
 *  Rend `{ error }` au lieu d'écarter en silence : un token n'entre jamais en
 *  jeu par `playCard`, donc une capacité « à l'entrée » y serait définitivement
 *  muette. La retirer sans rien dire rendrait la sauvegarde réussie et l'effet
 *  absent — précisément la panne invisible qu'on passe son temps à traquer. */
function normaliserCapacites(
  input: unknown,
): { caps: Capability[] } | { error: string } {
  if (input == null) return { caps: [] };
  if (!Array.isArray(input)) return { error: 'capabilities doit être un tableau' };

  const composees = (input as Capability[]).filter((c) => c && typeof c === 'object' && c.composed);

  // Les EMBLÈMES sont posés par `placeEmblemsForCard`, appelé à l'entrée d'une
  // CRÉATURE et à la résolution d'un SORT. Un jeton ne passe ni par l'un ni par
  // l'autre : l'emblème ne serait jamais posé. Refusé plutôt que rabattu en
  // silence sur un effet ordinaire — c'est ce rabattement muet, côté cartes, qui
  // a rendu TOUS les emblèmes inopérants sans que rien ne le signale.
  if (composees.some((c) => c.effectKind === 'emblem')) {
    return { error: "Un jeton ne peut pas poser d'emblème : il n'entre pas en jeu par une pose et n'est pas un sort, donc l'emblème ne serait jamais déposé." };
  }

  const muettes = composees.filter((c) => !isTokenFiringTrigger(c.trigger));
  if (muettes.length) {
    const quoi = [...new Set(muettes.map((c) => c.trigger))].join(', ');
    return {
      error: `Un jeton n'entre pas en jeu par une pose : le déclencheur « ${quoi} » n'y partirait jamais. `
        + 'Choisissez la mort, l\'activation, le retour, la fin de tour, l\'attaque ou les bas PV.',
    };
  }

  return {
    caps: composees.map((c, i) =>
      fillXYMagnitude({ ...c, uid: `cx_${i}`, effectKind: 'immediate' as const, abilityId: c.abilityId || '_composed' }),
    ),
  };
}

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

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('token_templates')
    .select('*')
    .order('race');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = auth.supabase;

  try {
    const { race, clan, faction, name, attack, health, keywords, keyword_instances, capabilities, imageBase64, imageMimeType, updateId } = await request.json();
    if (!race || !name) return NextResponse.json({ error: 'Race et nom requis' }, { status: 400 });

    const capsNorm = normaliserCapacites(capabilities);
    if ('error' in capsNorm) return NextResponse.json({ error: capsNorm.error }, { status: 400 });
    const atk = typeof attack === 'number' && attack >= 0 ? Math.floor(attack) : 1;
    const hp = typeof health === 'number' && health >= 1 ? Math.floor(health) : 1;

    let image_url: string | null = null;
    if (imageBase64 && imageMimeType) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const ext = imageMimeType.split('/')[1] || 'webp';
      const safeName = race.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
      const filePath = `token_${safeName}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('card-images')
        .upload(filePath, buffer, { upsert: true, contentType: imageMimeType, cacheControl: '31536000' });
      if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);
      const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(filePath);
      image_url = urlData.publicUrl;
    }

    const templateData: Record<string, unknown> = {
      race,
      faction: typeof faction === 'string' && faction.trim() ? faction.trim() : null,
      clan: typeof clan === 'string' && clan.trim() ? clan.trim() : null,
      name,
      attack: atk,
      health: hp,
      keywords: keywords || [],
      // Sidecar X/Y des capacités. Écrit MÊME à null : sur une mise à jour,
      // désélectionner la dernière capacité scalable doit effacer l'ancien
      // sidecar, sinon le template garderait un X fantôme invisible dans le
      // formulaire. Seules les entrées bien formées ({id}) sont retenues.
      keyword_instances: Array.isArray(keyword_instances)
        ? (keyword_instances.filter(
            (k: unknown): k is { id: string } =>
              !!k && typeof k === 'object' && typeof (k as { id?: unknown }).id === 'string',
          ).length ? keyword_instances : null)
        : null,
      // Effets composés. Écrits MÊME à null, pour la même raison que le
      // sidecar : retirer le dernier effet d'un token doit l'effacer en base,
      // sinon le template garderait un effet fantôme absent du formulaire.
      capabilities: capsNorm.caps.length ? capsNorm.caps : null,
    };
    if (image_url) templateData.image_url = image_url;

    if (updateId) {
      const { error: updateErr } = await supabase
        .from('token_templates')
        .update(templateData)
        .eq('id', updateId);
      if (updateErr) throw new Error(updateErr.message);
      return NextResponse.json({ success: true, updated: true });
    } else {
      if (!image_url) templateData.image_url = null;
      const { error: insertErr } = await supabase.from('token_templates').insert(templateData);
      if (insertErr) throw new Error(insertErr.message);
      return NextResponse.json({ success: true, updated: false });
    }
  } catch (err) {
    console.error('[token-templates] error:', err);
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

    const { error } = await supabase.from('token_templates').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[token-templates] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
