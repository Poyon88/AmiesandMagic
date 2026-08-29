// BARÈME MODIFIABLE — surcharge locale du modèle de coût.
//
// Les coûts vivent dans des constantes compilées (`KEYWORDS`, `STAT_COST`,
// `ADDITIONAL_COST_POINTS`, `BUDGET`, `RARITIES`). L'onglet Barème de la forge
// permet de les régler sans redéploiement : les écarts sont mémorisés dans le
// navigateur et RÉAPPLIQUÉS au chargement, par-dessus les valeurs d'origine.
//
// Pourquoi muter les objets en place plutôt qu'exposer des accesseurs : les
// consommateurs (jauge de la forge, générateur, panneaux d'aide) lisent déjà ces
// objets à une quinzaine d'endroits. Les muter fait porter la surcharge partout
// d'un coup, sans toucher un seul appelant — et sans risquer d'en oublier un.
//
// AUCUN RISQUE DE DÉSYNCHRONISATION : ces coûts ne servent qu'à CRÉER des cartes
// (jauge d'auteur, générateur automatique). Le moteur de jeu ne les lit jamais
// en partie — les stats d'une carte sont figées à sa création. Une surcharge
// locale ne peut donc pas faire diverger deux clients.
import { KEYWORDS } from "@/lib/game/abilities";
import { STAT_COST, ADDITIONAL_COST_POINTS, BUDGET, RARITIES } from "./constants";

export interface BalanceOverrides {
  /** Par LIBELLÉ de capacité (la clé de KEYWORDS), pas par id moteur. */
  keywords?: Record<string, { cost?: number; costPerX?: number }>;
  stat?: { atk?: number; def?: number };
  additional?: Partial<Record<keyof typeof ADDITIONAL_COST_POINTS, number>>;
  budgetBase?: number;
  /** Par id de rareté (« Commune », « Rare »…). */
  rarityMultipliers?: Record<string, number>;
}

const CLE = "am.balance.overrides.v1";

/** Valeurs d'ORIGINE, capturées au chargement du module, avant toute surcharge.
 *  C'est ce qui rend « rétablir » exact plutôt qu'approximatif. */
const DEFAUTS = {
  keywords: Object.fromEntries(
    Object.entries(KEYWORDS).map(([k, v]) => [k, { cost: v.cost, costPerX: v.costPerX }]),
  ) as Record<string, { cost: number; costPerX: number }>,
  stat: { ...STAT_COST },
  additional: { ...ADDITIONAL_COST_POINTS },
  budgetBase: BUDGET.base,
  rarityMultipliers: Object.fromEntries(RARITIES.map((r) => [r.id, r.multiplier])) as Record<string, number>,
};

export function balanceDefaults() {
  return DEFAUTS;
}

/** Remet TOUT à l'origine, puis applique les écarts fournis. Repartir des
 *  défauts à chaque fois évite qu'une valeur retirée de la surcharge reste
 *  collée à son ancien réglage. */
export function applyBalanceOverrides(ov: BalanceOverrides): void {
  for (const [label, d] of Object.entries(DEFAUTS.keywords)) {
    const cible = KEYWORDS[label];
    if (!cible) continue;
    cible.cost = ov.keywords?.[label]?.cost ?? d.cost;
    cible.costPerX = ov.keywords?.[label]?.costPerX ?? d.costPerX;
  }
  STAT_COST.atk = ov.stat?.atk ?? DEFAUTS.stat.atk;
  STAT_COST.def = ov.stat?.def ?? DEFAUTS.stat.def;
  for (const k of Object.keys(DEFAUTS.additional) as (keyof typeof ADDITIONAL_COST_POINTS)[]) {
    ADDITIONAL_COST_POINTS[k] = ov.additional?.[k] ?? DEFAUTS.additional[k];
  }
  BUDGET.base = ov.budgetBase ?? DEFAUTS.budgetBase;
  for (const r of RARITIES) {
    r.multiplier = ov.rarityMultipliers?.[r.id] ?? DEFAUTS.rarityMultipliers[r.id];
  }
}

/** Nombre de valeurs qui s'écartent RÉELLEMENT de l'origine. Une surcharge qui
 *  répète la valeur par défaut ne compte pas : le badge de la forge doit dire
 *  « rien n'a bougé », pas « une entrée existe ». */
export function countBalanceChanges(ov: BalanceOverrides): number {
  let n = 0;
  for (const [label, v] of Object.entries(ov.keywords ?? {})) {
    const d = DEFAUTS.keywords[label];
    if (!d) continue;
    if (v.cost != null && v.cost !== d.cost) n++;
    if (v.costPerX != null && v.costPerX !== d.costPerX) n++;
  }
  if (ov.stat?.atk != null && ov.stat.atk !== DEFAUTS.stat.atk) n++;
  if (ov.stat?.def != null && ov.stat.def !== DEFAUTS.stat.def) n++;
  for (const [k, v] of Object.entries(ov.additional ?? {})) {
    if (v != null && v !== DEFAUTS.additional[k as keyof typeof ADDITIONAL_COST_POINTS]) n++;
  }
  if (ov.budgetBase != null && ov.budgetBase !== DEFAUTS.budgetBase) n++;
  for (const [k, v] of Object.entries(ov.rarityMultipliers ?? {})) {
    if (v != null && v !== DEFAUTS.rarityMultipliers[k]) n++;
  }
  return n;
}

/** Lecture du stockage local. Toute erreur rend un barème VIDE : un stockage
 *  illisible (autre onglet, navigation privée, quota) doit rendre les valeurs
 *  d'origine, jamais faire planter la forge. */
export function loadBalanceOverrides(): BalanceOverrides {
  if (typeof window === "undefined") return {};
  try {
    const brut = window.localStorage.getItem(CLE);
    if (!brut) return {};
    const o = JSON.parse(brut) as BalanceOverrides;
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export function saveBalanceOverrides(ov: BalanceOverrides): void {
  if (typeof window === "undefined") return;
  try {
    if (countBalanceChanges(ov) === 0) window.localStorage.removeItem(CLE);
    else window.localStorage.setItem(CLE, JSON.stringify(ov));
  } catch {
    /* stockage indisponible : la surcharge vaut pour la session, sans plus. */
  }
}
