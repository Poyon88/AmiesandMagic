import type { Keyword, KeywordMode, KeywordInstance, SpellKeywordInstance } from "./types";
import type { SafeT } from "@/i18n/config";
import { SPELL_KEYWORDS } from "./spell-keywords";

/** Color used to tint a keyword icon based on its trigger mode. Returned
 *  values are CSS hex strings — callers compose them into background /
 *  border / glow as appropriate. The fallback (`undefined` mode = on-play)
 *  returns null so the existing accent-color logic keeps applying. */
export function keywordModeColor(mode: KeywordMode | undefined): string | null {
  if (mode === "death") return "#a83232"; // dark red
  if (mode === "tap") return "#d4a800";   // amber yellow
  if (mode === "return") return "#3a7dd4"; // blue (retour en main)
  if (mode === "attack") return "#E735F6"; // magenta (à l'attaque)
  if (mode === "end_of_turn") return "#2faa3f"; // green (fin du tour)
  return null;
}

/** CSS `filter` chain that flattens any emoji or image icon to a single
 *  target colour matching the trigger mode. Built with
 *  https://codepen.io/sosuke/pen/Pjoqqp from the hex above so the visual
 *  output stays consistent between the two helpers. Returns null for the
 *  default on-play mode (no filter — emoji/image kept multicolor). */
export function keywordModeFilter(mode: KeywordMode | undefined): string | null {
  if (mode === "death") {
    // → #a83232 dark red
    return "brightness(0) saturate(100%) invert(24%) sepia(50%) saturate(3253%) hue-rotate(341deg) brightness(95%) contrast(91%)";
  }
  if (mode === "tap") {
    // → #d4a800 amber yellow
    return "brightness(0) saturate(100%) invert(63%) sepia(78%) saturate(2024%) hue-rotate(11deg) brightness(89%) contrast(99%)";
  }
  if (mode === "return") {
    // → #3a7dd4 blue (retour en main)
    return "brightness(0) saturate(100%) invert(38%) sepia(93%) saturate(1352%) hue-rotate(192deg) brightness(91%) contrast(94%)";
  }
  if (mode === "attack") {
    // → #E735F6 magenta (à l'attaque). The previous chain targeted #9D00FF but
    // its extreme saturate(7426%) rendered as vivid purple on Blink yet magenta
    // on WebKit/iOS Safari, so the icon (filter) and the X value (hex above) no
    // longer matched on Safari. This chain uses a moderate saturate(372%) that
    // resolves to the same magenta on both engines, keeping icon + number
    // consistent cross-browser. Keep in sync with keywordModeColor("attack").
    return "brightness(0) saturate(100%) invert(59%) sepia(55%) saturate(372%) hue-rotate(247deg) brightness(71%) contrast(285%)";
  }
  if (mode === "end_of_turn") {
    // → #2faa3f green (fin du tour)
    return "brightness(0) saturate(100%) invert(48%) sepia(92%) saturate(389%) hue-rotate(73deg) brightness(94%) contrast(90%)";
  }
  return null;
}

export interface KeywordDisplayEntry {
  kw: Keyword;
  x?: number;
  mode?: KeywordMode; // undefined = on-play
  /** Index back into card.keyword_instances when sourced from there —
   *  useful when the click handler needs to dispatch the right instance
   *  (tap activation). Undefined for legacy entries derived from the
   *  `keywords` string array only. */
  instanceIdx?: number;
}

/** Build the per-icon display list for a creature card. Each entry maps
 *  to ONE icon — same keyword in two modes yields two entries so the
 *  player sees one icon per mode (e.g. Convocation X play + Convocation X
 *  tap = 2 icons, the latter coloured yellow). Falls back to the legacy
 *  `keywords` string array for cards without per-instance metadata. */
export function buildKeywordDisplayEntries(
  card: { keywords: Keyword[]; keyword_instances?: KeywordInstance[] | null; effect_text: string },
): KeywordDisplayEntry[] {
  const out: KeywordDisplayEntry[] = [];
  const instances = card.keyword_instances ?? [];
  const xFromText = parseXValuesFromEffectText(card.effect_text);
  const idsCovered = new Set<Keyword>();
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    idsCovered.add(inst.id);
    out.push({
      kw: inst.id,
      x: inst.x ?? (inst.mode === undefined ? xFromText[inst.id] : undefined),
      mode: inst.mode,
      instanceIdx: i,
    });
  }
  for (const kw of card.keywords) {
    if (!idsCovered.has(kw)) {
      out.push({ kw, x: xFromText[kw] });
    }
  }
  return out;
}

/** Convert an integer to Roman numerals (1–10) */
export function toRoman(n: number): string {
  const vals = [10, 9, 5, 4, 1];
  const syms = ["X", "IX", "V", "IV", "I"];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return result || "0";
}

/**
 * Parse X values from effect_text bracket notation: "[Persécution 1, Souffle de feu 2]"
 * Returns a map from game keyword id to X value, e.g. { "persecution": 1, "souffle_de_feu": 2 }
 */
/** Strip the bracket notation [Keyword1 X, ...] from effect_text for display,
 *  replacing X/Y placeholders with actual values from brackets and spell keywords */
export function cleanEffectText(
  effectText: string | null | undefined,
  spellKeywords?: SpellKeywordInstance[] | null,
): string {
  if (!effectText) return "";

  // Extract values from bracket notation before removing it
  const match = effectText.match(/\[([^\]]+)\]/);
  let result = effectText.replace(/\s*\[[^\]]*\]\s*/g, "").trim();

  if (match) {
    // Parse bracket values and build a single replacement value
    // Brackets like "[Impact 3]" or "[Persécution 2, Souffle de feu 1]"
    const parts = match[1].split(",").map(p => p.trim());
    for (const part of parts) {
      const lastSpace = part.lastIndexOf(" ");
      if (lastSpace > 0) {
        const val = parseInt(part.slice(lastSpace + 1));
        if (!isNaN(val)) {
          // Replace first remaining X with this value
          result = result.replace(/\bX\b/, String(val));
        }
      }
    }
  }

  // Replace from spell keywords if provided
  if (spellKeywords) {
    for (const kw of spellKeywords) {
      const def = SPELL_KEYWORDS[kw.id];
      if (!def) continue;
      if (def.params.includes("attack") && kw.attack != null) {
        result = result.replace(/\bX\b/, String(kw.attack));
      } else if (def.params.includes("amount") && kw.amount != null) {
        result = result.replace(/\bX\b/, String(kw.amount));
      }
      if (def.params.includes("health") && kw.health != null) {
        result = result.replace(/\bY\b/, String(kw.health));
      }
    }
  }

  return result;
}

export function parseXValuesFromEffectText(effectText: string | null | undefined): Record<Keyword, number> {
  const result: Record<string, number> = {};
  if (!effectText) return result as Record<Keyword, number>;
  const match = effectText.match(/\[([^\]]+)\]/);
  if (!match) return result as Record<Keyword, number>;
  for (const part of match[1].split(",")) {
    const trimmed = part.trim();
    const lastSpace = trimmed.lastIndexOf(" ");
    if (lastSpace > 0) {
      const forgeName = trimmed.slice(0, lastSpace);
      const val = parseInt(trimmed.slice(lastSpace + 1));
      if (!isNaN(val)) {
        // Find game keyword id from forge label
        const forgeKey = `${forgeName} X`;
        const entry = Object.entries(KEYWORD_LABELS).find(([, label]) => label === forgeKey);
        if (entry) result[entry[0]] = val;
      }
    }
  }
  return result as Record<Keyword, number>;
}

export const ALL_KEYWORDS: Keyword[] = [
  "charge", "taunt", "divine_shield", "ranged",
  "raid", "loyaute", "ancre", "resistance", "premiere_frappe", "berserk",
  "convocations_multiples",
  // NOTE: "vol" is a legacy duplicate of "ranged" (both = "Vol" 🦅, treated
  // identically in combat). The forge emits "ranged" and every card uses it
  // (0 cards use "vol"), so "vol" is intentionally omitted from this list to
  // avoid a duplicate "Vol" entry in keyword pickers/filters. Its label, symbol
  // and engine handling are kept below as a harmless alias for safety.
  "precision", "drain_de_vie", "esquive", "poison", "celerite",
  "augure", "benediction", "bravoure", "pillage", "riposte",
  "rappel", "combustion",
  "terreur", "armure", "commandement", "fureur", "double_attaque", "invisible",
  "canalisation", "contresort", "convocation", "convocation_simple", "malediction", "necrophagie", "richesse", "sacrifice_demoniaque",
  "paralysie", "permutation", "persecution", "pietinement",
  "catalyse", "ombre_du_passe", "profanation", "prescience", "suprematie", "divination", "savant",
  "liaison_de_vie", "ombre", "sacrifice", "malefice",
  "indestructible", "regeneration", "corruption",
  "carnage", "heritage", "mimique", "metamorphose", "tactique",
  "exhumation", "heritage_du_cimetiere",
  "traque_du_destin", "sang_mele", "fierte_du_clan", "solidarite", "lycanthropie", "entraide",
  "cycle_eternel", "martyr", "instinct_de_meute", "totem", "appel_du_clan", "appel_supreme", "rassemblement",
  "pacte_de_sang", "souffle_de_feu", "domination", "resurrection", "transcendance",
  "vampirisme",
  "selection",
  "selection_magique",
  "renfort_royal",
  "relancer",
  "tempete",
  "cataclysme",
  "affaiblissement",
  "renforcement",
  "impact",
  "douleur",
  "pauvrete",
  "inspiration",
  "concentration",
  "remontee",
  "renforcement_multiple",
  "entrainement",
  "declenchement",
];

export const KEYWORD_LABELS: Record<Keyword, string> = {
  charge: "Traque", taunt: "Provocation", divine_shield: "Bouclier", ranged: "Vol",
  raid: "Raid", convocations_multiples: "Convocations multiples", loyaute: "Loyauté", ancre: "Ancré", resistance: "Résistance X", premiere_frappe: "Première Frappe",
  berserk: "Berserk", vol: "Vol", precision: "Précision", drain_de_vie: "Drain de vie", esquive: "Esquive",
  poison: "Poison", celerite: "Célérité",
  augure: "Augure", benediction: "Bénédiction", bravoure: "Bravoure",
  pillage: "Pillage X", riposte: "Riposte X",
  rappel: "Rappel", combustion: "Combustion",
  terreur: "Terreur", pauvrete: "Pauvreté X", armure: "Armure",
  commandement: "Commandement", fureur: "Fureur", double_attaque: "Double Attaque", invisible: "Invisible",
  canalisation: "Canalisation", contresort: "Contresort", convocation: "Convocation X",
  convocation_simple: "Convocation",
  malediction: "Malédiction", necrophagie: "Nécrophagie", richesse: "Richesse X", sacrifice_demoniaque: "Sacrifice démoniaque X",
  paralysie: "Paralysie", permutation: "Permutation", persecution: "Persécution X",
  pietinement: "Piétinement",
  catalyse: "Catalyse", ombre_du_passe: "Ombre du passé", profanation: "Profanation X",
  prescience: "Prescience X", suprematie: "Suprématie", divination: "Divination",
  savant: "Savant",
  liaison_de_vie: "Liaison de vie", ombre: "Ombre", sacrifice: "Sacrifice", malefice: "Maléfice",
  indestructible: "Indestructible", regeneration: "Régénération", corruption: "Corruption",
  carnage: "Carnage X", heritage: "Héritage X", mimique: "Mimique",
  metamorphose: "Métamorphose", dedoublement: "Dédoublement", tactique: "Tactique X",
  exhumation: "Exhumation X", heritage_du_cimetiere: "Héritage du cimetière",
  pacte_de_sang: "Pacte de sang", souffle_de_feu: "Souffle de feu X", domination: "Domination",
  resurrection: "Résurrection", transcendance: "Transcendance",
  vampirisme: "Vampirisme X",
  traque_du_destin: "Traque du destin X", sang_mele: "Sang mêlé",
  fierte_du_clan: "Fierté du clan", solidarite: "Solidarité X", entraide: "Entraide",
  cycle_eternel: "Cycle éternel", martyr: "Martyr",
  instinct_de_meute: "Instinct de meute X", totem: "Totem",
  appel_du_clan: "Appel du clan X", appel_supreme: "Appel Suprême", rassemblement: "Rassemblement X",
  selection: "Sélection X",
  selection_magique: "Sélection magique X",
  renfort_royal: "Sélection Royale X",
  lycanthropie: "Lycanthropie X",
  relancer: "Relancer X",
  tempete: "Tempête X",
  cataclysme: "Cataclysme X",
  affaiblissement: "Affaiblissement -X/-Y",
  renforcement: "Renforcement +X/+Y",
  impact: "Impact X",
  douleur: "Douleur X",
  inspiration: "Inspiration X",
  concentration: "Concentration X",
  remontee: "Remontée",
  renforcement_multiple: "Renforcement multiple",
  entrainement: "Entrainement X",
  conferer: "Conférer",
  declenchement: "Déclenchement",
};

/**
 * Libellé d'AFFICHAGE localisé d'un mot-clé, keyé par l'id moteur snake_case
 * (le même que `card.keywords` / `buildKeywordDisplayEntries`). Avec un
 * traducteur, tente `vocab.keywords.{id}.label` ; sinon (ou clé absente)
 * retombe sur le français source `KEYWORD_LABELS`.
 *
 * ⚠️ NE PAS confondre avec `KEYWORD_LABELS`, qui reste la source FR
 * *load-bearing* pour le parser (`parseXValuesFromEffectText`,
 * `cleanEffectText`). Ces parsers comparent des labels FR et NE doivent PAS
 * être localisés — utilisez ce helper uniquement pour le rendu à l'écran.
 */
export function getKeywordDisplayLabel(kw: Keyword, t?: SafeT): string {
  return t?.(`vocab.keywords.${kw}.label`) ?? KEYWORD_LABELS[kw] ?? kw;
}

export const KEYWORD_SYMBOLS: Record<Keyword, string> = {
  charge: "⚡", taunt: "🎯", divine_shield: "🔰", ranged: "🦅",
  raid: "⚔️", convocations_multiples: "📣📣", loyaute: "🤝", ancre: "⚓", resistance: "🛡️", premiere_frappe: "🗡️",
  berserk: "😤", vol: "🦅", precision: "🏹", drain_de_vie: "🩸", esquive: "💨",
  poison: "☠️", celerite: "💫",
  augure: "/icons/augure.png", benediction: "✝️", bravoure: "🦁",
  pillage: "💰", riposte: "↩️",
  rappel: "🔄", combustion: "🔥",
  terreur: "👁️", pauvrete: "📉", armure: "/icons/armure.png",
  commandement: "👑", fureur: "💢", double_attaque: "⚔️", invisible: "👻",
  canalisation: "🔮", contresort: "🚫", convocation: "📣",
  convocation_simple: "📯",
  malediction: "💀", necrophagie: "🦴", richesse: "🤑", sacrifice_demoniaque: "👹",
  paralysie: "⛓️", permutation: "🔀", persecution: "🩻", pietinement: "🐾",
  catalyse: "⚗️", ombre_du_passe: "👤", profanation: "⚰️",
  prescience: "🃏", suprematie: "👊", divination: "🔍",
  savant: "📚",
  liaison_de_vie: "🔗", ombre: "🌑", sacrifice: "💔", malefice: "🕯️",
  indestructible: "♾️", regeneration: "💚", corruption: "🖤",
  carnage: "💥", heritage: "📜", mimique: "🪞",
  metamorphose: "🦎", dedoublement: "👯", tactique: "📋",
  exhumation: "🪦", heritage_du_cimetiere: "🏚️",
  pacte_de_sang: "🩸", souffle_de_feu: "🐲", domination: "👁️‍🗨️",
  resurrection: "✨", transcendance: "🌟",
  vampirisme: "🧛",
  traque_du_destin: "🔮", sang_mele: "🧬",
  fierte_du_clan: "🏰", solidarite: "🤜", entraide: "🤝",
  cycle_eternel: "♻️", martyr: "⚱️",
  instinct_de_meute: "🐺", totem: "🗿",
  appel_du_clan: "📯", appel_supreme: "🎺", rassemblement: "🏴",
  selection: "🎴",
  selection_magique: "🪄",
  renfort_royal: "👑",
  lycanthropie: "🐺",
  relancer: "🔁",
  tempete: "🌩️",
  cataclysme: "☄️",
  affaiblissement: "🔻",
  renforcement: "⬆️",
  impact: "💥",
  douleur: "🤕",
  inspiration: "📖",
  concentration: "🎯",
  entrainement: "🏋️",
  remontee: "🔼",
  renforcement_multiple: "⏫",
  conferer: "✋",
  declenchement: "🔂",
};
