import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { findNameCollision } from '@/lib/cards/nameCollision';

/** Vérification d'homonyme EN AMONT de la sauvegarde.
 *
 *  La forge n'apprenait la collision qu'au `POST /api/cards/save`, c'est-à-dire
 *  après la génération de l'illustration : un refus faisait perdre tout le
 *  travail (le garde serveur est placé avant l'upload, donc rien n'est
 *  conservé). Cette route permet de prévenir dès la saisie du nom.
 *
 *  Elle ne remplace PAS le garde de la sauvegarde — elle le double. */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const exceptIdRaw = searchParams.get('exceptId');
  const exceptId = exceptIdRaw != null && /^\d+$/.test(exceptIdRaw) ? Number(exceptIdRaw) : undefined;

  const existing = await findNameCollision(auth.supabase, name, exceptId);
  return NextResponse.json({ taken: existing != null, existing });
}
