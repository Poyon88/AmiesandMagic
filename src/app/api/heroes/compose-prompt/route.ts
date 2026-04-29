import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
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

// Asks Claude to weave the user-provided extra context into the deterministic
// prompt skeleton. The skeleton already pins down the composition (round
// frame, banner, neon-cyan chroma-key background) — we only let the LLM
// expand the character description, not restructure the scene.
async function enrichWithLLM(basePrompt: string, extraContext: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return basePrompt;

  const userMessage =
    `You will receive a base image-generation prompt for a fantasy hero portrait, ` +
    `plus extra character details from the author. Produce ONE final English prompt that:\n` +
    `- Keeps the round metallic frame, the bottom banner with the faction emblem, and the neon cyan RGB(0,255,255) background-fill rule INTACT and unchanged.\n` +
    `- Naturally weaves the author's extra details into the character description (face, expression, accessories, posture, mood).\n` +
    `- Does NOT add scenery, halo, rays, architecture, or anything outside the round frame.\n` +
    `- Output: just the final prompt as plain text. No quotes, no JSON, no explanation, no markdown.\n\n` +
    `BASE PROMPT:\n${basePrompt}\n\n` +
    `AUTHOR'S EXTRA DETAILS:\n${extraContext}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[compose-prompt] Anthropic error:', data.error?.message || data);
      return basePrompt;
    }
    const text = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text;
    if (typeof text === 'string' && text.trim()) {
      return text.trim();
    }
    return basePrompt;
  } catch (err) {
    console.error('[compose-prompt] LLM call failed:', err);
    return basePrompt;
  }
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    name?: string;
    race?: string;
    faction?: string | null;
    clan?: string | null;
    extraContext?: string | null;
  };

  const { name, race, faction, clan, extraContext } = body;

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

  const basePrompt = buildHeroPortraitPrompt({
    name: name ?? null,
    race: race as HeroRaceId,
    faction: faction ?? null,
    clan: clan ?? null,
    extraContext: null, // we'll let the LLM weave it in instead of brute-concat
  });

  const trimmedExtra = (extraContext ?? '').trim();
  if (!trimmedExtra) {
    return NextResponse.json({ prompt: basePrompt, llmEnriched: false });
  }

  const enriched = await enrichWithLLM(basePrompt, trimmedExtra);
  // Fallback safety: if the LLM call failed and returned the base prompt,
  // append the extra context deterministically so the user's input isn't
  // silently dropped.
  if (enriched === basePrompt) {
    const withExtra = buildHeroPortraitPrompt({
      name: name ?? null,
      race: race as HeroRaceId,
      faction: faction ?? null,
      clan: clan ?? null,
      extraContext: trimmedExtra,
    });
    return NextResponse.json({ prompt: withExtra, llmEnriched: false });
  }
  return NextResponse.json({ prompt: enriched, llmEnriched: true });
}
