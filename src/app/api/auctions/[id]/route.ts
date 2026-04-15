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

// GET /api/auctions/[id] — single auction with full details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { id } = await params;
  const supabase = getAdminClient();

  // Settle if expired
  const { data: auction } = await supabase
    .from('auctions')
    .select('status, ends_at')
    .eq('id', id)
    .single();

  if (auction?.status === 'active' && new Date(auction.ends_at) <= new Date()) {
    await supabase.rpc('settle_auction', { p_auction_id: id });
  }

  const { data, error } = await supabase
    .from('auctions')
    .select(`
      *,
      items:auction_items(
        *,
        card:cards(*)
      )
    `)
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Enchère introuvable' }, { status: 404 });

  // Fetch seller username
  const { data: sellerProfile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', data.seller_id)
    .single();

  // Fetch bids
  const { data: bids } = await supabase
    .from('auction_bids')
    .select('*')
    .eq('auction_id', id)
    .order('created_at', { ascending: false });

  // Fetch bidder usernames
  const bidderIds = [...new Set((bids ?? []).map(b => b.bidder_id))];
  const { data: bidderProfiles } = bidderIds.length
    ? await supabase.from('profiles').select('id, username').in('id', bidderIds)
    : { data: [] };
  const bidderMap = new Map((bidderProfiles ?? []).map(p => [p.id, p.username]));

  const result = {
    ...data,
    seller_username: sellerProfile?.username ?? null,
    bids: (bids ?? []).map(b => ({
      ...b,
      bidder_username: bidderMap.get(b.bidder_id) ?? null,
    })),
  };

  return NextResponse.json({ auction: result });
}

// DELETE /api/auctions/[id] — cancel auction (seller only, no bids)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { id } = await params;
  const supabase = getAdminClient();

  const { data: auction, error } = await supabase
    .from('auctions')
    .select('*, items:auction_items(*)')
    .eq('id', id)
    .single();

  if (error || !auction) return NextResponse.json({ error: 'Enchère introuvable' }, { status: 404 });
  if (auction.seller_id !== user.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  if (auction.status !== 'active') return NextResponse.json({ error: 'Enchère non active' }, { status: 400 });
  if (auction.bid_count > 0) return NextResponse.json({ error: 'Impossible d\'annuler une enchère avec des offres' }, { status: 400 });

  // Return escrowed items to seller
  for (const item of auction.items) {
    if (item.source_type === 'collection') {
      await supabase
        .from('user_collections')
        .upsert({ user_id: user.id, card_id: item.card_id }, { onConflict: 'user_id,card_id' });
    } else if (item.source_type === 'print') {
      await supabase
        .from('card_prints')
        .update({ owner_id: user.id, assigned_at: new Date().toISOString() })
        .eq('id', item.source_id);
    }
  }

  await supabase
    .from('auctions')
    .update({ status: 'cancelled', settled_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ success: true });
}
