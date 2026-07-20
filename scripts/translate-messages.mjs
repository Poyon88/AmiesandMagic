// Pipeline de traduction des catalogues d'UI (messages/*.json).
// FR = source de vérité ; remplit EN/ES/DE/IT/PT. Diff par hash (par clé) via
// .i18n-hashes.json → n'envoie que les clés manquantes ou modifiées. Les
// éditions manuelles (messages/{locale}.overrides.json) sont fusionnées en
// dernier et JAMAIS régénérées.
//
// Usage:
//   node scripts/translate-messages.mjs [--only=de,es] [--batch=40] [--force]
//
// Format d'échange = TSV (clé⇥valeur) : robuste aux guillemets / apostrophes
// que le modèle n'échappe pas toujours en JSON (cf. pipeline cartes). Les
// {placeholders} et la syntaxe ICU sont préservés (consigne + garde-fou).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MESSAGES_DIR = path.join(ROOT, "messages");
const HASH_FILE = path.join(ROOT, ".i18n-hashes.json");

const SOURCE_LOCALE = "fr";
const TARGET_LOCALES = ["en", "es", "de", "it", "pt", "ja", "zh"];
const LANG_NAMES = { en: "English", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese", ja: "Japanese", zh: "Simplified Chinese" };
const MODEL = "claude-sonnet-5";

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const targets = only ? only.split(",").filter((l) => TARGET_LOCALES.includes(l)) : TARGET_LOCALES;
const BATCH = Number((args.find((a) => a.startsWith("--batch=")) || "").split("=")[1]) || 40;
const FORCE = args.includes("--force");

// ─── env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ─── flatten / unflatten (clés pointées) ────────────────────────────────────
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
function setDeep(obj, dottedKey, value) {
  const parts = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] ?? {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// ─── hash stable (djb2) ─────────────────────────────────────────────────────
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

// ─── appel modèle (TSV) ─────────────────────────────────────────────────────
function buildPrompt(entries, locale) {
  const lang = LANG_NAMES[locale];
  // entries: [{key, value}]. On envoie clé + valeur, on ne traduit QUE la valeur.
  const lines = entries.map((e) => `${e.key}\t${e.value.replace(/\n/g, "\\n")}`).join("\n");
  return `You are a professional game localizer for "Armies & Magic", a dark-fantasy fantasy card game UI. Translate the VALUES below from French into idiomatic ${lang}.

You receive one entry per line: a key, a TAB, then the French value. Rules:
- Translate ONLY the value. Never translate or alter the key.
- Preserve EXACTLY every placeholder like {name}, {count}, {n} and any ICU syntax (plural/select blocks, #). Do not translate text inside {…}.
- Keep the literal sequence \\n (backslash + n) intact where present — it marks a line break.
- Keep it concise; this is UI chrome (buttons, labels, menus).
- Keys under vocab.races_forms.* / vocab.clans_forms.* / vocab.factions_forms.* are GRAMMATICAL SURFACE FORMS of one same noun: "def" = singular with definite article, "bare" = singular with no article, "de" = genitive/"of the" form, "pl" = plural. Keep them mutually consistent and correctly inflected for the target language. If the language has no articles or no case marking, the forms may legitimately be identical.
- CRITICAL: the {race}, {clan}, {faction} and {alignment} placeholders ALREADY CONTAIN their own article/determiner (French "le Démon", English "the Demon"). NEVER write an article directly before such a placeholder — write "Adds {race} to your hand", never "Adds the {race} to your hand".
- Keys under vocab.markers.* are generic FALLBACK fragments substituted INSIDE a sentence in place of a concrete noun. Translate them so they remain grammatical in that slot; keep them the same part of speech as the French.

OUTPUT FORMAT — follow exactly:
- Output ONE line per entry, same order, nothing else (no header, no commentary, no code fences).
- Each line = the key, a single TAB (U+0009), then the translated value.
- Do NOT wrap fields in quotes. Never put a TAB inside a value.

Entries:
${lines}`;
}

function parseTsv(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const i = line.indexOf("\t");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).replace(/\\n/g, "\n");
    if (key) out.set(key, value);
  }
  return out;
}

async function translateBatch(entries, locale) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: buildPrompt(entries, locale) }] }),
    });
    const data = await res.json();
    if (res.status === 529 || data.error?.type === "overloaded_error") {
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(data.error?.message || `Anthropic ${res.status}`);
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const map = parseTsv(text);
    if (map.size === 0) throw new Error("aucune ligne TSV parsée");
    return map;
  }
  throw new Error("overloaded after retries");
}

// Scinde en cas d'échec pour isoler une entrée fautive (garde le reste).
async function translateWithSplit(entries, locale) {
  try {
    return await translateBatch(entries, locale);
  } catch (err) {
    if (entries.length <= 1) {
      console.error(`  clé ${entries[0]?.key} ÉCHEC (skip): ${err.message}`);
      return new Map();
    }
    const mid = Math.ceil(entries.length / 2);
    const a = await translateWithSplit(entries.slice(0, mid), locale);
    const b = await translateWithSplit(entries.slice(mid), locale);
    return new Map([...a, ...b]);
  }
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY manquant (.env.local)");
  const source = readJson(path.join(MESSAGES_DIR, `${SOURCE_LOCALE}.json`), null);
  if (!source) throw new Error("messages/fr.json introuvable ou invalide");
  const flatSource = flatten(source);
  const srcKeys = Object.keys(flatSource);
  console.log(`Source fr.json : ${srcKeys.length} clés | cibles: ${targets.join(",")} | batch=${BATCH}${FORCE ? " | FORCE" : ""}`);

  const hashes = FORCE ? {} : readJson(HASH_FILE, {});

  for (const locale of targets) {
    const outPath = path.join(MESSAGES_DIR, `${locale}.json`);
    const existing = readJson(outPath, {});
    const flatExisting = flatten(existing);
    const overrides = flatten(readJson(path.join(MESSAGES_DIR, `${locale}.overrides.json`), {}));

    // Clés à (re)traduire : manquantes, ou dont le hash FR a changé.
    const hkey = (k) => `${locale}:${k}`;
    const todo = srcKeys.filter((k) => {
      if (overrides[k] !== undefined) return false; // surcharge manuelle → jamais
      if (typeof flatSource[k] !== "string") return false;
      if (flatExisting[k] === undefined) return true;
      return hashes[hkey(k)] !== hash(String(flatSource[k]));
    });
    console.log(`\n[${locale}] à traduire: ${todo.length}`);

    const result = {};
    // Repart de l'existant (clés inchangées conservées).
    for (const k of srcKeys) {
      if (typeof flatSource[k] === "string" && flatExisting[k] !== undefined) result[k] = flatExisting[k];
    }

    for (let i = 0; i < todo.length; i += BATCH) {
      const slice = todo.slice(i, i + BATCH).map((k) => ({ key: k, value: String(flatSource[k]) }));
      const map = await translateWithSplit(slice, locale);
      for (const { key } of slice) {
        const v = map.get(key);
        if (v !== undefined) {
          result[key] = v;
          hashes[hkey(key)] = hash(String(flatSource[key]));
        }
      }
      process.stdout.write(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}\r`);
    }

    // Fusionne : traductions puis surcharges manuelles (priorité finale).
    const merged = {};
    for (const [k, v] of Object.entries(result)) setDeep(merged, k, v);
    for (const [k, v] of Object.entries(overrides)) setDeep(merged, k, v);
    fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
    console.log(`\n[${locale}] écrit → ${outPath}`);
  }

  fs.writeFileSync(HASH_FILE, JSON.stringify(hashes, null, 2) + "\n");
  console.log("\n✅ Terminé. Hashes mis à jour.");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
