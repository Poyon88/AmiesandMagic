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
// scalable: la capacité a un paramètre X variable
// zone    : zone d'interaction (Terrain, Cimetière, Main, Mixte)

export type KeywordZone = "Terrain" | "Cimetière" | "Main" | "Mixte";

export const KEYWORDS: Record<string, { cost: number; costPerX: number; se: number; minTier: number; scalable: boolean; zone: KeywordZone; desc: string }> = {
  // ── Tier 0 — Commune+ ─────────────────────────────────────────────────────
  "Loyauté":            { cost:  2, costPerX: 0, se: 0.5, minTier: 0, scalable: false, zone: "Terrain", desc: "Invocation : +1 ATK et +1 PV pour chaque allié de même race en jeu." },
  "Ancré":              { cost:  2, costPerX: 0, se: 0.5, minTier: 0, scalable: false, zone: "Terrain", desc: "Ne peut pas être déplacé ou exilé." },
  "Résistance":         { cost:  5, costPerX: 0, se: 1.0, minTier: 0, scalable: false, zone: "Terrain", desc: "Réduit les dégâts reçus de 1." },
  "Provocation":        { cost:  5, costPerX: 0, se: 1.0, minTier: 0, scalable: false, zone: "Terrain", desc: "Les ennemis doivent attaquer cette unité en priorité." },
  "Traque":             { cost:  5, costPerX: 0, se: 1.0, minTier: 0, scalable: false, zone: "Terrain", desc: "Peut attaquer dès son invocation." },
  "Première Frappe":    { cost:  7, costPerX: 0, se: 1.5, minTier: 0, scalable: false, zone: "Terrain", desc: "Lorsque cette unité attaque, inflige ses dégâts en premier ; l'unité adverse ne riposte que si elle survit." },
  "Berserk":            { cost: 11, costPerX: 0, se: 2.5, minTier: 0, scalable: false, zone: "Terrain", desc: "Double son ATK si ses PV actuels sont inférieurs à sa valeur de PV originale (sur la carte)." },
  "Bouclier":           { cost:  7, costPerX: 0, se: 1.5, minTier: 0, scalable: false, zone: "Terrain", desc: "Absorbe une première attaque sans dégâts." },
  // ── Tier 1 — Peu Commune+ ─────────────────────────────────────────────────
  "Vol":                { cost:  7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Terrain", desc: "Ignore les provocations adverses qui n'ont pas Vol." },
  "Précision":          { cost:  7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Terrain", desc: "Ignore la Résistance, l'Armure et le Bouclier." },
  "Drain de vie":       { cost:  9, costPerX: 0, se: 2.0, minTier: 1, scalable: false, zone: "Terrain", desc: "Soigne votre héros des dégâts infligés." },
  "Esquive":            { cost: 13, costPerX: 0, se: 3.0, minTier: 1, scalable: false, zone: "Terrain", desc: "Évite automatiquement la première attaque reçue chaque tour." },
  "Poison":             { cost:  9, costPerX: 0, se: 2.0, minTier: 1, scalable: false, zone: "Terrain", desc: "Les unités blessées perdent 1 PV par tour." },
  "Célérité":           { cost: 11, costPerX: 0, se: 2.5, minTier: 1, scalable: false, zone: "Terrain", desc: "Peut attaquer deux fois par tour." },
  "Augure":             { cost:  7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Terrain", desc: "Quand cette unité inflige des dégâts au héros adverse, vous piochez une carte." },
  "Bénédiction":        { cost:  9, costPerX: 0, se: 2.0, minTier: 1, scalable: false, zone: "Terrain", desc: "Soigne complètement l'unité ciblée." },
  "Bravoure":           { cost:  9, costPerX: 0, se: 2.0, minTier: 1, scalable: false, zone: "Terrain", desc: "Double ses dégâts (arrondi au supérieur) contre les unités ayant une ATK supérieure à la sienne." },
  "Pillage":            { cost: 13, costPerX: 0, se: 3.0, minTier: 1, scalable: false, zone: "Terrain", desc: "Invocation : l'adversaire défausse une carte de son choix." },
  "Riposte X":          { cost:  5, costPerX: 4, se: 2.0, minTier: 1, scalable: true,  zone: "Terrain", desc: "Quand cette unité subit des dégâts, inflige X dégâts à la source de l'attaque (unité ou héros)." },
  "Rappel":             { cost:  7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Cimetière", desc: "Invocation : remettez une carte ciblée de votre cimetière dans votre main." },
  "Combustion":         { cost:  7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Main", desc: "Invocation : défaussez une carte de votre main, puis piochez deux cartes." },
  // ── Tier 2 — Rare+ ────────────────────────────────────────────────────────
  "Terreur":            { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Terrain", desc: "Les unités adverses perdent 1 ATK en présence de cette carte." },
  "Armure":             { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Terrain", desc: "Réduit de moitié les dégâts de combat reçus (arrondi au supérieur) ; les dégâts de sorts ne sont pas réduits." },
  "Commandement":       { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Terrain", desc: "Les alliés de même faction gagnent +1/+1." },
  "Fureur":             { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Terrain", desc: "Après avoir subi des dégâts, attaque immédiatement une unité adverse au choix." },
  "Double Attaque":     { cost: 16, costPerX: 0, se: 3.5, minTier: 2, scalable: false, zone: "Terrain", desc: "En phase offensive uniquement : inflige deux fois son ATK, dont la première fois en Première Frappe." },
  "Invisible":          { cost: 16, costPerX: 0, se: 3.5, minTier: 2, scalable: false, zone: "Terrain", desc: "Ne peut pas être ciblé par des sorts ni par des capacités d'unités adverses." },
  "Canalisation":       { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Terrain", desc: "Tant que cette unité est en jeu, vos sorts coûtent 1 mana de moins." },
  "Catalyse":           { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Main", desc: "Invocation : réduit de 1 le coût en mana de toutes les unités de même race dans votre main." },
  "Contresort":         { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Terrain", desc: "Invocation : annule le prochain sort adverse." },
  "Convocation X":      { cost:  8, costPerX: 5, se: 3.0, minTier: 2, scalable: true,  zone: "Terrain", desc: "Invocation : crée un token X/X de même race et clan (si clan indiqué sur la carte)." },
  "Malédiction":        { cost: 16, costPerX: 0, se: 3.5, minTier: 2, scalable: false, zone: "Terrain", desc: "Invocation : ciblez une unité ennemie, elle est exilée à la fin du prochain tour adverse." },
  "Nécrophagie":        { cost: 18, costPerX: 0, se: 4.0, minTier: 2, scalable: false, zone: "Terrain", desc: "Gagne +1 ATK et +1 PV chaque fois qu'une unité (alliée ou ennemie) meurt." },
  "Paralysie":          { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Terrain", desc: "Invocation : une unité ennemie ciblée ne peut pas attaquer lors du prochain tour adverse." },
  "Permutation":        { cost: 16, costPerX: 0, se: 3.5, minTier: 2, scalable: false, zone: "Terrain", desc: "Invocation : échange les PV actuels de deux unités ciblées (une alliée et une ennemie)." },
  "Persécution X":      { cost:  8, costPerX: 5, se: 3.0, minTier: 2, scalable: true,  zone: "Terrain", desc: "Chaque fois que cette unité attaque, inflige X dégâts au héros adverse." },
  "Ombre du passé":     { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Cimetière", desc: "Invocation : gagne +1 ATK et +1 PV par unité de même race dans votre cimetière." },
  "Profanation X":      { cost:  7, costPerX: 3, se: 2.5, minTier: 2, scalable: true,  zone: "Cimetière", desc: "Invocation : exilez jusqu'à X cartes de votre cimetière ; gagne +1 ATK et +1 PV par carte exilée." },
  "Prescience X":       { cost:  9, costPerX: 4, se: 3.0, minTier: 2, scalable: true,  zone: "Main", desc: "Invocation : piochez des cartes jusqu'à avoir X cartes en main." },
  "Suprématie":         { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Main", desc: "Invocation : gagne +1 ATK et +1 PV par carte dans votre main au moment de l'invocation." },
  "Divination":         { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Mixte", desc: "Invocation : révèle les 3 premières cartes de votre pioche ; placez-en une sur le dessus et les 2 autres en dessous dans l'ordre choisi." },
  // ── Tier 3 — Épique+ ──────────────────────────────────────────────────────
  "Liaison de vie":     { cost: 16, costPerX: 0, se: 3.5, minTier: 3, scalable: false, zone: "Terrain", desc: "Partage les dégâts subis avec le héros adverse." },
  "Ombre":              { cost: 18, costPerX: 0, se: 4.0, minTier: 3, scalable: false, zone: "Terrain", desc: "Ne peut être ciblée ni attaquée tant qu'elle n'a pas effectué une action (attaque ou capacité)." },
  "Sacrifice":          { cost: 18, costPerX: 0, se: 4.0, minTier: 3, scalable: false, zone: "Terrain", desc: "Invocation : détruisez un allié pour gagner ses PV et son ATK de manière permanente." },
  "Maléfice":           { cost: 18, costPerX: 0, se: 4.0, minTier: 3, scalable: false, zone: "Terrain", desc: "À la mort, inflige X dégâts à toutes les unités (alliés et ennemis), X = son ATK." },
  "Indestructible":     { cost: 25, costPerX: 0, se: 5.5, minTier: 3, scalable: false, zone: "Terrain", desc: "Ne subit aucun dégât de combat." },
  "Régénération":       { cost: 20, costPerX: 0, se: 4.5, minTier: 3, scalable: false, zone: "Terrain", desc: "Récupère 2 PV au début de chaque tour." },
  "Corruption":         { cost: 27, costPerX: 0, se: 6.0, minTier: 4, scalable: false, zone: "Terrain", desc: "Convertit l'unité ennemie sélectionnée à votre camp jusqu'à la fin du tour ; elle gagne Traque jusqu'à la fin du tour." },
  "Carnage X":          { cost: 12, costPerX: 5, se: 4.0, minTier: 3, scalable: true,  zone: "Terrain", desc: "Mort : inflige X dégâts à toutes les unités en jeu (alliées et ennemies)." },
  "Héritage X":         { cost: 14, costPerX: 6, se: 4.5, minTier: 3, scalable: true,  zone: "Terrain", desc: "Mort : chaque unité alliée en jeu gagne +X ATK et +X PV de manière permanente." },
  "Mimique":            { cost: 20, costPerX: 0, se: 4.5, minTier: 3, scalable: false, zone: "Terrain", desc: "Invocation : copie toutes les capacités d'une unité ciblée et les attribue à cette unité de manière permanente." },
  "Métamorphose":       { cost: 20, costPerX: 0, se: 4.5, minTier: 3, scalable: false, zone: "Terrain", desc: "Invocation : cette unité devient une copie exacte (ATK / PV / capacités) d'une unité ciblée." },
  "Tactique X":         { cost: 11, costPerX: 7, se: 4.0, minTier: 3, scalable: true,  zone: "Terrain", desc: "Invocation : attribue X capacité(s) choisie(s) à une unité alliée ciblée de manière permanente." },
  "Exhumation X":       { cost: 14, costPerX: 4, se: 4.0, minTier: 3, scalable: true,  zone: "Cimetière", desc: "Invocation : ressuscite une unité de votre cimetière dont le coût en mana est égal ou inférieur à X." },
  "Héritage du cimetière": { cost: 16, costPerX: 0, se: 3.5, minTier: 3, scalable: false, zone: "Cimetière", desc: "Invocation : attribue à cette unité les capacités d'une unité ciblée dans votre cimetière." },
  // ── Tier 4 — Légendaire uniquement ─────────────────────────────────────────
  "Pacte de sang":      { cost: 25, costPerX: 0, se: 5.5, minTier: 4, scalable: false, zone: "Terrain", desc: "Quand cette unité meurt, invoque deux tokens 1/1 de sa race." },
  "Souffle de feu X":   { cost: 19, costPerX: 6, se: 5.5, minTier: 4, scalable: true,  zone: "Terrain", desc: "Inflige X dégâts à toutes les unités ennemies lors de l'attaque (ex : Souffle de feu 2 = 2 dégâts)." },
  "Domination":         { cost: 27, costPerX: 0, se: 6.0, minTier: 4, scalable: false, zone: "Terrain", desc: "Prend le contrôle d'une unité ennemie au hasard à son invocation." },
  "Résurrection":       { cost: 29, costPerX: 0, se: 6.5, minTier: 4, scalable: false, zone: "Terrain", desc: "Revient en jeu après sa mort avec 1 PV ; perd la capacité Résurrection à son retour." },
  "Transcendance":      { cost: 32, costPerX: 0, se: 7.0, minTier: 4, scalable: false, zone: "Terrain", desc: "Immunité totale aux sorts adverses : ne peut subir aucun dégât ni effet de sort, y compris les sorts de zone." },
  "Vampirisme X":       { cost: 20, costPerX: 5, se: 5.5, minTier: 4, scalable: true,  zone: "Terrain", desc: "Invocation : vole X PV à une unité ennemie ciblée et les ajoute aux PV de cette unité." },
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
    likelyKeywords: { "Traque": 0.60, "Esquive": 0.55, "Précision": 0.50, "Invisible": 0.40, "Première Frappe": 0.45, "Drain de vie": 0.30, "Vol": 0.20,
      "Augure": 0.40, "Canalisation": 0.40, "Catalyse": 0.40, "Divination": 0.45, "Prescience X": 0.35, "Suprématie": 0.40, "Contresort": 0.35, "Héritage X": 0.25, "Tactique X": 0.30 },
    forbiddenKeywords: ["Armure", "Ancré", "Provocation", "Berserk", "Nécrophagie", "Pillage", "Carnage X"],
    description: "Agiles et furtifs. Favorisent la vitesse et l'esquive. Aigles géants parmi leurs rangs.",
    raceProfiles: {
      "Aigles Géants": { statWeights: { atk: 1.20, def: 0.70 }, likelyKeywords: { "Vol": 0.90, "Traque": 0.60, "Première Frappe": 0.50, "Augure": 0.40 } },
    },
  },
  Nains: {
    color: "#b87333", accent: "#ff9f43", emoji: "⚒️", bg: "#2a1a0a", alignment: "bon",
    races: ["Nains", "Golems"],
    clans: { names: ["Montagnes", "Collines", "Lave"], appliesTo: "Nains" },
    statWeights: { atk: 0.85, def: 1.40 },
    guaranteedKeywords: [],
    likelyKeywords: { "Armure": 0.70, "Résistance": 0.65, "Bouclier": 0.50, "Ancré": 0.45, "Berserk": 0.35, "Provocation": 0.40,
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
    likelyKeywords: { "Esquive": 0.65, "Loyauté": 0.60, "Traque": 0.45, "Invisible": 0.50, "Résistance": 0.35, "Ancré": 0.40,
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
    likelyKeywords: { "Fureur": 0.40, "Résistance": 0.40, "Régénération": 0.35, "Esquive": 0.35,
      "Canalisation": 0.45, "Permutation": 0.30, "Métamorphose": 0.35, "Mimique": 0.30, "Carnage X": 0.30 },
    forbiddenKeywords: ["Loyauté", "Commandement", "Bouclier", "Pillage"],
    description: "Forces primordiales de la nature. Chaque élément a son propre style de combat.",
    raceProfiles: {
      "Feu": { statWeights: { atk: 1.40, def: 0.75 }, likelyKeywords: { "Fureur": 0.70, "Souffle de feu X": 0.60, "Berserk": 0.50, "Sacrifice": 0.35, "Combustion": 0.50, "Carnage X": 0.40 } },
      "Terre": { statWeights: { atk: 0.85, def: 1.50 }, likelyKeywords: { "Provocation": 0.70, "Armure": 0.65, "Ancré": 0.60, "Résistance": 0.55, "Indestructible": 0.30, "Riposte X": 0.45 } },
      "Eau": { statWeights: { atk: 0.90, def: 1.10 }, likelyKeywords: { "Régénération": 0.65, "Drain de vie": 0.55, "Esquive": 0.50, "Résistance": 0.40, "Paralysie": 0.50, "Bénédiction": 0.35 } },
      "Air/Tempête": { statWeights: { atk: 1.15, def: 0.85 }, likelyKeywords: { "Vol": 0.80, "Traque": 0.65, "Célérité": 0.50, "Esquive": 0.45, "Première Frappe": 0.40, "Augure": 0.35 } },
    },
  },
  Mercenaires: {
    color: "#8B8B00", accent: "#D4D400", emoji: "💰", bg: "#1a1a08", alignment: "spéciale",
    races: ["Géants", "Ogres", "Dragons"],
    statWeights: { atk: 1.05, def: 1.05 },
    guaranteedKeywords: [],
    likelyKeywords: { "Traque": 0.40, "Première Frappe": 0.40, "Précision": 0.35, "Esquive": 0.30, "Berserk": 0.30, "Bouclier": 0.25, "Fureur": 0.25, "Vol": 0.15,
      "Mimique": 0.40, "Métamorphose": 0.40, "Bravoure": 0.30, "Combustion": 0.25 },
    forbiddenKeywords: ["Commandement", "Loyauté", "Domination", "Corruption"],
    description: "Soldats de fortune sans allégeance. Polyvalents et disponibles pour tous les decks.",
    raceProfiles: {
      "Géants": { statWeights: { atk: 1.15, def: 1.30 }, likelyKeywords: { "Provocation": 0.65, "Résistance": 0.60, "Armure": 0.55, "Indestructible": 0.45, "Terreur": 0.40, "Carnage X": 0.30 } },
      "Ogres": { statWeights: { atk: 1.25, def: 1.10 }, likelyKeywords: { "Berserk": 0.55, "Fureur": 0.50, "Provocation": 0.40, "Résistance": 0.35, "Pillage": 0.30 } },
      "Dragons": { statWeights: { atk: 1.40, def: 0.90 }, likelyKeywords: { "Vol": 0.90, "Souffle de feu X": 0.70, "Terreur": 0.60, "Fureur": 0.50, "Indestructible": 0.40, "Transcendance": 0.35, "Vampirisme X": 0.25 } },
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
