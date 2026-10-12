import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { ABILITIES } from '@/lib/game/abilities';
import { FACTIONS, RARITIES, getClanNamesForRace, getFactionDisplayName } from '@/lib/card-engine/constants';
import {
  BRIEF_COST_LABELS, BRIEF_MAX_CARDS, BRIEF_TRIGGER_LABELS, briefManquants, emptyBrief, sanitizeBrief,
} from '@/lib/card-engine/brief';
import { labelUnite, sortGenerable } from '@/lib/card-engine/brief-generator';

// POST /api/forge/brief-chat — ADMIN — un tour du chat de la Création assistée.
//
// Entrée  : { messages: [{ role: 'user'|'assistant', content }], brief }
// Sortie  : { message, brief, done, warnings }
//
// Claude interprète les réponses libres de l'auteur et tient à jour le brief
// COMPLET à chaque tour ; le serveur le repasse par `sanitizeBrief` (ids
// inconnus écartés, bornes) et renvoie les avertissements, que l'interface
// affiche et que Claude relit au tour suivant.

const QUESTIONS = `Pose les questions UNE PAR UNE (tu peux regrouper des sous-points d'une même question), dans cet ordre :
1. PÉRIMÈTRE : nombre de cartes (${BRIEF_MAX_CARDS} au plus), faction, race(s), clan(s) éventuels, types (Unité / Action, en parts), répartition des raretés, courbe de mana (optionnelle), et édition : « édition limitée » (année, mois optionnel) ou « set » (un set ne contient QUE des Communes) ou aucune.
2. CAPACITÉS À PRIVILÉGIER, avec un pourcentage indicatif = part de TOUTES les capacités posées sur le lot. Si le total est inférieur à 100 %, le reste est tiré au hasard en cohérence avec la race (dis-le).
3. DÉCLENCHEURS favorisés, chacun avec une fréquence léger / moyen / fort.
4. COÛTS ADDITIONNELS favorisés, chacun avec une fréquence léger (5 % des cartes) / moyen (15 %) / fort (30 %). Un seul coût par carte ; les coûts non cités ne sont jamais tirés.
5. GENRE : pourcentages M / F / O (O = autre, non genré).
6. PRÉCISIONS libres (thème, ambiance, unités…). Si l'auteur y écrit une règle mécanique explicite (« pas plus de 3 mana », « aucune capacité X », « 2 capacités max par carte »), traduis-la dans "constraints" et signale-le.
Dans tes messages, n'affiche JAMAIS les identifiants techniques (« death », « sacrifice », « taunt »…) : uniquement les libellés français. Le genre ne s'applique qu'aux Unités (les Actions sont neutres).
Quand tout est répondu, présente un RÉCAPITULATIF clair et mets "done": true. Si l'auteur corrige ensuite, mets le brief à jour et garde "done": true.`;

function listes(sets: { id: number; name: string; type: string | null }[]): string {
  const factions = Object.entries(FACTIONS).map(([id, f]) => {
    const races = (f.races ?? []).map((r) => {
      const clans = getClanNamesForRace(id, r);
      return clans.length ? `${r} (clans : ${clans.join(', ')})` : r;
    });
    return `- "${id}" (${getFactionDisplayName(id)}) : ${races.join(' ; ')}`;
  }).join('\n');
  const capacites = Object.values(ABILITIES)
    .map((a) => ({ a, u: labelUnite(a.id) != null, s: sortGenerable(a.id) }))
    .filter((x) => x.u || x.s)
    .map(({ a, u, s }) => `- ${a.id} — ${a.creature?.label ?? a.label} [${[u ? 'Unité' : '', s ? 'Action' : ''].filter(Boolean).join('+')}] : ${(a.creature?.desc ?? a.desc).replace(/\s+/g, ' ').slice(0, 110)}`)
    .join('\n');
  const declencheurs = Object.entries(BRIEF_TRIGGER_LABELS).map(([k, v]) => `"${k}" = ${v}`).join(', ');
  const couts = Object.entries(BRIEF_COST_LABELS).map(([k, v]) => `"${k}" = ${v}`).join(', ');
  const setsTxt = sets.length ? sets.map((s) => `${s.id} = ${s.name}${s.type ? ` (${s.type})` : ''}`).join(' ; ') : 'aucun';
  return `FACTIONS (id exact) et leurs races (clans) :
${factions}

RARETÉS : ${RARITIES.map((r) => `"${r.id}"`).join(', ')}
TYPES : "Unité", "Action"
SETS (id = nom) : ${setsTxt}
DÉCLENCHEURS : ${declencheurs}
COÛTS ADDITIONNELS : ${couts}
FRÉQUENCES : "leger", "moyen", "fort"

CAPACITÉS GÉNÉRABLES (utilise l'id avant le tiret ; [Unité] / [Action] = types qui peuvent la porter) :
${capacites}`;
}

const FORMAT = `Réponds UNIQUEMENT par un objet JSON valide, sans backticks :
{
  "message": "ton message à l'auteur (français, concis, une question à la fois ; markdown léger autorisé)",
  "brief": {
    "title": "titre court du lot",
    "count": 10,
    "faction": "id de faction",
    "races": ["id de race"], "clans": ["nom de clan"],
    "types": {"Unité": 3, "Action": 1},
    "rarities": {"Commune": 6, "Peu Commune": 3, "Rare": 1},
    "manaCurve": {"2": 3, "3": 4},
    "edition": {"kind": "limited", "year": 2026, "month": 10} | {"kind": "set", "setId": 3} | {"kind": "none"},
    "abilities": [{"id": "vol", "pct": 40}],
    "triggers": [{"trigger": "death", "freq": "fort"}],
    "additionalCosts": [{"cost": "sacrifice", "freq": "leger"}],
    "gender": {"M": 50, "F": 40, "O": 10},
    "constraints": {"minMana": 1, "maxMana": 5, "excludedAbilities": ["id"], "maxAbilitiesPerCard": 2},
    "notes": "précisions libres de l'auteur, reformulées fidèlement"
  },
  "done": false
}
Le "brief" est TOUJOURS complet (reprends tout ce qui est déjà acquis, laisse vide ce qui n'est pas encore demandé). N'invente jamais d'id : si l'auteur cite une capacité, une race ou un clan absent des listes, propose l'équivalent le plus proche et demande confirmation.`;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m: { role?: string; content?: unknown }) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-40)
    .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!messages.length || messages[0].role !== 'user') {
    return NextResponse.json({ error: 'La conversation doit commencer par un message de l\'auteur' }, { status: 400 });
  }
  const courant = sanitizeBrief(body?.brief ?? emptyBrief()).brief;

  const { data: sets } = await auth.supabase.from('sets').select('id, name, type').order('id');

  const system = `Tu es l'assistant de création de cartes de la forge d'« Armies & Magic », un CCG médiéval-fantastique. Tu recueilles le BRIEF d'un lot de cartes que l'outil créera ensuite SEUL : le code choisit les capacités selon le brief et les équilibre au barème, Claude écrira les noms et textes. Ton rôle se limite au brief.

Le premier message de l'interface (déjà affiché à l'auteur) lui a demandé de décrire le lot (périmètre). Enchaîne à partir de sa réponse.

${QUESTIONS}

${listes(sets ?? [])}

BRIEF ACTUEL (déjà validé par le serveur) :
${JSON.stringify(courant)}

${FORMAT}`;

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
          max_tokens: 6000,
          output_config: { effort: 'low' },
          fallbacks: 'default',
          system,
          messages,
        }),
      });
      const data = await res.json();
      if (res.status === 529 || data?.error?.type === 'overloaded_error') {
        lastError = 'API surchargée';
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) { lastError = data?.error?.message ?? `Erreur ${res.status}`; break; }
      const texte: string = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
      const debut = texte.indexOf('{');
      const fin = texte.lastIndexOf('}');
      if (debut < 0 || fin < debut) { lastError = 'Réponse illisible'; continue; }
      const parsed = JSON.parse(texte.slice(debut, fin + 1));
      const { brief, warnings } = sanitizeBrief(parsed.brief ?? courant);
      const manquants = briefManquants(brief);
      return NextResponse.json({
        message: typeof parsed.message === 'string' ? parsed.message : '',
        brief,
        done: parsed.done === true && manquants.length === 0,
        warnings: [...warnings, ...(parsed.done === true && manquants.length ? [`Il manque : ${manquants.join(', ')}`] : [])],
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json({ error: lastError }, { status: 502 });
}
