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

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabaseAdmin = getAdminClient();
  const { data, error } = await supabaseAdmin
    .from('cards')
    .select('id, name, mana_cost, card_type, attack, health, effect_text, flavor_text, keywords, spell_keywords, spell_effects, image_url, illustration_prompt, faction, race, clan, rarity, card_alignment, convocation_race, convocation_tokens, lycanthropie_race, set_id, card_year, card_month')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabaseAdmin = getAdminClient();

  try {
    const { card, imageBase64, imageMimeType, updateId } = await request.json();

    // Upload image if provided
    let image_url: string | null = null;
    if (imageBase64 && imageMimeType) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const ext = imageMimeType.split('/')[1] || 'webp';
      const filePath = `forge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('card-images')
        .upload(filePath, buffer, { upsert: true, contentType: imageMimeType });
      if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);
      const { data: urlData } = supabaseAdmin.storage.from('card-images').getPublicUrl(filePath);
      image_url = urlData.publicUrl;
    }

    const cardData: Record<string, unknown> = {
      name: card.name,
      mana_cost: card.mana_cost,
      card_type: card.card_type,
      attack: card.attack,
      health: card.health,
      effect_text: card.effect_text,
      flavor_text: card.flavor_text || null,
      illustration_prompt: card.illustration_prompt || null,
      keywords: card.keywords,
      spell_keywords: card.spell_keywords || null,
      spell_effects: card.spell_effects || null,
      faction: card.faction || null,
      race: card.race || null,
      clan: card.clan || null,
      convocation_race: card.convocation_race || null,
      convocation_tokens: card.convocation_tokens || null,
      lycanthropie_race: card.lycanthropie_race || null,
      set_id: card.set_id || null,
      card_year: card.card_year || null,
      card_month: card.card_month || null,
      rarity: card.rarity || null,
      card_alignment: card.card_alignment || null,
    };
    if (image_url) cardData.image_url = image_url;

    if (updateId) {
      // Update existing card
      const { error: updateErr } = await supabaseAdmin
        .from('cards')
        .update(cardData)
        .eq('id', updateId);
      if (updateErr) throw new Error(updateErr.message);
      return NextResponse.json({ success: true, name: card.name, updated: true });
    } else {
      // Insert new card
      if (!image_url) cardData.image_url = null;
      const { error: insertErr } = await supabaseAdmin.from('cards').insert(cardData);
      if (insertErr) throw new Error(insertErr.message);
      return NextResponse.json({ success: true, name: card.name, updated: false });
    }
  } catch (err) {
    console.error('[card-save] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabaseAdmin = getAdminClient();

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    // Delete from deck_cards first (foreign key)
    await supabaseAdmin.from('deck_cards').delete().eq('card_id', id);

    // Delete the card
    const { error } = await supabaseAdmin.from('cards').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[card-delete] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
