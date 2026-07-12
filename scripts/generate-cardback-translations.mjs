// Génère les traductions du NOM des DOS DE CARTES vers EN/ES/DE/IT/PT dans un
// fichier statique `src/i18n/card-back-translations.json` (pas de table DB →
// conforme à la préférence « pas de migration maintenant »). Les dos sont peu
// nombreux (~40) et quasi statiques ; un ré-run régénère tout. Le FR reste la
// source (colonne `card_backs.name`) et le repli garanti.
//
//   Usage : node scripts/generate-cardback-translations.mjs [--only=de,it]
//
// Lit ANTHROPIC_API_KEY + SUPABASE (URL/service role) depuis .env.local.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "i18n", "card-back-translations.json");

// ─── env (.env.local) ────────────────────────────────────────────────────────
function readEnv() {
  const env = {};
  const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}
const ENV = readEnv();
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ENV.ANTHROPIC_API_KEY;
const SUPA_URL = ENV.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY manquant");
if (!SUPA_URL || !SUPA_KEY) throw new Error("SUPABASE URL / service role manquant");

const TARGETS = ["en", "es", "de", "it", "pt", "ja", "zh"];
const LANG = { en: "English", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese", ja: "Japanese", zh: "Simplified Chinese" };
const MODEL = "claude-sonnet-4-6";

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const locales = onlyArg ? onlyArg.slice(7).split(",").map((s) => s.trim()).filter((l) => TARGETS.includes(l)) : TARGETS;

// ─── fetch card backs ────────────────────────────────────────────────────────
async function fetchCardBacks() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/card_backs?select=id,name&order=id`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } },
  );
  if (!res.ok) throw new Error(`card_backs fetch ${res.status}`);
  return res.json();
}

// ─── TSV translation (nom seul) ──────────────────────────────────────────────
async function translateNames(rows, locale) {
  const payload = rows.map((r) => ({ id: r.id, text: r.name.replace(/[\t\n]+/g, " ").trim() }));
  const prompt = `You are a professional game localizer for "Armies & Magic", a dark-fantasy collectible card game. Translate the following card-back (cosmetic card sleeve) names into ${LANG[locale]}.

Each value is a short cosmetic name — usually a faction / theme label (e.g. a race, a creature, a style). Translate the meaningful words naturally and keep it evocative. Do NOT translate a proper name that should stay as-is. Keep any trailing numbers. The source may be French or English — detect and translate into idiomatic ${LANG[locale]}.

OUTPUT FORMAT — follow exactly:
- Output ONE line per item and nothing else: no header, no commentary, no code fences.
- Each line = two fields separated by a single TAB (U+0009): the numeric id, then the translated text.
- Do NOT wrap fields in quotes, do NOT output JSON. Never put a TAB or line break inside the text.
- Keep the same order as the input.

Items (JSON input):
${JSON.stringify(payload)}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      if (res.status === 529 || data.error?.type === "overloaded_error") {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(data.error?.message || `Anthropic ${res.status}`);
      const text = data.content?.find((b) => b.type === "text")?.text || "";
      const out = new Map();
      for (const line of text.split("\n")) {
        const parts = line.split("\t");
        if (parts.length < 2) continue;
        const id = Number(parts[0].trim());
        if (!Number.isInteger(id)) continue;
        const val = parts.slice(1).join(" ").trim();
        if (val) out.set(id, val);
      }
      if (out.size === 0) throw new Error("aucune ligne TSV");
      return out;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return new Map();
}

// ─── main ────────────────────────────────────────────────────────────────────
const cardBacks = await fetchCardBacks();
console.log(`${cardBacks.length} dos | cibles: ${locales.join(",")}`);

let result = {};
try { result = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { result = {}; }

const rows = cardBacks.filter((c) => c.name).map((c) => ({ id: c.id, name: c.name }));
for (const locale of locales) {
  const map = await translateNames(rows, locale);
  const byId = {};
  for (const c of cardBacks) {
    const v = map.get(c.id);
    if (v) byId[c.id] = { name: v };
  }
  result[locale] = byId;
  console.log(`[${locale}] ✓ ${map.size}/${rows.length}`);
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(`\n✅ écrit → ${OUT}`);
