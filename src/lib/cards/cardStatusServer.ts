// Règles SERVEUR du statut de cycle de vie des cartes (draft / playable /
// retired / excluded) — cf. supabase-migration-card-status.sql.
import type { SupabaseClient } from '@supabase/supabase-js';
import { CARD_STATUSES, type CardStatus } from '@/lib/game/types';

export function estStatutValide(v: unknown): v is CardStatus {
  return typeof v === 'string' && (CARD_STATUSES as readonly string[]).includes(v);
}

/** Ce que touche un changement de statut : decks qui contiennent la carte,
 *  exemplaires numérotés détenus par des joueurs, dons de collection. Sert à la
 *  confirmation d'exclusion et à la garde « retour en brouillon ». */
export interface ImpactStatut {
  decks: number;
  exemplairesDetenus: number;
  dons: number;
}

export async function impactStatut(admin: SupabaseClient, cardId: number): Promise<ImpactStatut> {
  const [decks, prints, dons] = await Promise.all([
    admin.from('deck_cards').select('deck_id', { count: 'exact', head: true }).eq('card_id', cardId),
    admin.from('card_prints').select('id', { count: 'exact', head: true }).eq('card_id', cardId).not('owner_id', 'is', null),
    admin.from('user_collections').select('id', { count: 'exact', head: true }).eq('card_id', cardId),
  ]);
  for (const r of [decks, prints, dons]) if (r.error) throw new Error(r.error.message);
  return { decks: decks.count ?? 0, exemplairesDetenus: prints.count ?? 0, dons: dons.count ?? 0 };
}

/** Refus éventuel d'un passage de statut, ou null. Seule règle dure : une carte
 *  que des joueurs détiennent (exemplaire, don) ou ont mise en deck ne redevient
 *  pas brouillon — elle disparaîtrait de leur collection (RLS). La possession
 *  IMPLICITE des communes de faction ne compte pas : elle bloquerait toute
 *  commune à vie. Tout le reste est libre, l'exclusion étant confirmée côté
 *  forge. */
export async function refusTransition(
  admin: SupabaseClient,
  cardId: number,
  prochain: CardStatus,
): Promise<string | null> {
  if (prochain !== 'draft') return null;
  const { data: cur, error } = await admin.from('cards').select('status').eq('id', cardId).single();
  if (error) throw new Error(error.message);
  if (cur?.status === 'draft') return null;
  const impact = await impactStatut(admin, cardId);
  if (impact.exemplairesDetenus + impact.dons + impact.decks > 0) {
    return `Retour en brouillon impossible : ${impact.exemplairesDetenus + impact.dons} exemplaire(s) détenu(s) et ${impact.decks} deck(s) la contiennent. Utilisez « Retirée ».`;
  }
  return null;
}
