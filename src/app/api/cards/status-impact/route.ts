// Ce que toucherait un changement de statut d'une carte : decks qui la
// contiennent, exemplaires détenus, dons. Affiché par la forge avant une
// EXCLUSION (confirmation) — cf. supabase-migration-card-status.sql.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { impactStatut } from '@/lib/cards/cardStatusServer';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = parseInt(new URL(request.url).searchParams.get('id') ?? '', 10);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id invalide' }, { status: 400 });
  }
  try {
    return NextResponse.json(await impactStatut(auth.supabase, id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
