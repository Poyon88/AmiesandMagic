import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

const STATUTS_EN_COURS = ['waiting', 'active'];
const STATUTS_TERMINES = ['finished', 'abandoned'];

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabaseAdmin = getAdminClient();

  try {
    const body = await request.json().catch(() => null);
    // Entier strict : l'identifiant est interpolé dans un filtre `.or()`.
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    // Verify the deck belongs to the user
    const { data: deck, error: deckError } = await supabaseAdmin
      .from('decks')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();
    if (deckError) throw new Error(deckError.message);

    if (!deck || deck.user_id !== user.id) {
      return NextResponse.json({ error: 'Deck non trouvé' }, { status: 404 });
    }

    const refDeck = `player1_deck_id.eq.${id},player2_deck_id.eq.${id}`;

    // Une partie en attente ou en cours a encore besoin du deck : on refuse,
    // plutôt que de la détruire sous les pieds des deux joueurs.
    const { data: enCours, error: enCoursError } = await supabaseAdmin
      .from('matches')
      .select('id')
      .in('status', STATUTS_EN_COURS)
      .or(refDeck)
      .limit(1);
    if (enCoursError) throw new Error(enCoursError.message);
    if (enCours && enCours.length > 0) {
      return NextResponse.json(
        { error: 'Ce deck est utilisé par une partie en cours. Terminez-la avant de le supprimer.' },
        { status: 409 },
      );
    }

    // Les parties terminées sont CONSERVÉES : leur référence au deck passe à
    // NULL (cf. supabase-migration-deck-delete-preserve-matches.sql).
    let { error } = await supabaseAdmin.from('decks').delete().eq('id', id);

    // 23503 = clé étrangère : la migration n'est pas encore appliquée sur cette
    // base, un deck déjà joué ne peut pas disparaître seul. Dans ce cas
    // seulement, ancien comportement, restreint aux parties terminées.
    if (error?.code === '23503') {
      const { error: matchesError } = await supabaseAdmin
        .from('matches')
        .delete()
        .in('status', STATUTS_TERMINES)
        .or(refDeck);
      if (matchesError) throw new Error(matchesError.message);

      const { error: queueError } = await supabaseAdmin
        .from('matchmaking_queue')
        .delete()
        .eq('deck_id', id);
      if (queueError) throw new Error(queueError.message);

      ({ error } = await supabaseAdmin.from('decks').delete().eq('id', id));
      // Encore bloqué : une partie a démarré avec ce deck entre-temps.
      if (error?.code === '23503') {
        return NextResponse.json(
          { error: 'Ce deck est utilisé par une partie en cours. Terminez-la avant de le supprimer.' },
          { status: 409 },
        );
      }
    }
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[deck-delete] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
