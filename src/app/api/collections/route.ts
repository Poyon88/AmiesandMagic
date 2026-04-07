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

// GET /api/collections?userId=xxx
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') ?? user.id;

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('user_collections')
    .select('card_id')
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cardIds: (data ?? []).map(r => r.card_id) });
}

// POST /api/collections — { userId, cardIds }
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await request.json();
  const { userId, cardIds } = body as { userId: string; cardIds: number[] };

  if (!userId || !cardIds?.length) {
    return NextResponse.json({ error: 'userId et cardIds requis' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const rows = cardIds.map(card_id => ({ user_id: userId, card_id }));

  const { error } = await supabase
    .from('user_collections')
    .upsert(rows, { onConflict: 'user_id,card_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE /api/collections — { userId, cardIds }
export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await request.json();
  const { userId, cardIds } = body as { userId: string; cardIds: number[] };

  if (!userId || !cardIds?.length) {
    return NextResponse.json({ error: 'userId et cardIds requis' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { error } = await supabase
    .from('user_collections')
    .delete()
    .eq('user_id', userId)
    .in('card_id', cardIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
