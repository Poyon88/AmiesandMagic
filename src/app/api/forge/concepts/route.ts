import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { sanitizeBrief } from '@/lib/card-engine/brief';
import { formatStyleGuideForPrompt, loadStyleGuide } from '@/lib/ai/style-guide';
import { RACE_TYPICAL_GEAR, RACE_VISUALS } from '@/lib/ai/race-visuals';
import {
  FLAVOR_FORMS, FLAVOR_TONES, MOMENTS, NAME_FORMS, SUBJECT_KINDS, SUBJECT_KINDS_UNITE, TENUES, chargerCatalogue, repartir,
  resumeCatalogue, sanitizeConcept, sanitizeConcepts, type CardConcept,
} from '@/lib/ai/card-concepts';

// POST /api/forge/concepts — ADMIN — plan des CONCEPTS d'un lot de Création
// assistée : qui représente chaque carte, dans quelle scène, sous quel nom et
// avec quelle voix. Claude voit le lot ENTIER (et le catalogue existant) : c'est
// ce qui lui permet de varier, là où dix appels isolés retombaient tous sur le
// même nain en armure.
//
// Entrée : { brief, cards: [{ type, rarity, mana, race, clan, gender, mechanics[] }],
//            consigne?, index?, concepts?, lexique? }
//   - sans `index` : tout le lot → { lexique, concepts }
//   - avec `index` : régénère cette carte seule, les autres concepts en
//     contexte pour ne pas les répéter → { concept }

interface CartePlan { type: string; rarity: string; mana: number; race: string | null; clan: string | null; gender: string; mechanics: string[] }

const TRANCHE = 25;

function lireCartes(v: unknown): CartePlan[] {
  return (Array.isArray(v) ? v : []).slice(0, 100).map((c) => {
    const r = (c ?? {}) as Record<string, unknown>;
    return {
      type: r.type === 'Action' ? 'Action' : 'Unité',
      rarity: String(r.rarity ?? 'Commune'),
      mana: Number(r.mana) || 0,
      race: typeof r.race === 'string' ? r.race : null,
      clan: typeof r.clan === 'string' ? r.clan : null,
      gender: typeof r.gender === 'string' ? r.gender : 'neutre',
      mechanics: (Array.isArray(r.mechanics) ? r.mechanics : []).filter((m): m is string => typeof m === 'string').slice(0, 8),
    };
  });
}

/** Moment et tenue TIRÉS pour chaque carte (en cycles, cf. `repartir`) : laissés
 *  au choix de Claude, ils retombaient sur la lumière signature du clan. */
interface Axes { moment: string; tenue: string }

const ligneCarte = (c: CartePlan, i: number, axes?: Axes) =>
  `${i + 1}. ${c.type} ${c.rarity}, ${c.mana} mana, ${c.race ?? 'sans race'}${c.clan ? ` / ${c.clan}` : ''}${c.type === 'Unité' ? `, genre ${c.gender}` : ''} — ${c.mechanics.join(' | ') || 'sans capacité'}${axes ? ` — MOMENT : ${axes.moment} — TENUE : ${axes.tenue}` : ''}`;

const ligneConcept = (c: CardConcept, i: number) =>
  `${i + 1}. [${c.subjectKind}] ${c.sujet} — ${c.scene} — ${c.moment || '?'} — ${c.tenue || '?'} — ${c.cadrage} — nom : ${c.ideeNom} (${c.formeNom}) — ambiance : ${c.formeAmbiance}`;

/** Le tirage fait foi si Claude omet le champ. */
const avecAxes = (c: CardConcept, a: Axes): CardConcept => ({ ...c, moment: c.moment || a.moment, tenue: c.tenue || a.tenue });

async function appelClaude(system: string, user: string, maxTokens: number): Promise<unknown> {
  let lastError = 'Erreur inconnue';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5-5',
          max_tokens: maxTokens,
          // Un seul appel pour tout le lot : c'est ici que se joue la variété.
          output_config: { effort: 'medium' },
          fallbacks: 'default',
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      const data = await res.json();
      if (res.status === 529 || data?.error?.type === 'overloaded_error') {
        lastError = 'API surchargée';
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(data?.error?.message ?? `Erreur ${res.status}`);
      const texte: string = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
      const debut = texte.indexOf('{');
      const fin = texte.lastIndexOf('}');
      if (debut < 0 || fin < debut) { lastError = 'Réponse illisible'; continue; }
      return JSON.parse(texte.slice(debut, fin + 1));
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastError);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const brief = sanitizeBrief(body?.brief ?? {}).brief;
  const cartes = lireCartes(body?.cards);
  if (!cartes.length) return NextResponse.json({ error: 'Aucune carte à concevoir' }, { status: 400 });
  const consigne = typeof body?.consigne === 'string' ? body.consigne.trim().slice(0, 1000) : '';
  const index = Number.isInteger(body?.index) ? Number(body.index) : null;

  const races = [...new Set(cartes.map((c) => c.race).filter((r): r is string => !!r))];
  const clans = [...new Set(cartes.map((c) => c.clan).filter((c): c is string => !!c))];

  // Chartes des clans du lot (répertoire) et apparence des races.
  const chartes = (await Promise.all(clans.map((clan) => loadStyleGuide(auth.supabase, { clan }))))
    .map((sg) => formatStyleGuideForPrompt(sg, { mode: 'repertoire' }))
    .filter(Boolean)
    .join('\n\n');
  const apparences = races.map((r) => `- ${r} : ${RACE_VISUALS[r] ?? r}${RACE_TYPICAL_GEAR[r] ? ` (équipement habituel, facultatif : ${RACE_TYPICAL_GEAR[r]})` : ''}`).join('\n');
  const catalogue = resumeCatalogue(await chargerCatalogue(auth.supabase, races, clans).catch(() => []));

  const system = `Tu es le directeur artistique et narratif d'« Armies & Magic », un CCG médiéval-fantastique. On te confie un LOT de cartes déjà conçues mécaniquement (type, rareté, coût, capacités) ; tu inventes pour chacune un CONCEPT : qui elle représente, dans quelle scène, sous quel nom et avec quelle voix. Un autre appel rédigera ensuite chaque carte à partir de ton concept.

OBJECTIF : des cartes ORIGINALES et DIFFÉRENTES les unes des autres, qui complètent le catalogue au lieu de le répéter.

RÈGLES
1. Le concept ILLUSTRE la mécanique : lis les capacités, déclencheurs et coûts (Provocation → quelqu'un qui tient la ligne ; coût de sacrifice → un rituel ou un pacte ; « à la mort » → martyr, kamikaze, héritage ; pioche → érudit, éclaireur, archiviste…). Deux cartes aux mécaniques proches reçoivent quand même des sujets nettement différents.
2. Sujets LARGES : métiers, castes, âges, tempéraments, montures, machines et constructions servies, groupes ou portraits isolés. Une race n'est pas « un guerrier en armure » : au plus un tiers des Unités sont des combattants en armure. Pour une Action : un lieu, un objet, un phénomène ou un événement, avec ou sans personnage.
3. La race de chaque carte est NON NÉGOCIABLE : tout personnage montré en est. Ne prends jamais comme sujet une créature d'une autre race du jeu.
4. subjectKind ∈ ${SUBJECT_KINDS.map((k) => `"${k}"`).join(', ')} ; une Unité est seulement ${SUBJECT_KINDS_UNITE.map((k) => `"${k}"`).join(', ')}.
5. Répartis dans le lot : les sujets, les cadrages (portrait serré, plan moyen, plan large, contre-plongée, vue plongeante, silhouette en contre-jour…), les décors, les instants (avant, pendant, après l'action) et les éléments du RÉPERTOIRE de la charte (un ou deux par carte, jamais les mêmes partout ; tu peux en inventer dans le même esprit). Le décor signature du clan (son volcan, sa cité, sa forêt…) n'apparaît que sur une carte sur trois au plus.
5 bis. MOMENT et TENUE sont tirés au sort pour chaque carte (indiqués dans la liste) : reprends-les tels quels dans "moment" et "tenue", en les précisant pour la carte (« pluie battante sur le marché aux poissons », « tenue de travail : pagne et tablier de pêcheur »). Le moment fixe la lumière et les couleurs de l'image, la palette du clan n'y met que des accents. Sous terre ou en intérieur, transpose-le (une aube vue par un puits de lumière). Seule exception : si la charte INTERDIT ce moment ou si la mécanique l'exige, prends le plus proche et dis pourquoi dans "moment". La tenue vient des matériaux de la charte ou s'invente dans le même esprit, différente d'une carte à l'autre ; pour une bête, une machine, un esprit ou un lieu, c'est un harnais, des parures, un ornement ou rien.
6. NOMS : la forme dépend de la rareté — Commune = nom GÉNÉRIQUE, jamais de nom propre ; au-dessus = édition limitée = nom PROPRE ou unité spécifique. Formes à faire tourner :
   - Unité, nom propre : ${NAME_FORMS.propre.unite.join(' ; ')}
   - Action, nom propre : ${NAME_FORMS.propre.action.join(' ; ')}
   - Unité commune : ${NAME_FORMS.generique.unite.join(' ; ')}
   - Action commune : ${NAME_FORMS.generique.action.join(' ; ')}
   Deux noms du lot ne commencent JAMAIS par le même mot ; aucun nom du catalogue n'est repris. Accorde le nom au genre de l'Unité.
7. LEXIQUE : invente quelques noms de lieux, lignées, divinités ou événements propres au lot (6 à 12), à réutiliser avec MODÉRATION (un même nom au plus sur deux ou trois cartes).
8. TEXTE D'AMBIANCE : fais tourner les formes (${FLAVOR_FORMS.join(', ')}) et les tons (${FLAVOR_TONES.join(', ')}) ; il parle du monde, jamais des règles (aucune référence aux cartes, au deck, au mana ni aux noms de capacités).

Réponds UNIQUEMENT par un objet JSON valide, sans backticks :
{"lexique": ["…"], "concepts": [{"subjectKind": "membre", "sujet": "qui ou quoi, précis (français)", "role": "ce que sa mécanique raconte", "scene": "où, quel instant", "cadrage": "…", "elementsCharte": "1-2 éléments du répertoire", "moment": "…", "tenue": "…", "ideeNom": "…", "formeNom": "…", "formeAmbiance": "…", "ton": "…"}]}
Un concept par carte, dans l'ordre exact des cartes. Concis : chaque champ tient en une courte phrase.`;

  const contexte = `THÈME DU LOT (précisions de l'auteur) : ${brief.notes || 'aucune'}
${consigne ? `CONSIGNE DE L'AUTEUR POUR CE PLAN : ${consigne}\n` : ''}
APPARENCE DES RACES :
${apparences || '- (aucune race)'}

${chartes || 'CHARTE : aucune'}

CATALOGUE EXISTANT pour ces races et clans (${catalogue.length} cartes : nom [capacités] — début du prompt d'illustration). Trouve des sujets qu'il ne couvre pas :
${catalogue.join('\n') || '(vide)'}`;

  try {
    // ── Une seule carte à régénérer ──
    if (index != null) {
      if (index < 0 || index >= cartes.length) return NextResponse.json({ error: 'Index hors du lot' }, { status: 400 });
      const autres = (Array.isArray(body?.concepts) ? body.concepts : [])
        .map((c: unknown, i: number) => (i === index ? null : sanitizeConcept(c, cartes[i]?.type ?? 'Unité')))
        .map((c: CardConcept | null, i: number) => (c ? ligneConcept(c, i) : null))
        .filter(Boolean);
      const lexique = (Array.isArray(body?.lexique) ? body.lexique : []).filter((x: unknown) => typeof x === 'string');
      const actuel = Array.isArray(body?.concepts) ? sanitizeConcept(body.concepts[index], cartes[index].type) : null;
      // Nouveau tirage, différent du moment et de la tenue rejetés.
      const axesRegen: Axes = {
        moment: repartir(MOMENTS.filter((m) => !actuel?.moment.startsWith(m)), 1)[0],
        tenue: repartir(TENUES.filter((t) => !actuel?.tenue.startsWith(t)), 1)[0],
      };
      const user = `${contexte}

LEXIQUE DU LOT : ${lexique.join(' ; ') || '(libre)'}

LES AUTRES CARTES DU LOT ONT DÉJÀ CES CONCEPTS (ne les répète pas, ni le sujet ni le premier mot du nom) :
${autres.join('\n') || '(aucun)'}

CARTE À RECONCEVOIR :
${ligneCarte(cartes[index], index, axesRegen)}

${actuel ? `CONCEPT ACTUEL, que l'auteur REJETTE : ${ligneConcept(actuel, index)}\nPropose un sujet TOUT AUTRE (autre métier ou nature de sujet, autre scène, autre cadrage, autre forme de nom et d'ambiance) — pas une variante de celui-ci.\n\n` : ''}Propose UN concept neuf pour cette carte. Réponds par {"lexique": [], "concepts": [ {…} ]} avec un seul concept.`;
      const raw = await appelClaude(system, user, 3000);
      const { value } = sanitizeConcepts(raw, [cartes[index].type]);
      if (!value.concepts[0]) return NextResponse.json({ error: 'Concept illisible' }, { status: 502 });
      return NextResponse.json({ concept: avecAxes(value.concepts[0], axesRegen) });
    }

    // ── Tout le lot, par tranches ──
    const lexique: string[] = [];
    const concepts: CardConcept[] = [];
    const warnings: string[] = [];
    const moments = repartir(MOMENTS, cartes.length);
    const tenues = repartir(TENUES, cartes.length);
    const axes: Axes[] = cartes.map((_, i) => ({ moment: moments[i], tenue: tenues[i] }));
    for (let debut = 0; debut < cartes.length; debut += TRANCHE) {
      const tranche = cartes.slice(debut, debut + TRANCHE);
      const user = `${contexte}

LOT : ${cartes.length} cartes${cartes.length > TRANCHE ? ` (tranche ${debut + 1}–${debut + tranche.length})` : ''}.
${concepts.length ? `\nCONCEPTS DÉJÀ DÉCIDÉS pour les cartes précédentes du lot (ne les répète pas) :\n${concepts.map(ligneConcept).join('\n')}\nLEXIQUE DÉJÀ INVENTÉ (réutilise-le, complète-le au besoin) : ${lexique.join(' ; ')}\n` : ''}
CARTES À CONCEVOIR :
${tranche.map((c, i) => ligneCarte(c, debut + i, axes[debut + i])).join('\n')}`;
      const raw = await appelClaude(system, user, Math.min(32000, 3000 + 450 * tranche.length));
      const { value, errors } = sanitizeConcepts(raw, tranche.map((c) => c.type));
      if (value.concepts.length !== tranche.length) throw new Error(`Plan incomplet : ${errors.join(', ')}`);
      warnings.push(...errors);
      concepts.push(...value.concepts.map((c, i) => avecAxes(c, axes[debut + i])));
      for (const l of value.lexique) if (!lexique.includes(l)) lexique.push(l);
    }
    return NextResponse.json({ lexique: lexique.slice(0, 30), concepts, warnings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
