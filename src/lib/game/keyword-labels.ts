import type { Keyword, SpellKeywordInstance } from "./types";
import { SPELL_KEYWORDS } from "./spell-keywords";

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
  "vol", "precision", "drain_de_vie", "esquive", "poison", "celerite",
  "augure", "benediction", "bravoure", "pillage", "riposte",
  "rappel", "combustion",
  "terreur", "armure", "commandement", "fureur", "double_attaque", "invisible",
  "canalisation", "contresort", "convocation", "malediction", "necrophagie",
  "paralysie", "permutation", "persecution",
  "catalyse", "ombre_du_passe", "profanation", "prescience", "suprematie", "divination",
  "liaison_de_vie", "ombre", "sacrifice", "malefice",
  "indestructible", "regeneration", "corruption",
  "carnage", "heritage", "mimique", "metamorphose", "tactique",
  "exhumation", "heritage_du_cimetiere",
  "traque_du_destin", "sang_mele", "fierte_du_clan", "solidarite", "lycanthropie",
  "cycle_eternel", "martyr", "instinct_de_meute", "totem", "appel_du_clan", "rassemblement",
  "pacte_de_sang", "souffle_de_feu", "domination", "resurrection", "transcendance",
  "vampirisme",
  "selection",
  "relancer",
];

export const KEYWORD_LABELS: Record<Keyword, string> = {
  charge: "Traque", taunt: "Provocation", divine_shield: "Bouclier", ranged: "Vol",
  raid: "Raid", convocations_multiples: "Convocations multiples", loyaute: "Loyauté", ancre: "Ancré", resistance: "Résistance X", premiere_frappe: "Première Frappe",
  berserk: "Berserk", vol: "Vol", precision: "Précision", drain_de_vie: "Drain de vie", esquive: "Esquive",
  poison: "Poison", celerite: "Célérité",
  augure: "Augure", benediction: "Bénédiction", bravoure: "Bravoure",
  pillage: "Pillage", riposte: "Riposte X",
  rappel: "Rappel", combustion: "Combustion",
  terreur: "Terreur", armure: "Armure",
  commandement: "Commandement", fureur: "Fureur", double_attaque: "Double Attaque", invisible: "Invisible",
  canalisation: "Canalisation", contresort: "Contresort", convocation: "Convocation X",
  malediction: "Malédiction", necrophagie: "Nécrophagie",
  paralysie: "Paralysie", permutation: "Permutation", persecution: "Persécution X",
  catalyse: "Catalyse", ombre_du_passe: "Ombre du passé", profanation: "Profanation X",
  prescience: "Prescience X", suprematie: "Suprématie", divination: "Divination",
  liaison_de_vie: "Liaison de vie", ombre: "Ombre", sacrifice: "Sacrifice", malefice: "Maléfice",
  indestructible: "Indestructible", regeneration: "Régénération", corruption: "Corruption",
  carnage: "Carnage X", heritage: "Héritage X", mimique: "Mimique",
  metamorphose: "Métamorphose", tactique: "Tactique X",
  exhumation: "Exhumation X", heritage_du_cimetiere: "Héritage du cimetière",
  pacte_de_sang: "Pacte de sang", souffle_de_feu: "Souffle de feu X", domination: "Domination",
  resurrection: "Résurrection", transcendance: "Transcendance",
  vampirisme: "Vampirisme X",
  traque_du_destin: "Traque du destin X", sang_mele: "Sang mêlé",
  fierte_du_clan: "Fierté du clan", solidarite: "Solidarité X",
  cycle_eternel: "Cycle éternel", martyr: "Martyr",
  instinct_de_meute: "Instinct de meute X", totem: "Totem",
  appel_du_clan: "Appel du clan X", rassemblement: "Rassemblement X",
  selection: "Sélection X",
  lycanthropie: "Lycanthropie X",
  relancer: "Relancer X",
};

export const KEYWORD_SYMBOLS: Record<Keyword, string> = {
  charge: "⚡", taunt: "🎯", divine_shield: "🔰", ranged: "🦅",
  raid: "⚔️", convocations_multiples: "📣📣", loyaute: "🤝", ancre: "⚓", resistance: "🛡️", premiere_frappe: "🗡️",
  berserk: "😤", vol: "🦅", precision: "🏹", drain_de_vie: "🩸", esquive: "💨",
  poison: "☠️", celerite: "💫",
  augure: "📖", benediction: "✝️", bravoure: "🦁",
  pillage: "💰", riposte: "↩️",
  rappel: "🔄", combustion: "🔥",
  terreur: "👁️", armure: "/icons/armure.png",
  commandement: "👑", fureur: "💢", double_attaque: "⚔️", invisible: "👻",
  canalisation: "🔮", contresort: "🚫", convocation: "📣",
  malediction: "💀", necrophagie: "🦴",
  paralysie: "⛓️", permutation: "🔀", persecution: "🩻",
  catalyse: "⚗️", ombre_du_passe: "👤", profanation: "⚰️",
  prescience: "🃏", suprematie: "👊", divination: "🔍",
  liaison_de_vie: "🔗", ombre: "🌑", sacrifice: "💔", malefice: "🕯️",
  indestructible: "♾️", regeneration: "💚", corruption: "🖤",
  carnage: "💥", heritage: "📜", mimique: "🪞",
  metamorphose: "🦎", tactique: "📋",
  exhumation: "🪦", heritage_du_cimetiere: "🏚️",
  pacte_de_sang: "🩸", souffle_de_feu: "🐲", domination: "👁️‍🗨️",
  resurrection: "✨", transcendance: "🌟",
  vampirisme: "🧛",
  traque_du_destin: "🔮", sang_mele: "🧬",
  fierte_du_clan: "🏰", solidarite: "🤜",
  cycle_eternel: "♻️", martyr: "⚱️",
  instinct_de_meute: "🐺", totem: "🗿",
  appel_du_clan: "📯", rassemblement: "🏴",
  selection: "🎴",
  lycanthropie: "🐺",
  relancer: "🔁",
};
