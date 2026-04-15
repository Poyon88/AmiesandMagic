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

// GET /api/auctions/settings
export async function GET() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('auction_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

// PATCH /api/auctions/settings — admin only
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
  const allowedFields = ['commission_rate', 'min_bid_increment', 'allowed_durations', 'max_items_per_lot', 'is_marketplace_open'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  const { data, error } = await supabase
    .from('auction_settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, settings: data });
}
