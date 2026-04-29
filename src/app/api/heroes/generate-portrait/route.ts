import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateImage, GenerateImageError } from '@/lib/ai/generate-image';
import { buildHeroPortraitPrompt, type HeroRaceId } from '@/lib/ai/hero-portrait-prompt';
import { chromaKeyToPng } from '@/lib/ai/chroma-key';
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
    prompt?: string;
    name?: string;
    race?: string;
    faction?: string | null;
    clan?: string | null;
    extraContext?: string | null;
    useReference?: boolean;
    referenceImageBase64?: string;
    referenceImageMimeType?: string;
  };

  const {
    prompt: providedPrompt,
    name, race, faction, clan, extraContext,
    useReference, referenceImageBase64, referenceImageMimeType,
  } = body;

  // race + faction + clan validation only matters when we still have to
  // build the prompt server-side. With a caller-provided prompt we trust it
  // (the V2 flow composes via /compose-prompt which validates upstream).
  let prompt: string;
  if (typeof providedPrompt === 'string' && providedPrompt.trim()) {
    prompt = providedPrompt.trim();
  } else {
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
    prompt = buildHeroPortraitPrompt({
      name: name ?? null,
      race: race as HeroRaceId,
      faction: faction ?? null,
      clan: clan ?? null,
      extraContext: extraContext ?? null,
    });
  }

  // When the user opted in to reference-image fidelity AND uploaded one, we
  // route through Gemini multimodal (lower res, accepts inline images).
  // Otherwise Imagen 4 Ultra at 2K, no reference.
  const hasUsableRef =
    !!useReference &&
    typeof referenceImageBase64 === 'string' && !!referenceImageBase64 &&
    typeof referenceImageMimeType === 'string' && !!referenceImageMimeType;

  try {
    const result = await generateImage(
      hasUsableRef
        ? {
            prompt,
            aspectRatio: '1:1',
            referenceImageBase64,
            referenceImageMimeType,
          }
        : {
            prompt,
            highRes: true,
            aspectRatio: '1:1',
          },
    );
    // Strip the neon-cyan background to a real alpha channel. Both Imagen
    // (no ref) and Gemini (with ref) honor the cyan-fill rule reasonably
    // well; the chroma-key tolerance in chroma-key.ts is wide enough to
    // forgive small color drift.
    const keyed = await chromaKeyToPng(result.imageBase64, result.mimeType);
    return NextResponse.json({
      imageBase64: keyed.base64,
      mimeType: keyed.mimeType,
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
