import type { SafeT } from "@/i18n/config";

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
export { KEYWORDS, CREATURE_LABEL_TO_ENGINE_ID } from "@/lib/game/abilities";

// FR-label → set of trigger modes that keyword can opt into beyond the
// default on-play. The engine (resolveCuratedKeywordEffect) mirrors this:
// when an admin assigns a mode, the effect is routed to the matching
// pipeline (on-death rattle or tap-activated). Keywords missing from this
// map can only be on-play. Shared by the Forge and the card Editor so both
// surfaces gate the picker identically.
// Les modes "return" (retour en main), "end_of_turn" (fin du tour) et
// "attack" (à l'attaque d'une créature) sont ouverts à TOUS les mots-clés
// curés « à effet », en plus de leurs modes existants. Le moteur
// (engine.ts, boucle du flux d'attaque) exécute n'importe quel mot-clé curé
// en mode "attack" de façon générique ; l'appartenance à ce map est le seul
// verrou côté picker.
type CuratedMode = "death" | "tap" | "return" | "end_of_turn" | "attack";
export const CURATED_KEYWORD_MODES: Record<string, ReadonlySet<CuratedMode>> = {
  "Convocation X": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  "Convocations multiples": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  "Inspiration X": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  "Pillage X": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  "Douleur X": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  "Vampirisme X": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn"]),
  "Tempête X": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  "Cataclysme X": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  "Renforcement +X/+Y": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  // Impact / Remontée / Vampirisme lisent un targetInstanceId que le flux
  // d'attaque (synchrone, pré-combat, sans pause) ne fournit pas : Impact et
  // Remontée reporteraient leur picker APRÈS le combat, Vampirisme frapperait
  // le héros au lieu d'une créature. Pas de mode "attack" tant qu'un vrai
  // ciblage n'est pas câblé dans le flux d'attaque.
  "Impact X": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn"]),
  "Prescience X": new Set<CuratedMode>(["tap", "return", "end_of_turn", "attack"]),
  "Suprématie": new Set<CuratedMode>(["death", "return", "end_of_turn", "attack"]),
  "Ombre du passé": new Set<CuratedMode>(["death", "return", "end_of_turn", "attack"]),
  "Savant": new Set<CuratedMode>(["death", "return", "end_of_turn", "attack"]),
  "Combustion": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  "Remontée": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn"]),
  "Renforcement multiple": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  // Entrainement accepte TOUS les déclencheurs habituels, y compris l'attaque.
  "Entrainement X": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  // Dédoublement : disponible sur tous les déclencheurs (entrée + mort, tap,
  // retour en main, fin de tour, attaque).
  "Dédoublement": new Set<CuratedMode>(["death", "tap", "return", "end_of_turn", "attack"]),
  // Sélection : seuls tap et fin de tour (en plus de l'entrée). Pas de mort ni
  // retour en main — ces deux-là surviennent pendant le tour adverse et la
  // Sélection est interactive (modale « 1 parmi 3 »), qui doit rester sur le
  // tour du contrôleur.
  "Sélection X": new Set<CuratedMode>(["tap", "end_of_turn"]),
  "Sélection magique X": new Set<CuratedMode>(["tap", "end_of_turn"]),
  "Sélection Royale X": new Set<CuratedMode>(["tap", "end_of_turn"]),
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

// Répartition de la race RÉELLEMENT stockée d'une carte selon son coût en mana,
// pour les clans « à sous-races » (ex. Cohortes Sanglantes : Gobelins/Orcs·Wargs/
// Trolls, clan Hobbits : Hobbits/Hommes-Arbres). Les bandes sont évaluées par
// mana croissant ; dans la bande retenue, la race est tirée au sort de façon
// pondérée. `maxMana: null` = bande fourre-tout (mana au-delà des seuils).
export interface RaceBand {
  maxMana: number | null;
  races: { race: string; weight: number }[];
}

// A faction can declare several clan groups, each targeting a different race
// (or "all"). E.g. the Elfes have race-specific clans for Elfes, Fées and
// Aigles Géants. Resolve with getClanNamesForRace / getAllClanNames below.

export const FACTIONS: Record<string, {
  displayName: string;
  color: string; accent: string; emoji: string; bg: string;
  alignment: Alignment;
  races: string[];
  clans?: FactionClan[];
  // Races « libres » : disponibles dans TOUS les clans de la faction, quelle que
  // soit la contrainte `appliesTo` (ex. Aigles Géants chez les Elfes).
  freeRaces?: string[];
  statWeights: { atk: number; def: number };
  guaranteedKeywords: string[];
  likelyKeywords: Record<string, number>;
  forbiddenKeywords: string[];
  description: string;
  subType?: FactionSubType;
  raceProfiles?: Record<string, { statWeights: { atk: number; def: number }; likelyKeywords?: Record<string, number> }>;
  // Per-clan tuning, same shape as raceProfiles. Used by factions whose
  // playstyle differentiation lives on the clan rather than the race (the
  // Élémentaires: one race "Élémentaire", four elemental clans). The
  // generator prefers a matching raceProfile, then a clanProfile, then the
  // faction-level weights.
  clanProfiles?: Record<string, { statWeights: { atk: number; def: number }; likelyKeywords?: Record<string, number> }>;
  // Sous-races déterminées par le mana, par clan (cf. RaceBand). Consommé par
  // deriveRaceForClan (constants) et le générateur (race persistée).
  clanRaceBands?: Record<string, RaceBand[]>;
}> = {
  Elfes: {
    displayName: "L'Alliance Céleste",
    color: "#3a7d44", accent: "#55efc4", emoji: "🌿", bg: "#0a1f0a", alignment: "bon",
    races: ["Elfes", "Fées", "Aigles Géants", "Hobbits", "Hommes-Arbres"],
    freeRaces: ["Aigles Géants"],
    clans: [
      { names: ["Les Sylvains", "Les Hauts-Elfes"], appliesTo: "Elfes" },
      { names: ["La Forêt d'Émeraude"], appliesTo: "Fées" },
      { names: ["La Combe Verte"], appliesTo: "Hobbits" },
      { names: ["La Combe Verte"], appliesTo: "Hommes-Arbres" },
    ],
    statWeights: { atk: 1.05, def: 0.85 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.50, "Esquive": 0.50, "Précision": 0.45, "Divination": 0.45, "Augure": 0.40, "Canalisation": 0.40, "Invisible": 0.40, "Contresort": 0.35, "Première Frappe": 0.35, "Loyauté": 0.35, "Bénédiction": 0.30, "Vol": 0.20 },
    forbiddenKeywords: ["Armure", "Berserk", "Nécrophagie", "Pillage X", "Carnage X"],
    description: "L'alliance du bon peuple des bois : elfes furtifs, fées mages, hobbits rusés et leurs colosses Hommes-Arbres.",
    raceProfiles: {
      "Aigles Géants": { statWeights: { atk: 1.20, def: 0.70 }, likelyKeywords: { "Vol": 0.90, "Traque": 0.60, "Première Frappe": 0.50, "Augure": 0.40 } },
      "Fées": { statWeights: { atk: 0.75, def: 0.65 }, likelyKeywords: { "Vol": 0.85, "Invisible": 0.70, "Esquive": 0.65, "Augure": 0.55, "Divination": 0.50, "Canalisation": 0.60, "Drain de vie": 0.45, "Contresort": 0.40, "Héritage X": 0.35 } },
      "Hommes-Arbres": { statWeights: { atk: 0.90, def: 1.50 }, likelyKeywords: { "Provocation": 0.60, "Ancré": 0.55, "Régénération": 0.40, "Riposte X": 0.35 } },
    },
    clanProfiles: {
      "Les Sylvains": { statWeights: { atk: 1.15, def: 0.80 }, likelyKeywords: { "Traque": 0.55, "Esquive": 0.55, "Invisible": 0.45, "Première Frappe": 0.45, "Précision": 0.45, "Combustion": 0.30 } },
      "Les Hauts-Elfes": { statWeights: { atk: 0.95, def: 0.90 }, likelyKeywords: { "Canalisation": 0.55, "Divination": 0.50, "Contresort": 0.45, "Augure": 0.45, "Prescience X": 0.40, "Précision": 0.35, "Suprématie": 0.35 } },
      "La Forêt d'Émeraude": { statWeights: { atk: 0.75, def: 0.75 }, likelyKeywords: { "Vol": 0.85, "Invisible": 0.60, "Canalisation": 0.55, "Divination": 0.50, "Augure": 0.50, "Drain de vie": 0.40, "Contresort": 0.40 } },
      "La Combe Verte": { statWeights: { atk: 0.85, def: 1.05 }, likelyKeywords: { "Esquive": 0.55, "Loyauté": 0.55, "Bravoure": 0.45, "Invisible": 0.40, "Bénédiction": 0.40, "Régénération": 0.35, "Ancré": 0.35, "Provocation": 0.35, "Résistance X": 0.35 } },
    },
    clanRaceBands: {
      "La Combe Verte": [
        { maxMana: 5, races: [{ race: "Hobbits", weight: 1 }] },
        { maxMana: null, races: [{ race: "Hommes-Arbres", weight: 1 }] },
      ],
    },
  },
  Nains: {
    displayName: "La Confrérie de la Forge",
    color: "#b87333", accent: "#ff9f43", emoji: "⚒️", bg: "#2a1a0a", alignment: "bon",
    races: ["Nains", "Golems", "Gnomes"],
    clans: [
      { names: ["Les Gardiens de la Montagne", "La Forge Ardente"], appliesTo: "Nains" },
      { names: ["Les Sentinelles d'Airain"], appliesTo: "Golems" },
      { names: ["La Guilde des Ingénieurs"], appliesTo: "Gnomes" },
    ],
    statWeights: { atk: 0.85, def: 1.40 },
    guaranteedKeywords: [],
    likelyKeywords: { "Armure": 0.70, "Résistance X": 0.65, "Bouclier": 0.50, "Riposte X": 0.50, "Ancré": 0.45, "Provocation": 0.40, "Bravoure": 0.40, "Catalyse": 0.40, "Berserk": 0.35, "Tactique X": 0.25 },
    forbiddenKeywords: ["Vol", "Invisible", "Esquive", "Ombre", "Traque", "Pillage X"],
    description: "Solides et résistants : défense, ténacité, forge et ingénierie gnome.",
    raceProfiles: {
      "Golems": { statWeights: { atk: 0.90, def: 1.60 }, likelyKeywords: { "Ancré": 0.80, "Armure": 0.75, "Provocation": 0.60, "Indestructible": 0.30, "Riposte X": 0.45 } },
    },
    clanProfiles: {
      "Les Gardiens de la Montagne": { statWeights: { atk: 0.85, def: 1.45 }, likelyKeywords: { "Armure": 0.65, "Résistance X": 0.60, "Provocation": 0.55, "Bouclier": 0.50, "Ancré": 0.45, "Riposte X": 0.45 } },
      "La Forge Ardente": { statWeights: { atk: 1.15, def: 1.05 }, likelyKeywords: { "Combustion": 0.50, "Berserk": 0.50, "Fureur": 0.45, "Riposte X": 0.40, "Catalyse": 0.40, "Bravoure": 0.35 } },
      "Les Sentinelles d'Airain": { statWeights: { atk: 0.90, def: 1.60 }, likelyKeywords: { "Ancré": 0.80, "Armure": 0.75, "Provocation": 0.60, "Résistance X": 0.50, "Riposte X": 0.45, "Indestructible": 0.35 } },
      "La Guilde des Ingénieurs": { statWeights: { atk: 0.80, def: 1.00 }, likelyKeywords: { "Convocation X": 0.55, "Catalyse": 0.50, "Divination": 0.45, "Tactique X": 0.40, "Inspiration X": 0.40, "Contresort": 0.35, "Riposte X": 0.30 } },
    },
  },
  EmpireDuMilieu: {
    displayName: "L'Empire du Milieu",
    color: "#a83232", accent: "#e8b923", emoji: "🏯", bg: "#1a0d0a", alignment: "neutre",
    races: ["Humains"],
    clans: [{ names: ["Les Hordes des Steppes", "L'Empire de Jade", "Les Lames de l'Ombre"], appliesTo: "all" }],
    statWeights: { atk: 0.95, def: 1.10 },
    guaranteedKeywords: [],
    likelyKeywords: { "Tactique X": 0.50, "Divination": 0.45, "Contresort": 0.40, "Provocation": 0.40, "Première Frappe": 0.40, "Augure": 0.35, "Convocation X": 0.35, "Célérité": 0.30, "Traque": 0.30 },
    forbiddenKeywords: ["Poison", "Corruption", "Maléfice", "Pacte de sang", "Nécrophagie"],
    description: "Stratégie et contrôle : discipline, formations, mysticisme et furtivité.",
    clanProfiles: {
      "Les Hordes des Steppes": { statWeights: { atk: 1.15, def: 0.90 }, likelyKeywords: { "Célérité": 0.55, "Traque": 0.55, "Raid": 0.50, "Première Frappe": 0.45, "Persécution X": 0.40, "Pillage X": 0.35 } },
      "L'Empire de Jade": { statWeights: { atk: 0.90, def: 1.20 }, likelyKeywords: { "Tactique X": 0.55, "Divination": 0.50, "Contresort": 0.45, "Provocation": 0.45, "Commandement": 0.40, "Convocation X": 0.40, "Augure": 0.35 } },
      "Les Lames de l'Ombre": { statWeights: { atk: 1.20, def: 0.80 }, likelyKeywords: { "Ombre": 0.60, "Invisible": 0.55, "Traque": 0.55, "Esquive": 0.50, "Célérité": 0.45, "Première Frappe": 0.45, "Précision": 0.40, "Remontée": 0.35 } },
    },
  },
  RoyaumesDuSoleil: {
    displayName: "Les Royaumes du Soleil",
    color: "#e1a100", accent: "#ffd54f", emoji: "☀️", bg: "#1a1206", alignment: "neutre",
    races: ["Humains"],
    clans: [{ names: ["Les Enfants du Soleil", "Les Seigneurs des Dunes", "Le Royaume des Masques"], appliesTo: "all" }],
    statWeights: { atk: 1.02, def: 1.03 },
    guaranteedKeywords: [],
    likelyKeywords: { "Bénédiction": 0.45, "Convocation X": 0.45, "Bravoure": 0.40, "Sacrifice": 0.35, "Héritage X": 0.35, "Résistance X": 0.35, "Divination": 0.30, "Pillage X": 0.30 },
    forbiddenKeywords: ["Poison", "Corruption", "Maléfice", "Pacte de sang", "Nécrophagie"],
    description: "Soleil, désert et esprits : brasier rituel, nomades pilleurs et invocateurs.",
    clanProfiles: {
      "Les Enfants du Soleil": { statWeights: { atk: 1.10, def: 0.95 }, likelyKeywords: { "Sacrifice": 0.55, "Héritage X": 0.50, "Martyr": 0.45, "Bravoure": 0.45, "Bénédiction": 0.40, "Convocation X": 0.40 } },
      "Les Seigneurs des Dunes": { statWeights: { atk: 1.05, def: 1.00 }, likelyKeywords: { "Pillage X": 0.55, "Traque": 0.50, "Esquive": 0.50, "Célérité": 0.45, "Résistance X": 0.45, "Persécution X": 0.40 } },
      "Le Royaume des Masques": { statWeights: { atk: 0.90, def: 1.15 }, likelyKeywords: { "Convocation X": 0.60, "Divination": 0.50, "Prescience X": 0.45, "Augure": 0.45, "Bénédiction": 0.40, "Totem": 0.40, "Régénération": 0.35 } },
    },
  },
  Humains: {
    displayName: "Les Royaumes Libres",
    color: "#2c5f8a", accent: "#74b9ff", emoji: "⚔️", bg: "#0a0f2a", alignment: "neutre",
    races: ["Humains"],
    clans: [{ names: ["Le Royaume du Nord", "L'Ordre de l'Aube", "Les Guerrières du Vent"], appliesTo: "all" }],
    statWeights: { atk: 1.00, def: 1.00 },
    guaranteedKeywords: [],
    likelyKeywords: { "Loyauté": 0.55, "Commandement": 0.55, "Bravoure": 0.50, "Bénédiction": 0.45, "Bouclier": 0.45, "Première Frappe": 0.45, "Tactique X": 0.35, "Héritage X": 0.30, "Provocation": 0.30, "Convocation X": 0.30 },
    forbiddenKeywords: ["Poison", "Corruption", "Maléfice", "Pacte de sang", "Nécrophagie"],
    description: "Le vieux continent : honneur, acier et champions héroïques.",
    clanProfiles: {
      "Le Royaume du Nord": { statWeights: { atk: 1.15, def: 0.90 }, likelyKeywords: { "Berserk": 0.55, "Bravoure": 0.50, "Raid": 0.50, "Première Frappe": 0.45, "Célérité": 0.40, "Pillage X": 0.35, "Combustion": 0.30, "Commandement": 0.30 } },
      "L'Ordre de l'Aube": { statWeights: { atk: 0.90, def: 1.20 }, likelyKeywords: { "Bouclier": 0.60, "Bénédiction": 0.55, "Provocation": 0.50, "Résistance X": 0.50, "Première Frappe": 0.40, "Commandement": 0.40, "Bravoure": 0.35 } },
      "Les Guerrières du Vent": { statWeights: { atk: 1.15, def: 0.85 }, likelyKeywords: { "Précision": 0.55, "Esquive": 0.55, "Traque": 0.50, "Première Frappe": 0.45, "Célérité": 0.45, "Bravoure": 0.40 } },
    },
  },
  "Hommes-Bêtes": {
    displayName: "La Meute",
    color: "#7B5B3A", accent: "#CD853F", emoji: "🐺", bg: "#1a1008", alignment: "neutre",
    races: ["Hommes-Loups", "Hommes-Ours", "Hommes-Félins", "Centaures", "Mimis", "Hommes-Chiens", "Hommes-Renards", "Hommes-Cerfs"],
    clans: [
      { names: ["Les Seigneurs Fauves"], appliesTo: "Hommes-Félins" },
      { names: ["Les Enfants de la Lune"], appliesTo: "Hommes-Ours" },
      { names: ["Les Enfants de la Lune"], appliesTo: "Hommes-Loups" },
      { names: ["Le Pacte des Griffes"], appliesTo: "all" },
      { names: ["La Harde Sauvage"], appliesTo: "Centaures" },
      { names: ["La Harde Sauvage"], appliesTo: "Hommes-Cerfs" },
    ],
    statWeights: { atk: 1.20, def: 1.00 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.65, "Berserk": 0.55, "Fureur": 0.55, "Première Frappe": 0.45, "Régénération": 0.40, "Bravoure": 0.40, "Combustion": 0.35, "Esquive": 0.35, "Persécution X": 0.30, "Augure": 0.30, "Vol": 0.20 },
    forbiddenKeywords: ["Armure", "Commandement", "Invisible", "Ancré", "Canalisation", "Contresort"],
    description: "Sauvages et féroces : attaquent vite, régénèrent, entrent en rage.",
    clanProfiles: {
      "Les Seigneurs Fauves": { statWeights: { atk: 1.30, def: 0.85 }, likelyKeywords: { "Persécution X": 0.55, "Célérité": 0.50, "Traque": 0.50, "Bravoure": 0.45, "Première Frappe": 0.45, "Double Attaque": 0.40 } },
      "Les Enfants de la Lune": { statWeights: { atk: 1.25, def: 1.00 }, likelyKeywords: { "Lycanthropie X": 0.55, "Berserk": 0.50, "Fureur": 0.50, "Traque": 0.45, "Régénération": 0.40, "Résistance X": 0.40 } },
      "Le Pacte des Griffes": { statWeights: { atk: 1.15, def: 0.95 }, likelyKeywords: { "Sang mêlé": 0.60, "Solidarité X": 0.50, "Loyauté": 0.45, "Instinct de meute X": 0.45, "Bravoure": 0.40, "Traque": 0.40 } },
      "La Harde Sauvage": { statWeights: { atk: 1.20, def: 0.95 }, likelyKeywords: { "Célérité": 0.50, "Raid": 0.50, "Piétinement": 0.45, "Précision": 0.45, "Traque": 0.45, "Bravoure": 0.40 } },
      "Les Mignons": { statWeights: { atk: 0.85, def: 0.90 }, likelyKeywords: { "Loyauté": 0.55, "Combustion": 0.40, "Régénération": 0.40, "Solidarité X": 0.40, "Bénédiction": 0.35 } },
    },
  },
  "Élémentaires": {
    displayName: "Les Primordiaux",
    color: "#E67E22", accent: "#F39C12", emoji: "🌀", bg: "#1a1008", alignment: "neutre",
    races: ["Élémentaire"],
    clans: [{ names: ["La Colère des Flammes", "Le Socle du Monde", "La Vague Sans Fin", "Le Souffle des Cimes"], appliesTo: "all" }],
    statWeights: { atk: 1.10, def: 1.10 },
    guaranteedKeywords: [],
    likelyKeywords: { "Fureur": 0.40, "Résistance X": 0.40, "Régénération": 0.35, "Esquive": 0.35,
      "Canalisation": 0.45, "Permutation": 0.30, "Métamorphose": 0.35, "Mimique": 0.30, "Carnage X": 0.30 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier", "Pillage X"],
    description: "Forces primordiales de la nature. Chaque élément a son propre style de combat.",
    // The four elements are now clans of the single race "Élémentaire";
    // their distinct playstyles live in clanProfiles (consumed by the
    // generator). "Le Souffle des Cimes" was formerly the race "Air/Tempête".
    clanProfiles: {
      "La Colère des Flammes": { statWeights: { atk: 1.40, def: 0.75 }, likelyKeywords: { "Fureur": 0.70, "Souffle de feu X": 0.60, "Berserk": 0.50, "Sacrifice": 0.35, "Combustion": 0.50, "Carnage X": 0.40 } },
      "Le Socle du Monde": { statWeights: { atk: 0.85, def: 1.50 }, likelyKeywords: { "Provocation": 0.70, "Armure": 0.65, "Ancré": 0.60, "Résistance X": 0.55, "Indestructible": 0.30, "Riposte X": 0.45 } },
      "La Vague Sans Fin": { statWeights: { atk: 0.90, def: 1.10 }, likelyKeywords: { "Régénération": 0.65, "Drain de vie": 0.55, "Esquive": 0.50, "Résistance X": 0.40, "Paralysie": 0.50, "Bénédiction": 0.35 } },
      "Le Souffle des Cimes": { statWeights: { atk: 1.15, def: 0.85 }, likelyKeywords: { "Vol": 0.80, "Traque": 0.65, "Célérité": 0.50, "Esquive": 0.45, "Première Frappe": 0.40, "Augure": 0.35 } },
    },
  },
  Mercenaires: {
    displayName: "Mercenaires",
    color: "#8B8B00", accent: "#D4D400", emoji: "💰", bg: "#1a1a08", alignment: "spéciale",
    races: ["Géants", "Ogres", "Dragons", "Chiens", "Phoenix", "Anges", "Ours", "Loups", "Fauves"],
    statWeights: { atk: 1.05, def: 1.05 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.40, "Première Frappe": 0.40, "Précision": 0.35, "Esquive": 0.30, "Berserk": 0.30, "Bouclier": 0.25, "Fureur": 0.25, "Vol": 0.15,
      "Mimique": 0.40, "Métamorphose": 0.40, "Bravoure": 0.30, "Combustion": 0.25 },
    forbiddenKeywords: ["Commandement", "Loyauté", "Domination", "Corruption"],
    description: "Soldats de fortune sans allégeance. Polyvalents et disponibles pour tous les decks.",
    raceProfiles: {
      "Géants": { statWeights: { atk: 1.15, def: 1.30 }, likelyKeywords: { "Provocation": 0.65, "Résistance X": 0.60, "Armure": 0.55, "Indestructible": 0.45, "Terreur": 0.40, "Carnage X": 0.30 } },
      "Ogres": { statWeights: { atk: 1.25, def: 1.10 }, likelyKeywords: { "Berserk": 0.55, "Fureur": 0.50, "Provocation": 0.40, "Résistance X": 0.35, "Pillage X": 0.30 } },
      "Dragons": { statWeights: { atk: 1.40, def: 0.90 }, likelyKeywords: { "Vol": 0.90, "Souffle de feu X": 0.70, "Terreur": 0.60, "Fureur": 0.50, "Indestructible": 0.40, "Transcendance": 0.35, "Vampirisme X": 0.25 } },
      "Chiens": { statWeights: { atk: 1.10, def: 0.80 }, likelyKeywords: { "Raid": 0.70, "Traque": 0.55, "Instinct de meute X": 0.60, "Loyauté": 0.50, "Esquive": 0.40, "Berserk": 0.35, "Première Frappe": 0.30 } },
      "Phoenix": { statWeights: { atk: 1.20, def: 0.95 }, likelyKeywords: { "Vol": 0.80, "Résurrection": 0.70, "Souffle de feu X": 0.55, "Régénération": 0.50, "Bouclier": 0.40, "Berserk": 0.35, "Fureur": 0.30, "Cycle éternel": 0.45 } },
      "Anges": { statWeights: { atk: 1.10, def: 1.15 }, likelyKeywords: { "Vol": 0.85, "Bouclier": 0.60, "Bénédiction": 0.55, "Commandement": 0.50, "Première Frappe": 0.45, "Drain de vie": 0.40, "Provocation": 0.35, "Résistance X": 0.30 } },
      "Ours": { statWeights: { atk: 1.20, def: 1.25 }, likelyKeywords: { "Provocation": 0.55, "Berserk": 0.50, "Résistance X": 0.45, "Fureur": 0.40, "Régénération": 0.35, "Lycanthropie X": 0.45 } },
      "Loups": { statWeights: { atk: 1.15, def: 0.90 }, likelyKeywords: { "Traque": 0.60, "Raid": 0.55, "Instinct de meute X": 0.50, "Esquive": 0.40, "Berserk": 0.35, "Lycanthropie X": 0.45 } },
      "Fauves": { statWeights: { atk: 1.20, def: 0.95 }, likelyKeywords: { "Traque": 0.65, "Esquive": 0.55, "Première Frappe": 0.50, "Précision": 0.45, "Bravoure": 0.40, "Berserk": 0.35, "Raid": 0.30, "Invisible": 0.25 } },
    },
  },
  "Morts-Vivants": {
    displayName: "La Nécropole",
    color: "#6c3483", accent: "#a29bfe", emoji: "💀", bg: "#1a0a2a", alignment: "maléfique",
    races: ["Squelettes", "Zombies", "Spectres", "Vampires", "Lich", "Banshees"],
    clans: [
      { names: ["Les Rangs Silencieux"], appliesTo: "Squelettes" },
      { names: ["Les Rangs Silencieux"], appliesTo: "Zombies" },
      { names: ["Le Voile Hurlant"], appliesTo: "Spectres" },
      { names: ["Le Voile Hurlant"], appliesTo: "Banshees" },
      { names: ["La Cour Écarlate"], appliesTo: "Vampires" },
      { names: ["Le Cénacle Nécromant"], appliesTo: "Lich" },
    ],
    statWeights: { atk: 1.05, def: 0.95 },
    guaranteedKeywords: [],
    likelyKeywords: { "Poison": 0.65, "Drain de vie": 0.60, "Nécrophagie": 0.55, "Terreur": 0.55, "Rappel": 0.55, "Exhumation X": 0.55, "Maléfice": 0.50, "Ombre du passé": 0.50, "Profanation X": 0.50, "Vampirisme X": 0.50, "Régénération": 0.45, "Héritage du cimetière": 0.45, "Résurrection": 0.40, "Pacte de sang": 0.40, "Convocation X": 0.40, "Liaison de vie": 0.35, "Corruption": 0.30, "Domination": 0.30, "Vol": 0.15 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier", "Bénédiction", "Bravoure"],
    description: "Insatiables et corrompus : résurrection, drain de vie et magie du cimetière.",
    clanProfiles: {
      "Les Rangs Silencieux": { statWeights: { atk: 1.00, def: 0.90 }, likelyKeywords: { "Nécrophagie": 0.55, "Exhumation X": 0.55, "Rappel": 0.50, "Convocation X": 0.50, "Poison": 0.40, "Sacrifice": 0.35, "Pacte de sang": 0.35 } },
      "Le Voile Hurlant": { statWeights: { atk: 1.05, def: 0.75 }, likelyKeywords: { "Terreur": 0.60, "Ombre": 0.55, "Invisible": 0.50, "Esquive": 0.50, "Maléfice": 0.45, "Malédiction": 0.40, "Paralysie": 0.35 } },
      "La Cour Écarlate": { statWeights: { atk: 1.25, def: 0.90 }, likelyKeywords: { "Drain de vie": 0.60, "Vampirisme X": 0.55, "Célérité": 0.45, "Régénération": 0.45, "Pacte de sang": 0.40, "Terreur": 0.35, "Vol": 0.30 } },
      "Le Cénacle Nécromant": { statWeights: { atk: 0.85, def: 1.00 }, likelyKeywords: { "Héritage du cimetière": 0.55, "Résurrection": 0.50, "Ombre du passé": 0.50, "Savant": 0.45, "Canalisation": 0.45, "Domination": 0.40, "Divination": 0.35 } },
    },
  },
  "Elfes Noirs": {
    displayName: "Les Légions du Chaos",
    color: "#4A0E4E", accent: "#9B59B6", emoji: "🔮", bg: "#150520", alignment: "maléfique",
    races: ["Elfes Corrompus", "Araignées Géantes", "Démons", "Orcs", "Gobelins", "Trolls", "Wargs", "Guerriers du Chaos"],
    clans: [
      { names: ["Les Cohortes Sanglantes"], appliesTo: "Orcs" },
      { names: ["Les Cohortes Sanglantes"], appliesTo: "Gobelins" },
      { names: ["Les Cohortes Sanglantes"], appliesTo: "Trolls" },
      { names: ["Les Cohortes Sanglantes"], appliesTo: "Wargs" },
      { names: ["Les Princes des Abîmes"], appliesTo: "Démons" },
      { names: ["La Forêt Maudite"], appliesTo: "Elfes Corrompus" },
      { names: ["La Forêt Maudite"], appliesTo: "Araignées Géantes" },
      { names: ["La Garde Noire"], appliesTo: "Guerriers du Chaos" },
    ],
    statWeights: { atk: 1.15, def: 0.90 },
    guaranteedKeywords: [],
    likelyKeywords: { "Fureur": 0.50, "Traque": 0.50, "Berserk": 0.45, "Poison": 0.45, "Sacrifice": 0.45, "Terreur": 0.45, "Invisible": 0.40, "Ombre": 0.40, "Malédiction": 0.40, "Pillage X": 0.40, "Persécution X": 0.40, "Carnage X": 0.35, "Maléfice": 0.35, "Pacte de sang": 0.35, "Drain de vie": 0.35, "Corruption": 0.30, "Convocation X": 0.30, "Domination": 0.30, "Vol": 0.20 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier", "Bénédiction", "Bravoure"],
    description: "Toutes les forces du Chaos unies : horde organisée, cour démoniaque, corrompus du poison et élite déchue.",
    raceProfiles: {
      "Démons": { statWeights: { atk: 1.35, def: 0.80 }, likelyKeywords: { "Fureur": 0.65, "Sacrifice": 0.55, "Terreur": 0.50, "Ombre": 0.45, "Vol": 0.30, "Carnage X": 0.40, "Persécution X": 0.45 } },
      "Araignées Géantes": { statWeights: { atk: 1.10, def: 0.90 }, likelyKeywords: { "Poison": 0.75, "Esquive": 0.50, "Invisible": 0.45 } },
    },
    clanProfiles: {
      "Les Cohortes Sanglantes": { statWeights: { atk: 1.25, def: 0.90 }, likelyKeywords: { "Traque": 0.55, "Entrainement X": 0.50, "Berserk": 0.50, "Fureur": 0.45, "Catalyse": 0.45, "Convocation X": 0.40, "Entraide (Race)": 0.40, "Régénération": 0.35, "Provocation": 0.35, "Célérité": 0.35, "Sacrifice": 0.30 } },
      "Les Princes des Abîmes": { statWeights: { atk: 1.35, def: 0.80 }, likelyKeywords: { "Fureur": 0.65, "Sacrifice": 0.55, "Terreur": 0.50, "Persécution X": 0.45, "Pacte de sang": 0.40, "Carnage X": 0.40, "Vol": 0.30 } },
      "La Forêt Maudite": { statWeights: { atk: 1.10, def: 0.90 }, likelyKeywords: { "Poison": 0.65, "Invisible": 0.55, "Ombre": 0.50, "Malédiction": 0.50, "Esquive": 0.45, "Drain de vie": 0.40 } },
      "La Garde Noire": { statWeights: { atk: 1.10, def: 1.15 }, likelyKeywords: { "Armure": 0.60, "Résistance X": 0.55, "Fureur": 0.45, "Provocation": 0.45, "Maléfice": 0.40, "Riposte X": 0.40 } },
    },
    clanRaceBands: {
      "Les Cohortes Sanglantes": [
        { maxMana: 2, races: [{ race: "Gobelins", weight: 1 }] },
        { maxMana: 5, races: [{ race: "Orcs", weight: 0.7 }, { race: "Wargs", weight: 0.3 }] },
        { maxMana: null, races: [{ race: "Trolls", weight: 1 }] },
      ],
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

// Every clan name a faction declares, across all of its clan groups (hence
// across all races). Use for validation and "show every clan" surfaces.
export function getAllClanNames(factionId: string | null | undefined): string[] {
  if (!factionId) return [];
  const groups = FACTIONS[factionId]?.clans;
  if (!groups) return [];
  return [...new Set(groups.flatMap((g) => g.names))];
}

// Clan names applicable to a given race within a faction. A clan group applies
// when its `appliesTo` is "all" (or empty), or matches the race. With a
// null/empty race, only the transversal ("all") groups apply.
export function getClanNamesForRace(
  factionId: string | null | undefined,
  race: string | null | undefined,
): string[] {
  if (!factionId) return [];
  const def = FACTIONS[factionId];
  const groups = def?.clans;
  if (!groups) return [];
  // Race libre (ex. Aigles Géants) : accède à TOUS les clans de la faction,
  // quelle que soit la contrainte `appliesTo`.
  if (race && def?.freeRaces?.includes(race)) return getAllClanNames(factionId);
  const out = new Set<string>();
  for (const g of groups) {
    if (g.appliesTo === "all" || !g.appliesTo || (race && g.appliesTo === race)) {
      for (const n of g.names) out.add(n);
    }
  }
  return [...out];
}

// Race RÉELLEMENT stockée d'une carte de `clan` selon son coût en `mana`, pour
// les clans « à sous-races » (cf. FACTIONS[].clanRaceBands). Les bandes sont
// évaluées par mana croissant ; la race est tirée de façon pondérée dans la
// bande retenue (Math.random — la génération de cartes n'est pas semée).
// Renvoie null si le clan n'a pas de bandes (race choisie normalement ailleurs).
export function deriveRaceForClan(
  factionId: string | null | undefined,
  clanId: string | null | undefined,
  mana: number,
): string | null {
  if (!factionId || !clanId) return null;
  const bands = FACTIONS[factionId]?.clanRaceBands?.[clanId];
  if (!bands || bands.length === 0) return null;
  const band =
    bands.find((b) => b.maxMana === null || mana <= b.maxMana) ?? bands[bands.length - 1];
  if (!band || band.races.length === 0) return null;
  if (band.races.length === 1) return band.races[0].race;
  const total = band.races.reduce((s, r) => s + r.weight, 0);
  let r = Math.random() * total;
  for (const rc of band.races) {
    r -= rc.weight;
    if (r <= 0) return rc.race;
  }
  return band.races[band.races.length - 1].race;
}

// Human-readable faction label. Internal ids (e.g. "Elfes") stay stable in code
// and DB; this maps them to the player-facing name (e.g. "L'Alliance Céleste").
// Falls back to the raw value for ids not in FACTIONS.
//
// i18n : avec un traducteur `t` (SafeT), tente `vocab.factions.{id}.displayName`
// puis retombe sur le `displayName` FR source. Sans `t` (moteur / SSR sans
// provider), renvoie le FR — tout le code existant compile inchangé.
export function getFactionDisplayName(
  faction: string | null | undefined,
  t?: SafeT,
): string {
  if (!faction) return "";
  return (
    t?.(`vocab.factions.${faction}.displayName`) ??
    FACTIONS[faction]?.displayName ??
    faction
  );
}

// Libellé de rareté localisé, keyé par l'id de rareté (qui reste la chaîne FR,
// ex. "Commune", stable en DB). Fallback FR via RARITY_MAP.
export function getRarityLabel(
  rarity: string | null | undefined,
  t?: SafeT,
): string {
  if (!rarity) return "";
  return t?.(`vocab.rarities.${rarity}`) ?? RARITY_MAP[rarity]?.label ?? rarity;
}

// Nom de clan localisé. Les ids de clan restent les chaînes FR (ex. "Montagnes"),
// stables en DB ; seul l'affichage est traduit.
export function getClanName(
  clan: string | null | undefined,
  t?: SafeT,
): string {
  if (!clan) return "";
  return t?.(`vocab.clans.${clan}`) ?? clan;
}

// Nom de race localisé (identité FR = valeur data). Fallback : la valeur brute.
export function getRaceName(
  race: string | null | undefined,
  t?: SafeT,
): string {
  if (!race) return "";
  return t?.(`vocab.races.${race}`) ?? race;
}

// Libellé d'alignement localisé (id moteur stable). Fallback : le libellé FR
// déclaré dans ALIGNMENTS, puis l'id.
export function getAlignmentLabel(
  alignment: string | null | undefined,
  t?: SafeT,
): string {
  if (!alignment) return "";
  return (
    t?.(`vocab.alignments.${alignment}`) ??
    ALIGNMENTS.find((a) => a.id === alignment)?.label ??
    alignment
  );
}

export const TYPES = ["Unité", "Sort", "Artefact", "Magie"];

export const ALIGNMENTS: { id: Alignment; label: string; emoji: string; color: string }[] = [
  { id: "bon", label: "Bon", emoji: "✨", color: "#4caf50" },
  { id: "neutre", label: "Neutre", emoji: "⚖️", color: "#ffd54f" },
  { id: "maléfique", label: "Maléfique", emoji: "💀", color: "#e74c3c" },
  { id: "spéciale", label: "Spéciale", emoji: "💰", color: "#D4D400" },
];

// Résout l'alignement effectif d'une carte pour l'affichage du descriptif.
// L'alignement vient TOUJOURS de la faction sauf pour Mercenaires (faction
// "spéciale") où le champ override `card_alignment` sert à choisir parmi
// bon/neutre/maléfique à la création de la carte.
//
// Note : on ignore volontairement `card_alignment` pour les cartes non-
// Mercenaires — le CardEditor remplit ce champ par défaut à "neutre" même
// pour des factions clairement bonnes ou maléfiques, donc s'y fier
// donnerait des badges incohérents (Orc affiché Neutre, etc.).
export function getEffectiveAlignment(
  card: { faction?: string | null; card_alignment?: string | null },
): Exclude<Alignment, "spéciale"> | null {
  if (!card.faction) return null;
  const fac = FACTIONS[card.faction];
  if (!fac) return null;
  if (fac.alignment === "spéciale") {
    // Mercenaires : l'alignement effectif est porté par le champ card.
    if (card.card_alignment && card.card_alignment !== "spéciale") {
      return card.card_alignment as Exclude<Alignment, "spéciale">;
    }
    return null;
  }
  return fac.alignment;
}

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
