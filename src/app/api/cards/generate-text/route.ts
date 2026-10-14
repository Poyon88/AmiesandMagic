import { NextResponse } from 'next/server';
import { FACTIONS } from '@/lib/card-engine/constants';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { formatStyleGuideForPrompt, loadStyleGuide } from '@/lib/ai/style-guide';
import { findNameCollision, normalizeCardName } from '@/lib/cards/nameCollision';
import { RACE_TYPICAL_GEAR, RACE_VISUALS, physiquePourGenre } from '@/lib/ai/race-visuals';
import {
  FLAVOR_FORMS, FLAVOR_TONES, ancrageRace, chargerCatalogue, conceptPourPrompt, nameRuleText, premierMot, sanitizeConcept,
} from '@/lib/ai/card-concepts';

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { factionId, type, rarityId, stats, existingName, existingAbility, clanId, extraContext, styleGuideId } = body;
  const extra = typeof extraContext === 'string' ? extraContext.trim() : '';
  // raceId can arrive as "undefined" string from JSON — normalize to real undefined
  const raceId = body.raceId && body.raceId !== 'undefined' ? body.raceId : undefined;

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
  const raceVisualDescriptions = RACE_VISUALS;
  // For factions whose visual identity lives on the clan (Élémentaires: race
  // "Élémentaire", clan = element), prefer the clan-keyed descriptor.
  const visualKey = (clanId && raceVisualDescriptions[clanId]) ? clanId : raceId;
  // CHARTE GRAPHIQUE du clan : celle demandée, sinon la charte par défaut.
  // Elle fixe l'UNIVERS (palette, lumière, décors, matériaux, motifs,
  // interdits) ; la race, plus bas, reste le sujet. Sans charte, l'ancienne
  // consigne générique.
  const charte = clanId
    ? await loadStyleGuide(auth.supabase, { id: typeof styleGuideId === 'number' ? styleGuideId : null, clan: clanId })
    : null;
  // Mode RÉPERTOIRE : palette, lumière, style et interdits s'imposent ; décors,
  // matériaux et motifs sont des pistes (sinon chaque carte reprend les
  // premiers de la liste).
  const blocCharte = formatStyleGuideForPrompt(charte, { mode: 'repertoire' });
  const clanHint = !clanId ? ''
    : blocCharte
      ? `\n- Clan: ${clanId}. Charte graphique du clan ci-dessous : le champ "illustrationPrompt" en applique TOUJOURS la partie MANDATORY (palette, lumière, style) et ne contient jamais ce qu'elle interdit ; du RÉPERTOIRE, il ne prend qu'un ou deux éléments au plus (ceux du concept s'il y en a un), ou en invente dans le même esprit.\n${blocCharte}`
      : `\n- Clan: ${clanId}. Le style, l'environnement et l'ambiance doivent refléter ce clan.`;

  // Build context from existing card data if provided
  const existingHint = existingName || existingAbility
    ? `\n- Nom de la carte: "${existingName || "à générer"}"\n- Capacité: "${existingAbility || "à générer"}"\nUtilise ces informations pour créer un prompt d'illustration cohérent avec le personnage/créature décrit.`
    : '';

  // Free-form admin directive — fed into both the textual fields AND
  // the illustration prompt so the AI knows the scene constraints
  // before drafting anything.
  const extraHint = extra
    ? `\n- Contexte supplémentaire IMPÉRATIF (à intégrer dans l'illustration ET à refléter dans le ton / nom / capacité / lore si pertinent) : ${extra}`
    : '';

  // ── Création assistée (onglet du même nom) : genre, règle de nom, thème du
  // lot, mécanique exacte et noms déjà pris. Tous optionnels : la forge
  // manuelle et le mode Auto n'en envoient aucun.
  const gender = body.gender === 'homme' || body.gender === 'femme' || body.gender === 'neutre' ? body.gender : null;
  const nameRule = body.nameRule === 'propre' || body.nameRule === 'generique' ? body.nameRule : null;
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';
  const mechanics: string[] = Array.isArray(body.mechanics) ? body.mechanics.filter((m: unknown): m is string => typeof m === 'string').slice(0, 8) : [];
  const forbiddenNames: string[] = Array.isArray(body.forbiddenNames) ? body.forbiddenNames.filter((n: unknown): n is string => typeof n === 'string').slice(0, 200) : [];
  // Concept décidé par le planificateur du lot (/api/forge/concepts) ; absent
  // dans la forge manuelle et le mode Auto, où Claude en invente un.
  const concept = body.concept ? sanitizeConcept(body.concept, type) : null;
  const lexique: string[] = Array.isArray(body.lexique) ? body.lexique.filter((x: unknown): x is string => typeof x === 'string').slice(0, 30) : [];
  const genderHint = type !== 'Unité' ? '' : gender === 'homme'
    ? `\n- Genre : MASCULIN. Nom et accords au masculin ; dans "illustrationPrompt", le sujet est explicitement male.`
    : gender === 'femme'
      ? `\n- Genre : FÉMININ. Nom et accords au féminin (« Gardienne », « Archère ») ; dans "illustrationPrompt", le sujet est explicitement female.`
      : gender === 'neutre'
        ? `\n- Genre : NEUTRE / non genré. Nom sans genre marqué ; dans "illustrationPrompt", aucune indication de genre (créature ou silhouette non genrée).`
        : '';
  const nameRuleHint = nameRule ? `\n- NOM : ${nameRuleText(nameRule, type)}` : '';
  const notesHint = notes ? `\n- Thème du lot (à refléter dans le nom, le texte d'ambiance et l'illustration) : ${notes}` : '';
  const mechanicsHint = mechanics.length
    ? `\n- MÉCANIQUE EXACTE de la carte — le champ "ability" doit la décrire fidèlement, en français clair, sans inventer ni omettre d'effet :\n${mechanics.map((m) => `  • ${m}`).join('\n')}`
    : '';
  const forbiddenHint = forbiddenNames.length
    ? `\n- Noms DÉJÀ PRIS (interdits ; ne commence pas non plus par le même premier mot que l'un d'eux) : ${forbiddenNames.slice(-60).join(' ; ')}`
    : '';
  // Sans concept : Claude invente le sien, en évitant les cartes déjà au
  // catalogue pour cette race et ce clan.
  let catalogueHint = '';
  if (!concept && !existingName && (raceId || clanId)) {
    const rows = await chargerCatalogue(auth.supabase, raceId ? [raceId] : [], clanId ? [clanId] : [], 120).catch(() => []);
    const noms = rows.map((r) => r.name).filter(Boolean).slice(0, 80);
    if (noms.length) catalogueHint = `\n- Cartes DÉJÀ au catalogue pour cette race / ce clan (ne les imite pas, trouve un sujet qu'elles ne couvrent pas) : ${noms.join(' ; ')}`;
  }
  const conceptHint = concept
    ? `\n${conceptPourPrompt(concept, lexique)}`
    : existingName ? '' : `\n- Invente d'abord un CONCEPT original : qui est cette carte (métier, caste, âge, tempérament — pas forcément un guerrier en armure), ce que sa mécanique raconte d'elle, dans quelle scène et sous quel cadrage. Le nom, le texte d'ambiance et l'illustration en découlent.`;
  const assistHint = `${genderHint}${nameRuleHint}${notesHint}${mechanicsHint}${conceptHint}${catalogueHint}${forbiddenHint}`;
  const subjectKind = concept?.subjectKind ?? (type === 'Unité' ? 'membre' : 'evenement');
  // Forme du texte d'ambiance : celle du concept, sinon tirée au hasard.
  const formeAmbiance = concept?.formeAmbiance
    ? `${concept.formeAmbiance}${concept.ton ? `, ton ${concept.ton}` : ''}`
    : `${FLAVOR_FORMS[Math.floor(Math.random() * FLAVOR_FORMS.length)]}, ton ${FLAVOR_TONES[Math.floor(Math.random() * FLAVOR_TONES.length)]}`;
  const gear = raceId ? RACE_TYPICAL_GEAR[raceId] : undefined;

  const raceVisualDesc = raceId ? physiquePourGenre(raceVisualDescriptions[visualKey ?? raceId] || raceId, type === 'Unité' ? gender : null) : '';
  // Quand la race a une description, le post-traitement la place lui-même en
  // tête de l'illustrationPrompt : Claude ne doit pas la réécrire, sinon le
  // prompt la contient deux fois.
  const racePrefixee = !!(visualKey && raceVisualDescriptions[visualKey]);

  // Build prompt with race as the PRIMARY subject when specified
  const creatureSubject = raceId
    ? `Cette carte appartient à la race ${raceId} (apparence : ${raceVisualDesc}). La faction ${factionId} donne le thème/ambiance mais tout personnage montré est un(e) ${raceId}, PAS un(e) ${fac?.races?.[0] || factionId}.`
    : `Cette carte appartient à la faction ${factionId} (${facDesc}).`;

  const prompt = `Tu es un game designer expert pour "Armies & Magic", un CCG médiéval-fantastique.
Génère les textes pour cette carte :

SUJET PRINCIPAL — ${creatureSubject}
- Faction: ${factionId} (thème/ambiance uniquement)${clanHint}${subTypeHint}${volHint}${existingHint}${extraHint}${assistHint}
- Type: ${type} | Rareté: ${rarityId} | Coût mana: ${stats.mana}
- ${statsDesc}${kws}
${existingName ? `Le nom "${existingName}" est déjà choisi — garde-le tel quel.` : ''}
${existingAbility ? `La capacité est déjà définie — garde-la telle quelle.` : ''}
Pour le champ "illustrationPrompt" :
${raceId ? `- La race est NON NÉGOCIABLE : tout personnage montré est un(e) ${raceId} (${raceVisualDesc}) ; ne dessine JAMAIS un membre d'une autre race (pas de hobbit si la race est Hommes-Arbres, pas d'elfe si la race est Aigles Géants).
- En revanche le RÔLE, la tenue, l'âge, l'attitude et l'équipement sont LIBRES : une race n'est pas « un guerrier en armure ». ${gear ? `Équipement habituel (une piste parmi d'autres, pas une obligation) : ${gear}.` : ''}${racePrefixee && (subjectKind === 'membre' || subjectKind === 'groupe') ? `
- NE RECOPIE PAS la description d'apparence de la race : elle est ajoutée automatiquement en tête du prompt. Commence directement par le sujet précis, la pose, l'action et la scène.` : ''}` : `- Base l'apparence sur la faction ${factionId} : ${facDesc}.`}
- Varie le cadrage (portrait serré, plan moyen, plan large, contre-plongée…), la composition et l'instant : l'illustration doit se distinguer des autres cartes du clan.

Pour le champ "flavorText" : UNE phrase courte, sous la forme suivante : ${formeAmbiance}. Pas de formule épique creuse.
- Le texte d'ambiance vit DANS LE MONDE du jeu, jamais dans ses règles : AUCUNE référence aux mécanismes : pas de cartes à jouer, de deck, de main, de cimetière de cartes, de mana, de tour de jeu, de pioche ou de défausse de cartes, ni de nom de capacité ou de coût employé comme règle (Exil, Sacrifice, Épargne, Invention, Traque…). Les mots du monde restent permis dans leur sens propre (une carte géographique, une pioche de mineur, l'exil d'un peuple). La mécanique peut INSPIRER l'idée, mais elle s'exprime par l'histoire (un serment, une perte, une ruse, un prix payé), jamais en termes de jeu.

Réponds UNIQUEMENT en JSON valide sans backticks :
{
  "name": "${existingName || 'Nom épique (2-4 mots, français, cohérent avec la race et la faction)'}",
  "ability": "${existingAbility || 'Texte de capacité (1-2 phrases, clair, cohérent avec les mots-clés listés)'}",
  "flavorText": "Texte d'ambiance (1 phrase courte, forme indiquée ci-dessus)",
  "illustrationPrompt": "${racePrefixee
    ? (subjectKind === 'membre' || subjectKind === 'groupe'
      ? `Specific subject, pose, action, scene, framing, lighting… (English, cinematic dark fantasy, detailed, no text in image; do NOT restate the race's appearance)`
      : `Subject, scene, framing, lighting… (English, cinematic dark fantasy, detailed, no text in image)`)
    : raceId
      ? `A ${raceVisualDesc} — this is a ${raceId}, NOT a ${fac?.races?.[0] || factionId}. Cinematic dark fantasy, detailed, no text in image.`
      : 'Midjourney prompt (English, cinematic dark fantasy, detailed, no text in image)'}"
}`;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[card-forge] ANTHROPIC_API_KEY missing in environment');
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing on server' }, { status: 500 });
  }

  const maxRetries = 3;
  let lastErrorMessage = 'unknown error';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5-5',
          // Sonnet 5.5 réfléchit par défaut et la réflexion compte dans
          // max_tokens : effort bas + marge pour ne pas tronquer le JSON.
          max_tokens: 2000,
          output_config: { effort: 'low' },
          fallbacks: 'default',
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await response.json();

      // Retry on overloaded
      if (response.status === 529 || data.error?.type === 'overloaded_error') {
        console.warn(`[card-forge] API overloaded, retry ${attempt + 1}/${maxRetries}...`);
        lastErrorMessage = `overloaded (${response.status})`;
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }

      if (!response.ok) {
        const errMsg = data.error?.message || JSON.stringify(data);
        console.error('[card-forge] API error:', response.status, errMsg);
        return NextResponse.json({ error: `Anthropic ${response.status}: ${errMsg}` }, { status: 502 });
      }

      if (data.stop_reason === 'refusal') {
        console.error('[card-forge] refusal:', data.stop_details);
        return NextResponse.json({ error: `Anthropic refusal: ${data.stop_details?.category ?? 'inconnue'}` }, { status: 502 });
      }

      const raw = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text || '{}';
      let jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const jsonStart = jsonStr.indexOf('{');
      if (jsonStart > 0) jsonStr = jsonStr.slice(jsonStart);
      const parsed = JSON.parse(jsonStr);

      // Force race visual into illustrationPrompt — LLM instructions alone are unreliable.
      // visualKey resolves to the clan element for clan-tuned factions (Élémentaires).
      if (visualKey && raceVisualDescriptions[visualKey] && parsed.illustrationPrompt) {
        const raceDesc = physiquePourGenre(raceVisualDescriptions[visualKey], type === 'Unité' ? gender : null);
        // Mapping of wrong race terms (French + English) to remove from the prompt
        const wrongRaceTerms: Record<string, string[]> = {
          "Elfes": ["elf", "elven", "elfe"],
          "Aigles Géants": ["eagle", "aigle"],
          "Fées": ["fairy", "faerie", "fée"],
          "Farfadets": ["leprechaun", "farfadet", "sprite"],
          "Korrigans": ["korrigan", "breton sprite"],
          "Faunes": ["faun", "faune", "satyr"],
          "Dryades": ["dryad", "dryade", "tree nymph"],
          "Nains": ["dwarf", "dwarven", "nain"],
          "Golems": ["golem"],
          "Machines": ["automaton", "automata", "clockwork", "machine", "mechanism", "construct"],
          "Kobolds": ["kobold", "kobolds"],
          "Hobbits": ["hobbit", "halfling", "halflings", "hobbits", "small folk", "small humanoid", "short humanoid", "small figure", "diminutive"],
          "Hommes-Arbres": ["treant", "ent", "tree creature", "homme-arbre", "treefolk"],
          "Humains": ["human", "humain"],
          "Griffons": ["griffin", "gryphon", "griffon"],
          "Faucons": ["falcon", "hawk", "faucon"],
          "Pégases": ["pegasus", "pégase", "winged horse"],
          "Sphinx": ["sphinx", "sphinge", "riddle guardian"],
          "Hommes-Loups": ["werewolf", "wolf-man", "homme-loup"],
          "Hommes-Ours": ["werebear", "bear-man", "homme-ours"],
          "Hommes-Félins": ["werecat", "cat-man", "homme-félin"],
          "Centaures": ["centaur", "centaure"],
          "Mimis": ["mimi", "mimis", "critter", "cute creature", "petite bête"],
          "La Colère des Flammes": ["fire elemental"],
          "Le Socle du Monde": ["earth elemental"],
          "La Vague Sans Fin": ["water elemental"],
          "Le Souffle des Cimes": ["storm elemental", "air elemental"],
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
          "Gnomes": ["gnome", "tinker", "tinkerer"],
          "Guerriers du Chaos": ["chaos warrior", "chaos knight", "guerrier du chaos"],
          "Nagas": ["naga", "serpent guardian", "snake-bodied"],
          "Tengu": ["tengu", "crow-spirit", "karasu"],
          "Oni": ["oni", "ogre-demon", "kanabo"],
          "Qilins": ["qilin", "kirin", "chinese unicorn"],
          "Ghoules": ["ghoul", "goule", "ghoule"],
          "Homuncules de Sang": ["homunculus", "homoncule", "homuncule"],
          "Gargouilles": ["gargoyle", "gargouille", "stone sentinel"],
          "Dhampirs": ["dhampir", "half-vampire"],
          "Chiroptères": ["bat", "chiropteran", "chauve-souris"],
          "Momies": ["mummy", "momie", "bandaged undead"],
          "Chimères nécrotiques": ["chimera", "chimère", "stitched abomination"],
          "Vermines mortuaires": ["vermin", "vermine", "swarm", "rats"],
          "Poltergeists": ["poltergeist", "esprit frappeur"],
          "Dullahans": ["dullahan", "headless horseman", "cavalier sans tête"],
          "Sluaghs": ["sluagh", "host of the dead", "spirit flock"],
          "Ondins": ["undine", "ondin", "merfolk"],
          "Sirènes": ["siren", "sirène", "mermaid"],
          "Léviathans": ["leviathan", "léviathan", "sea monster"],
          "Cristallins": ["crystalline", "cristallin", "crystal being"],
          "Troglodytes": ["troglodyte", "cave dweller"],
          "Bêtes Chtoniennes": ["chthonic", "chtonien", "burrowing horror"],
          "Salamandres": ["salamander", "salamandre", "fire lizard"],
          "Sylphes": ["sylph", "sylphe", "air spirit"],
          "Néphélides": ["nephelid", "néphélide", "cloud nymph"],
        };
        // Get all wrong terms: other races in the faction, plus — for clan-tuned
        // factions (Élémentaires) — the sibling clans' terms so a Feu card doesn't
        // describe a "water elemental". Only element clans appear in wrongRaceTerms,
        // so non-element clans (Sylvains, …) contribute nothing here.
        const otherRaces = fac?.races?.filter((r: string) => r !== raceId) || [];
        const otherClans = (fac?.clans ?? []).flatMap((g) => g.names).filter((c: string) => c !== clanId);
        const termsToRemove: string[] = [];
        for (const otherRace of otherRaces) {
          if (wrongRaceTerms[otherRace]) termsToRemove.push(...wrongRaceTerms[otherRace]);
          termsToRemove.push(otherRace.toLowerCase());
        }
        for (const otherClan of otherClans) {
          if (wrongRaceTerms[otherClan]) termsToRemove.push(...wrongRaceTerms[otherClan]);
        }
        // Build the fixed prompt: prepend race description, strip wrong mentions.
        // Replace with the resolved visual key (the element for clan-tuned factions).
        let fixedPrompt = parsed.illustrationPrompt;
        for (const term of termsToRemove) {
          const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'gi');
          fixedPrompt = fixedPrompt.replace(regex, visualKey);
        }
        // Ancre la race : apparence en tête pour un être (ou un groupe) de la
        // race, en fin de prompt pour une monture, un lieu, un objet…
        const { prefixe, suffixe } = ancrageRace(raceDesc, subjectKind);
        const tete = fixedPrompt.trim().replace(/^an?\s+/i, '').toLowerCase();
        if (prefixe && !tete.startsWith(raceDesc.toLowerCase())) fixedPrompt = `${prefixe}. ${fixedPrompt}`;
        if (suffixe && !fixedPrompt.toLowerCase().includes(raceDesc.toLowerCase())) fixedPrompt = `${fixedPrompt.trim()} ${suffixe}`;
        parsed.illustrationPrompt = fixedPrompt;
      }

      // Nom unique (Création assistée) : ni dans le catalogue, ni dans le lot.
      let nameAdjusted = false;
      if (body.uniqueName === true && typeof parsed.name === 'string') {
        const r = await nomLibre(auth.supabase, parsed.name, forbiddenNames, { prompt, nameRule, gender });
        nameAdjusted = r !== parsed.name;
        parsed.name = r;
      }

      return NextResponse.json({ ...parsed, styleGuideId: charte?.id ?? null, ...(nameAdjusted ? { nameAdjusted } : {}) });
    } catch (err) {
      lastErrorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[card-forge] generateText error (attempt ${attempt + 1}):`, err);
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
    }
  }

  return NextResponse.json({ error: `Failed after ${maxRetries} attempts: ${lastErrorMessage}` }, { status: 502 });
}

// ─── Nom libre ──────────────────────────────────────────────────────────────

type SupabaseAdmin = Parameters<typeof findNameCollision>[0];

async function estPris(admin: SupabaseAdmin, name: string, interdits: string[], premier = true): Promise<boolean> {
  const n = normalizeCardName(name);
  if (!n) return true;
  if (interdits.some((x) => normalizeCardName(x) === n)) return true;
  // Dans un lot, deux noms ne commencent pas par le même mot (« Garde… »).
  const m = premierMot(name);
  if (premier && m && interdits.some((x) => premierMot(x) === m)) return true;
  return (await findNameCollision(admin, name)) != null;
}

/** Rend `name` s'il est libre ; sinon redemande un nom à Claude (3 essais),
 *  puis, en dernier recours, suffixe « II », « III »… */
async function nomLibre(
  admin: SupabaseAdmin,
  name: string,
  interdits: string[],
  ctx: { prompt: string; nameRule: string | null; gender: string | null },
): Promise<string> {
  if (!(await estPris(admin, name, interdits))) return name;
  const pris = [...interdits, name];
  for (let essai = 0; essai < 3; essai++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5-5',
          max_tokens: 600,
          output_config: { effort: 'low' },
          messages: [{
            role: 'user',
            content: `${ctx.prompt}\n\nLes noms suivants sont DÉJÀ PRIS : ${pris.slice(-60).join(' ; ')}.\nPropose UN autre nom pour cette carte, en respectant les mêmes règles, qui ne commence pas par le même premier mot qu'un nom pris. Réponds UNIQUEMENT par le nom, sans guillemets.`,
          }],
        }),
      });
      const data = await res.json();
      const texte = (data?.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('').trim();
      const candidat = texte.split('\n')[0].replace(/^["«\s]+|["»\s.]+$/g, '').slice(0, 60);
      if (candidat && !(await estPris(admin, candidat, pris))) return candidat;
      if (candidat) pris.push(candidat);
    } catch { /* on retente */ }
  }
  for (const suffixe of ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']) {
    const c = `${name} ${suffixe}`;
    // Dernier recours : le premier mot est forcément partagé, seul compte l'exact.
    if (!(await estPris(admin, c, pris, false))) return c;
  }
  return `${name} ${Date.now() % 1000}`;
}
