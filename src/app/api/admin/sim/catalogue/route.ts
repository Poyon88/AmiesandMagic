// GET /api/admin/sim/catalogue — ADMIN — decks des comptes admin / testeur
// (figés), catalogue complet et empreinte, pour le simulateur du navigateur.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { chargerSim } from '@/lib/sim/catalogue-db';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await chargerSim(auth.supabase));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
