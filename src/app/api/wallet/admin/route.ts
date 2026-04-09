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

// POST /api/wallet/admin — { userId, amount, type: 'admin_credit' | 'admin_debit', description? }
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // Vérifier le rôle admin
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
  const { userId, amount, type, description } = body as {
    userId: string;
    amount: number;
    type: 'admin_credit' | 'admin_debit';
    description?: string;
  };

  if (!userId || !amount || !type) {
    return NextResponse.json({ error: 'userId, amount et type requis' }, { status: 400 });
  }

  if (amount <= 0) {
    return NextResponse.json({ error: 'Le montant doit être positif' }, { status: 400 });
  }

  if (!['admin_credit', 'admin_debit'].includes(type)) {
    return NextResponse.json({ error: 'Type invalide' }, { status: 400 });
  }

  const adjustedAmount = type === 'admin_debit' ? -amount : amount;

  const { data, error } = await supabase.rpc('adjust_wallet_balance', {
    p_user_id: userId,
    p_amount: adjustedAmount,
    p_type: type,
    p_description: description ?? null,
    p_metadata: {},
    p_created_by: user.id,
  });

  if (error) {
    if (error.message.includes('check') || error.message.includes('violates')) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    success: true,
    new_balance: result?.new_balance ?? 0,
    transaction_id: result?.transaction_id,
  });
}
