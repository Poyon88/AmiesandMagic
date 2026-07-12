// Rattrapage : traduit nom + ambiance des cartes existantes vers EN/ES/DE/IT/PT
// et remplit la table card_translations. Idempotent (saute les paires
// card/locale déjà présentes) et respecte les overrides manuels.
//
//   node scripts/backfill-card-translations.mjs [--only=en,es] [--batch=20] [--force]
//
// Modèle : SEULS name + flavor_text (effect_text jamais traduit).

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

const LANG_NAMES = { en: "English", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese" };

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const targetLocales = only ? only.split(",") : Object.keys(LANG_NAMES);
const BATCH = Number((args.find((a) => a.startsWith("--batch=")) || "").split("=")[1]) || 20;
const FORCE = args.includes("--force");

function sb(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

// Format de SORTIE = TSV (une ligne par carte : id⇥nom⇥ambiance). On a abandonné
// le JSON : le modèle, sur du contenu allemand, ferme ses guillemets avec un "
// ASCII non échappé ET « stringifie » parfois le tableau de l'outil — deux
// sources de JSON invalide, à toute taille de lot. La tabulation, elle,
// n'apparaît jamais dans un texte de carte → parsing infaillible.
function buildPrompt(cards, locale) {
  const lang = LANG_NAMES[locale];
  const payload = cards.map((c) => ({ id: c.id, name: c.name ?? "", flavor_text: c.flavor_text ?? "" }));
  return `You are a professional game localizer for "Armies & Magic", a dark-fantasy collectible card game. Translate the following card fields into ${lang}.

Rules:
- The source text may be in French OR English — detect it and translate into idiomatic ${lang}.
- "name" is a card title (a creature, hero, or spell). Translate it naturally; keep it evocative and concise. Do not translate a proper name that clearly should stay as-is.
- "flavor_text" is an epic lore quote/description — preserve tone and imagery.
- If a field is empty, leave it empty.

OUTPUT FORMAT — follow exactly:
- Output ONE line per card and nothing else: no header, no commentary, no code fences.
- Each line = three fields separated by a single TAB character (U+0009), in this order: the numeric id, the translated name, the translated flavor_text.
- Do NOT wrap fields in quotes and do NOT output JSON. Never put a TAB or a line break inside a field.
- Keep the same order as the input.

Cards (JSON input):
${JSON.stringify(payload)}`;
}

// Parse la réponse TSV en lignes {id, name, flavor_text}. Tolérant : ignore les
// lignes sans id numérique (commentaire éventuel), recolle un ambiance qui
// contiendrait par erreur une tabulation.
function parseTsv(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const id = Number(parts[0].trim());
    if (!Number.isInteger(id)) continue;
    const name = (parts[1] ?? "").trim();
    const flavor = parts.slice(2).join(" ").trim();
    rows.push({ id, name: name || null, flavor_text: flavor || null });
  }
  return rows;
}

// Récupère TOUTES les lignes d'une requête PostgREST en paginant (le défaut
// Supabase plafonne à 1000 lignes/réponse — sans ça, dès que card_translations
// dépasse 1000 lignes, l'ensemble `done` est tronqué et le backfill re-traduit
// des locales déjà faites au lieu de les sauter).
async function fetchAll(baseQuery) {
  const pageSize = 1000;
  let offset = 0;
  const all = [];
  for (;;) {
    const res = await sb(`${baseQuery}&limit=${pageSize}&offset=${offset}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`fetch failed: ${JSON.stringify(page)}`);
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// Traduit un lot ; sur ÉCHEC de parse (JSON malformé du modèle — typiquement un
// guillemet non échappé dans une valeur), scinde récursivement le lot en deux
// pour ISOLER la carte fautive, au lieu de perdre les 20 cartes du batch. À la
// taille 1, on abandonne la seule carte fautive (skip) et on garde le reste.
async function translateWithSplit(slice, locale, i) {
  try {
    return await translateBatch(slice, locale);
  } catch (err) {
    if (slice.length <= 1) {
      console.error(`  carte ${slice[0]?.id} ÉCHEC (skip): ${err.message}`);
      return [];
    }
    const mid = Math.ceil(slice.length / 2);
    console.error(`  batch @${i} (${slice.length}) parse ÉCHEC → split: ${err.message}`);
    const left = await translateWithSplit(slice.slice(0, mid), locale, i);
    const right = await translateWithSplit(slice.slice(mid), locale, i + mid);
    return [...left, ...right];
  }
}

async function translateBatch(cards, locale) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      // 8000 : marge confortable pour 20 cartes name+flavor dans toute langue.
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        messages: [{ role: "user", content: buildPrompt(cards, locale) }],
      }),
    });
    const data = await res.json();
    if (res.status === 529 || data.error?.type === "overloaded_error") {
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(data.error?.message || `Anthropic ${res.status}`);
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const rows = parseTsv(text);
    if (rows.length === 0) throw new Error("aucune ligne TSV parsée");
    return rows;
  }
  throw new Error("overloaded after retries");
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
    throw new Error("Missing env (SUPABASE_URL / SERVICE_ROLE_KEY / ANTHROPIC_API_KEY)");
  }
  // 1) Cartes source
  const cards = await fetchAll("cards?select=id,name,flavor_text&order=id");
  console.log(`Cartes: ${cards.length} | langues: ${targetLocales.join(",")} | batch=${BATCH}${FORCE ? " | FORCE" : ""}`);

  // 2) Traductions existantes (pour idempotence + respect manual). Paginé :
  // au-delà de 1000 lignes, une lecture simple tronquerait `done`.
  const existing = await fetchAll("card_translations?select=card_id,locale,source&order=card_id");
  const done = new Set(); // "id|locale" déjà présents (ai) → skip sauf --force
  const manual = new Set(); // "id|locale" verrouillés à la main → toujours skip
  for (const r of existing) {
    const k = `${r.card_id}|${r.locale}`;
    if (r.source === "manual") manual.add(k);
    else done.add(k);
  }

  let totalWritten = 0;
  for (const locale of targetLocales) {
    const todo = cards.filter((c) => {
      const k = `${c.id}|${locale}`;
      if (manual.has(k)) return false;
      if (!FORCE && done.has(k)) return false;
      return true;
    });
    console.log(`\n[${locale}] à traduire: ${todo.length}`);
    for (let i = 0; i < todo.length; i += BATCH) {
      const slice = todo.slice(i, i + BATCH);
      let rows;
      try {
        rows = await translateWithSplit(slice, locale, i);
      } catch (err) {
        // translateWithSplit ne throw que sur erreur non-parse (réseau /
        // overload épuisé) — on saute ce batch, les cartes restent à faire.
        console.error(`  batch ${i}-${i + slice.length} ÉCHEC: ${err.message}`);
        continue;
      }
      const byId = new Map(rows.filter((r) => typeof r.id === "number").map((r) => [r.id, r]));
      const upserts = slice
        .map((c) => byId.get(c.id))
        .filter(Boolean)
        .map((r) => ({
          card_id: r.id,
          locale,
          name: r.name?.trim() ? r.name : null,
          flavor_text: r.flavor_text?.trim() ? r.flavor_text : null,
          source: "ai",
          updated_at: new Date().toISOString(),
        }));
      if (upserts.length) {
        const up = await sb("card_translations?on_conflict=card_id,locale", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(upserts),
        });
        if (!up.ok) {
          console.error(`  upsert ÉCHEC (${up.status}): ${await up.text()}`);
        } else {
          totalWritten += upserts.length;
          process.stdout.write(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}\r`);
        }
      }
    }
    console.log(`\n[${locale}] terminé`);
  }
  console.log(`\n✅ Total lignes écrites: ${totalWritten}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
