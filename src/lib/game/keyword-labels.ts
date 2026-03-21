import type { Keyword } from "./types";

export const ALL_KEYWORDS: Keyword[] = [
  "charge", "taunt", "divine_shield", "ranged",
  "loyaute", "ancre", "resistance", "premier_frappe", "berserk",
  "precision", "drain_de_vie", "esquive", "poison", "celerite",
  "terreur", "armure", "commandement", "fureur", "double_attaque", "invisible",
  "liaison_de_vie", "ombre", "sacrifice", "malefice",
  "indestructible", "regeneration", "corruption",
  "pacte_de_sang", "souffle_de_feu", "domination", "resurrection", "transcendance",
];

export const KEYWORD_LABELS: Record<Keyword, string> = {
  charge: "Traque", taunt: "Provocation", divine_shield: "Bouclier", ranged: "Vol",
  loyaute: "Loyauté", ancre: "Ancré", resistance: "Résistance", premier_frappe: "Premier Frappe",
  berserk: "Berserk", precision: "Précision", drain_de_vie: "Drain de vie", esquive: "Esquive",
  poison: "Poison", celerite: "Célérité", terreur: "Terreur", armure: "Armure",
  commandement: "Commandement", fureur: "Fureur", double_attaque: "Double Attaque", invisible: "Invisible",
  liaison_de_vie: "Liaison de vie", ombre: "Ombre", sacrifice: "Sacrifice", malefice: "Maléfice",
  indestructible: "Indestructible", regeneration: "Régénération", corruption: "Corruption",
  pacte_de_sang: "Pacte de sang", souffle_de_feu: "Souffle de feu", domination: "Domination",
  resurrection: "Résurrection", transcendance: "Transcendance",
};

export const KEYWORD_SYMBOLS: Record<Keyword, string> = {
  charge: "⚡", taunt: "🎯", divine_shield: "🔰", ranged: "🦅",
  loyaute: "🤝", ancre: "⚓", resistance: "🛡️", premier_frappe: "🗡️",
  berserk: "😤", precision: "🎯", drain_de_vie: "🩸", esquive: "💨",
  poison: "☠️", celerite: "⚡", terreur: "👁️", armure: "🛡️",
  commandement: "👑", fureur: "🔥", double_attaque: "⚔️", invisible: "👻",
  liaison_de_vie: "💀", ombre: "🌑", sacrifice: "💔", malefice: "🔮",
  indestructible: "♾️", regeneration: "💚", corruption: "🖤",
  pacte_de_sang: "🩸", souffle_de_feu: "🐲", domination: "👁️‍🗨️",
  resurrection: "✨", transcendance: "🌟",
};
