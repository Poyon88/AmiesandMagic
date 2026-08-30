// BARÈME MODIFIABLE — surcharge PARTAGÉE du modèle de coût.
//
// Les coûts vivent dans des constantes compilées (`KEYWORDS`, `STAT_COST`,
// `ADDITIONAL_COST_POINTS`, `BUDGET`, `RARITIES`). L'onglet Budget de la forge
// permet de les régler sans redéploiement : les écarts sont enregistrés EN BASE
// (`balance_overrides`, ligne unique) et réappliqués par-dessus les valeurs
// d'origine à chaque ouverture de la forge, sur n'importe quelle machine.
//
// Ils vivaient auparavant dans le `localStorage`, qui est cloisonné par ORIGINE :
// un coût réglé sur localhost restait invisible sur le serveur dev. Le stockage
// navigateur ne sert plus qu'à RÉCUPÉRER ces anciens réglages (cf. plus bas) ;
// il n'est plus jamais écrit, pour qu'il n'existe qu'une seule source de vérité.
//
// Pourquoi muter les objets en place plutôt qu'exposer des accesseurs : les
// consommateurs (jauge de la forge, générateur, panneaux d'aide) lisent déjà ces
// objets à une quinzaine d'endroits. Les muter fait porter la surcharge partout
// d'un coup, sans toucher un seul appelant — et sans risquer d'en oublier un.
//
// AUCUN RISQUE DE DÉSYNCHRONISATION : ces coûts ne servent qu'à CRÉER des cartes
// (jauge d'auteur, générateur automatique). Le moteur de jeu ne les lit jamais
// en partie — les stats d'une carte sont figées à sa création. Une surcharge
// ne peut donc pas faire diverger deux clients.
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

/** Ancienne clé de stockage navigateur. Conservée en LECTURE seule, pour offrir
 *  de reprendre un barème réglé avant le passage en base. */
const CLE_NAVIGATEUR = "am.balance.overrides.v1";

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

/** Le barème actuellement APPLIQUÉ aux constantes.
 *
 *  Il est tenu ici parce que deux composants distincts en ont besoin : la forge
 *  l'applique à l'ouverture (depuis le serveur), l'éditeur de barème l'affiche
 *  et l'édite. Le faire descendre en props obligerait à traverser un composant
 *  de six mille lignes ; le relire depuis les constantes muté serait ambigu (une
 *  valeur égale au défaut n'est pas la même chose qu'une valeur non surchargée). */
let courant: BalanceOverrides = {};

export function getBalanceOverrides(): BalanceOverrides {
  return courant;
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
  courant = ov;
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

const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Ne garde d'un objet quelconque que ce qui est un barème valide : clés
 *  connues, nombres finis. Tout le reste est écarté SANS erreur.
 *
 *  Appelé aux deux frontières — ce que la route reçoit du navigateur, et ce que
 *  le serveur relit de la base. Un JSONB est une porte ouverte : une clé
 *  inventée ou un `NaN` glissé là traverserait sinon jusqu'à `Math.round` et
 *  ferait afficher une jauge « NaN/NaN » sans que rien ne signale d'où ça vient.
 *  Écarter une capacité inconnue est délibéré aussi : renommer un mot-clé ne
 *  doit pas laisser une entrée morte grossir le barème à chaque écriture. */
export function sanitizeBalanceOverrides(brut: unknown): BalanceOverrides {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return {};
  const src = brut as Record<string, unknown>;
  const out: BalanceOverrides = {};

  const kwSrc = src.keywords;
  if (kwSrc && typeof kwSrc === "object" && !Array.isArray(kwSrc)) {
    const kw: NonNullable<BalanceOverrides["keywords"]> = {};
    for (const [label, v] of Object.entries(kwSrc as Record<string, unknown>)) {
      if (!DEFAUTS.keywords[label] || !v || typeof v !== "object") continue;
      const { cost, costPerX } = v as Record<string, unknown>;
      const entree: { cost?: number; costPerX?: number } = {};
      if (estNombre(cost)) entree.cost = cost;
      if (estNombre(costPerX)) entree.costPerX = costPerX;
      if (Object.keys(entree).length) kw[label] = entree;
    }
    if (Object.keys(kw).length) out.keywords = kw;
  }

  const statSrc = src.stat as Record<string, unknown> | undefined;
  if (statSrc && typeof statSrc === "object") {
    const stat: NonNullable<BalanceOverrides["stat"]> = {};
    if (estNombre(statSrc.atk)) stat.atk = statSrc.atk;
    if (estNombre(statSrc.def)) stat.def = statSrc.def;
    if (Object.keys(stat).length) out.stat = stat;
  }

  const addSrc = src.additional as Record<string, unknown> | undefined;
  if (addSrc && typeof addSrc === "object") {
    const add: NonNullable<BalanceOverrides["additional"]> = {};
    for (const k of Object.keys(DEFAUTS.additional) as (keyof typeof ADDITIONAL_COST_POINTS)[]) {
      if (estNombre(addSrc[k])) add[k] = addSrc[k] as number;
    }
    if (Object.keys(add).length) out.additional = add;
  }

  if (estNombre(src.budgetBase)) out.budgetBase = src.budgetBase;

  const rarSrc = src.rarityMultipliers as Record<string, unknown> | undefined;
  if (rarSrc && typeof rarSrc === "object") {
    const rar: Record<string, number> = {};
    for (const id of Object.keys(DEFAUTS.rarityMultipliers)) {
      if (estNombre(rarSrc[id])) rar[id] = rarSrc[id] as number;
    }
    if (Object.keys(rar).length) out.rarityMultipliers = rar;
  }

  return out;
}

/** Superpose `ajout` à `base`, valeur par valeur. Sert à REPRENDRE un barème
 *  laissé dans un navigateur sans écraser ce qui est déjà en base : un réglage
 *  local remplace son homologue partagé, mais ne fait pas disparaître un réglage
 *  partagé qu'il ne mentionne pas.
 *
 *  Fusion au niveau de la FEUILLE, et non de l'objet : deux barèmes qui touchent
 *  chacun un champ différent d'une même capacité doivent survivre tous les deux. */
export function mergeBalanceOverrides(base: BalanceOverrides, ajout: BalanceOverrides): BalanceOverrides {
  const keywords = { ...base.keywords };
  for (const [label, v] of Object.entries(ajout.keywords ?? {})) {
    keywords[label] = { ...keywords[label], ...v };
  }
  return {
    ...(Object.keys(keywords).length ? { keywords } : {}),
    ...((base.stat || ajout.stat) ? { stat: { ...base.stat, ...ajout.stat } } : {}),
    ...((base.additional || ajout.additional) ? { additional: { ...base.additional, ...ajout.additional } } : {}),
    ...(ajout.budgetBase ?? base.budgetBase) != null
      ? { budgetBase: ajout.budgetBase ?? base.budgetBase }
      : {},
    ...((base.rarityMultipliers || ajout.rarityMultipliers)
      ? { rarityMultipliers: { ...base.rarityMultipliers, ...ajout.rarityMultipliers } }
      : {}),
  };
}

/** Barème enregistré en base. Toute erreur — réseau, session expirée, table
 *  absente parce que la migration n'est pas passée — rend un barème VIDE : la
 *  forge doit s'ouvrir sur les valeurs d'origine, jamais refuser de s'ouvrir. */
export async function fetchBalanceOverrides(): Promise<BalanceOverrides> {
  try {
    const res = await fetch("/api/balance");
    if (!res.ok) return {};
    const body = (await res.json()) as { overrides?: unknown };
    return sanitizeBalanceOverrides(body?.overrides);
  } catch {
    return {};
  }
}

/** Écrit le barème en base. Rend l'erreur au lieu de la taire : contrairement à
 *  la lecture, un enregistrement qui échoue en silence ferait croire à l'auteur
 *  que son réglage est parti — c'est exactement le défaut qu'on répare ici. */
export async function saveBalanceOverridesToDb(ov: BalanceOverrides): Promise<void> {
  const res = await fetch("/api/balance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overrides: ov }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Enregistrement refusé (${res.status})`);
  }
}

/** Barème laissé dans CE navigateur par l'ancienne version. Lecture seule : il
 *  n'est plus jamais écrit. Sert à proposer de reprendre des réglages faits
 *  avant le passage en base, qui seraient sinon inatteignables. */
export function loadBrowserOverrides(): BalanceOverrides {
  if (typeof window === "undefined") return {};
  try {
    const brut = window.localStorage.getItem(CLE_NAVIGATEUR);
    if (!brut) return {};
    return sanitizeBalanceOverrides(JSON.parse(brut));
  } catch {
    return {};
  }
}

/** Oublie le barème local, une fois repris en base. Sans cela la proposition de
 *  reprise reviendrait à chaque ouverture, indéfiniment. */
export function clearBrowserOverrides(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLE_NAVIGATEUR);
  } catch {
    /* stockage indisponible : la proposition réapparaîtra, sans gravité. */
  }
}
