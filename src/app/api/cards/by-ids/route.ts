// Résolution de cartes PAR ID, pour les références croisées d'une carte à une
// autre — aujourd'hui les Compagnons, qui citent leurs cartes liées et doivent
// pouvoir en montrer le verso au survol.
//
// Point d'accès dédié plutôt que le catalogue complet (`/api/cards/save`, ~720
// cartes avec toutes leurs colonnes) : une carte cite deux ou trois compagnons,
// charger la base entière pour ça serait disproportionné hors de la forge.
//
// En PARTIE, la page de match l'appelle pour compléter ses pools avec les cartes
// liées absentes. Passer par le service role est voulu : une carte liée suit sa
// carte mère QUEL QUE SOIT SON STATUT — un jeton en brouillon, invisible au
// joueur par la RLS de `cards`, doit quand même se résoudre en jeu. Hors partie
// elle sert à la collection, au constructeur de deck et à l'aperçu de la forge.
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Mêmes colonnes que les pools du match : le verso a besoin de tout ce qui le
 *  compose (capacités, mots-clés, coûts alternatifs, illustration). */
const CARD_COLUMNS =
  'id, name, mana_cost, card_type, attack, health, effect_text, flavor_text, ' +
  'keywords, keyword_instances, spell_keywords, spell_effects, capabilities, ' +
  'image_url, faction, race, clan, rarity, card_alignment, convocation_token_id, ' +
  'convocation_tokens, lycanthropie_token_id, entraide_race, set_id, card_year, ' +
  'card_month, sfx_play_url, sfx_death_url, sfx_exile_url, life_cost, discard_cost, sacrifice_cost, exile_cost, ' +
  'topdeck_cost, eveil_cost, equip_cost, discoverable, status, status_reason';

/** Garde-fou de volume : au-delà, l'appelant se trompe de route (qu'il prenne le
 *  catalogue). Une carte ne cite jamais 50 compagnons. */
const MAX_IDS = 50;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* lecture seule */ },
      },
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const brut = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = [...new Set(
    brut.split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0),
  )].slice(0, MAX_IDS);

  // Aucun id exploitable : on rend une liste vide plutôt qu'une erreur. Une
  // carte sans compagnon configuré est un cas normal, pas un défaut d'appel.
  if (ids.length === 0) return NextResponse.json([]);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase
    .from('cards')
    .select(CARD_COLUMNS)
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
