import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { PlaceBidPayload } from '@/lib/auction/types';

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

// POST /api/auctions/[id]/bid — place a bid or buyout
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { id } = await params;
  const body = await request.json() as PlaceBidPayload;
  const { amount, is_buyout } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('place_bid', {
    p_auction_id: id,
    p_bidder_id: user.id,
    p_amount: amount,
    p_is_buyout: is_buyout ?? false,
  });

  if (error) {
    if (error.message.includes('check') || error.message.includes('violates')) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as Record<string, unknown>;
  if (result?.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...result });
}
