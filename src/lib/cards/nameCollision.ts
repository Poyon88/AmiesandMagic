import type { SupabaseClient } from '@supabase/supabase-js';
import { scanAllRows } from '@/lib/supabase/fetchAllRows';

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
 *  On balaie `id, name` sur toute la table au lieu d'un `ilike` : le `trim`
 *  doit s'appliquer des DEUX côtés, ce qu'un filtre PostgREST ne sait pas faire
 *  sans fonction SQL dédiée. Le balayage est PAGINÉ (`scanAllRows`) : sans
 *  cela, PostgREST s'arrête à 1 000 lignes et la garde déclare « nom libre »
 *  un nom qui est pris — c'est arrivé, sur « Refus du Destin ».
 *
 *  Jette si la lecture échoue (le helper s'en charge). C'est délibéré : cette
 *  fonction est la garde anti-doublon de `POST /api/cards/save`, et un `null`
 *  rendu sur erreur signifierait « nom libre » — soit exactement l'écrasement
 *  qu'elle existe pour empêcher. */
export async function findNameCollision(
  supabaseAdmin: SupabaseClient,
  name: unknown,
  exceptId?: number,
): Promise<NameCollision | null> {
  const needle = normalizeCardName(name);
  if (!needle) return null;

  return scanAllRows<{ id: number; name: string | null }, NameCollision>(
    (from, to) => supabaseAdmin.from('cards').select('id, name').order('id').range(from, to),
    (rows) => {
      for (const row of rows) {
        if (exceptId != null && row.id === exceptId) continue;
        if (normalizeCardName(row.name) === needle) {
          return { id: row.id, name: row.name ?? '' };
        }
      }
      return undefined;
    },
    { label: "Vérification d'homonyme impossible" },
  );
}
