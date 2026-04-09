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

// POST /api/card-prints/generate
// Body: { cardId: number } — generate prints for one card
// Body: { batch: true }    — generate prints for all eligible cards missing prints
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabaseAdmin = getAdminClient();

  try {
    const body = await request.json();

    if (body.batch) {
      // Batch mode: find all eligible cards without prints
      const { data: cards, error: cardsErr } = await supabaseAdmin
        .from('cards')
        .select('id, rarity, set_id, card_year')
        .is('set_id', null)
        .not('card_year', 'is', null)
        .not('rarity', 'is', null);
      if (cardsErr) throw new Error(cardsErr.message);

      const eligible = (cards || []).filter(c => LIMITED_PRINT_COUNTS[c.rarity!]);

      if (eligible.length === 0) {
        return NextResponse.json({ success: true, generated: 0, message: 'Aucune carte éligible sans exemplaires' });
      }

      // Delete existing prints for all eligible cards, then regenerate
      const eligibleIds = eligible.map(c => c.id);
      await supabaseAdmin.from('card_prints').delete().in('card_id', eligibleIds);

      const allPrints = eligible.flatMap(c => {
        const printCount = LIMITED_PRINT_COUNTS[c.rarity!];
        return Array.from({ length: printCount }, (_, i) => ({
          card_id: c.id,
          print_number: i + 1,
          max_prints: printCount,
        }));
      });

      const { error: insertErr } = await supabaseAdmin.from('card_prints').insert(allPrints);
      if (insertErr) throw new Error(insertErr.message);

      return NextResponse.json({ success: true, generated: eligible.length, message: `Exemplaires régénérés pour ${eligible.length} carte(s)` });

    } else if (body.cardId) {
      // Single card mode
      const { data: card, error: cardErr } = await supabaseAdmin
        .from('cards')
        .select('id, rarity, set_id, card_year')
        .eq('id', body.cardId)
        .single();
      if (cardErr) throw new Error(cardErr.message);

      if (card.set_id) {
        return NextResponse.json({ error: 'Cette carte appartient à un set, pas d\'édition limitée' }, { status: 400 });
      }
      if (!card.card_year) {
        return NextResponse.json({ error: 'Cette carte n\'a pas d\'année définie' }, { status: 400 });
      }
      const printCount = card.rarity ? LIMITED_PRINT_COUNTS[card.rarity] : undefined;
      if (!printCount) {
        return NextResponse.json({ error: `Rareté "${card.rarity}" non éligible aux exemplaires limités` }, { status: 400 });
      }

      // Delete existing prints (to allow regeneration)
      await supabaseAdmin.from('card_prints').delete().eq('card_id', card.id);

      const prints = Array.from({ length: printCount }, (_, i) => ({
        card_id: card.id,
        print_number: i + 1,
        max_prints: printCount,
      }));
      const { error: insertErr } = await supabaseAdmin.from('card_prints').insert(prints);
      if (insertErr) throw new Error(insertErr.message);

      return NextResponse.json({ success: true, printCount, message: `${printCount} exemplaire(s) généré(s)` });

    } else {
      return NextResponse.json({ error: 'cardId ou batch requis' }, { status: 400 });
    }
  } catch (err) {
    console.error('[card-prints/generate] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
