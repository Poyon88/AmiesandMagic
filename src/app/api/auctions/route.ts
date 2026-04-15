import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { CreateAuctionPayload } from '@/lib/auction/types';

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

// GET /api/auctions — list active auctions with filters
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'active';
  const faction = searchParams.get('faction');
  const rarity = searchParams.get('rarity');
  const cardType = searchParams.get('cardType');
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') ?? 'ending_soon';
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);
  const offset = (page - 1) * limit;

  const supabase = getAdminClient();

  // Settle any expired auctions on-demand
  const { data: expired } = await supabase
    .from('auctions')
    .select('id')
    .eq('status', 'active')
    .lte('ends_at', new Date().toISOString());

  if (expired?.length) {
    for (const a of expired) {
      await supabase.rpc('settle_auction', { p_auction_id: a.id });
    }
  }

  // Build query for auctions with items and card details
  let query = supabase
    .from('auctions')
    .select(`
      *,
      items:auction_items(
        *,
        card:cards(id, name, mana_cost, card_type, attack, health, rarity, faction, race, clan)
      ),
      seller:profiles!auctions_seller_id_fkey(username)
    `, { count: 'exact' })
    .eq('status', status);

  // Filter by card attributes via auction_items
  if (faction || rarity || cardType || search) {
    // Get auction IDs that match card filters
    let cardQuery = supabase
      .from('auction_items')
      .select('auction_id, card:cards!inner(name, faction, rarity, card_type)');

    if (faction) cardQuery = cardQuery.eq('card.faction', faction);
    if (rarity) cardQuery = cardQuery.eq('card.rarity', rarity);
    if (cardType) cardQuery = cardQuery.eq('card.card_type', cardType);
    if (search) cardQuery = cardQuery.ilike('card.name', `%${search}%`);

    const { data: matchingItems } = await cardQuery;
    const auctionIds = [...new Set((matchingItems ?? []).map(i => i.auction_id))];

    if (auctionIds.length === 0) {
      return NextResponse.json({ auctions: [], total: 0, page, limit });
    }
    query = query.in('id', auctionIds);
  }

  // Price filters
  if (minPrice) {
    query = query.gte('current_bid', parseInt(minPrice));
  }
  if (maxPrice) {
    query = query.lte('current_bid', parseInt(maxPrice));
  }

  // Sorting
  switch (sort) {
    case 'price_asc':
      query = query.order('current_bid', { ascending: true, nullsFirst: true });
      break;
    case 'price_desc':
      query = query.order('current_bid', { ascending: false, nullsFirst: false });
      break;
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'ending_soon':
    default:
      query = query.order('ends_at', { ascending: true });
      break;
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auctions = (data ?? []).map(a => ({
    ...a,
    seller_username: a.seller?.username ?? null,
    seller: undefined,
  }));

  return NextResponse.json({ auctions, total: count ?? 0, page, limit });
}

// POST /api/auctions — create a new auction
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  // Check profile role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Load settings
  const { data: settings } = await supabase
    .from('auction_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (!settings?.is_marketplace_open) {
    return NextResponse.json({ error: 'Le marché est actuellement fermé' }, { status: 400 });
  }

  const body = await request.json() as CreateAuctionPayload;
  const { items, starting_bid, buyout_price, duration_minutes } = body;

  // Validations
  if (!items?.length) {
    return NextResponse.json({ error: 'Au moins un objet requis' }, { status: 400 });
  }
  if (items.length > settings.max_items_per_lot) {
    return NextResponse.json({ error: `Maximum ${settings.max_items_per_lot} objets par lot` }, { status: 400 });
  }
  if (!starting_bid || starting_bid <= 0) {
    return NextResponse.json({ error: 'Mise de départ invalide' }, { status: 400 });
  }
  if (buyout_price !== undefined && buyout_price <= starting_bid) {
    return NextResponse.json({ error: 'Le prix d\'achat immédiat doit être supérieur à la mise de départ' }, { status: 400 });
  }
  if (!settings.allowed_durations.includes(duration_minutes)) {
    return NextResponse.json({ error: 'Durée non autorisée' }, { status: 400 });
  }

  const isAdmin = profile?.role === 'admin';
  const sellerType = isAdmin && items.some(i => i.source_type === 'admin') ? 'admin' : 'player';

  // Validate ownership and escrow items
  for (const item of items) {
    if (item.source_type === 'collection') {
      const { data: owned } = await supabase
        .from('user_collections')
        .select('card_id')
        .eq('user_id', user.id)
        .eq('card_id', item.card_id)
        .single();

      if (!owned) {
        return NextResponse.json({ error: `Vous ne possédez pas la carte ${item.card_id}` }, { status: 400 });
      }
    } else if (item.source_type === 'print') {
      const { data: print } = await supabase
        .from('card_prints')
        .select('id, owner_id, is_tradeable')
        .eq('id', item.source_id)
        .single();

      if (!print || print.owner_id !== user.id) {
        return NextResponse.json({ error: `Vous ne possédez pas ce print` }, { status: 400 });
      }
      if (!print.is_tradeable) {
        return NextResponse.json({ error: `Ce print n'est pas échangeable` }, { status: 400 });
      }
    } else if (item.source_type === 'admin') {
      if (!isAdmin) {
        return NextResponse.json({ error: 'Seuls les admins peuvent lister des cartes système' }, { status: 403 });
      }
    }
  }

  // Create auction
  const endsAt = new Date(Date.now() + duration_minutes * 60 * 1000).toISOString();
  const { data: auction, error: auctionError } = await supabase
    .from('auctions')
    .insert({
      seller_id: user.id,
      seller_type: sellerType,
      starting_bid,
      buyout_price: buyout_price ?? null,
      commission_rate: settings.commission_rate,
      duration_minutes,
      ends_at: endsAt,
    })
    .select()
    .single();

  if (auctionError) return NextResponse.json({ error: auctionError.message }, { status: 500 });

  // Insert auction items and escrow cards
  for (const item of items) {
    await supabase.from('auction_items').insert({
      auction_id: auction.id,
      card_id: item.card_id,
      source_type: item.source_type,
      source_id: item.source_id ?? null,
      quantity: item.quantity,
    });

    // Escrow: remove from seller's ownership
    if (item.source_type === 'collection') {
      await supabase
        .from('user_collections')
        .delete()
        .eq('user_id', user.id)
        .eq('card_id', item.card_id);
    } else if (item.source_type === 'print') {
      await supabase
        .from('card_prints')
        .update({ owner_id: null })
        .eq('id', item.source_id);
    }
  }

  return NextResponse.json({ success: true, auction });
}
