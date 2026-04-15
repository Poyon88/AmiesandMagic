import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/auctions/settle — settle all expired auctions (cron or admin)
export async function POST(request: Request) {
  // Protect with CRON_SECRET or admin auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Fallback: check if admin user
    const { createServerClient } = await import('@supabase/ssr');
    const { cookies } = await import('next/headers');
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

    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const supabase = getAdminClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
  }

  const supabase = getAdminClient();

  const { data: expired, error } = await supabase
    .from('auctions')
    .select('id')
    .eq('status', 'active')
    .lte('ends_at', new Date().toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let settled = 0;
  for (const auction of expired ?? []) {
    const { data } = await supabase.rpc('settle_auction', { p_auction_id: auction.id });
    const result = data as Record<string, unknown> | null;
    if (result?.success) settled++;
  }

  return NextResponse.json({ success: true, settled, total: expired?.length ?? 0 });
}
