// Génère le namespace `vocab.*` du catalogue FR (messages/fr.json) À PARTIR des
// sources moteur (KEYWORD_LABELS, FACTIONS, RARITIES). Ainsi le FR affiché reste
// dérivé d'une seule source de vérité ; le pipeline translate-messages.mjs
// remplit ensuite EN/ES/DE/IT/PT.
//
//   vocab.keywords.{id}.label   ← KEYWORD_LABELS[id]
//   vocab.factions.{id}.displayName / .description ← FACTIONS[id]
//   vocab.rarities.{id}         ← RARITIES (id = label FR)
//   vocab.clans.{nom}           ← noms de clans déclarés par les factions (identité FR)
//
// Fusion NON destructive : préserve les autres namespaces déjà dans fr.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FR_PATH = path.join(ROOT, "messages", "fr.json");

// Bundle un mini-point d'entrée qui ré-exporte les constantes moteur, en
// résolvant l'alias @/* via tsconfig, puis on l'importe pour lire les valeurs.
const entry = `
export { KEYWORD_LABELS } from "@/lib/game/keyword-labels";
export { FACTIONS, RARITIES } from "@/lib/card-engine/constants";
`;

const built = await esbuild.build({
  stdin: { contents: entry, resolveDir: ROOT, loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  tsconfig: path.join(ROOT, "tsconfig.json"),
  logLevel: "silent",
});

const tmp = path.join(ROOT, "scripts", ".vocab-bundle.mjs");
fs.writeFileSync(tmp, built.outputFiles[0].text);
let KEYWORD_LABELS, FACTIONS, RARITIES;
try {
  ({ KEYWORD_LABELS, FACTIONS, RARITIES } = await import(`file://${tmp}?t=${Date.now()}`));
} finally {
  fs.rmSync(tmp, { force: true });
}

// ─── construit vocab.* ──────────────────────────────────────────────────────
const vocab = { keywords: {}, factions: {}, rarities: {}, clans: {} };

for (const [id, label] of Object.entries(KEYWORD_LABELS)) {
  vocab.keywords[id] = { label };
}

for (const [id, def] of Object.entries(FACTIONS)) {
  vocab.factions[id] = { displayName: def.displayName };
  if (def.description) vocab.factions[id].description = def.description;
  // Noms de clans (identité FR → traduits par le pipeline).
  for (const group of def.clans ?? []) {
    for (const name of group.names ?? []) vocab.clans[name] = name;
  }
}

for (const r of RARITIES) {
  vocab.rarities[r.id] = r.label;
}

// ─── fusion non destructive dans fr.json ─────────────────────────────────────
let fr = {};
try {
  fr = JSON.parse(fs.readFileSync(FR_PATH, "utf8"));
} catch {
  fr = {};
}
fr.vocab = vocab;
fs.writeFileSync(FR_PATH, JSON.stringify(fr, null, 2) + "\n");

const counts = {
  keywords: Object.keys(vocab.keywords).length,
  factions: Object.keys(vocab.factions).length,
  rarities: Object.keys(vocab.rarities).length,
  clans: Object.keys(vocab.clans).length,
};
console.log("vocab.* écrit dans messages/fr.json :", JSON.stringify(counts));
