// GÉNÉRATEUR PILOTÉ PAR BRIEF (Création assistée) — fonctions PURES.
//
//   planBatch(brief, rng)  → la répartition du lot, carte par carte : type,
//                            rareté, mana, race/clan, genre, capacités,
//                            déclencheurs, coût additionnel. Quotas EXACTS
//                            (méthode du plus fort reste), pas un tirage libre.
//   equilibrer(plan)       → ATK/DEF et X ajustés pour que la carte tombe sur
//                            le barème calibré (scoreCarte ≈ budgetCarte).
//
// Le code CONÇOIT la carte ; Claude n'en écrit que le nom, le texte et le
// prompt d'illustration (route generate-text). Rien ici ne touche au réseau.
import type { Card, CardType, Keyword, KeywordMode, SpellKeywordInstance } from "@/lib/game/types";
import { ABILITIES } from "@/lib/game/abilities";
import { deriveCapabilities } from "@/lib/game/capability-adapter";
import { buildKeywordInstances, FORGE_TO_GAME_KEYWORD } from "@/lib/card-forge/keyword-instances";
import {
  CURATED_KEYWORD_MODES, FACTIONS, KEYWORDS, MANA_WEIGHTS, MANA_WEIGHTS_BY_RARITY, RARITY_MAP,
  deriveRaceForClan, getClanNamesForRace, getRacesForClan,
} from "./constants";
import { getAvailableKeywords, getStatWeights, POIDS_HORS_PROFIL, resserrerProfil } from "./generator";
import { regleRace } from "./race-abilities";
import { getBareme, type Bareme } from "./bareme";
import { scoreCarte, type ScoreCarte } from "./card-points";
import {
  COST_FREQ_SHARE, TRIGGER_FREQ_WEIGHT, TRIGGER_NON_CITE,
  type BriefCost, type BriefTrigger, type BriefType, type CardBrief,
} from "./brief";

// ─── Aléa reproductible ─────────────────────────────────────────────────────

export type Rng = () => number;
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(a: T[], rng: Rng): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: Rng): T | null {
  const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
  if (total <= 0) return items.length ? items[Math.floor(rng() * items.length)] : null;
  let r = rng() * total;
  for (const t of items) { r -= Math.max(0, weight(t)); if (r <= 0) return t; }
  return items[items.length - 1];
}

/** Répartit `n` éléments selon des parts relatives (méthode du plus fort reste). */
export function largestRemainder<K extends string>(partsIn: Partial<Record<K, number>>, n: number): Record<K, number> {
  const entries = Object.entries(partsIn).filter(([, v]) => (v as number) > 0) as [K, number][];
  const out = {} as Record<K, number>;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total || n <= 0) return out;
  const brut = entries.map(([k, v]) => ({ k, exact: (v / total) * n }));
  let reste = n;
  for (const e of brut) { out[e.k] = Math.floor(e.exact); reste -= out[e.k]; }
  brut.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (let i = 0; i < reste; i++) out[brut[i % brut.length].k] += 1;
  return out;
}
function expand<K extends string>(counts: Record<K, number>, rng: Rng): K[] {
  const out: K[] = [];
  for (const [k, c] of Object.entries(counts) as [K, number][]) for (let i = 0; i < c; i++) out.push(k);
  return shuffle(out, rng);
}

// ─── Capacités générables ───────────────────────────────────────────────────

/** Capacités qui exigent un réglage que le générateur ne sait pas faire
 *  (jeton, carte liée, race visée, capacité conférée, effet composé…) : jamais
 *  tirées au hasard, ni posées depuis un brief. */
export const CAPACITES_A_REGLAGE: ReadonlySet<string> = new Set([
  "entraide", "transformation", "convocation", "convocation_simple", "invocation_multiple", "invocations_multiples",
  "lycanthropie", "compagnons", "tuteur", "conferer", "neutralisation", "declenchement", "invention",
  "renforcement_multiple", "pauvrete",
]);

/** Côté SORT, ces capacités ne font qu'amplifier les AUTRES valeurs de l'action
 *  (« cette action inflige X dégâts supplémentaires ») : seules, elles ne font
 *  rien. Le générateur ne les pose jamais sur une Action. */
export const MODIFICATEURS_DE_SORT: ReadonlySet<string> = new Set(["seuil_colere", "lune", "soleil", "chant"]);

/** Côté sort, modifient les DÉGÂTS de l'action : n'ont de sens qu'avec une
 *  capacité qui en inflige. */
export const MODIFICATEURS_DE_DEGATS: ReadonlySet<string> = new Set(["precision", "touche_mortel", "poison"]);
export const SORTS_DE_DEGATS: ReadonlySet<string> = new Set(["impact", "deferlement", "siphon", "tempete", "cataclysme"]);
/** Côté sort, agissent sur l'action elle-même (rejouée, mélangée) : jamais seules. */
export const META_DE_SORT: ReadonlySet<string> = new Set(["boomerang", "seconde_vie"]);
const estEffetPrincipal = (id: string) => !MODIFICATEURS_DE_DEGATS.has(id) && !META_DE_SORT.has(id);

/** Libellé de forge (clé de KEYWORDS) d'une capacité d'Unité, ou null. */
export function labelUnite(id: string): string | null {
  const a = ABILITIES[id];
  if (!a?.creature || CAPACITES_A_REGLAGE.has(id)) return null;
  const label = a.creature.label ?? a.label;
  return KEYWORDS[label] && FORGE_TO_GAME_KEYWORD[label] ? label : null;
}

/** Capacité de sort générable : paramètres réduits à un montant X, ou +X/+Y. */
export function sortGenerable(id: string): boolean {
  const a = ABILITIES[id];
  if (!a?.spell || CAPACITES_A_REGLAGE.has(id) || MODIFICATEURS_DE_SORT.has(id)) return false;
  const p = a.spell.params;
  return p.every((x) => x === "amount") || (p.length === 2 && p.includes("attack") && p.includes("health"));
}

export function capaciteCompatible(id: string, type: BriefType): boolean {
  return type === "Unité" ? labelUnite(id) != null : sortGenerable(id);
}

const ID_PAR_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(ABILITIES).filter((a) => a.creature).map((a) => [a.creature!.label ?? a.label, a.id]),
);
export const idDeLabel = (label: string): string | undefined => ID_PAR_LABEL[label];

/** Une capacité d'unité à X/Y (Gloire +X/+Y, Renforcement +X/+Y…). */
const aDeuxValeurs = (label: string) => /[+-]X\/[+-]Y|X\/Y/.test(label);

// ─── Plan du lot ────────────────────────────────────────────────────────────

export type CardGender = "homme" | "femme" | "neutre";
const GENRE: Record<"M" | "F" | "O", CardGender> = { M: "homme", F: "femme", O: "neutre" };

export interface PlannedCard {
  index: number;
  type: BriefType;
  rarity: string;
  mana: number;
  faction: string;
  race: string | null;
  clan: string | null;
  gender: CardGender;
  /** Capacités, par id de registre, dans l'ordre de pose. */
  abilities: string[];
  /** Ids issus des quotas du brief ou obligatoires de race (non retirables à l'équilibrage). */
  locked: string[];
  /** Déclencheur par capacité d'unité (absent = à l'entrée en jeu / passif). */
  modes: Record<string, KeywordMode>;
  cost: { kind: BriefCost; n: number } | null;
}

export interface BatchPlan {
  cards: PlannedCard[];
  /** Capacités privilégiées : demandé vs posé (écart quand trop peu de cartes compatibles). */
  quotas: { id: string; demande: number; pose: number }[];
  warnings: string[];
}

/** Nombre de capacités d'une carte selon sa rareté (≥ 1 : les cartes sans
 *  capacité ont été retirées du jeu en Brouillon le 2026-10-11). */
const NB_CAPACITES: Record<string, [number, number]> = {
  "Commune": [1, 1], "Peu Commune": [1, 2], "Rare": [2, 2], "Épique": [2, 3], "Légendaire": [3, 3],
};

function nombreCapacites(type: BriefType, rarity: string, max: number | undefined, rng: Rng): number {
  const [lo, hi] = NB_CAPACITES[rarity] ?? [1, 2];
  let n = lo + Math.floor(rng() * (hi - lo + 1));
  if (type === "Action") n = Math.min(n, rarity === "Commune" ? 1 : 2);
  return Math.max(1, Math.min(n, max ?? 4));
}

function piocheMana(rarity: string, brief: CardBrief, rng: Rng): number {
  const w = MANA_WEIGHTS_BY_RARITY[rarity] ?? MANA_WEIGHTS;
  const lo = brief.constraints.minMana ?? 1, hi = brief.constraints.maxMana ?? 10;
  const choix = w.map((p, i) => ({ m: i + 1, p })).filter((x) => x.m >= lo && x.m <= hi);
  return pickWeighted(choix, (x) => x.p, rng)?.m ?? lo;
}

const TRIGGER_TO_MODE: Record<BriefTrigger, KeywordMode | null> = {
  entry: null, death: "death", tap: "tap", return: "return", attack: "attack", end_of_turn: "end_of_turn",
  start_of_turn: "start_of_turn", draw: "draw", low_hp: "low_hp", wound: "wound",
};

/** Déclencheur d'une capacité d'unité selon les préférences du brief. */
export function pickTrigger(label: string, brief: CardBrief, rng: Rng): KeywordMode | null {
  const autorises = CURATED_KEYWORD_MODES[label];
  if (!autorises || brief.triggers.length === 0) return null;
  const options: BriefTrigger[] = ["entry", ...(Object.keys(TRIGGER_TO_MODE) as BriefTrigger[])
    .filter((t) => t !== "entry" && autorises.has(TRIGGER_TO_MODE[t] as never))];
  const poids = (t: BriefTrigger) => {
    const cite = brief.triggers.find((x) => x.trigger === t);
    if (cite) return TRIGGER_FREQ_WEIGHT[cite.freq];
    return t === "entry" ? 1 : TRIGGER_NON_CITE;
  };
  const t = pickWeighted(options, poids, rng) ?? "entry";
  return TRIGGER_TO_MODE[t];
}

function valeurCout(kind: BriefCost, mana: number): number {
  switch (kind) {
    case "life": return 2 + Math.floor(mana / 3);
    case "exile": return 1 + Math.floor(mana / 4);
    default: return 1;
  }
}

export function planBatch(brief: CardBrief, rng: Rng): BatchPlan {
  const warnings: string[] = [];
  const n = brief.count;
  const fac = FACTIONS[brief.faction];
  if (!fac) return { cards: [], quotas: [], warnings: ["Faction inconnue"] };

  const types = expand(largestRemainder<BriefType>(Object.keys(brief.types).length ? brief.types : { "Unité": 1 }, n), rng);
  const rarities = expand(largestRemainder<string>(Object.keys(brief.rarities).length ? brief.rarities : { "Commune": 1 }, n), rng);
  const manas = Object.keys(brief.manaCurve).length ? expand(largestRemainder<string>(brief.manaCurve, n), rng).map(Number) : null;
  // Le genre ne concerne que les Unités (personnages, voix d'entrée en jeu) :
  // une Action est « neutre », et les pourcentages portent sur les Unités.
  const nbUnites = types.filter((t) => t === "Unité").length;
  const genres = expand(largestRemainder<"M" | "F" | "O">(brief.gender, nbUnites), rng);
  let iGenre = 0;

  // Races : celles du brief, sinon celles de la faction (hors Bâtiments, jamais générés).
  const racesPossibles = (brief.races.length ? brief.races : fac.races).filter((r) => r !== "Bâtiments");
  const racesLot = racesPossibles.length ? shuffle(Array.from({ length: n }, (_, i) => racesPossibles[i % racesPossibles.length]), rng) : [];

  const cards: PlannedCard[] = [];
  for (let i = 0; i < n; i++) {
    const type = types[i] ?? "Unité";
    const rarity = rarities[i] ?? "Commune";
    let mana = manas?.[i] ?? piocheMana(rarity, brief, rng);
    mana = Math.max(brief.constraints.minMana ?? 1, Math.min(brief.constraints.maxMana ?? 10, mana));
    let race: string | null = racesLot[i] ?? null;
    let clan: string | null = null;
    // Clan : parmi ceux du brief compatibles avec la race, sinon au hasard parmi ceux de la race.
    const clansRace = race ? getClanNamesForRace(brief.faction, race) : [];
    const voulus = brief.clans.length ? brief.clans.filter((c) => clansRace.includes(c) || getRacesForClan(c).includes(race ?? "")) : [];
    if (voulus.length) clan = voulus[Math.floor(rng() * voulus.length)];
    else if (brief.clans.length && !race) clan = brief.clans[Math.floor(rng() * brief.clans.length)];
    else if (!brief.clans.length && clansRace.length) clan = clansRace[Math.floor(rng() * clansRace.length)];
    race = deriveRaceForClan(brief.faction, clan, mana) ?? race;
    cards.push({
      index: i, type, rarity, mana, faction: brief.faction, race, clan,
      gender: type === "Unité" ? GENRE[genres[iGenre++] ?? "O"] : "neutre", abilities: [], locked: [], modes: {}, cost: null,
    });
  }

  // Emplacements de capacités, puis obligatoires de race (Unités).
  const exclues = new Set(brief.constraints.excludedAbilities ?? []);
  const slots = cards.map((c) => nombreCapacites(c.type, c.rarity, brief.constraints.maxAbilitiesPerCard, rng));
  for (const c of cards) {
    if (c.type !== "Unité") continue;
    for (const l of regleRace(c.race, c.clan).obligatoires) {
      const id = idDeLabel(l);
      if (id && !c.abilities.includes(id)) { c.abilities.push(id); c.locked.push(id); }
    }
  }
  const libre = (i: number) => slots[i] - cards[i].abilities.length;
  const totalSlots = cards.reduce((s, c, i) => s + Math.max(slots[i], c.abilities.length), 0);

  // Quotas exacts des capacités privilégiées (part de TOUTES les capacités posées).
  const pcts = Object.fromEntries(brief.abilities.map((a) => [a.id, a.pct])) as Record<string, number>;
  const resteP = Math.max(0, 100 - brief.abilities.reduce((s, a) => s + a.pct, 0));
  const quotasBruts = largestRemainder<string>({ ...pcts, ...(resteP > 0 ? { __hasard: resteP } : {}) }, totalSlots);
  const quotas: BatchPlan["quotas"] = [];
  const compatibles = (id: string) => cards.filter((c, i) => capaciteCompatible(id, c.type) && !regleRace(c.race, c.clan).interdits.includes(labelUnite(id) ?? "") && !c.abilities.includes(id) && libre(i) > 0);
  // Les capacités les plus difficiles à placer d'abord.
  const ordre = brief.abilities.map((a) => a.id).sort((a, b) => compatibles(a).length - compatibles(b).length);
  for (const id of ordre) {
    const demande = quotasBruts[id] ?? 0;
    let pose = cards.filter((c) => c.abilities.includes(id)).length; // déjà obligatoire
    // Les races qui portent le mieux la capacité d'abord (Vol → Chiroptères
    // avant Homuncules), puis les cartes qui ont le plus de place. Le mélange
    // préalable départage les ex æquo au hasard.
    const cibles = shuffle(compatibles(id), rng)
      .sort((a, b) => affinite(b, id) - affinite(a, id) || libre(b.index) - libre(a.index));
    for (const c of cibles) {
      if (pose >= demande) break;
      c.abilities.push(id); c.locked.push(id); pose++;
    }
    quotas.push({ id, demande, pose });
    if (pose < demande) warnings.push(`${ABILITIES[id]?.label ?? id} : ${pose} posée(s) sur ${demande} demandée(s) (pas assez de cartes compatibles).`);
  }

  // Complément au hasard, cohérent avec la race (profils likelyKeywords).
  for (const c of cards) {
    while (libre(c.index) > 0) {
      const id = tirerComplement(c, exclues, rng);
      if (!id) break;
      c.abilities.push(id);
    }
  }

  // Une Action garde toujours un effet principal ; un modificateur de dégâts
  // appelle une capacité qui inflige des dégâts.
  for (const c of cards) if (c.type === "Action") garantirEffetPrincipal(c, exclues, rng);

  // Déclencheurs.
  for (const c of cards) {
    if (c.type !== "Unité") continue;
    for (const id of c.abilities) {
      const label = labelUnite(id);
      const mode = label ? pickTrigger(label, brief, rng) : null;
      if (label && mode) c.modes[label] = mode;
    }
  }

  // Coûts additionnels : part des cartes par fréquence, un seul par carte.
  const parts = Object.fromEntries(brief.additionalCosts.map((x) => [x.cost, COST_FREQ_SHARE[x.freq]])) as Record<BriefCost, number>;
  const totalPart = Object.values(parts).reduce((s, v) => s + v, 0);
  const echelle = totalPart > 1 ? 1 / totalPart : 1;
  const nbCouts = largestRemainder<string>(
    { ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v * echelle])), __aucun: Math.max(0, 1 - totalPart * echelle) },
    n,
  );
  const ordreCartes = shuffle(cards, rng);
  let k = 0;
  for (const [kind, nb] of Object.entries(nbCouts)) {
    if (kind === "__aucun") continue;
    for (let j = 0; j < nb && k < ordreCartes.length; j++, k++) {
      const c = ordreCartes[k];
      c.cost = { kind: kind as BriefCost, n: valeurCout(kind as BriefCost, c.mana) };
    }
  }

  return { cards, quotas, warnings };
}

function garantirEffetPrincipal(c: PlannedCard, exclues: Set<string>, rng: Rng): void {
  const aDegats = c.abilities.some((id) => SORTS_DE_DEGATS.has(id));
  const veutDegats = c.abilities.some((id) => MODIFICATEURS_DE_DEGATS.has(id)) && !aDegats;
  if (!veutDegats && c.abilities.some(estEffetPrincipal)) return;
  const tier = RARITY_MAP[c.rarity]?.tier ?? 0;
  const fac = FACTIONS[c.faction];
  const dispo = Object.values(ABILITIES)
    .filter((a) => sortGenerable(a.id) && estEffetPrincipal(a.id) && !exclues.has(a.id) && !c.abilities.includes(a.id))
    .filter((a) => !veutDegats || SORTS_DE_DEGATS.has(a.id))
    .filter((a) => (a.creature?.minTier ?? 0) <= tier);
  const id = pickWeighted(dispo, (a) => fac.likelyKeywords[a.creature?.label ?? a.label] ?? 0.12, rng)?.id;
  if (id) c.abilities.unshift(id);
}

function tirerComplement(c: PlannedCard, exclues: Set<string>, rng: Rng): string | null {
  const interdits = new Set(regleRace(c.race, c.clan).interdits);
  if (c.type === "Unité") {
    const dispo = getAvailableKeywords(c.faction, c.rarity, c.race ?? undefined, c.clan ?? undefined)
      .map((k) => ({ id: idDeLabel(k.id), label: k.id, weight: k.weight }))
      .filter((k): k is { id: string; label: string; weight: number } => !!k.id && labelUnite(k.id) === k.label)
      .filter((k) => !exclues.has(k.id) && !interdits.has(k.label) && !c.abilities.includes(k.id));
    return pickWeighted(dispo, (k) => k.weight, rng)?.id ?? null;
  }
  const tier = RARITY_MAP[c.rarity]?.tier ?? 0;
  const fac = FACTIONS[c.faction];
  const aDegats = c.abilities.some((id) => SORTS_DE_DEGATS.has(id));
  const dispo = Object.values(ABILITIES)
    .filter((a) => sortGenerable(a.id) && !exclues.has(a.id) && !c.abilities.includes(a.id))
    .filter((a) => (MODIFICATEURS_DE_DEGATS.has(a.id) ? aDegats : META_DE_SORT.has(a.id) ? c.abilities.length > 0 : true))
    .filter((a) => (a.creature?.minTier ?? 0) <= tier && !fac.forbiddenKeywords.includes(a.creature?.label ?? a.label));
  const profil = (a: (typeof dispo)[number]) => fac.likelyKeywords[a.creature?.label ?? a.label];
  const ponderes = resserrerProfil(
    dispo.map((a) => ({ a, w: profil(a) ?? POIDS_HORS_PROFIL, profiled: profil(a) !== undefined })),
    (x) => x.w, (x) => x.profiled, (x, w) => ({ ...x, w }),
  );
  return pickWeighted(ponderes, (x) => x.w, rng)?.a.id ?? null;
}

/** Affinité d'une carte pour une capacité : son poids de tirage selon le
 *  profil clan > race > faction (0 si la capacité ne lui est pas tirable). */
export function affinite(c: PlannedCard, id: string): number {
  if (c.type === "Unité") {
    const label = labelUnite(id);
    if (!label) return 0;
    const k = getAvailableKeywords(c.faction, c.rarity, c.race ?? undefined, c.clan ?? undefined).find((k) => k.id === label);
    // Poids BRUT (non resserré) : comparable à celui d'une Action.
    return !k ? 0 : k.profiled ? k.weight : POIDS_HORS_PROFIL;
  }
  const a = ABILITIES[id];
  return FACTIONS[c.faction]?.likelyKeywords[a?.creature?.label ?? a?.label ?? ""] ?? POIDS_HORS_PROFIL;
}

// ─── Équilibrage au barème ──────────────────────────────────────────────────

export interface BalancedCard {
  plan: PlannedCard;
  cardType: CardType;
  attack: number | null;
  health: number | null;
  /** Unité : libellés de forge posés et leurs X. */
  labels: string[];
  xValues: Record<string, number>;
  yValues: Record<string, number>;
  /** Action : capacités de sort. */
  spellKeywords: SpellKeywordInstance[];
  score: ScoreCarte;
  /** Capacités retirées faute de budget. */
  retirees: string[];
}

const CHAMP_COUT: Record<BriefCost, keyof Card> = {
  life: "life_cost", discard: "discard_cost", sacrifice: "sacrifice_cost", exile: "exile_cost", topdeck: "topdeck_cost",
};

/** Champs « carte » communs au score et à l'enregistrement. */
export function champsCarte(b: Omit<BalancedCard, "score" | "retirees">) {
  const isSpell = b.cardType === "spell";
  const keyword_instances = isSpell ? [] : buildKeywordInstances({
    labels: b.labels, xValues: b.xValues, yValues: b.yValues, modes: b.plan.modes, isSpellCard: false,
    extras: {
      rfY: b.yValues["Renforcement +X/+Y"], afY: b.yValues["Affaiblissement -X/-Y"], glY: b.yValues["Gloire +X/+Y"],
      fdaY: b.yValues["Force des ancêtres +X/+Y"], dcY: b.yValues["Déchainement X/Y"],
    },
  });
  const keywords = isSpell ? [] : b.labels.map((l) => FORGE_TO_GAME_KEYWORD[l]).filter((k): k is Keyword => !!k);
  const couts = { life_cost: 0, discard_cost: 0, sacrifice_cost: 0, exile_cost: 0, topdeck_cost: 0, eveil_cost: 0 } as Record<string, number>;
  if (b.plan.cost) couts[CHAMP_COUT[b.plan.cost.kind] as string] = b.plan.cost.n;
  return {
    card_type: b.cardType,
    mana_cost: b.plan.mana,
    attack: b.attack,
    health: b.health,
    rarity: b.plan.rarity,
    keywords,
    keyword_instances: keyword_instances.length ? keyword_instances : null,
    spell_keywords: isSpell && b.spellKeywords.length ? b.spellKeywords : null,
    spell_effects: null,
    ...couts,
  };
}

function noter(bareme: Bareme, b: Omit<BalancedCard, "score" | "retirees">): ScoreCarte {
  const brouillon = { ...champsCarte(b), effect_text: "" } as unknown as Card;
  let caps: ReturnType<typeof deriveCapabilities> = [];
  try { caps = deriveCapabilities(brouillon); } catch { caps = []; }
  return scoreCarte(bareme, { ...brouillon, capabilities: caps });
}

const TOLERANCE = 0.05;
/** Au-delà de cet écart seulement, on touche à la STRUCTURE de la carte
 *  (retirer une capacité, monter X). En deçà, l'écart vient de la granularité
 *  des stats — un point d'ATK vaut ~13 % du budget d'une carte à 3 mana — et
 *  on garde la carte telle que planifiée. */
const TOLERANCE_STRUCTURE = 0.10;

/** ATK/DEF puis X ajustés pour approcher le barème (±5 %). En dernier
 *  recours, le coût en mana bouge de ±1 puis ±2 (dans les bornes du brief),
 *  et une carte encore trop faible (Action sans X : Boomerang, Silence)
 *  reçoit une capacité de complément — sans dépasser 2 capacités sur une
 *  Commune, 3 au-delà. */
export function equilibrer(
  plan: PlannedCard,
  bareme: Bareme = getBareme(),
  bornes: { minMana?: number; maxMana?: number } = {},
): BalancedCard {
  let best = equilibrerBorne(plan, bareme, bornes);
  const plafond = plan.type === "Action" ? (["Épique", "Légendaire"].includes(plan.rarity) ? 3 : 2) : plan.rarity === "Commune" ? 2 : 3;
  const rng = seededRng(plan.index * 7919 + plan.mana);
  let enrichi = plan;
  while (best.score.ratio < 1 - TOLERANCE && enrichi.abilities.length < plafond) {
    const id = tirerComplement(enrichi, new Set(), rng);
    if (!id) break;
    enrichi = { ...enrichi, abilities: [...enrichi.abilities, id] };
    const r = equilibrerBorne(enrichi, bareme, bornes);
    if (Math.abs(r.score.ratio - 1) < Math.abs(best.score.ratio - 1)) best = r;
  }
  return best;
}

function equilibrerBorne(plan: PlannedCard, bareme: Bareme, bornes: { minMana?: number; maxMana?: number }): BalancedCard {
  const lo = Math.max(1, bornes.minMana ?? 1), hi = Math.min(10, bornes.maxMana ?? 10);
  let best = equilibrerAMana(plan, bareme);
  if (Math.abs(best.score.ratio - 1) <= TOLERANCE) return best;
  for (const d of [1, -1, 2, -2]) {
    const mana = plan.mana + d;
    if (mana < lo || mana > hi) continue;
    const r = equilibrerAMana({ ...plan, mana }, bareme);
    if (Math.abs(r.score.ratio - 1) < Math.abs(best.score.ratio - 1)) best = r;
    if (Math.abs(best.score.ratio - 1) <= TOLERANCE) break;
  }
  return best;
}

function equilibrerAMana(plan: PlannedCard, bareme: Bareme): BalancedCard {
  const isUnit = plan.type === "Unité";
  const retirees: string[] = [];
  let abilities = [...plan.abilities];
  // Au-delà, X ne veut plus dire grand-chose (Rappel 10, Conquête 10…).
  const xMax = Math.min(10, plan.mana + 2);

  const construire = (atk: number | null, def: number | null, xs: Record<string, number>) => {
    const labels = isUnit ? abilities.map(labelUnite).filter((l): l is string => !!l) : [];
    const xValues: Record<string, number> = {};
    const yValues: Record<string, number> = {};
    const spellKeywords: SpellKeywordInstance[] = [];
    if (isUnit) {
      for (const l of labels) if (KEYWORDS[l]?.scalable) {
        xValues[l] = xs[l] ?? 1;
        if (aDeuxValeurs(l)) yValues[l] = xs[l] ?? 1;
      }
    } else {
      for (const id of abilities) {
        const p = ABILITIES[id]?.spell?.params ?? [];
        const x = xs[id] ?? 1;
        const inst: SpellKeywordInstance = { id: id as SpellKeywordInstance["id"] };
        if (p.includes("amount")) inst.amount = x;
        if (p.includes("attack")) { inst.attack = x; inst.health = x; }
        spellKeywords.push(inst);
      }
    }
    return { plan: { ...plan, abilities }, cardType: (isUnit ? "creature" : "spell") as CardType, attack: atk, health: def, labels, xValues, yValues, spellKeywords };
  };
  const scalables = () => isUnit
    ? abilities.map(labelUnite).filter((l): l is string => !!l && !!KEYWORDS[l]?.scalable)
    : abilities.filter((id) => (ABILITIES[id]?.spell?.params ?? []).length > 0);
  const xs: Record<string, number> = {};
  for (const k of scalables()) xs[k] = Math.max(1, Math.floor(plan.mana / 3));

  const w = isUnit ? getStatWeights(plan.faction, plan.race, plan.clan) : { atk: 1, def: 1 };
  const maxRatio = w.atk > 1.3 || w.def > 1.3 ? 3.0 : 2.5;
  const statsDe = (total: number): [number, number] => {
    let atk = Math.max(1, Math.round(total * (w.atk / (w.atk + w.def))));
    let def = Math.max(1, total - atk);
    if (Math.max(atk, def) / Math.min(atk, def) > maxRatio) {
      if (atk > def) atk = Math.floor(def * maxRatio); else def = Math.floor(atk * maxRatio);
    }
    return [atk, def];
  };

  /** Meilleur total de stats pour les X courants. */
  const meilleur = () => {
    if (!isUnit) { const c = construire(null, null, xs); return { c, s: noter(bareme, c) }; }
    let best: { c: ReturnType<typeof construire>; s: ScoreCarte } | null = null;
    for (let total = 2; total <= plan.mana * 3 + 8; total++) {
      const [atk, def] = statsDe(total);
      const c = construire(atk, def, xs);
      const s = noter(bareme, c);
      if (!best || Math.abs(s.ratio - 1) < Math.abs(best.s.ratio - 1)) best = { c, s };
      if (s.ratio > 1 + TOLERANCE) break; // au-delà, ça ne fait qu'empirer
    }
    return best!;
  };

  let res = meilleur();
  for (let iter = 0; iter < 40 && Math.abs(res.s.ratio - 1) > TOLERANCE; iter++) {
    const trop = res.s.ratio > 1;
    const sc = scalables();
    if (Math.abs(res.s.ratio - 1) <= TOLERANCE_STRUCTURE) {
      // Seule retouche permise : baisser un X au-dessus de 1 si ça rapproche.
      const k = trop ? sc.filter((x) => (xs[x] ?? 1) > 1)[0] : undefined;
      if (!k) break;
      xs[k] -= 1;
      const r2 = meilleur();
      if (Math.abs(r2.s.ratio - 1) < Math.abs(res.s.ratio - 1)) { res = r2; continue; }
      xs[k] += 1;
      break;
    }
    if (trop) {
      const k = sc.filter((x) => (xs[x] ?? 1) > 1).sort((a, b) => (xs[b] ?? 1) - (xs[a] ?? 1))[0];
      if (k) { xs[k] -= 1; res = meilleur(); continue; }
      // Retire d'abord une capacité de COMPLÉMENT, jamais un quota ni un obligatoire.
      const retirable = [...abilities].reverse().find((id) => !plan.locked.includes(id));
      if (retirable && abilities.length > 1) { abilities = abilities.filter((x) => x !== retirable); retirees.push(retirable); res = meilleur(); continue; }
      break;
    } else {
      const k = sc.filter((x) => (xs[x] ?? 1) < xMax).sort((a, b) => (xs[a] ?? 1) - (xs[b] ?? 1))[0];
      if (k) { const avant = res.s.ratio; xs[k] += 1; res = meilleur(); if (res.s.ratio > 1 + TOLERANCE && avant < 1) { xs[k] -= 1; res = meilleur(); break; } continue; }
      break;
    }
  }
  return { ...res.c, score: res.s, retirees };
}

/** Règle de nom (arbitrage 2026-10-12) : au-dessus de Commune = édition
 *  limitée ⇒ nom propre ou unité spécifique ; Commune ⇒ jamais de nom propre. */
export function regleNom(rarity: string): "propre" | "generique" {
  return rarity === "Commune" ? "generique" : "propre";
}

