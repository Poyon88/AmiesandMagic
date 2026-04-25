// ─── RARITIES ────────────────────────────────────────────────────────────────

export const RARITIES = [
  { id: "Commune",     label: "Commune",     code: "C", multiplier: 1.00, color: "#aaaaaa", glow: "#888888", tier: 0 },
  { id: "Peu Commune", label: "Peu Commune", code: "U", multiplier: 1.05, color: "#4caf50", glow: "#43a047", tier: 1 },
  { id: "Rare",        label: "Rare",        code: "R", multiplier: 1.10, color: "#4fc3f7", glow: "#0288d1", tier: 2 },
  { id: "Épique",      label: "Épique",      code: "É", multiplier: 1.15, color: "#ce93d8", glow: "#8e24aa", tier: 3 },
  { id: "Légendaire",  label: "Légendaire",  code: "L", multiplier: 1.20, color: "#ffd54f", glow: "#ffb300", tier: 4 },
];

export const RARITY_MAP = Object.fromEntries(RARITIES.map(r => [r.id, r]));

// Nombre d'exemplaires par rareté pour les séries limitées (cartes forgées avec date)
export const LIMITED_PRINT_COUNTS: Record<string, number> = {
  "Légendaire": 1,
  "Épique": 10,
  "Rare": 100,
  "Peu Commune": 1000,
};

// ─── KEYWORDS ────────────────────────────────────────────────────────────────
// Single source of truth lives in `src/lib/game/abilities.ts` (unified
// registry shared with spell keywords). The map below is re-exported under
// the legacy KEYWORDS name so engine code (`hasKw`, balance calc) keeps
// working unchanged.

export type { KeywordZone } from "@/lib/game/abilities";
export { KEYWORDS } from "@/lib/game/abilities";

// ─── FACTIONS ────────────────────────────────────────────────────────────────

export interface FactionSubType {
  threshold: number;       // mana >= threshold → sous-type haut
  name?: string;           // nom du sous-type haut (ex: "Homme-arbre", "Orc")
  emoji?: string;          // emoji du sous-type haut
  descOverride?: string;   // description pour le prompt IA
  lowName?: string;        // nom du sous-type bas (ex: "Gobelin")
  lowEmoji?: string;       // emoji du sous-type bas
}

export type Alignment = "bon" | "neutre" | "maléfique" | "spéciale";

export interface FactionClan {
  names: string[];
  appliesTo: string | "all"; // race name or "all" for transversal clans
}

export const FACTIONS: Record<string, {
  color: string; accent: string; emoji: string; bg: string;
  alignment: Alignment;
  races: string[];
  clans?: FactionClan;
  statWeights: { atk: number; def: number };
  guaranteedKeywords: string[];
  likelyKeywords: Record<string, number>;
  forbiddenKeywords: string[];
  description: string;
  subType?: FactionSubType;
  raceProfiles?: Record<string, { statWeights: { atk: number; def: number }; likelyKeywords?: Record<string, number> }>;
}> = {
  Elfes: {
    color: "#3a7d44", accent: "#55efc4", emoji: "🌿", bg: "#0a1f0a", alignment: "bon",
    races: ["Elfes", "Aigles Géants", "Fées"],
    clans: { names: ["Sylvains", "Hauts-Elfes", "Elfes des Mers"], appliesTo: "Elfes" },
    statWeights: { atk: 1.10, def: 0.80 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.60, "Esquive": 0.55, "Précision": 0.50, "Invisible": 0.40, "Première Frappe": 0.45, "Drain de vie": 0.30, "Vol": 0.20,
      "Augure": 0.40, "Canalisation": 0.40, "Catalyse": 0.40, "Divination": 0.45, "Prescience X": 0.35, "Suprématie": 0.40, "Contresort": 0.35, "Héritage X": 0.25, "Tactique X": 0.30 },
    forbiddenKeywords: ["Armure", "Ancré", "Provocation", "Berserk", "Nécrophagie", "Pillage", "Carnage X"],
    description: "Agiles et furtifs. Favorisent la vitesse et l'esquive. Aigles géants parmi leurs rangs.",
    raceProfiles: {
      "Aigles Géants": { statWeights: { atk: 1.20, def: 0.70 }, likelyKeywords: { "Vol": 0.90, "Traque": 0.60, "Première Frappe": 0.50, "Augure": 0.40 } },
      "Fées": { statWeights: { atk: 0.75, def: 0.65 }, likelyKeywords: { "Vol": 0.85, "Invisible": 0.70, "Esquive": 0.65, "Augure": 0.55, "Divination": 0.50, "Canalisation": 0.60, "Drain de vie": 0.45, "Contresort": 0.40, "Héritage X": 0.35 } },
    },
  },
  Nains: {
    color: "#b87333", accent: "#ff9f43", emoji: "⚒️", bg: "#2a1a0a", alignment: "bon",
    races: ["Nains", "Golems"],
    clans: { names: ["Montagnes", "Collines", "Lave"], appliesTo: "Nains" },
    statWeights: { atk: 0.85, def: 1.40 },
    guaranteedKeywords: [],
    likelyKeywords: { "Armure": 0.70, "Résistance X": 0.65, "Bouclier": 0.50, "Ancré": 0.45, "Berserk": 0.35, "Provocation": 0.40,
      "Riposte X": 0.50, "Bravoure": 0.40, "Catalyse": 0.40, "Tactique X": 0.25 },
    forbiddenKeywords: ["Vol", "Invisible", "Esquive", "Ombre", "Traque", "Pillage"],
    description: "Solides et résistants. Favorisent la défense et la ténacité.",
    raceProfiles: {
      "Golems": { statWeights: { atk: 0.90, def: 1.60 }, likelyKeywords: { "Ancré": 0.80, "Armure": 0.75, "Provocation": 0.60, "Indestructible": 0.30, "Riposte X": 0.45 } },
    },
  },
  Hobbits: {
    color: "#8B6914", accent: "#DAA520", emoji: "🍃", bg: "#1a1508", alignment: "bon",
    races: ["Hobbits", "Hommes-Arbres"],
    clans: { names: ["Plaines", "Rivièrains", "Landes"], appliesTo: "Hobbits" },
    statWeights: { atk: 0.80, def: 0.90 },
    guaranteedKeywords: [],
    likelyKeywords: { "Esquive": 0.65, "Loyauté": 0.60, "Traque": 0.45, "Invisible": 0.50, "Résistance X": 0.35, "Ancré": 0.40,
      "Bravoure": 0.45, "Bénédiction": 0.40, "Divination": 0.30, "Héritage X": 0.30, "Combustion": 0.25 },
    forbiddenKeywords: ["Terreur", "Corruption", "Domination", "Sacrifice", "Maléfice", "Nécrophagie", "Pillage", "Carnage X"],
    description: "Petits mais rusés. Esquive et entraide.",
    subType: { threshold: 6, name: "Homme-Arbre", emoji: "🌳", descOverride: "Homme-arbre allié des Hobbits. Colosse végétal, lent mais dévastateur et protecteur." },
    raceProfiles: {
      "Hommes-Arbres": { statWeights: { atk: 0.90, def: 1.50 }, likelyKeywords: { "Provocation": 0.60, "Ancré": 0.55, "Régénération": 0.40, "Riposte X": 0.35 } },
    },
  },
  Humains: {
    color: "#2c5f8a", accent: "#74b9ff", emoji: "⚔️", bg: "#0a0f2a", alignment: "neutre",
    races: ["Humains"],
    clans: { names: ["Nordiques", "Orientaux", "Templiers"], appliesTo: "all" },
    statWeights: { atk: 1.00, def: 1.00 },
    guaranteedKeywords: [],
    likelyKeywords: { "Commandement": 0.55, "Loyauté": 0.60, "Bouclier": 0.45, "Première Frappe": 0.40, "Provocation": 0.35,
      "Bravoure": 0.50, "Bénédiction": 0.45, "Augure": 0.35, "Tactique X": 0.40, "Convocation X": 0.35, "Héritage X": 0.35, "Contresort": 0.30, "Divination": 0.35, "Prescience X": 0.30, "Rappel": 0.25 },
    forbiddenKeywords: ["Poison", "Corruption", "Maléfice", "Pacte de sang", "Nécrophagie"],
    description: "Équilibrés et polyvalents. Synergies de groupe.",
  },
  "Hommes-Bêtes": {
    color: "#7B5B3A", accent: "#CD853F", emoji: "🐺", bg: "#1a1008", alignment: "neutre",
    races: ["Hommes-Loups", "Hommes-Ours", "Hommes-Félins", "Centaures"],
    clans: { names: ["Forêt", "Toundra", "Savane"], appliesTo: "all" },
    statWeights: { atk: 1.20, def: 1.00 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.65, "Berserk": 0.60, "Fureur": 0.55, "Première Frappe": 0.45, "Régénération": 0.40, "Esquive": 0.35, "Vol": 0.20,
      "Augure": 0.30, "Bravoure": 0.40, "Combustion": 0.35, "Persécution X": 0.30 },
    forbiddenKeywords: ["Armure", "Commandement", "Invisible", "Ancré", "Canalisation", "Contresort"],
    description: "Sauvages et féroces. Attaquent vite, régénèrent, entrent en rage.",
  },
  "Élémentaires": {
    color: "#E67E22", accent: "#F39C12", emoji: "🌀", bg: "#1a1008", alignment: "neutre",
    races: ["Feu", "Terre", "Eau", "Air/Tempête"],
    statWeights: { atk: 1.10, def: 1.10 },
    guaranteedKeywords: [],
    likelyKeywords: { "Fureur": 0.40, "Résistance X": 0.40, "Régénération": 0.35, "Esquive": 0.35,
      "Canalisation": 0.45, "Permutation": 0.30, "Métamorphose": 0.35, "Mimique": 0.30, "Carnage X": 0.30 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier", "Pillage"],
    description: "Forces primordiales de la nature. Chaque élément a son propre style de combat.",
    raceProfiles: {
      "Feu": { statWeights: { atk: 1.40, def: 0.75 }, likelyKeywords: { "Fureur": 0.70, "Souffle de feu X": 0.60, "Berserk": 0.50, "Sacrifice": 0.35, "Combustion": 0.50, "Carnage X": 0.40 } },
      "Terre": { statWeights: { atk: 0.85, def: 1.50 }, likelyKeywords: { "Provocation": 0.70, "Armure": 0.65, "Ancré": 0.60, "Résistance X": 0.55, "Indestructible": 0.30, "Riposte X": 0.45 } },
      "Eau": { statWeights: { atk: 0.90, def: 1.10 }, likelyKeywords: { "Régénération": 0.65, "Drain de vie": 0.55, "Esquive": 0.50, "Résistance X": 0.40, "Paralysie": 0.50, "Bénédiction": 0.35 } },
      "Air/Tempête": { statWeights: { atk: 1.15, def: 0.85 }, likelyKeywords: { "Vol": 0.80, "Traque": 0.65, "Célérité": 0.50, "Esquive": 0.45, "Première Frappe": 0.40, "Augure": 0.35 } },
    },
  },
  Mercenaires: {
    color: "#8B8B00", accent: "#D4D400", emoji: "💰", bg: "#1a1a08", alignment: "spéciale",
    races: ["Géants", "Ogres", "Dragons", "Chiens", "Phoenix", "Anges", "Ours", "Loups"],
    statWeights: { atk: 1.05, def: 1.05 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.40, "Première Frappe": 0.40, "Précision": 0.35, "Esquive": 0.30, "Berserk": 0.30, "Bouclier": 0.25, "Fureur": 0.25, "Vol": 0.15,
      "Mimique": 0.40, "Métamorphose": 0.40, "Bravoure": 0.30, "Combustion": 0.25 },
    forbiddenKeywords: ["Commandement", "Loyauté", "Domination", "Corruption"],
    description: "Soldats de fortune sans allégeance. Polyvalents et disponibles pour tous les decks.",
    raceProfiles: {
      "Géants": { statWeights: { atk: 1.15, def: 1.30 }, likelyKeywords: { "Provocation": 0.65, "Résistance X": 0.60, "Armure": 0.55, "Indestructible": 0.45, "Terreur": 0.40, "Carnage X": 0.30 } },
      "Ogres": { statWeights: { atk: 1.25, def: 1.10 }, likelyKeywords: { "Berserk": 0.55, "Fureur": 0.50, "Provocation": 0.40, "Résistance X": 0.35, "Pillage": 0.30 } },
      "Dragons": { statWeights: { atk: 1.40, def: 0.90 }, likelyKeywords: { "Vol": 0.90, "Souffle de feu X": 0.70, "Terreur": 0.60, "Fureur": 0.50, "Indestructible": 0.40, "Transcendance": 0.35, "Vampirisme X": 0.25 } },
      "Chiens": { statWeights: { atk: 1.10, def: 0.80 }, likelyKeywords: { "Raid": 0.70, "Traque": 0.55, "Instinct de meute X": 0.60, "Loyauté": 0.50, "Esquive": 0.40, "Berserk": 0.35, "Première Frappe": 0.30 } },
      "Phoenix": { statWeights: { atk: 1.20, def: 0.95 }, likelyKeywords: { "Vol": 0.80, "Résurrection": 0.70, "Souffle de feu X": 0.55, "Régénération": 0.50, "Bouclier": 0.40, "Berserk": 0.35, "Fureur": 0.30, "Cycle éternel": 0.45 } },
      "Anges": { statWeights: { atk: 1.10, def: 1.15 }, likelyKeywords: { "Vol": 0.85, "Bouclier": 0.60, "Bénédiction": 0.55, "Commandement": 0.50, "Première Frappe": 0.45, "Drain de vie": 0.40, "Provocation": 0.35, "Résistance X": 0.30 } },
      "Ours": { statWeights: { atk: 1.20, def: 1.25 }, likelyKeywords: { "Provocation": 0.55, "Berserk": 0.50, "Résistance X": 0.45, "Fureur": 0.40, "Régénération": 0.35, "Lycanthropie X": 0.45 } },
      "Loups": { statWeights: { atk: 1.15, def: 0.90 }, likelyKeywords: { "Traque": 0.60, "Raid": 0.55, "Instinct de meute X": 0.50, "Esquive": 0.40, "Berserk": 0.35, "Lycanthropie X": 0.45 } },
    },
  },
  Orcs: {
    color: "#4A7A2E", accent: "#7FFF00", emoji: "🗡️", bg: "#0f1a08", alignment: "maléfique",
    races: ["Orcs", "Gobelins", "Trolls", "Wargs"],
    clans: { names: ["Plaines", "Marais", "Montagnes"], appliesTo: "all" },
    statWeights: { atk: 1.25, def: 0.85 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.60, "Berserk": 0.55, "Fureur": 0.50, "Sacrifice": 0.45, "Loyauté": 0.40, "Célérité": 0.35, "Double Attaque": 0.30, "Vol": 0.15,
      "Pillage": 0.45, "Convocation X": 0.45, "Combustion": 0.40, "Persécution X": 0.40, "Carnage X": 0.35, "Profanation X": 0.30, "Pacte de sang": 0.30 },
    forbiddenKeywords: ["Invisible", "Armure", "Régénération", "Transcendance", "Canalisation", "Contresort", "Divination"],
    description: "Horde brutale. Gobelins rapides et sacrifiables. Orcs brutes et agressifs. Trolls résistants. Wargs rapides.",
    subType: { threshold: 3, name: "Orc", emoji: "💪", lowName: "Gobelin", lowEmoji: "👺" },
  },
  "Morts-Vivants": {
    color: "#6c3483", accent: "#a29bfe", emoji: "💀", bg: "#1a0a2a", alignment: "maléfique",
    races: ["Squelettes", "Zombies", "Spectres", "Vampires", "Lich", "Banshees"],
    statWeights: { atk: 1.05, def: 0.95 },
    guaranteedKeywords: [],
    likelyKeywords: { "Poison": 0.65, "Drain de vie": 0.60, "Terreur": 0.55, "Maléfice": 0.50, "Régénération": 0.45, "Résurrection": 0.40, "Liaison de vie": 0.35, "Vol": 0.15,
      "Nécrophagie": 0.55, "Rappel": 0.55, "Ombre du passé": 0.50, "Exhumation X": 0.55, "Héritage du cimetière": 0.45, "Profanation X": 0.50, "Vampirisme X": 0.50, "Corruption": 0.30, "Pacte de sang": 0.40, "Convocation X": 0.40, "Domination": 0.30 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier", "Bénédiction", "Bravoure"],
    description: "Insatiables et corrompus. Résurrection et drain de vie.",
  },
  "Elfes Noirs": {
    color: "#4A0E4E", accent: "#9B59B6", emoji: "🔮", bg: "#150520", alignment: "maléfique",
    races: ["Elfes Corrompus", "Araignées Géantes", "Démons"],
    clans: { names: ["Abysses souterrains", "Forêt maudite", "Cités de cendres"], appliesTo: "all" },
    statWeights: { atk: 1.15, def: 0.85 },
    guaranteedKeywords: [],
    likelyKeywords: { "Poison": 0.65, "Invisible": 0.55, "Ombre": 0.50, "Corruption": 0.50, "Maléfice": 0.45, "Drain de vie": 0.40, "Précision": 0.35,
      "Malédiction": 0.50, "Paralysie": 0.40, "Nécrophagie": 0.40, "Pillage": 0.40, "Permutation": 0.40, "Persécution X": 0.35, "Ombre du passé": 0.40, "Exhumation X": 0.35, "Héritage du cimetière": 0.35, "Rappel": 0.40, "Métamorphose": 0.30, "Domination": 0.35, "Vampirisme X": 0.40 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier", "Provocation", "Bénédiction", "Bravoure"],
    description: "Sournois et venimeux. Poison, ombre et corruption.",
    raceProfiles: {
      "Démons": { statWeights: { atk: 1.35, def: 0.80 }, likelyKeywords: { "Fureur": 0.65, "Sacrifice": 0.55, "Terreur": 0.50, "Ombre": 0.45, "Vol": 0.30, "Carnage X": 0.40, "Persécution X": 0.45 } },
      "Araignées Géantes": { statWeights: { atk: 1.10, def: 0.90 }, likelyKeywords: { "Poison": 0.75, "Esquive": 0.50, "Invisible": 0.45 } },
    },
  },
};

// Reverse map race → faction id, derived from FACTIONS. Each race lives in
// exactly one faction so the lookup is unambiguous. Used for tokens, where
// the canonical faction is implied by the chosen race rather than carried
// as a separate stored field.
const RACE_TO_FACTION: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [factionId, def] of Object.entries(FACTIONS)) {
    for (const race of def.races) out[race] = factionId;
  }
  return out;
})();

export function getFactionForRace(race: string | null | undefined): string | null {
  if (!race) return null;
  return RACE_TO_FACTION[race] ?? null;
}

export const TYPES = ["Unité", "Sort", "Artefact", "Magie"];

export const ALIGNMENTS: { id: Alignment; label: string; emoji: string; color: string }[] = [
  { id: "bon", label: "Bon", emoji: "✨", color: "#4caf50" },
  { id: "neutre", label: "Neutre", emoji: "⚖️", color: "#ffd54f" },
  { id: "maléfique", label: "Maléfique", emoji: "💀", color: "#e74c3c" },
  { id: "spéciale", label: "Spéciale", emoji: "💰", color: "#D4D400" },
];

// ─── CALIBRATION ─────────────────────────────────────────────────────────────

// 1 SE ≈ 4.5 pts · ATK légèrement plus chère (valeur tempo)
export const STAT_COST = { atk: 5, def: 4 };
export const MANA_BUDGET_BASE = 10;

// Distribution pondérée du mana — courbe en cloche penchée vers le bas
// Fallback uniquement si aucune rareté n'est spécifiée
export const MANA_WEIGHTS = [
  0.10, 0.16, 0.18, 0.16, 0.14, 0.10, 0.07, 0.05, 0.03, 0.01
];

// Distribution globale des raretés pour le bulk
// Basé sur Hearthstone : ~46% C, 25% R, 15% É, 15% L
// Adapté avec Peu Commune intercalé
//                    C     U     R     É     L
export const RARITY_WEIGHTS_GLOBAL = [0.35, 0.25, 0.20, 0.12, 0.08];

// Distribution du mana par rareté — forge simple
// Basé sur les données réelles d'Hearthstone (7886 cartes analysées)
// Le mana 0 de HS est redistribué dans 1-2 (A&M commence à 1 mana)
// Peu Commune interpolé entre Commune et Rare
//                 1     2     3     4     5     6     7     8     9    10
export const MANA_WEIGHTS_BY_RARITY: Record<string, number[]> = {
  "Commune":     [0.26, 0.25, 0.22, 0.14, 0.06, 0.03, 0.02, 0.01, 0.005, 0.005],
  "Peu Commune": [0.20, 0.23, 0.23, 0.15, 0.08, 0.05, 0.03, 0.02, 0.005, 0.005],
  "Rare":        [0.13, 0.21, 0.24, 0.19, 0.11, 0.06, 0.03, 0.02, 0.005, 0.005],
  "Épique":      [0.08, 0.16, 0.18, 0.16, 0.14, 0.08, 0.07, 0.05, 0.04, 0.04],
  "Légendaire":  [0.05, 0.05, 0.11, 0.13, 0.14, 0.14, 0.14, 0.12, 0.08, 0.04],
};

// Probabilités de rareté par coût de mana [C, U, R, É, L]
export const RARITY_WEIGHTS_BY_MANA = [
  [0.45, 0.30, 0.15, 0.07, 0.03], // 1
  [0.45, 0.30, 0.15, 0.07, 0.03], // 2
  [0.35, 0.28, 0.22, 0.10, 0.05], // 3
  [0.28, 0.28, 0.25, 0.13, 0.06], // 4
  [0.20, 0.24, 0.28, 0.18, 0.10], // 5
  [0.15, 0.22, 0.30, 0.22, 0.11], // 6
  [0.10, 0.17, 0.28, 0.28, 0.17], // 7
  [0.07, 0.15, 0.27, 0.31, 0.20], // 8
  [0.04, 0.10, 0.22, 0.36, 0.28], // 9
  [0.03, 0.08, 0.20, 0.37, 0.32], // 10
];
