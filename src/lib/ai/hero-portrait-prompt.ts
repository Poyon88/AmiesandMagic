// Hero portrait prompt builder.
//
// Composes a stable style preamble + race descriptors + faction/clan
// descriptors into a single prompt fed to Imagen 4 Ultra (2K, 1:1). The style
// preamble freezes the visual identity (round metallic frame, halo, stained
// glass arch, bottom emblem cartouche) so every generated portrait shares the
// same overall composition and only the character + cultural cues vary.

import { FACTIONS } from '@/lib/card-engine/constants';

export type HeroRaceId =
  | 'humans'
  | 'elves'
  | 'dwarves'
  | 'halflings'
  | 'beastmen'
  | 'giants'
  | 'dark_elves'
  | 'orcs_goblins'
  | 'undead';

const STYLE_PREAMBLE =
  'Highly detailed digital fantasy hero portrait in painterly matte concept-art style. ' +
  'Centered character bust, head and shoulders only, facing the viewer with an intense direct gaze. ' +
  'A round ornate metallic frame surrounds the portrait, decorated with engraved filigree and small gemstones. ' +
  'A decorative metallic banner curves across the bottom, centered on a circular medallion bearing the faction emblem. ' +
  'IMPORTANT: completely transparent background — no scenery, no environment, no architecture, no halo, no rays of light, no decorative pattern, no sky, no walls behind the character. ' +
  'Anything outside the round metallic frame must be plain transparent (alpha 0). ' +
  'Pure isolated subject as a clean PNG cutout, ready to be composited on top of any game UI. ' +
  'Cinematic lighting on the character only, fine brushwork, ArtStation fantasy game art quality, 1:1 square composition.';

// Physical features per race. Kept short so it doesn't drown the faction layer.
const RACE_DESCRIPTORS: Record<HeroRaceId, string> = {
  humans:
    'A human warrior, expressive eyes, defined cheekbones, short trimmed beard, scar or mark of experience.',
  elves:
    'A tall elven figure with long pointed ears, sharp angular features, almond-shaped luminous eyes, flowing long hair.',
  dwarves:
    'A stocky dwarf with broad shoulders, weathered face, thick braided beard adorned with metal rings, deep-set piercing eyes.',
  halflings:
    'A youthful halfling with rounded cheeks, curly hair, gentle but determined expression, small stature emphasized in framing.',
  beastmen:
    'A bestial humanoid with feral features, fur-trimmed skin, animalistic eyes (slit pupils or amber glow), hints of fangs and pointed ears.',
  giants:
    'A towering giant figure, massive shoulders filling the frame, rugged stone-like skin texture, weathered noble face, deep-set eyes.',
  dark_elves:
    'A dark elf with ashen-grey or onyx skin, pointed ears, sharp predatory features, glowing crimson or violet eyes, long pale hair.',
  orcs_goblins:
    'A green-skinned orc with prominent tusks, heavy brow ridge, fierce yellow eyes, scarred skin, wild dark hair.',
  undead:
    'An undead figure with ghostly pale or grey skin, hollow glowing eyes, gaunt features, faint spectral mist drifting around the head.',
};

// Per-faction palette, mood, and heraldic emblem. Falls back to a generic
// silver shield if a faction is missing here. The emblem name is mentioned
// explicitly so Imagen places it in the bottom medallion.
type FactionDescriptor = {
  palette: string;
  mood: string;
  emblem: string;
  armor: string;
};

const FACTION_DESCRIPTORS: Record<string, FactionDescriptor> = {
  Elfes: {
    palette: 'emerald green and silver with soft turquoise glow accents',
    mood: 'serene, wise, in harmony with nature',
    emblem: 'a silver stag head crest on a green disc',
    armor: 'elegant scale armor inscribed with leaf motifs and flowing organic ornaments',
  },
  Nains: {
    palette: 'burnished copper, deep gold, and forge-red',
    mood: 'stoic, proud, mountain-forged resilience',
    emblem: 'a crossed silver hammer and anvil on a copper disc',
    armor: 'thick riveted plate armor with hammered geometric patterns',
  },
  Hobbits: {
    palette: 'warm gold, autumn brown, and harvest yellow',
    mood: 'humble, brave, hearth-warm',
    emblem: 'a golden oak leaf on an earthen disc',
    armor: 'simple but finely woven tunic with leather pauldrons and bronze trim',
  },
  Humains: {
    palette: 'royal blue, white, and bright gold',
    mood: 'noble, balanced, upright crusader-king bearing',
    emblem: 'a silver rampant lion on a black disc',
    armor: 'ornate plate pauldrons and white tabard with a heraldic cross of gold',
  },
  'Hommes-Bêtes': {
    palette: 'earthen browns, tawny gold, and deep forest green',
    mood: 'feral, primal, untamed',
    emblem: 'a silver wolf head on a wooden disc',
    armor: 'fur-trimmed leather armor with bone fetishes and tribal totems',
  },
  Élémentaires: {
    palette: 'swirling colors of fire orange, water blue, earth ochre, and storm white',
    mood: 'primordial, otherworldly, raw natural force',
    emblem: 'a four-element sigil (flame, drop, mountain, swirl) on a stone disc',
    armor: 'armor that seems formed of living elemental matter, glowing fissures of energy',
  },
  Mercenaires: {
    palette: 'gold, brass, and blood-red',
    mood: 'roguish, mercenary, coin-hungry confidence',
    emblem: 'a golden coin pierced by a dagger on a red disc',
    armor: 'mismatched ornate armor pieces from many cultures, gold trim, hanging trinkets',
  },
  Orcs: {
    palette: 'savage green, bone white, and rust red',
    mood: 'brutal, war-hungry, savage horde leader',
    emblem: 'a jagged crossed cleavers on a bone-white skull disc',
    armor: 'crude spiked plate armor stitched with leather and bone trophies',
  },
  'Morts-Vivants': {
    palette: 'sickly purple, bone-white, and necrotic green',
    mood: 'unholy, eternal, drained of life',
    emblem: 'a grinning skull crowned in thorns on a violet disc',
    armor: 'tattered shroud over rusted blackened plate, glowing necrotic runes',
  },
  'Elfes Noirs': {
    palette: 'deep violet, obsidian black, and venom green accents',
    mood: 'cunning, predatory, shadow-touched',
    emblem: 'a silver spider sigil on a violet disc',
    armor: 'sleek black plate armor with venomous green inlays and spider-silk cloak',
  },
};

const DEFAULT_FACTION_DESCRIPTOR: FactionDescriptor = {
  palette: 'silver and steel-blue with subdued gold accents',
  mood: 'mysterious, neutral, reserved',
  emblem: 'a blank silver shield on a dark disc',
  armor: 'plain steel plate armor without specific heraldry',
};

// Per-clan accent layer. Adds a small distinctive touch on top of the faction
// look (specific hood color, fabric pattern, accessory). Optional — falls back
// to the faction look only when the clan isn't mapped.
const CLAN_ACCENTS: Record<string, string> = {
  // Humains
  Templiers:
    'a deep crimson hood with gold-embroidered trim, white tabard bearing a vertical golden cross, gleaming gold pauldrons (the templar look)',
  Nordiques:
    'a thick wolf-fur cloak with frosted edges, braided icy-blonde hair, blue rune-painted face markings',
  Orientaux:
    'silken layered robes with dragon embroidery, ornate jade pendant, a single curved hairpin',
  // Elfes
  Sylvains:
    'a leaf-woven circlet, mossy-green hooded cape, traces of foliage and twigs in the hair',
  'Hauts-Elfes':
    'a tall silver tiara, pristine white-and-blue robes, delicate sapphire jewelry',
  'Elfes des Mers':
    'a coral-and-pearl headpiece, sea-blue layered fabrics, faintly iridescent skin',
  // Nains
  Montagnes:
    'a winged steel helm, cloak of bear fur, gold-banded braided beard',
  Collines:
    'a leather hood over a copper circlet, earth-toned tunic, pickaxe charm pendant',
  Lave:
    'glowing magma-veined skin patterns, blackened fire-forged armor, ember-orange beard streaks',
  // Hobbits
  Plaines: 'a wide-brimmed straw hat, simple linen tunic, golden wheat motif',
  Rivièrains:
    'a fishing-net scarf, river-blue cloak, small water-lily pendant',
  Landes: 'a heather-purple hood, peat-stained leather jerkin, twisted bramble bracelet',
  // Hommes-Bêtes / Orcs / Elfes Noirs (shared clan names)
  Forêt: 'moss-and-leaf camouflage, antler headpiece, bark-textured skin patches',
  Toundra: 'thick frost-covered fur cloak, ice-blue eye color, frost crystals on the brow',
  Savane: 'sun-bleached lion-mane mantle, ochre warpaint stripes',
  Marais: 'algae-stained leather, swamp-green skin tone, a bone-and-reed necklace',
  // Elfes Noirs
  'Abysses souterrains':
    'glowing violet eyes, obsidian crown, faintly luminescent skin veins',
  'Forêt maudite':
    'twisted blackthorn antlers, bark-like skin, eerie green firefly glow around the head',
  'Cités de cendres':
    'soot-grey hood, cracked-ash skin texture, ember-red gem set in the brow',
};

export function buildHeroPortraitPrompt(input: {
  name?: string | null;
  race: HeroRaceId;
  faction?: string | null;
  clan?: string | null;
}): string {
  const racePart = RACE_DESCRIPTORS[input.race]
    ?? 'A fantasy heroic figure with distinctive features.';

  const factionDef = input.faction ? FACTION_DESCRIPTORS[input.faction] : null;
  const fd = factionDef ?? DEFAULT_FACTION_DESCRIPTOR;

  // Alignment cue from the FACTIONS table to bias the lighting/mood (good →
  // warm gold, maléfique → cold/sinister, neutre → balanced).
  const alignment = input.faction ? FACTIONS[input.faction]?.alignment : null;
  const alignmentCue =
    alignment === 'maléfique' ? 'cold sinister rim light cast on the character only, dark mood on the subject (background still fully transparent)' :
    alignment === 'bon' ? 'warm golden noble lighting on the character only (background still fully transparent)' :
    alignment === 'spéciale' ? 'mixed warm-and-cool enigmatic lighting on the character only (background still fully transparent)' :
    'even balanced cinematic lighting on the character only (background still fully transparent)';

  const clanAccent = input.clan ? CLAN_ACCENTS[input.clan] : null;

  const factionPart =
    `Faction look: ${fd.mood}, color palette of ${fd.palette}. ` +
    `Wearing ${fd.armor}. ` +
    (clanAccent ? `Clan accent (${input.clan}): ${clanAccent}. ` : '') +
    `The bottom medallion of the frame must clearly display ${fd.emblem}.`;

  return [
    STYLE_PREAMBLE,
    racePart,
    factionPart,
    alignmentCue + '.',
  ].join(' ');
}
