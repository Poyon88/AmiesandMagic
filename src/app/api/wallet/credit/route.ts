import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { TransactionType } from '@/lib/economy/types';

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

const ALLOWED_CREDIT_TYPES: TransactionType[] = [
  'reward_victory',
  'reward_quest',
  'purchase',
  'refund',
];

// POST /api/wallet/credit — { userId, amount, type, description?, metadata? }
// Server-side credit pour récompenses de jeu (admin only en Phase 1)
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // Phase 1 : admin only
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
  const { userId, amount, type, description, metadata } = body as {
    userId: string;
    amount: number;
    type: TransactionType;
    description?: string;
    metadata?: Record<string, unknown>;
  };

  if (!userId || !amount || !type) {
    return NextResponse.json({ error: 'userId, amount et type requis' }, { status: 400 });
  }

  if (amount <= 0) {
    return NextResponse.json({ error: 'Le montant doit être positif' }, { status: 400 });
  }

  if (!ALLOWED_CREDIT_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Type de transaction non autorisé' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('adjust_wallet_balance', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description ?? null,
    p_metadata: metadata ?? {},
    p_created_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    success: true,
    new_balance: result?.new_balance ?? 0,
    transaction_id: result?.transaction_id,
  });
}
