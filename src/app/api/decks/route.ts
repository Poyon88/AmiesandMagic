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

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabaseAdmin = getAdminClient();

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    // Verify the deck belongs to the user
    const { data: deck } = await supabaseAdmin
      .from('decks')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!deck || deck.user_id !== user.id) {
      return NextResponse.json({ error: 'Deck non trouvé' }, { status: 404 });
    }

    // Delete referencing rows (foreign keys)
    await supabaseAdmin.from('matches').delete().or(`player1_deck_id.eq.${id},player2_deck_id.eq.${id}`);
    await supabaseAdmin.from('deck_cards').delete().eq('deck_id', id);

    // Delete the deck
    const { error } = await supabaseAdmin.from('decks').delete().eq('id', id);
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
