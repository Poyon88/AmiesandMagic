import { NextResponse } from 'next/server';
import { FACTIONS } from '@/lib/card-engine/constants';

export async function POST(request: Request) {
  const { factionId, type, rarityId, stats } = await request.json();

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
  const volHint = hasVol ? '\n- IMPORTANT: La carte a le mot-clé Vol → la créature DOIT être volante (dragon, wyverne, aigle, faucon, griffon, chauve-souris, spectre ailé, démon ailé, etc. selon la faction)' : '';

  const prompt = `Tu es un game designer expert pour "Armies & Magic", un CCG médiéval-fantastique.
Génère les textes pour cette carte :
- Faction: ${factionId} (${facDesc})${subTypeHint}${volHint}
- Type: ${type} | Rareté: ${rarityId} | Coût mana: ${stats.mana}
- ${statsDesc}${kws}

Réponds UNIQUEMENT en JSON valide sans backticks :
{
  "name": "Nom épique (2-4 mots, français, cohérent avec la faction)",
  "ability": "Texte de capacité (1-2 phrases, clair, cohérent avec les mots-clés listés)",
  "flavorText": "Citation narrative immersive (1 phrase courte, style lore épique)",
  "illustrationPrompt": "Midjourney prompt (English, cinematic dark fantasy, detailed, no text in image)"
}`;

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
    const raw = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[card-forge] generateText error:', err);
    return NextResponse.json({
      name: 'Carte sans nom', ability: '—', flavorText: '', illustrationPrompt: '',
    });
  }
}
