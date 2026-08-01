import type { SupabaseClient } from '@supabase/supabase-js';

/** Clé de comparaison des noms de cartes. La base contient déjà des noms à
 *  espace final et des variantes de casse : on normalise des DEUX côtés pour
 *  que « Golem en surcharge » et « Golem en Surcharge  » soient reconnus comme
 *  le même nom. Volontairement partagée entre la sauvegarde et la vérification
 *  en amont : deux règles divergentes laisseraient passer un doublon que la
 *  sauvegarde refuserait ensuite — le cas même qu'on cherche à éviter. */
export function normalizeCardName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().toLowerCase();
  return trimmed || null;
}

export type NameCollision = { id: number; name: string };

/** Cherche une carte homonyme. `exceptId` exclut la carte en cours de
 *  renommage.
 *
 *  On charge `id, name` pour toute la table (quelques centaines de lignes) au
 *  lieu d'un `ilike` : le `trim` doit s'appliquer des DEUX côtés, ce qu'un
 *  filtre PostgREST ne sait pas faire sans fonction SQL dédiée. */
export async function findNameCollision(
  supabaseAdmin: SupabaseClient,
  name: unknown,
  exceptId?: number,
): Promise<NameCollision | null> {
  const needle = normalizeCardName(name);
  if (!needle) return null;
  const { data } = await supabaseAdmin.from('cards').select('id, name');
  for (const row of (data ?? []) as { id: number; name: string | null }[]) {
    if (exceptId != null && row.id === exceptId) continue;
    if (normalizeCardName(row.name) === needle) {
      return { id: row.id, name: row.name ?? '' };
    }
  }
  return null;
}
