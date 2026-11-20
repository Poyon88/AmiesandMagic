// Relecture de cohérence des catalogues d'UI (messages/*.json).
//
// Les catalogues sont traduits par lots indépendants : le nom d'une capacité
// peut être rendu d'une façon dans son libellé (« Traque » → "Charge") et d'une
// autre dans une description qui la cite ("it gains Hunt"). Ce script prend le
// LIBELLÉ pour référence et fait relire, langue par langue :
//   1. tout texte dont le français cite une capacité sans que la traduction
//      emploie le nom établi de cette capacité ;
//   2. les textes « à retraduire » selon translate-messages (français modifié
//      ou empreinte absente) : gardés tels quels s'ils disent encore la même
//      chose, corrigés sinon — puis leur empreinte est mise à jour.
// Il NE renomme jamais un libellé de capacité et ne touche pas aux surcharges
// (messages/{locale}.overrides.json).
//
// Usage :
//   node scripts/review-vocab-consistency.mjs --only=en [--dry] [--batch=25]
// Un processus par langue (les empreintes sont fusionnées à l'écriture).
// Rapport : .i18n-review/{locale}.json (avant → après de chaque changement).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MESSAGES_DIR = path.join(ROOT, "messages");
const HASH_FILE = path.join(ROOT, ".i18n-hashes.json");
const REPORT_DIR = path.join(ROOT, ".i18n-review");
const MODEL = "claude-sonnet-5-5";
const LANG_NAMES = { en: "English", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese", ja: "Japanese", zh: "Simplified Chinese", ru: "Russian", ar: "Modern Standard Arabic", ko: "Korean", "zh-TW": "Traditional Chinese (Taiwan)", tr: "Turkish", pl: "Polish" };

const args = process.argv.slice(2);
const arg = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1];
const locales = (arg("only") || "").split(",").filter((l) => l in LANG_NAMES);
const BATCH = Number(arg("batch")) || 25;
const DRY = args.includes("--dry");
if (locales.length === 0) { console.error("--only=xx requis"); process.exit(1); }

for (const line of fs.existsSync(path.join(ROOT, ".env.local")) ? fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const i = line.indexOf("=");
  if (i > 0 && !(line.slice(0, i).trim() in process.env)) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("ANTHROPIC_API_KEY manquant (.env.local)"); process.exit(1); }

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
function setDeep(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = cur[p];
  cur[parts[parts.length - 1]] = value;
}
// Même empreinte que translate-messages.mjs (djb2).
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const LABEL_RE = /^vocab\.(keywords|spell_keywords)\.[^.]+\.label$/;
/** Nom nu d'une capacité : « Entrave X » → « Entrave », « Gloire +X/+Y » → « Gloire ». */
const nu = (label) => String(label).replace(/\s*[+]?[XY](\s*\/\s*[+]?[XY])?\s*$/u, "").trim();
const placeholders = (s) => (String(s).match(/\{[a-zA-Z_]+/g) || []).sort().join(",");
const echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const source = readJson(path.join(MESSAGES_DIR, "fr.json"), null);
const fr = flatten(source);
const frKeys = Object.keys(fr).filter((k) => typeof fr[k] === "string");

// Noms français des capacités, du plus long au plus court (« Traque du destin »
// avant « Traque »), avec la clé de libellé qui fait foi. Le registre des
// créatures passe devant celui des actions quand les deux portent le même nom.
const termes = new Map(); // nom FR nu → clés de libellé (créature d'abord, puis action)
for (const k of frKeys.filter((k) => LABEL_RE.test(k)).sort((a, b) => a.localeCompare(b))) {
  const t = nu(fr[k]);
  if (t.length < 3) continue;
  if (!termes.has(t)) termes.set(t, []);
  termes.get(t).push(k);
}
const termesTries = [...termes.keys()].sort((a, b) => b.length - a.length);
const reTerme = new Map(termesTries.map((t) => [t, new RegExp(`(?<![\\p{L}])${echappe(t)}(?![\\p{L}])`, "u")]));

/** Capacités citées dans un texte français (un nom long masque le court qu'il contient). */
function termesCites(texte) {
  let reste = texte;
  const out = [];
  for (const t of termesTries) {
    if (reTerme.get(t).test(reste)) { out.push(t); reste = reste.split(t).join(" "); }
  }
  return out;
}

async function appeler(prompt) {
  for (let essai = 0; essai < 5; essai++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 529 || res.status === 429 || data.error?.type === "overloaded_error") {
      await new Promise((r) => setTimeout(r, 4000 * (essai + 1)));
      continue;
    }
    if (!res.ok) throw new Error(data.error?.message || `Anthropic ${res.status}`);
    return data.content?.find((b) => b.type === "text")?.text || "";
  }
  throw new Error("API saturée après plusieurs essais");
}

function prompt(locale, lot, glossaire) {
  const lang = LANG_NAMES[locale];
  const gloss = glossaire.length
    ? glossaire.map(([f, t]) => `${f}\t${t}`).join("\n")
    : "(none for this batch)";
  const lignes = lot.map((e) => `${e.key}\t${e.fr.replace(/\n/g, "\\n")}\t${e.cur.replace(/\n/g, "\\n")}`).join("\n");
  return `You are the localization reviewer for "Armies of Legends", a fantasy collectible card game. You review existing ${lang} translations of French UI strings. Your job is to FIX ONLY real problems and otherwise return each translation EXACTLY as it is.

GLOSSARY — established ${lang} names of game abilities (French name, TAB, ${lang} name). These names are final and visible on the cards:
${gloss}

For each entry (key, TAB, French source, TAB, current ${lang} translation):
1. If the French source cites one of the glossary abilities BY NAME (a capitalised ability name, e.g. « elle gagne Traque »), the translation must use the glossary's ${lang} name for it — inflected as the grammar requires, but the same word. When the glossary gives two names separated by " / ", the first is the creature ability's name and the second the action's: both are established, so keep whichever the translation already uses; if it uses neither, use the second when the key starts with vocab.spell_keywords or contains ".spell.", the first otherwise. If the translation uses another name for that ability, replace just that name. If the French word is used in its ordinary sense (a common noun or verb) and not as an ability name, ignore the glossary for it and leave the text alone.
2. If the translation no longer says what the French says (the French was edited after it was translated), correct it so it matches the French, keeping the existing wording wherever it is still right.
3. Otherwise return the translation UNCHANGED, character for character. Do not rephrase for style, do not "improve".

Always preserve every {placeholder}, ICU plural/select syntax, the literal sequence \\n, leading and trailing spaces, X, Y, +X/+Y and digits.

OUTPUT FORMAT — one line per entry, same order, nothing else: the key, a single TAB, then the final ${lang} text (do NOT repeat the French source). No quotes, no commentary, no code fences.

Entries:
${lignes}`;
}

for (const locale of locales) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  const cat = readJson(file, null);
  if (!cat) { console.error(`[${locale}] catalogue introuvable`); continue; }
  const cur = flatten(cat);
  const overrides = flatten(readJson(path.join(MESSAGES_DIR, `${locale}.overrides.json`), {}));
  const hashes = readJson(HASH_FILE, {});
  const rapport = { alignes: [], changes: [], refuses: [] };

  // 0. Deux capacités DIFFÉRENTES ne peuvent pas porter le même nom dans la
  //    langue (« Remontée » et « Rappel » toutes deux "Recall"). Le libellé
  //    d'action fautif reprend alors celui de la créature de même nom français.
  //    Hors collision, un libellé n'est jamais renommé, même si créature et
  //    action diffèrent : les deux noms sont établis.
  const labelKeys = frKeys.filter((k) => LABEL_RE.test(k) && typeof cur[k] === "string");
  for (const k of labelKeys.filter((k) => k.startsWith("vocab.spell_keywords."))) {
    if (overrides[k] !== undefined) continue;
    const collision = labelKeys.find((o) => o !== k && nu(fr[o]) !== nu(fr[k]) && nu(cur[o]).toLowerCase() === nu(cur[k]).toLowerCase());
    if (!collision) continue;
    const ref = (termes.get(nu(fr[k])) ?? []).find((o) => o.startsWith("vocab.keywords.") && typeof cur[o] === "string");
    if (!ref || nu(cur[ref]).toLowerCase() === nu(cur[k]).toLowerCase()) {
      rapport.refuses.push({ key: k, fr: fr[k], avant: cur[k], propose: `(collision avec ${collision}, sans libellé de créature pour trancher)` });
      continue;
    }
    const neuf = nu(cur[ref]) + cur[k].slice(nu(cur[k]).length);
    rapport.alignes.push({ key: k, fr: fr[k], avant: cur[k], apres: neuf, collision, reference: ref });
    cur[k] = neuf;
  }

  // Glossaire de la langue.
  // Une collision levée par un alignement ci-dessus n'est plus à signaler.
  rapport.refuses = rapport.refuses.filter((r) => labelKeys.some((o) => o !== r.key && nu(fr[o]) !== nu(fr[r.key]) && nu(cur[o]).toLowerCase() === nu(cur[r.key]).toLowerCase()));

  // Noms établis de chaque capacité : celui de la créature, celui de l'action.
  const nomsCible = new Map(termesTries.map((t) => [t, [...new Set(termes.get(t).map((k) => nu(cur[k] ?? "")).filter(Boolean))]]));
  // Écran d'admin (forge) et noms de déclencheurs : hors relecture de vocabulaire.
  const horsVocabulaire = (k) => k.startsWith("forge.") || k.startsWith("vocab.triggers.");

  // 1. Textes citant une capacité sans son nom établi.
  const aRelire = new Map(); // key → motif
  for (const k of frKeys) {
    if (LABEL_RE.test(k) || horsVocabulaire(k) || overrides[k] !== undefined || typeof cur[k] !== "string") continue;
    const bas = cur[k].toLowerCase();
    const cites = termesCites(fr[k]).filter((t) => nomsCible.get(t).length);
    if (cites.some((t) => !nomsCible.get(t).some((n) => bas.includes(n.toLowerCase())))) aRelire.set(k, "vocabulaire");
  }
  // 2. Textes que translate-messages retraduirait.
  const perimes = frKeys.filter((k) => overrides[k] === undefined && typeof cur[k] === "string" && hashes[`${locale}:${k}`] !== hash(fr[k]));
  for (const k of perimes) if (!LABEL_RE.test(k) && !aRelire.has(k)) aRelire.set(k, "français modifié ou empreinte absente");

  const liste = [...aRelire.keys()];
  console.log(`[${locale}] à relire: ${liste.length} (vocabulaire: ${[...aRelire.values()].filter((m) => m === "vocabulaire").length}) | libellés alignés: ${rapport.alignes.length}`);

  const relus = new Set();
  for (let i = 0; i < liste.length; i += BATCH) {
    const lot = liste.slice(i, i + BATCH).map((k) => ({ key: k, fr: fr[k], cur: cur[k] }));
    const cites = new Set(lot.flatMap((e) => termesCites(e.fr)));
    const glossaire = [...cites].filter((t) => nomsCible.get(t).length).map((t) => [t, nomsCible.get(t).join(" / ")]);
    let texte = "";
    try { texte = await appeler(prompt(locale, lot, glossaire)); } catch (err) { console.error(`  lot ${i} ÉCHEC: ${err.message}`); continue; }
    const recu = new Map();
    for (const line of texte.split("\n")) {
      // Dernier champ : le modèle recopie parfois le français entre la clé et
      // la traduction, et une valeur ne contient jamais de tabulation.
      const t = line.indexOf("\t");
      const d = line.lastIndexOf("\t");
      if (t > 0) recu.set(line.slice(0, t).trim(), line.slice(d + 1).replace(/\\n/g, "\n"));
    }
    for (const e of lot) {
      const neuf = recu.get(e.key);
      if (neuf === undefined) continue;
      relus.add(e.key);
      if (neuf === e.cur) continue;
      // Garde-fous : mêmes {marqueurs}, mêmes espaces de bord, pas de texte vidé.
      const bords = (s) => [s.match(/^\s*/)[0], s.match(/\s*$/)[0]].join("|");
      if (!neuf.trim() || placeholders(neuf) !== placeholders(e.cur) || bords(neuf) !== bords(e.cur)) {
        rapport.refuses.push({ key: e.key, fr: e.fr, avant: e.cur, propose: neuf });
        continue;
      }
      rapport.changes.push({ key: e.key, motif: aRelire.get(e.key), fr: e.fr, avant: e.cur, apres: neuf });
      cur[e.key] = neuf;
    }
    process.stdout.write(`  ${Math.min(i + BATCH, liste.length)}/${liste.length}\r`);
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, `${locale}.json`), JSON.stringify(rapport, null, 2) + "\n");
  console.log(`\n[${locale}] changés: ${rapport.changes.length} | refusés: ${rapport.refuses.length} | relus: ${relus.size}/${liste.length}`);
  if (DRY) continue;

  for (const c of [...rapport.alignes, ...rapport.changes]) setDeep(cat, c.key, c.apres);
  fs.writeFileSync(file, JSON.stringify(cat, null, 2) + "\n");

  // Empreintes : un texte relu (ou un libellé, jamais retraduit ici) est à jour.
  // Verrou (dossier) : plusieurs langues tournent en parallèle sur ce fichier.
  const verrou = `${HASH_FILE}.lock`;
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(verrou); break; } catch { if (i > 600) throw new Error("verrou des empreintes bloqué"); await new Promise((r) => setTimeout(r, 100)); }
  }
  try {
    const aJour = readJson(HASH_FILE, {});
    const refuses = new Set(rapport.refuses.map((r) => r.key));
    for (const k of perimes) if ((relus.has(k) && !refuses.has(k)) || LABEL_RE.test(k)) aJour[`${locale}:${k}`] = hash(fr[k]);
    fs.writeFileSync(HASH_FILE, JSON.stringify(aJour, null, 2) + "\n");
  } finally { fs.rmdirSync(verrou); }
}
