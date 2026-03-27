// ─── RARITIES ────────────────────────────────────────────────────────────────

export const RARITIES = [
  { id: "Commune",     label: "Commune",     code: "C", multiplier: 1.00, color: "#aaaaaa", glow: "#888888", tier: 0 },
  { id: "Peu Commune", label: "Peu Commune", code: "U", multiplier: 1.05, color: "#4caf50", glow: "#43a047", tier: 1 },
  { id: "Rare",        label: "Rare",        code: "R", multiplier: 1.10, color: "#4fc3f7", glow: "#0288d1", tier: 2 },
  { id: "Épique",      label: "Épique",      code: "É", multiplier: 1.15, color: "#ce93d8", glow: "#8e24aa", tier: 3 },
  { id: "Légendaire",  label: "Légendaire",  code: "L", multiplier: 1.20, color: "#ffd54f", glow: "#ffb300", tier: 4 },
];

export const RARITY_MAP = Object.fromEntries(RARITIES.map(r => [r.id, r]));

// ─── KEYWORDS ────────────────────────────────────────────────────────────────
// cost    : points de budget keywords consommés
// se      : stat équivalent (documentation de l'impact)
// minTier : rareté minimale (0=Commune … 4=Légendaire)

export const KEYWORDS: Record<string, { cost: number; se: number; minTier: number; desc: string }> = {
  // Tier 0 — Commune+
  "Loyauté":          { cost:  2, se: 0.5, minTier: 0, desc: "+1 ATK pour chaque allié sur le terrain." },
  "Ancré":            { cost:  2, se: 0.5, minTier: 0, desc: "Ne peut pas être déplacé ou exilé." },
  "Résistance":       { cost:  5, se: 1.0, minTier: 0, desc: "Réduit les dégâts reçus de 1." },
  "Provocation":      { cost:  5, se: 1.0, minTier: 0, desc: "Les ennemis doivent attaquer cette unité en priorité." },
  "Traque":           { cost:  5, se: 1.0, minTier: 0, desc: "Peut attaquer dès son invocation." },
  "Premier Frappe":   { cost:  7, se: 1.5, minTier: 0, desc: "Attaque avant les autres unités au combat." },
  "Berserk":          { cost:  7, se: 1.5, minTier: 0, desc: "+2 ATK lorsque les PV sont inférieurs à 50%." },
  "Bouclier":         { cost:  7, se: 1.5, minTier: 0, desc: "Absorbe une première attaque sans dégâts." },
  // Tier 1 — Peu Commune+
  "Précision":        { cost:  7, se: 1.5, minTier: 1, desc: "Ignore la Résistance et l'Armure." },
  "Drain de vie":     { cost:  9, se: 2.0, minTier: 1, desc: "Soigne votre héros des dégâts infligés." },
  "Esquive":          { cost:  9, se: 2.0, minTier: 1, desc: "30% de chance d'éviter une attaque." },
  "Poison":           { cost:  9, se: 2.0, minTier: 1, desc: "Les unités blessées perdent 1 PV par tour." },
  "Célérité":         { cost: 11, se: 2.5, minTier: 1, desc: "Peut attaquer deux fois par tour." },
  // Tier 2 — Rare+
  "Terreur":          { cost: 11, se: 2.5, minTier: 2, desc: "Les unités adverses perdent 1 ATK en présence de cette carte." },
  "Vol":              { cost:  7, se: 1.5, minTier: 1, desc: "Ignore les provocations adverses qui n'ont pas Vol." },
  "Armure":           { cost: 11, se: 2.5, minTier: 2, desc: "Réduit tous les dégâts reçus de 2." },
  "Commandement":     { cost: 13, se: 3.0, minTier: 2, desc: "Les alliés de même faction gagnent +1/+1." },
  "Fureur":           { cost: 13, se: 3.0, minTier: 2, desc: "+3 ATK pendant un tour après avoir subi des dégâts." },
  "Double Attaque":   { cost: 16, se: 3.5, minTier: 2, desc: "Attaque deux cibles différentes par tour." },
  "Invisible":        { cost: 16, se: 3.5, minTier: 2, desc: "Ne peut pas être ciblé par des sorts adverses." },
  // Tier 3 — Épique+
  "Liaison de vie":   { cost: 16, se: 3.5, minTier: 3, desc: "Partage les dégâts subis avec le héros adverse." },
  "Ombre":            { cost: 18, se: 4.0, minTier: 3, desc: "Attaque directement le héros adverse, ignorant les blockers." },
  "Sacrifice":        { cost: 18, se: 4.0, minTier: 3, desc: "Détruisez un allié pour doubler l'ATK pendant un tour." },
  "Maléfice":         { cost: 18, se: 4.0, minTier: 3, desc: "À la mort, inflige 3 dégâts à tous les ennemis." },
  "Indestructible":   { cost: 18, se: 4.0, minTier: 3, desc: "Survit à une mort avec 1 PV restant." },
  "Régénération":     { cost: 20, se: 4.5, minTier: 3, desc: "Récupère 2 PV au début de chaque tour." },
  "Corruption":       { cost: 20, se: 4.5, minTier: 3, desc: "Convertit une unité ennemie de ≤3 ATK à votre camp." },
  // Tier 4 — Légendaire uniquement
  "Pacte de sang":    { cost: 25, se: 5.5, minTier: 4, desc: "Quand cette unité meurt, invoque une copie à 0 mana." },
  "Souffle de feu":   { cost: 25, se: 5.5, minTier: 4, desc: "Inflige 4 dégâts à toutes les unités ennemies lors de l'attaque." },
  "Domination":       { cost: 27, se: 6.0, minTier: 4, desc: "Prend le contrôle d'une unité ennemie au hasard à son invocation." },
  "Résurrection":     { cost: 29, se: 6.5, minTier: 4, desc: "Revient en jeu une fois après sa mort avec la moitié de ses PV." },
  "Transcendance":    { cost: 32, se: 7.0, minTier: 4, desc: "Immunité totale aux sorts adverses pendant 2 tours." },
};

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
    races: ["Elfes", "Aigles Géants"],
    clans: { names: ["Sylvains", "Hauts-Elfes", "Elfes des Mers"], appliesTo: "Elfes" },
    statWeights: { atk: 1.10, def: 0.80 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.60, "Esquive": 0.55, "Précision": 0.50, "Invisible": 0.40, "Premier Frappe": 0.45, "Drain de vie": 0.30, "Vol": 0.20 },
    forbiddenKeywords: ["Armure", "Ancré", "Provocation", "Berserk"],
    description: "Agiles et furtifs. Favorisent la vitesse et l'esquive. Aigles géants parmi leurs rangs.",
    raceProfiles: {
      "Aigles Géants": { statWeights: { atk: 1.20, def: 0.70 }, likelyKeywords: { "Vol": 0.90, "Traque": 0.60, "Premier Frappe": 0.50 } },
    },
  },
  Nains: {
    color: "#b87333", accent: "#ff9f43", emoji: "⚒️", bg: "#2a1a0a", alignment: "bon",
    races: ["Nains", "Golems"],
    clans: { names: ["Montagnes", "Collines", "Lave"], appliesTo: "Nains" },
    statWeights: { atk: 0.85, def: 1.40 },
    guaranteedKeywords: [],
    likelyKeywords: { "Armure": 0.70, "Résistance": 0.65, "Bouclier": 0.50, "Ancré": 0.45, "Berserk": 0.35, "Provocation": 0.40 },
    forbiddenKeywords: ["Vol", "Invisible", "Esquive", "Ombre", "Traque"],
    description: "Solides et résistants. Favorisent la défense et la ténacité.",
    raceProfiles: {
      "Golems": { statWeights: { atk: 0.90, def: 1.60 }, likelyKeywords: { "Ancré": 0.80, "Armure": 0.75, "Provocation": 0.60, "Indestructible": 0.30 } },
    },
  },
  Hobbits: {
    color: "#8B6914", accent: "#DAA520", emoji: "🍃", bg: "#1a1508", alignment: "bon",
    races: ["Hobbits", "Hommes-Arbres"],
    clans: { names: ["Plaines", "Rivièrains", "Landes"], appliesTo: "Hobbits" },
    statWeights: { atk: 0.80, def: 0.90 },
    guaranteedKeywords: [],
    likelyKeywords: { "Esquive": 0.65, "Loyauté": 0.60, "Traque": 0.45, "Invisible": 0.50, "Résistance": 0.35, "Ancré": 0.40 },
    forbiddenKeywords: ["Terreur", "Corruption", "Domination", "Sacrifice", "Maléfice"],
    description: "Petits mais rusés. Esquive et entraide.",
    subType: { threshold: 6, name: "Homme-Arbre", emoji: "🌳", descOverride: "Homme-arbre allié des Hobbits. Colosse végétal, lent mais dévastateur et protecteur." },
    raceProfiles: {
      "Hommes-Arbres": { statWeights: { atk: 0.90, def: 1.50 }, likelyKeywords: { "Provocation": 0.60, "Ancré": 0.55, "Régénération": 0.40 } },
    },
  },
  Humains: {
    color: "#2c5f8a", accent: "#74b9ff", emoji: "⚔️", bg: "#0a0f2a", alignment: "neutre",
    races: ["Humains"],
    clans: { names: ["Nordiques", "Orientaux", "Templiers"], appliesTo: "all" },
    statWeights: { atk: 1.00, def: 1.00 },
    guaranteedKeywords: [],
    likelyKeywords: { "Commandement": 0.55, "Loyauté": 0.60, "Bouclier": 0.45, "Premier Frappe": 0.40, "Provocation": 0.35 },
    forbiddenKeywords: ["Poison", "Corruption", "Maléfice", "Pacte de sang"],
    description: "Équilibrés et polyvalents. Synergies de groupe.",
  },
  "Hommes-Bêtes": {
    color: "#7B5B3A", accent: "#CD853F", emoji: "🐺", bg: "#1a1008", alignment: "neutre",
    races: ["Hommes-Loups", "Hommes-Ours", "Hommes-Félins", "Centaures"],
    clans: { names: ["Forêt", "Toundra", "Savane"], appliesTo: "all" },
    statWeights: { atk: 1.20, def: 1.00 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.65, "Berserk": 0.60, "Fureur": 0.55, "Premier Frappe": 0.45, "Régénération": 0.40, "Esquive": 0.35, "Vol": 0.20 },
    forbiddenKeywords: ["Armure", "Commandement", "Invisible", "Ancré"],
    description: "Sauvages et féroces. Attaquent vite, régénèrent, entrent en rage.",
  },
  "Élémentaires": {
    color: "#E67E22", accent: "#F39C12", emoji: "🌀", bg: "#1a1008", alignment: "neutre",
    races: ["Feu", "Terre", "Eau", "Air/Tempête"],
    statWeights: { atk: 1.10, def: 1.10 },
    guaranteedKeywords: [],
    likelyKeywords: { "Fureur": 0.40, "Résistance": 0.40, "Régénération": 0.35, "Esquive": 0.35 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier"],
    description: "Forces primordiales de la nature. Chaque élément a son propre style de combat.",
    raceProfiles: {
      "Feu": { statWeights: { atk: 1.40, def: 0.75 }, likelyKeywords: { "Fureur": 0.70, "Souffle de feu": 0.60, "Berserk": 0.50, "Sacrifice": 0.35 } },
      "Terre": { statWeights: { atk: 0.85, def: 1.50 }, likelyKeywords: { "Provocation": 0.70, "Armure": 0.65, "Ancré": 0.60, "Résistance": 0.55, "Indestructible": 0.30 } },
      "Eau": { statWeights: { atk: 0.90, def: 1.10 }, likelyKeywords: { "Régénération": 0.65, "Drain de vie": 0.55, "Esquive": 0.50, "Résistance": 0.40 } },
      "Air/Tempête": { statWeights: { atk: 1.15, def: 0.85 }, likelyKeywords: { "Vol": 0.80, "Traque": 0.65, "Célérité": 0.50, "Esquive": 0.45, "Premier Frappe": 0.40 } },
    },
  },
  Mercenaires: {
    color: "#8B8B00", accent: "#D4D400", emoji: "💰", bg: "#1a1a08", alignment: "spéciale",
    races: ["Géants", "Ogres", "Dragons"],
    statWeights: { atk: 1.05, def: 1.05 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.40, "Premier Frappe": 0.40, "Précision": 0.35, "Esquive": 0.30, "Berserk": 0.30, "Bouclier": 0.25, "Fureur": 0.25, "Vol": 0.15 },
    forbiddenKeywords: ["Commandement", "Loyauté", "Domination", "Corruption"],
    description: "Soldats de fortune sans allégeance. Polyvalents et disponibles pour tous les decks.",
    raceProfiles: {
      "Géants": { statWeights: { atk: 1.15, def: 1.30 }, likelyKeywords: { "Provocation": 0.65, "Résistance": 0.60, "Armure": 0.55, "Indestructible": 0.45, "Terreur": 0.40 } },
      "Ogres": { statWeights: { atk: 1.25, def: 1.10 }, likelyKeywords: { "Berserk": 0.55, "Fureur": 0.50, "Provocation": 0.40, "Résistance": 0.35 } },
      "Dragons": { statWeights: { atk: 1.40, def: 0.90 }, likelyKeywords: { "Vol": 0.90, "Souffle de feu": 0.70, "Terreur": 0.60, "Fureur": 0.50, "Indestructible": 0.40, "Transcendance": 0.35 } },
    },
  },
  Orcs: {
    color: "#4A7A2E", accent: "#7FFF00", emoji: "🗡️", bg: "#0f1a08", alignment: "maléfique",
    races: ["Orcs", "Gobelins", "Trolls", "Wargs"],
    clans: { names: ["Plaines", "Marais", "Montagnes"], appliesTo: "all" },
    statWeights: { atk: 1.25, def: 0.85 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.60, "Berserk": 0.55, "Fureur": 0.50, "Sacrifice": 0.45, "Loyauté": 0.40, "Célérité": 0.35, "Double Attaque": 0.30, "Vol": 0.15 },
    forbiddenKeywords: ["Invisible", "Armure", "Régénération", "Transcendance"],
    description: "Horde brutale. Gobelins rapides et sacrifiables. Orcs brutes et agressifs. Trolls résistants. Wargs rapides.",
    subType: { threshold: 3, name: "Orc", emoji: "💪", lowName: "Gobelin", lowEmoji: "👺" },
  },
  "Morts-Vivants": {
    color: "#6c3483", accent: "#a29bfe", emoji: "💀", bg: "#1a0a2a", alignment: "maléfique",
    races: ["Squelettes", "Zombies", "Spectres", "Vampires", "Lich", "Banshees"],
    statWeights: { atk: 1.05, def: 0.95 },
    guaranteedKeywords: [],
    likelyKeywords: { "Poison": 0.65, "Drain de vie": 0.60, "Terreur": 0.55, "Maléfice": 0.50, "Régénération": 0.45, "Résurrection": 0.40, "Liaison de vie": 0.35, "Vol": 0.15 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier"],
    description: "Insatiables et corrompus. Résurrection et drain de vie.",
  },
  "Elfes Noirs": {
    color: "#4A0E4E", accent: "#9B59B6", emoji: "🔮", bg: "#150520", alignment: "maléfique",
    races: ["Elfes Corrompus", "Araignées Géantes", "Démons"],
    clans: { names: ["Abysses souterrains", "Forêt maudite", "Cités de cendres"], appliesTo: "all" },
    statWeights: { atk: 1.15, def: 0.85 },
    guaranteedKeywords: [],
    likelyKeywords: { "Poison": 0.65, "Invisible": 0.55, "Ombre": 0.50, "Corruption": 0.50, "Maléfice": 0.45, "Drain de vie": 0.40, "Précision": 0.35 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier", "Provocation"],
    description: "Sournois et venimeux. Poison, ombre et corruption.",
    raceProfiles: {
      "Démons": { statWeights: { atk: 1.35, def: 0.80 }, likelyKeywords: { "Fureur": 0.65, "Sacrifice": 0.55, "Terreur": 0.50, "Ombre": 0.45, "Vol": 0.30 } },
      "Araignées Géantes": { statWeights: { atk: 1.10, def: 0.90 }, likelyKeywords: { "Poison": 0.75, "Esquive": 0.50, "Invisible": 0.45 } },
    },
  },
};

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
