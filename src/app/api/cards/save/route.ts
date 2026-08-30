import { NextResponse, after } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { LIMITED_PRINT_COUNTS } from '@/lib/card-engine/constants';
import { validateRace } from '@/lib/validation/faction-clan';
import { deriveCapabilities } from '@/lib/game/capability-adapter';
import type { Capability, Card } from '@/lib/game/types';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { upsertCardTranslations } from '@/lib/cards/cardTranslations';
import { findNameCollision } from '@/lib/cards/nameCollision';
import { fetchAllRows } from '@/lib/supabase/fetchAllRows';
import { sanitizeComposed } from '@/lib/cards/composedCapabilities';

// Planifie (hors du chemin de réponse, via `after`) la (re)traduction nom +
// ambiance d'une carte vers les 5 langues. i18n : seuls nom/ambiance sont
// traduits ; les overrides manuels sont préservés côté helper.
function scheduleCardTranslation(
  supabaseAdmin: SupabaseClient,
  card: { id: number; name: string | null; flavor_text: string | null },
) {
  after(async () => {
    try {
      await upsertCardTranslations(supabaseAdmin, card);
    } catch (err) {
      console.error('[card-save] translation scheduling failed:', err);
    }
  });
}

// Champs dont dépend le modèle de capacités unifié : si l'un d'eux change, la
// colonne `capabilities` doit être recalculée (dual-write via l'adaptateur).
const CAPABILITY_FIELDS = [
  'card_type', 'keywords', 'keyword_instances', 'spell_keywords', 'effect_text',
  'convocation_token_id', 'convocation_tokens', 'lycanthropie_token_id', 'entraide_race',
] as const;


/** Réponse 409 commune : le client (forge) la reconnaît via `code` et propose
 *  de forcer la sauvegarde avec `allowDuplicateName: true`. Le message est
 *  auto-porteur (il inclut la question) pour que l'appelant n'ait aucun texte
 *  à composer — le reste de cette route renvoie déjà ses erreurs en français. */
function duplicateNameResponse(existing: { id: number; name: string }) {
  return NextResponse.json(
    {
      error: `Une carte nommée « ${existing.name.trim()} » existe déjà (id ${existing.id}). Enregistrer quand même ?`,
      code: 'duplicate_name',
      existingId: existing.id,
    },
    { status: 409 },
  );
}

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
  const COLONNES = 'id, name, mana_cost, card_type, attack, health, effect_text, flavor_text, keywords, keyword_instances, spell_keywords, spell_effects, capabilities, image_url, illustration_prompt, faction, race, clan, rarity, card_alignment, convocation_token_id, convocation_tokens, lycanthropie_token_id, entraide_race, set_id, card_year, card_month, sfx_play_url, sfx_death_url, sfx_exile_url, life_cost, discard_cost, sacrifice_cost, exile_cost, topdeck_cost, eveil_cost, discoverable';

  // Lecture PAGINÉE : c'est la liste que charge l'éditeur de cartes. Sans
  // `.range()`, PostgREST plafonnait la réponse à 1 000 lignes sur les 1 713 de
  // la table — 713 cartes simplement absentes de l'éditeur, sans erreur ni
  // signe (« Soleil vivant », id 1742, en était). `name` seul ne départage pas
  // les homonymes : l'ordre total exige `id` en dernier, sans quoi deux pages
  // peuvent se recouvrir ou sauter une ligne.
  try {
    const data = await fetchAllRows(
      (from, to) =>
        supabaseAdmin.from('cards').select(COLONNES).order('name').order('id').range(from, to),
      { label: 'Lecture du catalogue (éditeur)' },
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabaseAdmin = auth.supabase;

  try {
    const { card, imageBase64, imageMimeType, updateId, sfxPlayBase64, sfxPlayMimeType, sfxDeathBase64, sfxDeathMimeType, sfxExileBase64, sfxExileMimeType, partial, composed_capabilities, allowDuplicateName } = await request.json();
    const composedCaps = sanitizeComposed(composed_capabilities);

    // Partial update path: only update the fields explicitly present in
    // `card`. Used by callers that just want to bump a couple of columns
    // (e.g. setting `card_year` from the editor before generating
    // prints) without forcing them to fill the entire card payload —
    // sending an incomplete card through the full-update branch would
    // null out everything not provided.
    if (partial && updateId) {
      const allowed = new Set([
        'name', 'mana_cost', 'card_type', 'attack', 'health',
        'effect_text', 'flavor_text', 'illustration_prompt',
        'keywords', 'keyword_instances', 'spell_keywords', 'spell_effects',
        'faction', 'race', 'clan', 'rarity', 'card_alignment',
        'convocation_token_id', 'convocation_tokens',
        'lycanthropie_token_id', 'entraide_race',
        'set_id', 'card_year', 'card_month',
        'life_cost', 'discard_cost', 'sacrifice_cost', 'exile_cost', 'topdeck_cost',
        // Coût ALTERNATIF d'éveil — même exigence : hors de cette liste, la
        // valeur saisie serait jetée en silence à l'édition.
        'eveil_cost',
        // Carte écartée des tirages (Sélection, Invocation…) sans cesser d'être
        // collectionnable ni jouable. Absente de cette liste blanche, la case
        // serait silencieusement ignorée à l'édition.
        'discoverable',
      ]);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(card ?? {})) {
        if (allowed.has(k)) patch[k] = v;
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ success: true, updated: true, noop: true });
      }
      // Un renommage partiel peut lui aussi créer un homonyme.
      if ('name' in patch && !allowDuplicateName) {
        const clash = await findNameCollision(supabaseAdmin, patch.name, updateId);
        if (clash) return duplicateNameResponse(clash);
      }
      // Dual-write : si le patch touche un champ dont dépendent les capacités,
      // on recharge la ligne, on fusionne et on recalcule `capabilities`.
      if (CAPABILITY_FIELDS.some((f) => f in patch)) {
        const { data: current } = await supabaseAdmin
          .from('cards')
          .select('card_type, effect_text, keywords, keyword_instances, spell_keywords, capabilities, convocation_token_id, convocation_tokens, lycanthropie_token_id, entraide_race')
          .eq('id', updateId)
          .single();
        const merged = { ...(current ?? {}), ...patch } as unknown as Card;
        // Préserver les effets composés existants (le legacy ne les porte pas).
        const keptComposed = ((current?.capabilities as Capability[] | null) ?? []).filter((c) => c?.composed);
        patch.capabilities = [...deriveCapabilities(merged), ...keptComposed];
      }
      const { error: patchErr } = await supabaseAdmin
        .from('cards')
        .update(patch)
        .eq('id', updateId);
      if (patchErr) throw new Error(patchErr.message);
      // i18n : si le nom ou l'ambiance a été touché(e), replanifie la traduction.
      if ('name' in patch || 'flavor_text' in patch) {
        const { data: row } = await supabaseAdmin
          .from('cards')
          .select('id, name, flavor_text')
          .eq('id', updateId)
          .single();
        if (row) scheduleCardTranslation(supabaseAdmin, row);
      }
      return NextResponse.json({ success: true, updated: true });
    }

    // Entraide: when the keyword is present, the targeted race must be set
    // and must be a known race. Other constraints (card.race / faction)
    // don't apply — Entraide can target any race, regardless of the host
    // card's own race.
    const carriesEntraide = Array.isArray(card?.keywords) && card.keywords.includes('entraide');
    if (carriesEntraide) {
      const rc = validateRace(card.entraide_race ?? null, null);
      if (!rc.ok) return NextResponse.json({ error: `Entraide : ${rc.error}` }, { status: 400 });
      if (!rc.race) return NextResponse.json({ error: 'Entraide : race cible requise.' }, { status: 400 });
    }

    // Renforcement multiple : race et clan sont désormais FACULTATIFS — sans
    // eux, le bonus s'applique à toutes les créatures alliées. La validation
    // qui les exigeait n'avait de sens que parce que le moteur ne savait pas
    // traiter ce cas (il ne buffait alors personne).

    // Garde anti-homonyme (création ET renommage). Volontairement AVANT tout
    // upload : un refus ne doit pas laisser d'image ni de SFX orphelins dans le
    // storage. `allowDuplicateName` permet à l'admin de forcer en connaissance
    // de cause (des homonymes légitimes existent déjà en base).
    if (!allowDuplicateName) {
      const clash = await findNameCollision(
        supabaseAdmin,
        card?.name,
        typeof updateId === 'number' ? updateId : undefined,
      );
      if (clash) return duplicateNameResponse(clash);
    }

    // Upload image if provided
    let image_url: string | null = null;
    if (imageBase64 && imageMimeType) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const ext = imageMimeType.split('/')[1] || 'webp';
      const filePath = `forge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('card-images')
        .upload(filePath, buffer, { upsert: true, contentType: imageMimeType, cacheControl: '31536000' });
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
      keyword_instances: card.keyword_instances ?? null,
      spell_keywords: card.spell_keywords || null,
      spell_effects: card.spell_effects || null,
      faction: card.faction || null,
      race: card.race || null,
      clan: card.clan || null,
      convocation_token_id: card.convocation_token_id ?? null,
      convocation_tokens: card.convocation_tokens || null,
      lycanthropie_token_id: card.lycanthropie_token_id ?? null,
      entraide_race: carriesEntraide ? (card.entraide_race ?? null) : null,
      set_id: card.set_id || null,
      // Défaut DÉCOUVRABLE : une carte créée sans y penser reste dans les tirages.
      discoverable: card.discoverable ?? true,
      card_year: card.card_year || null,
      card_month: card.card_month || null,
      rarity: card.rarity || null,
      card_alignment: card.card_alignment || null,
      life_cost: card.life_cost ?? null,
      discard_cost: card.discard_cost ?? null,
      sacrifice_cost: card.sacrifice_cost ?? null,
      exile_cost: card.exile_cost ?? null,
      topdeck_cost: card.topdeck_cost ?? null,
      eveil_cost: card.eveil_cost ?? null,
    };
    // Dual-write du modèle unifié : dérivé de la carte sauvegardée (l'adaptateur
    // reproduit fidèlement la sémantique legacy). Source de vérité côté moteur
    // une fois lue (getCapabilities) ; sinon repli adaptateur.
    cardData.capabilities = [...deriveCapabilities(cardData as unknown as Card), ...composedCaps];
    if (image_url) cardData.image_url = image_url;

    // Upload SFX files if provided
    for (const [base64Key, mimeKey, urlKey] of [
      ['sfxPlayBase64', 'sfxPlayMimeType', 'sfx_play_url'],
      ['sfxDeathBase64', 'sfxDeathMimeType', 'sfx_death_url'],
      ['sfxExileBase64', 'sfxExileMimeType', 'sfx_exile_url'],
    ] as const) {
      // Aiguillage explicite : les trois sons partagent le même chemin d'upload,
      // seule la source du base64 change.
      const b64 = base64Key === 'sfxPlayBase64' ? sfxPlayBase64
        : base64Key === 'sfxDeathBase64' ? sfxDeathBase64
        : sfxExileBase64;
      const mime = mimeKey === 'sfxPlayMimeType' ? sfxPlayMimeType
        : mimeKey === 'sfxDeathMimeType' ? sfxDeathMimeType
        : sfxExileMimeType;
      if (b64 && mime) {
        const buf = Buffer.from(b64, 'base64');
        const ext = mime.split('/')[1]?.replace('mpeg', 'mp3') || 'mp3';
        const sfxPath = `cards/${urlKey}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const { error: sfxErr } = await supabaseAdmin.storage
          .from('sfx-tracks')
          .upload(sfxPath, buf, { upsert: true, contentType: mime, cacheControl: '31536000' });
        if (sfxErr) throw new Error(`SFX upload: ${sfxErr.message}`);
        const { data: sfxUrl } = supabaseAdmin.storage.from('sfx-tracks').getPublicUrl(sfxPath);
        cardData[urlKey] = sfxUrl.publicUrl;
      }
    }

    if (updateId) {
      // Update existing card — capture l'ancien nom/ambiance pour ne
      // retraduire que si l'un des deux a réellement changé.
      const { data: prev } = await supabaseAdmin
        .from('cards')
        .select('name, flavor_text')
        .eq('id', updateId)
        .single();
      const { error: updateErr } = await supabaseAdmin
        .from('cards')
        .update(cardData)
        .eq('id', updateId);
      if (updateErr) throw new Error(updateErr.message);
      if (
        !prev ||
        prev.name !== cardData.name ||
        (prev.flavor_text ?? null) !== (cardData.flavor_text ?? null)
      ) {
        scheduleCardTranslation(supabaseAdmin, {
          id: updateId as number,
          name: cardData.name as string | null,
          flavor_text: cardData.flavor_text as string | null,
        });
      }
      return NextResponse.json({ success: true, name: card.name, updated: true });
    } else {
      // Insert new card
      if (!image_url) cardData.image_url = null;
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('cards')
        .insert(cardData)
        .select('id')
        .single();
      if (insertErr) throw new Error(insertErr.message);

      // i18n : traduit nom + ambiance de la nouvelle carte en arrière-plan.
      if (inserted) {
        scheduleCardTranslation(supabaseAdmin, {
          id: inserted.id as number,
          name: cardData.name as string | null,
          flavor_text: cardData.flavor_text as string | null,
        });
      }

      // Generate limited prints for forged cards with date
      const printCount = card.rarity ? LIMITED_PRINT_COUNTS[card.rarity] : undefined;
      if (!card.set_id && card.card_year && printCount && inserted) {
        const prints = Array.from({ length: printCount }, (_, i) => ({
          card_id: inserted.id,
          print_number: i + 1,
          max_prints: printCount,
        }));
        const { error: printErr } = await supabaseAdmin.from('card_prints').insert(prints);
        if (printErr) console.error('[card-save] prints error:', printErr.message);
      }

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
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabaseAdmin = auth.supabase;

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
