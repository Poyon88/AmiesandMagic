import { getTransverseRaceProfile,
  RARITIES, RARITY_MAP, KEYWORDS, FACTIONS, deriveRaceForClan,
  STAT_COST, BUDGET,
  MANA_WEIGHTS, MANA_WEIGHTS_BY_RARITY, RARITY_WEIGHTS_BY_MANA,
  RARITY_WEIGHTS_GLOBAL,
} from './constants';
import { regleRace } from './race-abilities';

// ─── UTILS ───────────────────────────────────────────────────────────────────

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function buildId() {
  return `am_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── MANA & RARITY PICKERS ───────────────────────────────────────────────────

export function pickMana(rarityId?: string) {
  const weights = (rarityId && MANA_WEIGHTS_BY_RARITY[rarityId]) || MANA_WEIGHTS;
  let r = Math.random();
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i + 1;
  }
  return 5;
}

export function pickRarityForMana(mana: number) {
  const weights = RARITY_WEIGHTS_BY_MANA[Math.min(mana, 10) - 1];
  let r = Math.random();
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return RARITIES[i].id;
  }
  return RARITIES[RARITIES.length - 1].id;
}

export function pickRarity() {
  let r = Math.random();
  for (let i = 0; i < RARITY_WEIGHTS_GLOBAL.length; i++) {
    r -= RARITY_WEIGHTS_GLOBAL[i];
    if (r <= 0) return RARITIES[i].id;
  }
  return RARITIES[RARITIES.length - 1].id;
}

// ─── BUDGET ──────────────────────────────────────────────────────────────────

function computeBudget(mana: number, rarityId: string) {
  const r = RARITY_MAP[rarityId];
  const base = mana * BUDGET.base * r.multiplier;
  const variance = base * 0.10;
  return Math.round(randFloat(base - variance, base + variance));
}

// ─── KEYWORDS ────────────────────────────────────────────────────────────────

export function getAvailableKeywords(factionId: string, _rarityId: string, raceId?: string, clanId?: string) {
  const faction = FACTIONS[factionId];
  // Plus de palier de rareté (`minTier`) depuis le 2026-10-17 : toutes les
  // capacités sont ouvertes à toutes les raretés, le barème en fait payer le
  // prix. La rareté reste dans la signature pour les appelants.
  // Poids des mots-clés : cascade CLAN > RACE > FACTION, comblée PAR MOT-CLÉ.
  // Le profil de clan prime ; un mot-clé absent de sa table retombe sur le
  // profil de race (ex. l'Aigle Géant garde son poids de Vol dans un clan elfe),
  // puis sur l'ombrelle de faction, puis sur le défaut 0.12.
  const clanKws = clanId ? faction.clanProfiles?.[clanId]?.likelyKeywords : undefined;
  // Race transverse (Insectes) hors de sa faction d'origine : son profil de
  // pouvoirs la suit, sinon un insecte elfe ne serait qu'un elfe.
  const raceKws = raceId ? (faction.raceProfiles?.[raceId] ?? getTransverseRaceProfile(raceId))?.likelyKeywords : undefined;
  // Cohérence de race/clan (race-abilities.ts) : un interdit n'est jamais tiré.
  const { interdits } = regleRace(raceId, clanId);
  const dispo = Object.entries(KEYWORDS)
    .filter(([id]) => !faction.forbiddenKeywords.includes(id) && !interdits.includes(id))
    .map(([id, kw]) => {
      // L'ombrelle de faction ne compte qu'à moitié quand la race ou le clan
      // a son propre profil : sinon le Poison des Morts-Vivants passait
      // devant l'Armure d'une Gargouille.
      const propre = clanKws?.[id] ?? raceKws?.[id];
      const fac = faction.likelyKeywords[id];
      const profil = propre ?? (fac !== undefined && (clanKws || raceKws) ? fac * 0.5 : fac);
      return { id, ...kw, weight: profil ?? POIDS_HORS_PROFIL, profiled: profil !== undefined };
    });
  return resserrerProfil(dispo, (k) => k.weight, (k) => k.profiled, (k, w) => ({ ...k, weight: w }));
}

/** Poids d'une capacité absente de tout profil (clan, race, faction). */
export const POIDS_HORS_PROFIL = 0.12;
/** Part MAXIMALE du tirage laissée aux capacités hors profil. Avec un poids
 *  fixe de 0,12 sur ~85 capacités, le hors-profil pesait ~80 % du tirage et
 *  noyait les 5-7 capacités typiques de la race (mesuré le 2026-10-17 :
 *  22 % seulement des tirages d'une Gargouille venaient de son profil).
 *  Resserré à 25 %, puis rouvert à 50 % (arbitrage de l'auteur, même jour) :
 *  les capacités typiques reviennent souvent sans uniformiser les lots. */
export const PART_HORS_PROFIL = 0.5;

/** Réduit le poids cumulé du hors-profil à `part` du total (sans jamais
 *  l'augmenter). Sans profil du tout, rien ne change : tirage uniforme. */
export function resserrerProfil<T>(
  items: T[],
  poids: (t: T) => number,
  estProfil: (t: T) => boolean,
  avecPoids: (t: T, w: number) => T,
  part = PART_HORS_PROFIL,
): T[] {
  const p = items.filter(estProfil).reduce((s, t) => s + poids(t), 0);
  const h = items.filter((t) => !estProfil(t)).reduce((s, t) => s + poids(t), 0);
  if (p <= 0 || h <= 0 || h / (p + h) <= part) return items;
  const k = (part * p) / ((1 - part) * h);
  return items.map((t) => (estProfil(t) ? t : avecPoids(t, poids(t) * k)));
}

function pickWeightedKeyword(available: ReturnType<typeof getAvailableKeywords>, alreadyPicked: string[]) {
  const pool = available.filter(k => !alreadyPicked.includes(k.id));
  if (!pool.length) return null;
  const total = pool.reduce((s, k) => s + k.weight, 0);
  let r = Math.random() * total;
  for (const kw of pool) {
    r -= kw.weight;
    if (r <= 0) return kw;
  }
  return pool[pool.length - 1];
}

/** Poids ATK/DEF : cascade d'OBJET entier CLAN > RACE > FACTION. */
export function getStatWeights(factionId: string, raceId?: string | null, clanId?: string | null): { atk: number; def: number } {
  const faction = FACTIONS[factionId];
  const clanStatW = clanId ? faction.clanProfiles?.[clanId]?.statWeights : undefined;
  const raceStatW = raceId ? faction.raceProfiles?.[raceId]?.statWeights : undefined;
  return { ...(clanStatW ?? raceStatW ?? faction.statWeights) };
}

// ─── MAIN GENERATOR ──────────────────────────────────────────────────────────

export function generateCardStats(factionId: string, type: string, rarityId: string, fixedMana: number | null = null, raceId?: string, clanId?: string) {
  const faction = FACTIONS[factionId];
  const isUnit = type === 'Unité';
  const mana = fixedMana ?? pickMana(rarityId);

  // Race persistée par le mana pour les clans « à sous-races » (Cohortes
  // Sanglantes, clan Hobbits). Sinon on conserve la race passée. `effectiveRace`
  // pilote le profil de race, la garantie Vol, et la valeur renvoyée (stockée
  // telle quelle sur la carte).
  const effectiveRace = deriveRaceForClan(factionId, clanId, mana) ?? raceId;

  // Poids de stats : cascade CLAN > RACE > FACTION (le profil de clan prime,
  // le profil de race comble, sinon l'ombrelle de faction).
  const statWeights = getStatWeights(factionId, effectiveRace, clanId);
  let budget = computeBudget(mana, rarityId);
  const totalBudget = budget;

  // Keywords fréquents (40% de chance chacun, remplace les garantis)
  let keywords: string[] = [];
  const keywordXValues: Record<string, number> = {};
  const FREQUENT_CHANCE = 0.40;

  if (isUnit) {
    // Capacités OBLIGATOIRES de la race / du clan (race-abilities.ts) : une
    // race ailée vole toujours. Le poids de Vol dans un profil ne suffit pas —
    // les poids sont RELATIFS entre ~130 mots-clés, « Vol: 0.85 » ne sortait
    // qu'une fois sur quatre-vingts (mesuré sur le Tengu).
    for (const l of regleRace(effectiveRace, clanId).obligatoires) keywords.push(l);

    // Faction guaranteed keywords → fréquents à 40%
    for (const kid of faction.guaranteedKeywords) {
      if (keywords.includes(kid)) continue; // déjà ajouté (ex: Vol Dragons)
      const kw = KEYWORDS[kid];
      if (kw && Math.random() < FREQUENT_CHANCE) {
        keywords.push(kid);
      }
    }

    // Dédupliquer
    keywords = [...new Set(keywords)];
  }

  let attack: number | null = null, defense: number | null = null, power: number | null = null;

  if (isUnit) {
    // Stats : total fixe (vanilla test + bonus rareté), split variable
    const RARITY_STAT_BONUS: Record<string, number> = { 'Commune': 0, 'Peu Commune': 1, 'Rare': 1, 'Épique': 2, 'Légendaire': 2 };
    const statTotal = (mana * 2 + 1) + (RARITY_STAT_BONUS[rarityId] ?? 0);

    const totalWeight = statWeights.atk + statWeights.def;
    const baseAtk = statTotal * (statWeights.atk / totalWeight);
    const splitVariance = mana <= 3 ? 1 : 2;
    const atkRaw = Math.round(baseAtk) + randInt(-splitVariance, splitVariance);
    attack  = Math.max(1, Math.min(statTotal - 1, atkRaw));
    defense = Math.max(1, statTotal - attack);

    // Clamp dispersion ATK/DEF
    const maxRatio = statWeights.atk > 1.3 || statWeights.def > 1.3 ? 3.0 : 2.5;
    const hi = Math.max(attack, defense);
    const lo = Math.min(attack, defense);
    if (lo > 0 && hi / lo > maxRatio) {
      const clamped = Math.floor(lo * maxRatio);
      if (attack > defense) attack = clamped;
      else defense = clamped;
    }

    // Budget keywords : indépendant des stats, croît avec le mana
    const KW_BUDGET_CONFIG: Record<string, { base: number; factor: number }> = {
      'Commune':     { base: 0, factor: 1.5 },
      'Peu Commune': { base: 2, factor: 2.0 },
      'Rare':        { base: 4, factor: 2.5 },
      'Épique':      { base: 6, factor: 3.0 },
      'Légendaire':  { base: 8, factor: 4.0 },
    };
    const kwCfg = KW_BUDGET_CONFIG[rarityId] ?? { base: 4, factor: 2.5 };
    budget = Math.round(kwCfg.base + mana * kwCfg.factor);

    // Déduire les keywords déjà attribués (fréquents)
    for (const kid of keywords) budget -= KEYWORDS[kid]?.cost || 0;

    // Allocation keywords avec plafond et probabilité décroissante
    const KW_CONFIG: Record<string, { max: number; probs: number[] }> = {
      'Commune':     { max: 1, probs: [0.40] },
      'Peu Commune': { max: 2, probs: [0.55, 0.25] },
      'Rare':        { max: 2, probs: [0.65, 0.35] },
      'Épique':      { max: 3, probs: [0.75, 0.45, 0.20] },
      'Légendaire':  { max: 3, probs: [0.85, 0.55, 0.25] },
    };
    const kwConfig = KW_CONFIG[rarityId] || { max: 2, probs: [0.50, 0.25] };
    const available = getAvailableKeywords(factionId, rarityId, effectiveRace, clanId);
    let attempts = 0;
    while (keywords.length < kwConfig.max && attempts < 15) {
      const slotProb = kwConfig.probs[keywords.length] ?? 0;
      if (Math.random() > slotProb) break;
      const kw = pickWeightedKeyword(available, keywords);
      if (!kw || kw.cost > budget) break;

      // Scalable: determine X based on remaining budget
      let kwCost = kw.cost;
      if (kw.scalable && kw.costPerX > 0) {
        const maxAffordableX = Math.max(1, Math.floor((budget - kw.cost) / kw.costPerX) + 1);
        const desiredX = Math.max(1, Math.floor(mana / 3));
        const x = Math.min(maxAffordableX, desiredX);
        kwCost = kw.cost + kw.costPerX * (x - 1);
        keywordXValues[kw.id] = x;
      }

      if (kwCost > budget) break;
      keywords.push(kw.id);
      budget -= kwCost;
      attempts++;
    }
  } else {
    const powerMax = Math.floor((budget * 0.6) / STAT_COST.atk);
    power = Math.max(1, randInt(1, Math.max(1, powerMax)));
  }

  return {
    mana, attack, defense, power,
    // Race effectivement retenue (dérivée du mana pour les clans à sous-races,
    // sinon la race passée). La forge la persiste sur la carte.
    race: effectiveRace,
    keywords: [...new Set(keywords)],
    keywordXValues,
    budgetTotal: totalBudget,
    budgetUsed: Math.round(totalBudget - budget),
  };
}
