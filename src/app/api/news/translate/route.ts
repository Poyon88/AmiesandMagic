// Traduction automatique d'une news FR → 7 locales (admin).
// Pattern d'appel : fetch direct sur api.anthropic.com (comme
// api/heroes/compose-prompt et scripts/translate-messages.mjs — le repo n'a
// pas de SDK Anthropic, on n'en introduit pas pour une route).
// Chaque locale réussie est écrite IMMÉDIATEMENT dans `translations` : un
// échec en cours de route ne perd pas les locales déjà traduites, et
// re-cliquer « Traduire » complète les manquantes.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { NEWS_TARGET_LOCALES, type NewsTranslation } from '@/lib/news/types';
import { isLocale, type Locale } from '@/i18n/config';

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 8000;

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', it: 'Italian',
  pt: 'Portuguese', ja: 'Japanese', zh: 'Simplified Chinese',
};

function buildPrompt(locale: Locale, title: string, teaser: string, bodyMd: string): string {
  const lang = LANG_NAMES[locale] ?? locale;
  // Même esprit que buildPrompt() de scripts/translate-messages.mjs
  // (localisateur du jeu), plus les règles Markdown propres aux news.
  return `You are a professional game localizer for "Armies & Magic", a dark-fantasy card game. Translate the following news post from French into idiomatic ${lang}.

Rules:
- Keep the tone of a game announcement (enthusiastic but concise).
- Keep game-specific proper nouns and card names unchanged unless an official translation is obvious.
- The body is Markdown: preserve the syntax EXACTLY (headings #/##/###, **bold**, *italic*, lists, links). In links [text](url), translate the text but NEVER the URL.
- Do not add or remove content. No code fences.
- Output ONLY a JSON object, nothing else: {"title": "...", "teaser": "...", "body_md": "..."}

TITLE:
${title}

TEASER:
${teaser}

BODY (Markdown):
${bodyMd}`;
}

/** Extrait l'objet JSON de la réponse (tolère du texte autour). */
function parseTranslation(text: string): NewsTranslation | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title : undefined;
    const teaser = typeof obj.teaser === 'string' ? obj.teaser : undefined;
    const body_md = typeof obj.body_md === 'string' ? obj.body_md : undefined;
    if (!title && !teaser && !body_md) return null;
    return { title, teaser, body_md };
  } catch {
    return null;
  }
}

/** Un appel modèle, avec retry/backoff sur surcharge (529) — copie du
 *  comportement de translateBatch dans scripts/translate-messages.mjs. */
async function callModel(apiKey: string, prompt: string): Promise<string> {
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await response.json();
    if (response.ok) {
      const text = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text;
      if (typeof text === 'string' && text.trim()) return text;
      lastErr = 'réponse vide';
    } else if (response.status === 529 || data?.error?.type === 'overloaded_error') {
      lastErr = 'API surchargée';
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    } else {
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    }
  }
  throw new Error(lastErr || 'échec après retries');
}

// POST /api/news/translate — body { id, locales? }.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurée' }, { status: 503 });
  }

  const body = await request.json();
  const { id, locales } = body as { id?: number; locales?: string[] };
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const targets: Locale[] = (locales ?? NEWS_TARGET_LOCALES as unknown as string[])
    .filter(isLocale)
    .filter((l) => l !== 'fr');
  if (targets.length === 0) return NextResponse.json({ error: 'aucune locale cible valide' }, { status: 400 });

  const { data: news, error: readErr } = await auth.supabase
    .from('news')
    .select('id, title, teaser, body_md, translations')
    .eq('id', id)
    .single();
  if (readErr || !news) return NextResponse.json({ error: 'news introuvable' }, { status: 404 });

  const done: Locale[] = [];
  const failed: { locale: Locale; error: string }[] = [];

  // Séquentiel (pas de parallèle) : le corps peut être long, et un échec
  // partiel doit laisser un état propre, locale par locale.
  for (const locale of targets) {
    try {
      let text = await callModel(apiKey, buildPrompt(locale, news.title, news.teaser, news.body_md));
      let parsed = parseTranslation(text);
      if (!parsed) {
        // Un seul retry sur parse raté (sortie hors format).
        text = await callModel(apiKey, buildPrompt(locale, news.title, news.teaser, news.body_md));
        parsed = parseTranslation(text);
      }
      if (!parsed) throw new Error('réponse non parsable');

      // Merge lu-modifié-écrit : relit à chaque tour pour ne pas écraser une
      // écriture concurrente (deux clics admin), puis écrit immédiatement.
      const { data: current } = await auth.supabase.from('news').select('translations').eq('id', id).single();
      const merged = { ...(current?.translations ?? {}), [locale]: parsed };
      const { error: writeErr } = await auth.supabase
        .from('news')
        .update({ translations: merged, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (writeErr) throw new Error(writeErr.message);
      done.push(locale);
    } catch (err) {
      failed.push({ locale, error: err instanceof Error ? err.message : 'erreur inconnue' });
    }
  }

  return NextResponse.json({ done, failed });
}
