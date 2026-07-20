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
export { SPELL_KEYWORDS } from "@/lib/game/spell-keywords";
export { COMPOSED_FR } from "@/lib/game/composed-display";
export { FACTIONS, RARITIES, KEYWORDS, KEYWORD_DESC_BY_ID, ALIGNMENTS } from "@/lib/card-engine/constants";
export { RACE_FORMS_FR, CLAN_FORMS_FR, FACTION_FORMS_FR } from "@/lib/card-engine/race-forms";
export { MARKERS_FR } from "@/lib/game/desc-markers";
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
let KEYWORD_LABELS, SPELL_KEYWORDS, COMPOSED_FR, FACTIONS, RARITIES, KEYWORDS, KEYWORD_DESC_BY_ID, ALIGNMENTS;
let RACE_FORMS_FR, CLAN_FORMS_FR, FACTION_FORMS_FR, MARKERS_FR;
try {
  ({ KEYWORD_LABELS, SPELL_KEYWORDS, COMPOSED_FR, FACTIONS, RARITIES, KEYWORDS, KEYWORD_DESC_BY_ID, ALIGNMENTS,
     RACE_FORMS_FR, CLAN_FORMS_FR, FACTION_FORMS_FR, MARKERS_FR } = await import(`file://${tmp}?t=${Date.now()}`));
} finally {
  fs.rmSync(tmp, { force: true });
}

// Déplie une map plate à clés pointées ({"a.b": v}) en objets imbriqués.
function unflatten(flatMap) {
  const out = {};
  for (const [key, val] of Object.entries(flatMap)) {
    const parts = key.split(".");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ??= {};
    cur[parts[parts.length - 1]] = val;
  }
  return out;
}

// ─── construit vocab.* ──────────────────────────────────────────────────────
const vocab = { keywords: {}, spell_keywords: {}, composed: {}, factions: {}, rarities: {}, clans: {}, races: {}, alignments: {},
  races_forms: {}, clans_forms: {}, factions_forms: {}, markers: {} };

for (const [id, label] of Object.entries(KEYWORD_LABELS)) {
  vocab.keywords[id] = { label };
  // Description affichée (même source que le runtime : KEYWORDS[label].desc,
  // conserve les gabarits X/Y substitués à l'exécution). Traduite par le pipeline.
  // Repli par id moteur : KEYWORDS est keyé par le libellé forge, qui peut
  // diverger du libellé d'affichage (cf. KEYWORD_DESC_BY_ID dans abilities.ts).
  const desc = KEYWORDS?.[label]?.desc ?? KEYWORD_DESC_BY_ID?.[id];
  if (desc) vocab.keywords[id].desc = desc;
}

// Mots-clés de SORT (registre distinct, gabarits label/desc avec X/Y/amount
// substitués à l'exécution par getSpellKeywordLabel/Desc).
for (const [id, def] of Object.entries(SPELL_KEYWORDS ?? {})) {
  vocab.spell_keywords[id] = { label: def.label };
  if (def.desc) vocab.spell_keywords[id].desc = def.desc;
}

// Effets composés : fragments de phrase paramétriques (source unique
// COMPOSED_FR dans composed-display.ts, aussi repli runtime). Dépliés en objets
// imbriqués pour que next-intl résolve `vocab.composed.trigger.on_play`, etc.
vocab.composed = unflatten(COMPOSED_FR ?? {});

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

// Formes fléchies (singulier défini / nu / complément du nom) pour que les
// descriptions nomment la valeur concrète de la carte — cf. race-forms.ts.
// Traduites par le pipeline : le genre est implicite dans la chaîne.
vocab.races_forms = { ...(RACE_FORMS_FR ?? {}) };
for (const [clan, de] of Object.entries(CLAN_FORMS_FR ?? {})) vocab.clans_forms[clan] = de;
for (const [id, de] of Object.entries(FACTION_FORMS_FR ?? {})) vocab.factions_forms[id] = de;

// Replis génériques des marqueurs de description (« de même race »…). Sans ça
// les locales non-FR afficheraient le repli EN FRANÇAIS.
vocab.markers = { ...(MARKERS_FR ?? {}) };

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

// Formats : lignes DB, clé = `code` stable (`${mode}-${extent}`). L'ensemble est
// figé (4 combinaisons mode × étendue). Nom composite FR → traduit par le pipeline.
vocab.formats = {
  "expert-standard": "Expert · Standard",
  "expert-etendu": "Expert · Étendu",
  "classique-etendu": "Classique · Étendu",
  "classique-standard": "Classique · Standard",
};

// ─── fusion non destructive dans fr.json ─────────────────────────────────────
let fr = {};
try {
  fr = JSON.parse(fs.readFileSync(FR_PATH, "utf8"));
} catch {
  fr = {};
}
// Préserve les codes de set/format déjà présents (seeds manuels).
vocab.sets = { ...(fr.vocab?.sets ?? {}), ...vocab.sets };
vocab.formats = { ...(fr.vocab?.formats ?? {}), ...vocab.formats };
fr.vocab = vocab;
fs.writeFileSync(FR_PATH, JSON.stringify(fr, null, 2) + "\n");

const counts = {
  keywords: Object.keys(vocab.keywords).length,
  keyword_descs: Object.values(vocab.keywords).filter((k) => k.desc).length,
  races_forms: Object.keys(vocab.races_forms).length,
  markers: Object.keys(vocab.markers).length,
  clans_forms: Object.keys(vocab.clans_forms).length,
  factions_forms: Object.keys(vocab.factions_forms).length,
  spell_keywords: Object.keys(vocab.spell_keywords).length,
  spell_keyword_descs: Object.values(vocab.spell_keywords).filter((k) => k.desc).length,
  factions: Object.keys(vocab.factions).length,
  rarities: Object.keys(vocab.rarities).length,
  clans: Object.keys(vocab.clans).length,
  races: Object.keys(vocab.races).length,
  alignments: Object.keys(vocab.alignments).length,
};
console.log("vocab.* écrit dans messages/fr.json :", JSON.stringify(counts));
