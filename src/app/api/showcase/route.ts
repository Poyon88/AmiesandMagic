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

// GET /api/showcase — public, returns showcase cards with full card data
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('showcase_cards')
    .select('*, card:cards(*)')
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cards = (data ?? []).map(s => ({
    ...s,
    card: s.card as unknown as Record<string, unknown>,
  }));

  return NextResponse.json({ cards });
}

// POST /api/showcase — admin only, add a card
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const body = await request.json();
  const { card_id, sort_order } = body as { card_id: number; sort_order?: number };

  if (!card_id) return NextResponse.json({ error: 'card_id requis' }, { status: 400 });

  const { error } = await supabase
    .from('showcase_cards')
    .insert({ card_id, sort_order: sort_order ?? 0 });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE /api/showcase — admin only, remove a card
export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const body = await request.json();
  const { card_id } = body as { card_id: number };

  if (!card_id) return NextResponse.json({ error: 'card_id requis' }, { status: 400 });

  const { error } = await supabase
    .from('showcase_cards')
    .delete()
    .eq('card_id', card_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// PATCH /api/showcase — admin only, update sort orders
export async function PATCH(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const body = await request.json();
  const { orders } = body as { orders: { card_id: number; sort_order: number }[] };

  if (!orders?.length) return NextResponse.json({ error: 'orders requis' }, { status: 400 });

  for (const { card_id, sort_order } of orders) {
    await supabase
      .from('showcase_cards')
      .update({ sort_order })
      .eq('card_id', card_id);
  }

  return NextResponse.json({ success: true });
}
