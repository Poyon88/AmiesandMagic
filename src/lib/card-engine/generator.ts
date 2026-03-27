import {
  RARITIES, RARITY_MAP, KEYWORDS, FACTIONS,
  STAT_COST, MANA_BUDGET_BASE,
  MANA_WEIGHTS, MANA_WEIGHTS_BY_RARITY, RARITY_WEIGHTS_BY_MANA,
  RARITY_WEIGHTS_GLOBAL,
} from './constants';

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
  const base = mana * MANA_BUDGET_BASE * r.multiplier;
  const variance = base * 0.10;
  return Math.round(randFloat(base - variance, base + variance));
}

// ─── KEYWORDS ────────────────────────────────────────────────────────────────

function getAvailableKeywords(factionId: string, rarityId: string, raceId?: string) {
  const faction = FACTIONS[factionId];
  const tier = RARITY_MAP[rarityId].tier;
  const raceKws: Record<string, number> | undefined = raceId ? faction.raceProfiles?.[raceId]?.likelyKeywords : undefined;
  return Object.entries(KEYWORDS)
    .filter(([id, kw]) => kw.minTier <= tier && !faction.forbiddenKeywords.includes(id))
    .map(([id, kw]) => ({ id, ...kw, weight: (raceKws ? raceKws[id] : undefined) ?? faction.likelyKeywords[id] ?? 0.12 }));
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

// ─── MAIN GENERATOR ──────────────────────────────────────────────────────────

export function generateCardStats(factionId: string, type: string, rarityId: string, fixedMana: number | null = null, raceId?: string) {
  const faction = FACTIONS[factionId];
  const isUnit = type === 'Unité';
  const mana = fixedMana ?? pickMana(rarityId);

  // Race-specific stat adjustments
  let statWeights = { ...faction.statWeights };
  const raceProfile = raceId && faction.raceProfiles?.[raceId];
  if (raceProfile) {
    statWeights = { ...raceProfile.statWeights };
  }

  // Sub-type stat adjustments (mana-based)
  if (faction.subType && isUnit) {
    const st = faction.subType;
    if (factionId === "Hobbits" && mana >= st.threshold && !raceProfile) {
      statWeights = { atk: 0.90, def: 1.50 };
    } else if (factionId === "Orcs" && mana < st.threshold && !raceProfile) {
      statWeights = { atk: 1.10, def: 0.70 };
    }
  }
  let budget = computeBudget(mana, rarityId);
  const totalBudget = budget;

  // Keywords fréquents (40% de chance chacun, remplace les garantis)
  let keywords: string[] = [];
  const FREQUENT_CHANCE = 0.40;

  if (isUnit) {
    // Dragons et Aigles Géants : Vol toujours garanti
    if (raceId === "Dragons" || raceId === "Aigles Géants" || raceId === "Air/Tempête") {
      keywords.push("Vol");
    }

    // Faction guaranteed keywords → fréquents à 40%
    for (const kid of faction.guaranteedKeywords) {
      if (keywords.includes(kid)) continue; // déjà ajouté (ex: Vol Dragons)
      const kw = KEYWORDS[kid];
      if (kw && kw.minTier <= RARITY_MAP[rarityId].tier && Math.random() < FREQUENT_CHANCE) {
        keywords.push(kid);
      }
    }

    // Sub-type frequent keywords
    if (faction.subType) {
      const st = faction.subType;
      if (factionId === "Hobbits" && mana >= st.threshold) {
        if (Math.random() < FREQUENT_CHANCE) keywords.push("Provocation");
        if (Math.random() < FREQUENT_CHANCE) keywords.push("Ancré");
      } else if (factionId === "Orcs" && mana < st.threshold) {
        if (Math.random() < FREQUENT_CHANCE) keywords.push("Traque");
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
    const available = getAvailableKeywords(factionId, rarityId, raceId);
    let attempts = 0;
    while (keywords.length < kwConfig.max && attempts < 15) {
      const slotProb = kwConfig.probs[keywords.length] ?? 0;
      if (Math.random() > slotProb) break;
      const kw = pickWeightedKeyword(available, keywords);
      if (!kw || kw.cost > budget) break;
      keywords.push(kw.id);
      budget -= kw.cost;
      attempts++;
    }
  } else {
    const powerMax = Math.floor((budget * 0.6) / STAT_COST.atk);
    power = Math.max(1, randInt(1, Math.max(1, powerMax)));
  }

  return {
    mana, attack, defense, power,
    keywords: [...new Set(keywords)],
    budgetTotal: totalBudget,
    budgetUsed: Math.round(totalBudget - budget),
  };
}
