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

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };

  const supabase = getAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) };
  }

  return { user, supabase };
}

// GET /api/auctions/admin — list all auctions (any status)
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;
  const { supabase } = auth as { user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>; supabase: ReturnType<typeof getAdminClient> };

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('auctions')
    .select(`
      *,
      items:auction_items(
        *,
        card:cards(id, name, rarity, faction)
      ),
      seller:profiles!auctions_seller_id_fkey(username)
    `, { count: 'exact' });

  if (status) query = query.eq('status', status);

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auctions = (data ?? []).map(a => ({
    ...a,
    seller_username: a.seller?.username ?? null,
    seller: undefined,
  }));

  return NextResponse.json({ auctions, total: count ?? 0, page, limit });
}

// DELETE /api/auctions/admin — force cancel any auction
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;
  const { supabase } = auth as { user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>; supabase: ReturnType<typeof getAdminClient> };

  const body = await request.json();
  const { auctionId } = body as { auctionId: string };

  if (!auctionId) return NextResponse.json({ error: 'auctionId requis' }, { status: 400 });

  const { data: auction, error } = await supabase
    .from('auctions')
    .select('*, items:auction_items(*)')
    .eq('id', auctionId)
    .single();

  if (error || !auction) return NextResponse.json({ error: 'Enchère introuvable' }, { status: 404 });
  if (auction.status !== 'active') return NextResponse.json({ error: 'Enchère non active' }, { status: 400 });

  // Refund current bidder
  if (auction.current_bidder_id && auction.current_bid) {
    await supabase.rpc('adjust_wallet_balance', {
      p_user_id: auction.current_bidder_id,
      p_amount: auction.current_bid,
      p_type: 'auction_refund',
      p_description: 'Enchère annulée par un administrateur',
      p_metadata: { auction_id: auctionId },
      p_created_by: null,
    });

    // Notify bidder
    await supabase.from('notifications').insert({
      user_id: auction.current_bidder_id,
      type: 'auction_cancelled',
      title: 'Enchère annulée',
      message: `L'enchère a été annulée par un administrateur. Votre mise de ${auction.current_bid} or a été remboursée.`,
      metadata: { auction_id: auctionId },
    });
  }

  // Return items to seller
  for (const item of auction.items) {
    if (item.source_type === 'collection') {
      await supabase
        .from('user_collections')
        .upsert({ user_id: auction.seller_id, card_id: item.card_id }, { onConflict: 'user_id,card_id' });
    } else if (item.source_type === 'print') {
      await supabase
        .from('card_prints')
        .update({ owner_id: auction.seller_id, assigned_at: new Date().toISOString() })
        .eq('id', item.source_id);
    }
  }

  // Notify seller
  if (auction.seller_type === 'player') {
    await supabase.from('notifications').insert({
      user_id: auction.seller_id,
      type: 'auction_cancelled',
      title: 'Enchère annulée',
      message: 'Votre enchère a été annulée par un administrateur. Vos cartes vous ont été restituées.',
      metadata: { auction_id: auctionId },
    });
  }

  await supabase
    .from('auctions')
    .update({ status: 'cancelled', settled_at: new Date().toISOString() })
    .eq('id', auctionId);

  return NextResponse.json({ success: true });
}
