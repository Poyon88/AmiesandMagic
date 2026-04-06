import { NextResponse } from 'next/server';
import { FACTIONS } from '@/lib/card-engine/constants';

export async function POST(request: Request) {
  const body = await request.json();
  const { factionId, type, rarityId, stats, existingName, existingAbility, clanId } = body;
  // raceId can arrive as "undefined" string from JSON — normalize to real undefined
  const raceId = body.raceId && body.raceId !== 'undefined' ? body.raceId : undefined;
  console.log(`[card-forge] INPUT — factionId: ${factionId}, raceId: "${raceId}", type: ${type}`);

  const kws = stats.keywords?.length > 0 ? `Mots-clés: ${stats.keywords.join(', ')}. ` : '';
  const statsDesc = stats.attack != null
    ? `ATK ${stats.attack} / DEF ${stats.defense}. `
    : `Puissance ${stats.power}. `;
  const fac = FACTIONS[factionId];
  const facDesc = fac?.description || '';

  // Determine sub-type for prompt
  let subTypeHint = '';
  if (fac?.subType && stats.mana) {
    const st = fac.subType;
    if (stats.mana >= st.threshold) {
      const name = st.name || factionId;
      subTypeHint = st.descOverride
        ? `\n- Sous-type: ${name}. ${st.descOverride}`
        : `\n- Sous-type: ${name}`;
    } else if (st.lowName) {
      subTypeHint = `\n- Sous-type: ${st.lowName} (petite créature rapide et sacrifiable de la faction ${factionId})`;
    }
  }

  const hasVol = stats.keywords?.includes('Vol');
  const volHint = hasVol ? '\n- IMPORTANT: La carte a le mot-clé Vol → la créature DOIT être volante (dragon, wyverne, aigle, faucon, griffon, chauve-souris, spectre ailé, démon ailé, etc. selon la race)' : '';
  const raceVisualDescriptions: Record<string, string> = {
    // Elfes
    "Elfes": "tall, slender elven figure with pointed ears, elegant features, flowing hair, light armor with nature motifs",
    "Aigles Géants": "massive giant eagle with piercing eyes, powerful wingspan, golden-brown plumage, talons like swords",
    "Fées": "tiny luminous fairy with translucent butterfly/dragonfly wings, glowing aura, ethereal and delicate",
    // Nains
    "Nains": "stout dwarven warrior with thick beard, heavy plate armor, runes engraved on equipment, stocky and muscular",
    "Golems": "massive stone or metal construct, glowing runes carved into body, hulking and mechanical, no organic features",
    // Hobbits
    "Hobbits": "small halfling with bare hairy feet, round cheerful face, simple rustic clothing, shorter than a dwarf",
    "Hommes-Arbres": "towering treant/ent creature made of living wood, bark skin, branch limbs, leaves as hair, mossy and ancient",
    // Humains
    "Humains": "human warrior/mage in medieval armor or robes, realistic proportions, heraldic symbols",
    // Hommes-Bêtes
    "Hommes-Loups": "werewolf-like humanoid with wolf head, fur-covered muscular body, feral eyes, claws and fangs",
    "Hommes-Ours": "werebear-like humanoid, massive bear-headed figure, thick fur, enormous claws, towering and powerful",
    "Hommes-Félins": "feline humanoid with cat/panther features, lithe and agile body, whiskers, slit pupils, sleek fur",
    "Centaures": "centaur with human torso on horse body, wielding spear or bow, wild mane, tribal markings",
    // Élémentaires
    "Feu": "fire elemental, body made of living flames, molten core, embers floating around, intense heat haze",
    "Terre": "earth elemental, body of rock and stone, crystal growths, moss patches, heavy and immovable",
    "Eau": "water elemental, body of flowing translucent water, whirlpool core, droplets suspended in air",
    "Air/Tempête": "storm elemental, body of swirling wind and lightning, crackling electricity, semi-transparent and volatile",
    // Mercenaires
    "Géants": "towering giant humanoid, crude armor, massive club or weapon, standing several stories tall",
    "Ogres": "large brutish ogre, ugly face, thick skin, crude leather armor, heavy gut, wielding a club",
    "Dragons": "magnificent dragon with scales, massive wings, long tail, breathing fire/ice/lightning, serpentine neck",
    "Chiens": "large war hound or mastiff, battle-scarred, armored barding, fierce and loyal",
    "Phoenix": "majestic phoenix bird engulfed in sacred flames, radiant feathers of gold and crimson, rebirth aura",
    "Anges": "celestial angelic being with luminous feathered wings, divine armor, halo of light, ethereal beauty",
    "Ours": "massive armored bear, war-trained, thick fur, powerful claws, intimidating presence",
    "Loups": "fierce dire wolf, larger than normal, piercing eyes, thick fur, pack hunter",
    // Orcs
    "Orcs": "green-skinned muscular orc, tusks, brutal heavy armor, scarred face, savage and menacing",
    "Gobelins": "small green goblin, pointy ears, sharp teeth, ragged clothing, sneaky and mischievous",
    "Trolls": "huge troll with regenerating flesh, long arms, hunched posture, warty skin, dim-witted but dangerous",
    "Wargs": "giant wolf-like warg beast, dark matted fur, red eyes, razor fangs, used as mount by orcs",
    // Morts-Vivants
    "Squelettes": "animated skeleton warrior, hollow eye sockets with ghostly glow, rusted ancient armor, bones and decay",
    "Zombies": "shambling undead corpse, rotting flesh, torn clothing, mindless hunger, decayed and horrifying",
    "Spectres": "ghostly translucent specter, floating ethereal form, glowing eyes, trailing wisps of ectoplasm",
    "Vampires": "elegant vampire lord, pale skin, red eyes, aristocratic dark clothing, fangs, nocturnal predator",
    "Lich": "skeletal undead sorcerer in ornate robes, glowing phylactery, crown of dark magic, necromantic aura",
    "Banshees": "wailing ghostly female spirit, flowing spectral hair, mouth open in eternal scream, translucent and terrifying",
    // Elfes Noirs
    "Elfes Corrompus": "dark elf with ashen/obsidian skin, white hair, cruel features, spiked dark armor, malevolent aura",
    "Araignées Géantes": "enormous spider with dark chitin, multiple glowing eyes, venomous dripping fangs, web-covered",
    "Démons": "demonic creature with horns, bat-like wings, cloven hooves, infernal flames, corrupted and terrifying",
  };
  const raceVisual = raceId && raceVisualDescriptions[raceId] ? ` Visual: ${raceVisualDescriptions[raceId]}.` : '';
  const raceHint = raceId ? `\n- Race: ${raceId}. La créature DOIT correspondre visuellement à cette race.${raceVisual}` : '';
  const clanHint = clanId ? `\n- Clan: ${clanId}. Le style, l'environnement et l'ambiance doivent refléter ce clan.` : '';

  // Build context from existing card data if provided
  const existingHint = existingName || existingAbility
    ? `\n- Nom de la carte: "${existingName || "à générer"}"\n- Capacité: "${existingAbility || "à générer"}"\nUtilise ces informations pour créer un prompt d'illustration cohérent avec le personnage/créature décrit.`
    : '';

  const raceVisualDesc = raceId ? (raceVisualDescriptions[raceId] || raceId) : '';

  // Build prompt with race as the PRIMARY subject when specified
  const creatureSubject = raceId
    ? `Cette carte représente un(e) ${raceId} (apparence : ${raceVisualDesc}). La faction ${factionId} donne le thème/ambiance mais l'apparence physique est celle d'un(e) ${raceId}, PAS d'un(e) ${fac?.races?.[0] || factionId}.`
    : `Cette carte appartient à la faction ${factionId} (${facDesc}).`;

  const prompt = `Tu es un game designer expert pour "Armies & Magic", un CCG médiéval-fantastique.
Génère les textes pour cette carte :

SUJET PRINCIPAL — ${creatureSubject}
- Faction: ${factionId} (thème/ambiance uniquement)${clanHint}${subTypeHint}${volHint}${existingHint}
- Type: ${type} | Rareté: ${rarityId} | Coût mana: ${stats.mana}
- ${statsDesc}${kws}
${existingName ? `Le nom "${existingName}" est déjà choisi — garde-le tel quel.` : ''}
${existingAbility ? `La capacité est déjà définie — garde-la telle quelle.` : ''}
Pour le champ "illustrationPrompt" :
${raceId ? `- Le sujet de l'illustration est un(e) ${raceId} : ${raceVisualDesc}. C'est NON NÉGOCIABLE.
- Ne dessine JAMAIS un membre d'une autre race (par ex. pas de hobbit si la race est Hommes-Arbres, pas d'elfe si la race est Aigles Géants).
- Le nom, les capacités et la faction influencent le STYLE et l'AMBIANCE, mais le SUJET PHYSIQUE reste un(e) ${raceId}.` : `- Base l'apparence sur la faction ${factionId} : ${facDesc}.`}
- Ajoute des détails visuels semi-aléatoires (pose, environnement, éclairage, style d'armure/vêtements, éléments de background) pour rendre l'illustration unique.

Réponds UNIQUEMENT en JSON valide sans backticks :
{
  "name": "${existingName || 'Nom épique (2-4 mots, français, cohérent avec la race et la faction)'}",
  "ability": "${existingAbility || 'Texte de capacité (1-2 phrases, clair, cohérent avec les mots-clés listés)'}",
  "flavorText": "Citation narrative immersive (1 phrase courte, style lore épique)",
  "illustrationPrompt": "${raceId ? `A ${raceVisualDesc} — this is a ${raceId}, NOT a ${fac?.races?.[0] || factionId}. Cinematic dark fantasy, detailed, no text in image.` : 'Midjourney prompt (English, cinematic dark fantasy, detailed, no text in image)'}"
}`;

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await response.json();

      // Retry on overloaded
      if (response.status === 529 || data.error?.type === 'overloaded_error') {
        console.warn(`[card-forge] API overloaded, retry ${attempt + 1}/${maxRetries}...`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }

      if (!response.ok) {
        console.error('[card-forge] API error:', data.error?.message || JSON.stringify(data));
        return NextResponse.json({
          name: 'Carte sans nom', ability: '—', flavorText: '', illustrationPrompt: '',
        });
      }

      const raw = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text || '{}';
      let jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const jsonStart = jsonStr.indexOf('{');
      if (jsonStart > 0) jsonStr = jsonStr.slice(jsonStart);
      const parsed = JSON.parse(jsonStr);

      // Force race visual into illustrationPrompt — LLM instructions alone are unreliable
      if (raceId && raceVisualDescriptions[raceId] && parsed.illustrationPrompt) {
        const raceDesc = raceVisualDescriptions[raceId];
        // Mapping of wrong race terms (French + English) to remove from the prompt
        const wrongRaceTerms: Record<string, string[]> = {
          "Elfes": ["elf", "elven", "elfe"],
          "Aigles Géants": ["eagle", "aigle"],
          "Fées": ["fairy", "faerie", "fée"],
          "Nains": ["dwarf", "dwarven", "nain"],
          "Golems": ["golem"],
          "Hobbits": ["hobbit", "halfling", "halflings", "hobbits", "small folk", "small humanoid", "short humanoid", "small figure", "diminutive"],
          "Hommes-Arbres": ["treant", "ent", "tree creature", "homme-arbre", "treefolk"],
          "Humains": ["human", "humain"],
          "Hommes-Loups": ["werewolf", "wolf-man", "homme-loup"],
          "Hommes-Ours": ["werebear", "bear-man", "homme-ours"],
          "Hommes-Félins": ["werecat", "cat-man", "homme-félin"],
          "Centaures": ["centaur", "centaure"],
          "Feu": ["fire elemental"],
          "Terre": ["earth elemental"],
          "Eau": ["water elemental"],
          "Air/Tempête": ["storm elemental", "air elemental"],
          "Géants": ["giant", "géant"],
          "Ogres": ["ogre"],
          "Dragons": ["dragon"],
          "Chiens": ["hound", "dog", "mastiff", "chien"],
          "Phoenix": ["phoenix", "phénix"],
          "Anges": ["angel", "ange"],
          "Ours": ["bear", "ours"],
          "Loups": ["wolf", "loup"],
          "Orcs": ["orc"],
          "Gobelins": ["goblin", "gobelin"],
          "Trolls": ["troll"],
          "Wargs": ["warg"],
          "Squelettes": ["skeleton", "squelette"],
          "Zombies": ["zombie"],
          "Spectres": ["specter", "spectre", "ghost"],
          "Vampires": ["vampire"],
          "Lich": ["lich"],
          "Banshees": ["banshee"],
          "Elfes Corrompus": ["dark elf", "drow", "elfe noir", "elfe corrompu"],
          "Araignées Géantes": ["spider", "araignée"],
          "Démons": ["demon", "démon"],
        };
        // Get all wrong-race terms (other races in the same faction)
        const otherRaces = fac?.races?.filter((r: string) => r !== raceId) || [];
        const termsToRemove: string[] = [];
        for (const otherRace of otherRaces) {
          if (wrongRaceTerms[otherRace]) termsToRemove.push(...wrongRaceTerms[otherRace]);
          termsToRemove.push(otherRace.toLowerCase());
        }
        // Build the fixed prompt: prepend race description, strip wrong race mentions
        let fixedPrompt = parsed.illustrationPrompt;
        for (const term of termsToRemove) {
          const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'gi');
          fixedPrompt = fixedPrompt.replace(regex, raceId);
        }
        // Always prepend the authoritative race description
        parsed.illustrationPrompt = `${raceDesc}. ${fixedPrompt}`;
        console.log(`[card-forge] Race override: ${raceId} | Final prompt: ${parsed.illustrationPrompt.substring(0, 200)}...`);
      }

      return NextResponse.json(parsed);
    } catch (err) {
      console.error(`[card-forge] generateText error (attempt ${attempt + 1}):`, err);
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
    }
  }

  return NextResponse.json({
    name: 'Carte sans nom', ability: '—', flavorText: '', illustrationPrompt: '',
  });
}
