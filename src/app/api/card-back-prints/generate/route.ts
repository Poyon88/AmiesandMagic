import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { LIMITED_PRINT_COUNTS } from '@/lib/card-engine/constants';

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

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabaseAdmin = getAdminClient();

  try {
    const { cardBackId } = await request.json();
    if (!cardBackId) return NextResponse.json({ error: 'cardBackId requis' }, { status: 400 });

    const { data: cb, error: fetchErr } = await supabaseAdmin
      .from('card_backs')
      .select('id, rarity, max_prints')
      .eq('id', cardBackId)
      .single();
    if (fetchErr || !cb) throw new Error(fetchErr?.message ?? 'Dos introuvable');

    if (!cb.rarity || cb.rarity === 'Commune') {
      return NextResponse.json({ error: 'Les dos communs n\'ont pas d\'exemplaires limités' }, { status: 400 });
    }

    const printCount = cb.max_prints ?? LIMITED_PRINT_COUNTS[cb.rarity];
    if (!printCount) {
      return NextResponse.json({ error: `Rareté "${cb.rarity}" sans nombre d'exemplaires défini` }, { status: 400 });
    }

    const { error: delErr } = await supabaseAdmin
      .from('user_card_back_prints')
      .delete()
      .eq('card_back_id', cb.id)
      .is('owner_id', null);
    if (delErr) throw new Error(delErr.message);

    const { data: existing } = await supabaseAdmin
      .from('user_card_back_prints')
      .select('print_number')
      .eq('card_back_id', cb.id);
    const taken = new Set((existing ?? []).map((p) => p.print_number));

    const toInsert: { card_back_id: number; print_number: number; max_prints: number }[] = [];
    for (let i = 1; i <= printCount; i++) {
      if (!taken.has(i)) toInsert.push({ card_back_id: cb.id, print_number: i, max_prints: printCount });
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabaseAdmin.from('user_card_back_prints').insert(toInsert);
      if (insErr) throw new Error(insErr.message);
    }

    return NextResponse.json({ success: true, generated: toInsert.length, total: printCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
