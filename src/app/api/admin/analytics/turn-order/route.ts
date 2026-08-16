// GET /api/admin/analytics/turn-order — winrate selon l'ordre de jeu.
//
// Répond à : « commencer avantage-t-il, ou désavantage-t-il ? » — question
// devenue mesurable depuis que le premier joueur reçoit une carte de moins.
//
// Aucune colonne n'a été ajoutée pour cela : le premier joueur se dérive de
// l'identifiant de la partie, donc la statistique couvre AUSSI toutes les
// parties jouées avant que la question ne se pose.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { aggregateByTurnOrder, fetchSnapshots, type MatchSides, type Period } from '@/lib/admin/analytics';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const period = (new URL(request.url).searchParams.get('period') ?? 'all') as Period;

  try {
    const snapshots = await fetchSnapshots(auth.supabase, period);

    // On ne charge que les parties concernées par la période, pas toute la
    // table : la liste des instantanés borne déjà l'ensemble utile.
    const ids = [...new Set(snapshots.map((s) => s.match_id))];
    const { data: matches, error } = ids.length
      ? await auth.supabase.from('matches').select('id, player1_id, player2_id').in('id', ids)
      : { data: [] as MatchSides[], error: null };
    if (error) throw new Error(error.message);

    return NextResponse.json(aggregateByTurnOrder(snapshots, (matches ?? []) as MatchSides[]));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
