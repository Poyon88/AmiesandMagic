import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { associer, COLONNES_CARTE, unitesSansSon, type CarteLue } from '@/lib/audio/voice-assign';

// /api/voice-sfx/assign — ADMIN — donne une voix d'entrée en jeu aux unités.
//   POST { cardIds: number[], remplacer?: boolean } : ces cartes (Création assistée) ;
//   POST { manquantes: true, limite?: number }     : un paquet d'unités SANS son
//        (bouton de /admin/sfx, appelé en boucle tant que `restantes` > 0).
// Candidates : voice-match.ts. Parmi leurs répliques, Claude choisit celle qui
// colle le mieux à la carte (nom, capacités, texte d'ambiance, illustration) ;
// puis la prise la moins utilisée. Sans candidate, la carte garde le son générique.

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const sb = auth.supabase;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.manquantes === true) {
      const limite = Math.min(Math.max(Number(body.limite) || 10, 1), 25);
      const toutes = await unitesSansSon(sb);
      const resultats = await associer(sb, toutes.slice(0, limite), false);
      // Une carte que rien ne peut servir (erreur répétée) ne doit pas bloquer la
      // boucle du client : `restantes` compte ce qui reste APRÈS ce paquet.
      return NextResponse.json({ resultats, restantes: Math.max(0, toutes.length - limite) });
    }
    const ids = Array.isArray(body.cardIds) ? body.cardIds.map(Number).filter(Number.isInteger).slice(0, 50) : [];
    if (!ids.length) return NextResponse.json({ error: 'cardIds ou manquantes attendu' }, { status: 400 });
    const { data, error } = await sb.from('cards').select(COLONNES_CARTE).in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ resultats: await associer(sb, (data ?? []) as CarteLue[], body.remplacer === true) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
