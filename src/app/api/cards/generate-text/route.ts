import { NextResponse } from 'next/server';
import { FACTIONS } from '@/lib/card-engine/constants';

export async function POST(request: Request) {
  const { factionId, type, rarityId, stats, existingName, existingAbility, raceId, clanId } = await request.json();

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
  const raceHint = raceId ? `\n- Race: ${raceId}. La créature doit correspondre visuellement à cette race.` : '';
  const clanHint = clanId ? `\n- Clan: ${clanId}. Le style, l'environnement et l'ambiance doivent refléter ce clan.` : '';

  // Build context from existing card data if provided
  const existingHint = existingName || existingAbility
    ? `\n- Nom de la carte: "${existingName || "à générer"}"\n- Capacité: "${existingAbility || "à générer"}"\nUtilise ces informations pour créer un prompt d'illustration cohérent avec le personnage/créature décrit.`
    : '';

  const prompt = `Tu es un game designer expert pour "Armies & Magic", un CCG médiéval-fantastique.
Génère les textes pour cette carte :
- Faction: ${factionId} (${facDesc})${raceHint}${clanHint}${subTypeHint}${volHint}${existingHint}
- Type: ${type} | Rareté: ${rarityId} | Coût mana: ${stats.mana}
- ${statsDesc}${kws}
${existingName ? `Le nom "${existingName}" est déjà choisi — garde-le tel quel.` : ''}
${existingAbility ? `La capacité est déjà définie — garde-la telle quelle.` : ''}
Concentre-toi particulièrement sur le "illustrationPrompt" : il doit décrire visuellement le personnage/créature en se basant sur son nom, sa faction, ses capacités et ses mots-clés. Ajoute des détails visuels semi-aléatoires (pose, environnement, éclairage, style d'armure/vêtements, éléments de background) pour rendre l'illustration unique.

Réponds UNIQUEMENT en JSON valide sans backticks :
{
  "name": "${existingName || 'Nom épique (2-4 mots, français, cohérent avec la faction)'}",
  "ability": "${existingAbility || 'Texte de capacité (1-2 phrases, clair, cohérent avec les mots-clés listés)'}",
  "flavorText": "Citation narrative immersive (1 phrase courte, style lore épique)",
  "illustrationPrompt": "Midjourney prompt (English, cinematic dark fantasy, detailed, no text in image, based on the character name and abilities)"
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
