// Seed le namespace `vocab.tokens.{id}` (nom FR des tokens) dans messages/fr.json
// À PARTIR de la table DB `token_templates`. Le pipeline translate-messages.mjs
// remplit ensuite EN/ES/DE/IT/PT (les tokens passent par le MÊME système que le
// reste du vocabulaire → résolvables via SafeT dans les descriptions d'effets
// ET via useVocab().tokenName au rendu). Pas de table de traduction dédiée
// (conforme à « pas de migration »). Le FR reste la source (token_templates.name).
//
//   Usage : node scripts/generate-token-vocab.mjs
//
// Lit SUPABASE (URL / service role) depuis .env.local. Fusion NON destructive.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FR_PATH = path.join(ROOT, "messages", "fr.json");

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
const SUPA_URL = ENV.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) throw new Error("SUPABASE URL / service role manquant");

const res = await fetch(
  `${SUPA_URL}/rest/v1/token_templates?select=id,name&order=id`,
  { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } },
);
if (!res.ok) throw new Error(`token_templates fetch ${res.status}`);
const tokens = await res.json();

const fr = JSON.parse(fs.readFileSync(FR_PATH, "utf8"));
fr.vocab = fr.vocab ?? {};
const seeded = {};
for (const tk of tokens) if (tk.name) seeded[tk.id] = tk.name;
// Fusion non destructive : les entrées existantes (overrides manuels) gagnent.
fr.vocab.tokens = { ...seeded, ...(fr.vocab.tokens ?? {}) };

fs.writeFileSync(FR_PATH, JSON.stringify(fr, null, 2) + "\n");
console.log(`✅ vocab.tokens seedé : ${Object.keys(fr.vocab.tokens).length} tokens → ${FR_PATH}`);
