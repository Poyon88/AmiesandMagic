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
export { FACTIONS, RARITIES, KEYWORDS, ALIGNMENTS } from "@/lib/card-engine/constants";
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
let KEYWORD_LABELS, FACTIONS, RARITIES, KEYWORDS, ALIGNMENTS;
try {
  ({ KEYWORD_LABELS, FACTIONS, RARITIES, KEYWORDS, ALIGNMENTS } = await import(`file://${tmp}?t=${Date.now()}`));
} finally {
  fs.rmSync(tmp, { force: true });
}

// ─── construit vocab.* ──────────────────────────────────────────────────────
const vocab = { keywords: {}, factions: {}, rarities: {}, clans: {}, races: {}, alignments: {} };

for (const [id, label] of Object.entries(KEYWORD_LABELS)) {
  vocab.keywords[id] = { label };
  // Description affichée (même source que le runtime : KEYWORDS[label].desc,
  // conserve les gabarits X/Y substitués à l'exécution). Traduite par le pipeline.
  const desc = KEYWORDS?.[label]?.desc;
  if (desc) vocab.keywords[id].desc = desc;
}

for (const [id, def] of Object.entries(FACTIONS)) {
  vocab.factions[id] = { displayName: def.displayName };
  if (def.description) vocab.factions[id].description = def.description;
  // Noms de clans (identité FR → traduits par le pipeline).
  for (const group of def.clans ?? []) {
    for (const name of group.names ?? []) vocab.clans[name] = name;
  }
  // Races déclarées par la faction (identité FR → traduite par le pipeline).
  for (const race of def.races ?? []) vocab.races[race] = race;
}

for (const r of RARITIES) {
  vocab.rarities[r.id] = r.label;
}

// Alignements (id moteur stable → libellé FR ; emoji/couleur restent dans le code).
for (const a of ALIGNMENTS ?? []) {
  vocab.alignments[a.id] = a.label;
}

// Sets : lignes DB (pas des constantes moteur), clé = `code` stable. Graine des
// sets connus ; un set créé en admin doit être ajouté ici pour être traduit
// (sinon `vocab.setName` retombe sur le nom DB FR). Les valeurs déjà présentes
// dans fr.json sont préservées (édition manuelle possible).
vocab.sets = { "1": "Set de Base" };

// ─── fusion non destructive dans fr.json ─────────────────────────────────────
let fr = {};
try {
  fr = JSON.parse(fs.readFileSync(FR_PATH, "utf8"));
} catch {
  fr = {};
}
// Préserve les codes de set déjà présents (nouveaux sets seedés à la main).
vocab.sets = { ...(fr.vocab?.sets ?? {}), ...vocab.sets };
fr.vocab = vocab;
fs.writeFileSync(FR_PATH, JSON.stringify(fr, null, 2) + "\n");

const counts = {
  keywords: Object.keys(vocab.keywords).length,
  keyword_descs: Object.values(vocab.keywords).filter((k) => k.desc).length,
  factions: Object.keys(vocab.factions).length,
  rarities: Object.keys(vocab.rarities).length,
  clans: Object.keys(vocab.clans).length,
  races: Object.keys(vocab.races).length,
  alignments: Object.keys(vocab.alignments).length,
};
console.log("vocab.* écrit dans messages/fr.json :", JSON.stringify(counts));
