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

// GET /api/auctions/my-cards — returns sellable cards for the current user
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  // Fetch owned prints with card details
  const { data: prints } = await supabase
    .from('card_prints')
    .select('id, card_id, print_number, max_prints, is_tradeable, cards(id, name, rarity, faction, card_type, mana_cost)')
    .eq('owner_id', user.id)
    .eq('is_tradeable', true)
    .order('print_number');

  // Fetch owned board prints with board details
  const { data: boardPrints } = await supabase
    .from('user_board_prints')
    .select('id, board_id, print_number, max_prints, is_tradeable, game_boards(id, name, image_url, rarity, max_prints)')
    .eq('owner_id', user.id)
    .eq('is_tradeable', true)
    .order('print_number');

  // Fetch user_collections card IDs
  const { data: collections } = await supabase
    .from('user_collections')
    .select('card_id')
    .eq('user_id', user.id);

  const collectionCardIds = (collections ?? []).map(c => c.card_id);

  // Fetch card details for collection cards
  let collectionCards: Record<string, unknown>[] = [];
  if (collectionCardIds.length > 0) {
    const { data } = await supabase
      .from('cards')
      .select('id, name, rarity, faction, card_type, mana_cost')
      .in('id', collectionCardIds)
      .neq('rarity', 'Commune')
      .order('name');
    collectionCards = data ?? [];
  }

  // Build response
  const items: Record<string, unknown>[] = [];

  // Add prints
  for (const p of prints ?? []) {
    const card = p.cards as unknown as Record<string, unknown> | null;
    if (!card) continue;
    items.push({
      card_id: p.card_id,
      name: card.name,
      rarity: card.rarity,
      faction: card.faction,
      card_type: card.card_type,
      mana_cost: card.mana_cost,
      source_type: 'print',
      source_id: p.id,
      print_number: p.print_number,
      max_prints: p.max_prints,
    });
  }

  // Add collection cards (exclude Commune)
  for (const card of collectionCards) {
    items.push({
      card_id: card.id,
      name: card.name,
      rarity: card.rarity,
      faction: card.faction,
      card_type: card.card_type,
      mana_cost: card.mana_cost,
      source_type: 'collection',
    });
  }

  // Add board prints (limited only; commons aren't tradable)
  for (const bp of boardPrints ?? []) {
    const board = bp.game_boards as unknown as { id: number; name: string; image_url: string; rarity: string | null } | null;
    if (!board) continue;
    items.push({
      board_id: bp.board_id,
      name: board.name,
      rarity: board.rarity,
      image_url: board.image_url,
      kind: 'board',
      source_type: 'board_print',
      source_id: bp.id,
      print_number: bp.print_number,
      max_prints: bp.max_prints,
    });
  }

  return NextResponse.json({ items });
}
