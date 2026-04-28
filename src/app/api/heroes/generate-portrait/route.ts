import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateImage, GenerateImageError } from '@/lib/ai/generate-image';
import { buildHeroPortraitPrompt, type HeroRaceId } from '@/lib/ai/hero-portrait-prompt';
import { FACTIONS } from '@/lib/card-engine/constants';

const ALLOWED_RACES: ReadonlySet<HeroRaceId> = new Set([
  'humans', 'elves', 'dwarves', 'halflings', 'beastmen',
  'giants', 'dark_elves', 'orcs_goblins', 'undead',
]);

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
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    name?: string;
    race?: string;
    faction?: string | null;
    clan?: string | null;
  };

  const { name, race, faction, clan } = body;

  if (typeof race !== 'string' || !ALLOWED_RACES.has(race as HeroRaceId)) {
    return NextResponse.json({ error: 'Race invalide' }, { status: 400 });
  }
  if (faction != null && faction !== '' && !(faction in FACTIONS)) {
    return NextResponse.json({ error: 'Faction invalide' }, { status: 400 });
  }
  if (clan != null && clan !== '' && faction && faction in FACTIONS) {
    const factionDef = FACTIONS[faction];
    if (factionDef.clans && !factionDef.clans.names.includes(clan)) {
      return NextResponse.json({ error: 'Clan invalide pour cette faction' }, { status: 400 });
    }
  }

  const prompt = buildHeroPortraitPrompt({
    name: name ?? null,
    race: race as HeroRaceId,
    faction: faction ?? null,
    clan: clan ?? null,
  });

  try {
    const result = await generateImage({
      prompt,
      highRes: true,
      aspectRatio: '1:1',
    });
    return NextResponse.json({
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
      model: result.model,
    });
  } catch (err) {
    if (err instanceof GenerateImageError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}
