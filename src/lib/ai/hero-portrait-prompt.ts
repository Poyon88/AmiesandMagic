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

// Background fill color used as a chroma key. The post-processing step in
// src/lib/ai/chroma-key.ts removes pixels close to this color. Pure neon cyan
// is chosen because no hero faction descriptor uses anywhere near pure
// (0, 255, 255), so chroma-keying it out won't bleed into the subject.
const CHROMA_KEY_DESCRIPTION =
  'a perfectly flat solid uniform pure neon cyan color, exact RGB(0, 255, 255), ' +
  'no gradient, no shading, no checkerboard pattern, no texture, no scenery, ' +
  'no architecture, no halo, no rays, no clouds, no decorative element';

const STYLE_PREAMBLE =
  'Highly detailed digital fantasy hero portrait in painterly matte concept-art style. ' +
  'PRIMARY SUBJECT (do NOT omit): a clearly humanoid hero — visible head, face with two eyes, ' +
  'two shoulders, torso bust — filling the central oval area of the composition and facing the viewer with an intense direct gaze. ' +
  'The character must be the focal point; do NOT replace them with abstract symbols, sigils, floating runes, ' +
  'kaleidoscopic patterns, mandalas, decorative-only motifs, or geometric arrangements of objects. ' +
  'A round ornate metallic frame surrounds the portrait, decorated with engraved filigree and small gemstones — ' +
  'this frame is decoration ONLY, it must not consume the central space where the character lives. ' +
  'A decorative metallic banner curves across the bottom, centered on a circular medallion bearing the faction emblem. ' +
  `IMPORTANT BACKGROUND RULE: every single pixel OUTSIDE the round metallic frame must be ${CHROMA_KEY_DESCRIPTION}. ` +
  'The character, frame, and emblem must NOT use any neon cyan in their colors. ' +
  'Cinematic lighting on the character only, fine brushwork, ArtStation fantasy game art quality, 1:1 square composition.';

// Descriptors for granular FACTIONS races that aren't covered by the legacy
// simplified set. Without these, abstract races (Fées, Feu, Phoenix…) make
// Imagen drift into decorative-only patterns instead of producing a clear
// humanoid hero. Each entry MUST start with "A humanoid …" so the model
// keeps the character anchored as a person, not a motif.
export const GRANULAR_RACE_DESCRIPTORS: Record<string, string> = {
  // Elfes faction
  'Elfes':
    'A humanoid elven warrior, tall and slender, long pointed ears, sharp angular features, almond-shaped luminous eyes, flowing long hair.',
  'Aigles Géants':
    'A humanoid anthropomorphic giant eagle warrior — clearly bipedal humanoid silhouette, eagle-shaped feathered head with sharp golden eyes and beak, broad feathered shoulders, folded wings visible behind, talon-tipped hands.',
  'Fées':
    'A humanoid faerie warrior with iridescent butterfly or dragonfly wings tucked behind the shoulders, delicate elven features, glowing skin, intricate filigree clothing.',
  // Nains faction
  'Nains':
    'A humanoid dwarf, stocky and broad-shouldered, weathered face, thick braided beard adorned with metal rings, deep-set piercing eyes.',
  'Golems':
    'A humanoid stone or metal golem warrior — rocky carved torso, glowing runic seams on the chest and forehead, broad rugged shoulders, expressionless but determined face.',
  // Hobbits faction
  'Hobbits':
    'A humanoid halfling, youthful, rounded cheeks, curly hair, gentle but determined expression, small stature emphasized in framing.',
  'Hommes-Arbres':
    'A humanoid treant warrior — bark-textured skin, mossy beard, leafy hair, branch-like arms but clearly bipedal humanoid posture, kind weathered eyes glowing softly.',
  // Humains faction
  'Humains':
    'A human warrior, expressive eyes, defined cheekbones, short trimmed beard, scar or mark of experience.',
  // Hommes-Bêtes faction
  'Hommes-Loups':
    'A humanoid werewolf warrior — bipedal humanoid silhouette, lupine head with snout, fangs, pointed ears, thick fur over the shoulders, intelligent amber eyes.',
  'Hommes-Ours':
    'A humanoid werebear warrior — bipedal humanoid silhouette, ursine head with broad muzzle, thick brown fur, massive shoulders, calm but fierce eyes.',
  'Hommes-Félins':
    'A humanoid werefelid warrior — bipedal humanoid silhouette, feline head with whiskers, slit pupils, tufted ears, sleek spotted fur, agile build.',
  'Centaures':
    'A humanoid centaur — humanoid torso and head atop equine lower body (only the upper humanoid half framed in this bust portrait), wild mane braided into the hair, weathered features.',
  // Élémentaires faction
  'Feu':
    'A humanoid fire elemental warrior — clearly bipedal humanoid silhouette, skin of glowing embers and flowing flame, hair made of living fire, eyes like burning coals.',
  'Terre':
    'A humanoid earth elemental warrior — bipedal humanoid silhouette, rocky stone-textured skin, mossy beard, glowing crystal veins running across the chest and brow.',
  'Eau':
    'A humanoid water elemental warrior — bipedal humanoid silhouette, translucent flowing skin like rippling water, hair of cascading water droplets, calm deep-blue eyes.',
  'Air/Tempête':
    'A humanoid storm elemental warrior — bipedal humanoid silhouette, windswept wispy form with cloud-like hair, faint lightning veins crackling across the skin, fierce sky-blue eyes.',
  // Mercenaires faction
  'Géants':
    'A humanoid giant warrior — towering bipedal silhouette filling the frame, massive shoulders, rugged stone-like skin, weathered noble face, deep-set eyes.',
  'Ogres':
    'A humanoid ogre warrior — bipedal silhouette, broad muscular shoulders, tusked under-bite, thick brutish features, low-slung brow, scarred green-grey skin.',
  'Dragons':
    'A humanoid dragon warrior — bipedal humanoid silhouette, scaled draconic skin, horned reptilian head, slit pupils, plated armor of dragon-bone, wings tucked behind.',
  'Chiens':
    'A humanoid hound warrior — bipedal humanoid silhouette, canine head with floppy ears or alert pricked ears, expressive loyal eyes, fur over the shoulders.',
  'Phoenix':
    'A humanoid phoenix warrior — bipedal humanoid silhouette, head and shoulders adorned with fiery red-gold feathers, plumage like flames, embered eyes, regal poise.',
  'Anges':
    'A humanoid angelic warrior — bipedal humanoid silhouette, large feathered white wings folded behind the shoulders, faint halo of light, serene determined face, heavenly plate armor.',
  'Ours':
    'A humanoid bear warrior — bipedal humanoid silhouette, ursine head with broad muzzle, thick brown fur, massive shoulders, calm but fierce eyes.',
  'Loups':
    'A humanoid wolf warrior — bipedal humanoid silhouette, lupine head with snout, fangs, pointed ears, thick grey fur over the shoulders, intelligent amber eyes.',
  // Orcs faction
  'Orcs':
    'A humanoid orc warrior — bipedal humanoid silhouette, green-skinned, prominent tusks, heavy brow ridge, fierce yellow eyes, scarred skin, wild dark hair.',
  'Gobelins':
    'A humanoid goblin warrior — small bipedal humanoid silhouette, green-skinned, large pointed ears, sharp fangs in a wicked grin, mischievous yellow eyes.',
  'Trolls':
    'A humanoid troll warrior — towering bipedal silhouette, mossy stone-grey skin, hunched broad shoulders, prominent jaw with tusks, deep-set yellow eyes.',
  'Wargs':
    'A humanoid warg warrior — bipedal humanoid silhouette, wolf-like predatory head with fangs, dark fur over the shoulders, intelligent malevolent eyes.',
  // Morts-Vivants faction
  'Squelettes':
    'A humanoid skeletal warrior — bipedal humanoid silhouette of bare bone, skull-faced head with hollow glowing sockets, fragments of armor and tattered cloth.',
  'Zombies':
    'A humanoid zombie warrior — bipedal humanoid silhouette, decaying flesh, sunken eyes glowing faintly, ragged armor, slack-jawed grim expression.',
  'Spectres':
    'A humanoid spectre warrior — translucent ghostly bipedal silhouette, hollow glowing eyes, drifting tattered shroud forming the upper body.',
  'Vampires':
    'A humanoid vampire warrior — bipedal humanoid silhouette, pale aristocratic features, sharp fangs visible at parted lips, piercing crimson eyes, regal dark cloak.',
  'Lich':
    'A humanoid lich warrior — bipedal humanoid silhouette, gaunt undead face under a dark hood, glowing necrotic eyes, skeletal hands clutching a dark relic.',
  'Banshees':
    'A humanoid banshee warrior — translucent ghostly female bipedal silhouette, mournful glowing eyes, tattered flowing robes, wisps of pale hair.',
  // Elfes Noirs faction
  'Elfes Corrompus':
    'A humanoid corrupted dark-elf warrior — bipedal silhouette, ashen-grey or onyx skin, pointed ears, sharp predatory features, glowing crimson or violet eyes, long pale hair.',
  'Araignées Géantes':
    'A humanoid spider-warrior — bipedal humanoid upper torso atop arachnid lower body (only upper half visible in this bust), eight glittering eyes across the brow, chitinous black armor, fanged maw.',
  'Démons':
    'A humanoid demon warrior — bipedal humanoid silhouette, crimson or obsidian skin, horns curving from the brow, glowing infernal eyes, fanged mouth, broad muscular shoulders.',
};

// Physical features per race. Kept short so it doesn't drown the faction layer.
export const RACE_DESCRIPTORS: Record<HeroRaceId, string> = {
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
export type FactionDescriptor = {
  palette: string;
  mood: string;
  emblem: string;
  armor: string;
};

export const FACTION_DESCRIPTORS: Record<string, FactionDescriptor> = {
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

export const DEFAULT_FACTION_DESCRIPTOR: FactionDescriptor = {
  palette: 'silver and steel-blue with subdued gold accents',
  mood: 'mysterious, neutral, reserved',
  emblem: 'a blank silver shield on a dark disc',
  armor: 'plain steel plate armor without specific heraldry',
};

// Per-clan accent layer. Adds a small distinctive touch on top of the faction
// look (specific hood color, fabric pattern, accessory). Optional — falls back
// to the faction look only when the clan isn't mapped.
export const CLAN_ACCENTS: Record<string, string> = {
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
  // Accepts both legacy simplified IDs ("humans", "elves", …) and the
  // granular FACTIONS races ("Aigles Géants", "Hommes-Loups", …).
  race: string;
  faction?: string | null;
  clan?: string | null;
  extraContext?: string | null;
}): string {
  // Lookup order:
  // 1. Granular FACTIONS race descriptor (humanoid-anchored, prevents the
  //    model from drifting into abstract patterns for races like Fées, Feu,
  //    Phoenix, …).
  // 2. Legacy simplified-ID descriptor (existing 9-race system).
  // 3. Generic humanoid fallback.
  const racePart =
    GRANULAR_RACE_DESCRIPTORS[input.race]
    ?? (RACE_DESCRIPTORS as Record<string, string>)[input.race]
    ?? `A clearly humanoid ${input.race} fantasy hero — visible head, face, and shoulders — fitting the iconic look of that race.`;

  const factionDef = input.faction ? FACTION_DESCRIPTORS[input.faction] : null;
  const fd = factionDef ?? DEFAULT_FACTION_DESCRIPTOR;

  // Alignment cue from the FACTIONS table to bias the lighting/mood (good →
  // warm gold, maléfique → cold/sinister, neutre → balanced).
  const alignment = input.faction ? FACTIONS[input.faction]?.alignment : null;
  const alignmentCue =
    alignment === 'maléfique' ? 'cold sinister rim light cast on the character only, dark mood on the subject (background remains pure neon cyan)' :
    alignment === 'bon' ? 'warm golden noble lighting on the character only (background remains pure neon cyan)' :
    alignment === 'spéciale' ? 'mixed warm-and-cool enigmatic lighting on the character only (background remains pure neon cyan)' :
    'even balanced cinematic lighting on the character only (background remains pure neon cyan)';

  const clanAccent = input.clan ? CLAN_ACCENTS[input.clan] : null;

  const factionPart =
    `Faction look: ${fd.mood}, color palette of ${fd.palette}. ` +
    `Wearing ${fd.armor}. ` +
    (clanAccent ? `Clan accent (${input.clan}): ${clanAccent}. ` : '') +
    `The bottom medallion of the frame must clearly display ${fd.emblem}.`;

  const extraPart = input.extraContext && input.extraContext.trim()
    ? `Additional character details requested by the author: ${input.extraContext.trim()}.`
    : '';

  return [
    STYLE_PREAMBLE,
    racePart,
    factionPart,
    extraPart,
    alignmentCue + '.',
  ].filter(Boolean).join(' ');
}
