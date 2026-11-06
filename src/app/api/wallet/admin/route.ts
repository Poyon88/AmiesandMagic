import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { CREDIT_LIFETIME_DAYS } from '@/lib/tournaments/config';

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

// POST /api/wallet/admin — { userId, amount, type: 'admin_credit' | 'admin_debit', description?, currency? }
// `currency` : 'gold' (défaut), 'essence' ou 'credits' (crédits marché : un
// crédit émet un lot à 30 jours, un débit consomme les lots par échéance).
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
  const { userId, amount, type, description, currency = 'gold' } = body as {
    userId: string;
    amount: number;
    type: 'admin_credit' | 'admin_debit';
    description?: string;
    currency?: 'gold' | 'essence' | 'credits';
  };

  if (currency !== 'gold' && currency !== 'essence' && currency !== 'credits') {
    return NextResponse.json({ error: 'Monnaie invalide' }, { status: 400 });
  }

  if (!userId || !amount || !type) {
    return NextResponse.json({ error: 'userId, amount et type requis' }, { status: 400 });
  }

  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000_000) {
    return NextResponse.json({ error: 'Le montant doit être un entier positif borné' }, { status: 400 });
  }

  if (!['admin_credit', 'admin_debit'].includes(type)) {
    return NextResponse.json({ error: 'Type invalide' }, { status: 400 });
  }

  const adjustedAmount = type === 'admin_debit' ? -amount : amount;

  if (currency === 'credits') {
    const { error } = type === 'admin_credit'
      ? await supabase.rpc('grant_credits', {
          p_user_id: userId, p_amount: amount, p_type: type, p_source: 'admin',
          p_description: description ?? null, p_metadata: {}, p_created_by: user.id,
          p_lifetime_days: CREDIT_LIFETIME_DAYS,
        })
      : await supabase.rpc('spend_credits', {
          p_user_id: userId, p_amount: amount, p_type: type,
          p_description: description ?? null, p_metadata: {}, p_created_by: user.id,
        });
    if (error) {
      if (error.message.includes('insuffisants') || error.message.includes('check')) {
        return NextResponse.json({ error: 'Crédits insuffisants' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { data: balance } = await supabase.rpc('credit_balance', { p_user_id: userId });
    return NextResponse.json({ success: true, currency, new_balance: (balance as number) ?? 0 });
  }

  if (currency === 'essence') {
    const { data, error } = await supabase.rpc('adjust_essence', {
      p_user_id: userId,
      p_amount: adjustedAmount,
      p_type: type,
      p_description: description ?? null,
      p_metadata: {},
      p_created_by: user.id,
    });
    if (error) {
      if (error.message.includes('insufficient_essence') || error.message.includes('check') || error.message.includes('violates')) {
        return NextResponse.json({ error: 'Essence insuffisante' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, currency, new_balance: data as number });
  }

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
