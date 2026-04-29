import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildHeroPowerPrompt } from '@/lib/ai/hero-power-prompt';
import { FACTIONS } from '@/lib/card-engine/constants';

const LEGACY_SIMPLIFIED_RACES = new Set([
  'humans', 'elves', 'dwarves', 'halflings', 'beastmen',
  'giants', 'dark_elves', 'orcs_goblins', 'undead',
]);
const FACTION_GRANULAR_RACES = new Set(
  Object.values(FACTIONS).flatMap((f) => f.races),
);
function isAllowedRace(race: string): boolean {
  return LEGACY_SIMPLIFIED_RACES.has(race) || FACTION_GRANULAR_RACES.has(race);
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
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

async function enrichWithLLM(basePrompt: string, actionContext: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return basePrompt;

  const userMessage =
    `You will receive a base image-generation prompt for a fantasy hero ACTION shot ` +
    `(the hero performing their special power). The reference image of the hero will be ` +
    `passed alongside this prompt to keep identity consistent.\n\n` +
    `Author's extra action description: "${actionContext}"\n\n` +
    `Produce ONE final English prompt that:\n` +
    `- Keeps the 5:7 portrait composition, the full-bleed (no frame) constraint, and the ` +
    `requirement that the character must match the reference image exactly INTACT.\n` +
    `- Naturally weaves the author's action into the description (pose, weapon, motion lines, FX).\n` +
    `- Makes the action read clearly as the named power being unleashed.\n` +
    `- Output: just the final prompt as plain text. No quotes, no JSON, no explanation, no markdown.\n\n` +
    `BASE PROMPT:\n${basePrompt}`;

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
      console.error('[compose-power-prompt] Anthropic error:', data.error?.message || data);
      return basePrompt;
    }
    const text = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text;
    if (typeof text === 'string' && text.trim()) {
      return text.trim();
    }
    return basePrompt;
  } catch (err) {
    console.error('[compose-power-prompt] LLM call failed:', err);
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
    powerName?: string | null;
    powerDescription?: string | null;
    actionContext?: string | null;
  };

  const { name, race, faction, clan, powerName, powerDescription, actionContext } = body;

  if (typeof race !== 'string' || !isAllowedRace(race)) {
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

  const basePrompt = buildHeroPowerPrompt({
    name: name ?? null,
    race,
    faction: faction ?? null,
    clan: clan ?? null,
    powerName: powerName ?? null,
    powerDescription: powerDescription ?? null,
    actionContext: null,
  });

  const trimmedAction = (actionContext ?? '').trim();
  if (!trimmedAction) {
    return NextResponse.json({ prompt: basePrompt, llmEnriched: false });
  }

  const enriched = await enrichWithLLM(basePrompt, trimmedAction);
  if (enriched === basePrompt) {
    // LLM unavailable — append the action deterministically as fallback.
    const withAction = buildHeroPowerPrompt({
      name: name ?? null,
      race,
      faction: faction ?? null,
      clan: clan ?? null,
      powerName: powerName ?? null,
      powerDescription: powerDescription ?? null,
      actionContext: trimmedAction,
    });
    return NextResponse.json({ prompt: withAction, llmEnriched: false });
  }
  return NextResponse.json({ prompt: enriched, llmEnriched: true });
}
