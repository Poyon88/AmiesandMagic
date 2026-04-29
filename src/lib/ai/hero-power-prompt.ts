// Hero power image prompt builder.
//
// Produces a prompt fed to Gemini multimodal alongside the hero's portrait
// (passed as a reference image so the character identity stays consistent).
// Output target is a 5:7 card-portrait full-bleed action illustration that
// drops into the in-game HeroPowerCastOverlay (252×350 px, animated 2.8 s).
//
// This is intentionally distinct from the portrait builder:
//  - no neon-cyan chroma-key (the result is full-bleed art, not a cutout)
//  - no static round frame / banner / emblem (those belong to the portrait)
//  - emphasis on motion and the named action

import {
  RACE_DESCRIPTORS,
  GRANULAR_RACE_DESCRIPTORS,
  FACTION_DESCRIPTORS,
  DEFAULT_FACTION_DESCRIPTOR,
  CLAN_ACCENTS,
} from '@/lib/ai/hero-portrait-prompt';
import { FACTIONS } from '@/lib/card-engine/constants';

const STYLE_PREAMBLE =
  'Dynamic full-body fantasy hero action illustration, painterly matte concept-art style, ' +
  '5:7 card-portrait composition (taller than wide), dramatic cinematic lighting. ' +
  'PRIMARY SUBJECT (do NOT omit): a clearly humanoid hero figure — visible head, face, torso, limbs — ' +
  'as the central focus of the composition, in motion, mid-action. ' +
  'Do NOT replace the character with abstract symbols, sigils, kaleidoscopic patterns, mandalas, or floating runes. ' +
  'The character must keep the EXACT identity of the reference image — same face, same hair, ' +
  'same skin tone, same armor and faction colors. ' +
  'Body language conveys the power being unleashed. ' +
  'Atmospheric environment matching the faction mood (ruins, battlefield, mystical glade…). ' +
  'No frame, no border, no banner, no emblem cartouche, no text — just the illustration filling the canvas edge to edge.';

export function buildHeroPowerPrompt(input: {
  name?: string | null;
  // Accepts both legacy simplified IDs and granular FACTIONS races.
  race: string;
  faction?: string | null;
  clan?: string | null;
  powerName?: string | null;
  powerDescription?: string | null;
  actionContext?: string | null;
}): string {
  const racePart =
    GRANULAR_RACE_DESCRIPTORS[input.race]
    ?? (RACE_DESCRIPTORS as Record<string, string>)[input.race]
    ?? `A clearly humanoid ${input.race} fantasy hero in dynamic action.`;

  const factionDef = input.faction ? FACTION_DESCRIPTORS[input.faction] : null;
  const fd = factionDef ?? DEFAULT_FACTION_DESCRIPTOR;

  const alignment = input.faction ? FACTIONS[input.faction]?.alignment : null;
  const moodCue =
    alignment === 'maléfique' ? 'sinister, dark, oppressive atmosphere with cold rim lighting' :
    alignment === 'bon' ? 'noble, sacred atmosphere with warm golden light' :
    alignment === 'spéciale' ? 'enigmatic, ambiguous atmosphere with mixed warm-and-cool lighting' :
    'balanced epic atmosphere with cinematic lighting';

  const clanAccent = input.clan ? CLAN_ACCENTS[input.clan] : null;

  const factionPart =
    `Faction look: ${fd.mood}, color palette of ${fd.palette}. ` +
    `Wearing ${fd.armor}. ` +
    (clanAccent ? `Clan accent (${input.clan}): ${clanAccent}. ` : '');

  const powerName = (input.powerName ?? '').trim();
  const powerDescription = (input.powerDescription ?? '').trim();
  const action = (input.actionContext ?? '').trim() || 'the hero unleashing this power in a heroic stance';

  const powerPart =
    (powerName ? `Power name: "${powerName}". ` : '') +
    (powerDescription ? `Power effect: "${powerDescription}". ` : '') +
    `Visual action to depict: ${action}.`;

  return [
    STYLE_PREAMBLE,
    racePart,
    factionPart,
    powerPart,
    `Mood: ${moodCue}.`,
  ].filter(Boolean).join(' ');
}
