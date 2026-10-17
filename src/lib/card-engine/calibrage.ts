// CALIBRAGE DU BARÈME sur les cartes Jouables.
//
// Modèle : mana + k × éveil ≈ (Σ termes × paramètres) / (points/mana × rareté × type)
// (cf. card-points.ts). Deux étages alternés :
//  1. paramètres en POINTS (stats, capacités, contenus composés, coûts
//     additionnels, socles) : moindres carrés pondérés RIDGE, rétrécis vers
//     l'ancien coût — une capacité vue sur deux cartes reste près de son a priori,
//     une capacité vue sur cent suit les données ;
//  2. MULTIPLICATEURS (déclencheurs, portée, cible, filtre, hasard, Singulier,
//     rareté, type, éveil) : recherche coordonnée sur une grille, rétrécie elle
//     aussi vers sa valeur a priori.
// Pondération robuste (Huber) : quelques cartes aberrantes ne tirent pas tout
// le barème. Échelle : 10 points par mana à la Commune (ancrage d'affichage —
// le modèle est libre, on le renormalise en fixant ces deux valeurs).
import type { Card } from "@/lib/game/types";
import { getCapabilities } from "@/lib/game/capability-adapter";
import { ABILITIES } from "@/lib/game/abilities";
import { ADDITIONAL_COST_POINTS, STAT_COST } from "./constants";
import { RARETE_FIXEE, type Bareme, type CoutLineaire } from "./bareme";
import { budgetCarte, facteurBudget, RETARD_A_PRIORI, termesCarte, valeurParametre, type CarteNotee } from "./card-points";

export type CarteCalibree = CarteNotee & Pick<Card, "id" | "name"> & Partial<Pick<Card, "race" | "clan" | "faction">>;

/** Contenus composés rattachés à la capacité nommée équivalente (a priori). */
const EQUIVALENCE_COMPOSE: Record<string, string> = {
  deal_damage: "impact", heal: "guerison", buff: "renforcement", debuff: "affaiblissement",
  draw_cards: "inspiration", summon_token: "convocation_simple", gain_mana: "afflux", destroy: "execution",
  bounce: "boomerang", paralyze: "entrave", grant_keyword: "conferer", transformation: "metamorphose",
  appel: "appel_du_clan", poison: "poison", exhumation: "exhumation", rappel: "rappel",
  invocation: "invocation", appel_supreme: "appel_supreme", tuteur: "tuteur", epargne: "epargne",
  foi: "foi", conquete: "conquete", exploration: "exploration", incineration: "incineration",
  devoration: "devoration", tactique: "tactique", retour_differe: "retour_differe", silence: "silence",
  dechainement: "dechainement", selection: "selection", selection_magique: "selection_magique",
  faveur: "faveur", renfort_royal: "renfort_royal", tresor: "tresor", forge: "forge",
};

const DECLENCHEURS_A_PRIORI: Bareme["declencheur"] = {
  on_play: 1, automatic: 1, spell_resolution: 1,
  on_death: 0.7, on_return: 0.6, on_activation: 1.2, on_attack: 0.8,
  on_end_of_turn: 1.5, on_end_of_turn_in_hand: 1, on_start_of_turn: 1.5, on_start_of_turn_in_hand: 1,
  on_draw: 0.8, on_low_hp: 0.6, on_wound: 0.8,
};

function coutAPriori(id: string): CoutLineaire | undefined {
  const c = ABILITIES[id]?.creature;
  if (!c) return undefined;
  return { base: c.cost, perX: c.costPerX, perY: c.costPerX, n: 0 };
}

/** Barème de départ : l'ancien barème plat, multiplicateurs a priori. */
export function baremeAPriori(): Bareme {
  const capacites: Record<string, CoutLineaire> = {};
  for (const id of Object.keys(ABILITIES)) {
    const c = coutAPriori(id);
    if (c) capacites[id] = c;
  }
  const composes: Bareme["composes"] = {};
  for (const [contenu, eq] of Object.entries(EQUIVALENCE_COMPOSE)) {
    composes[contenu as keyof Bareme["composes"]] = coutAPriori(eq) ?? { base: 8, perX: 3, perY: 3, n: 0 };
  }
  return {
    version: 1,
    pointsParMana: 10,
    stat: { atk: STAT_COST.atk, def: STAT_COST.def },
    socle: { creature: 0, spell: 0, item: 0 },
    type: { creature: 1, spell: 1, item: 1 },
    rarete: { ...RARETE_FIXEE },
    eveil: 0.5,
    additionnel: { ...ADDITIONAL_COST_POINTS },
    plafondAdditionnel: 0.4,
    declencheur: { ...DECLENCHEURS_A_PRIORI },
    portee: { all_enemies: 2, all_allies: 2, all: 1.5 },
    cible: { hero: 0.7, both: 1.5, self: 0.8, parCible: 0.7 },
    filtre: { a: 0.4 },
    parts: {},
    hasard: 0.8,
    singulier: 0.6,
    don: 0.8,
    capacites,
    composes,
  };
}

/** Part du catalogue de chaque groupe filtrable. */
export function calculerParts(cartes: CarteCalibree[]): Record<string, number> {
  const n = cartes.length || 1;
  const compte = new Map<string, number>();
  const inc = (k: string) => compte.set(k, (compte.get(k) ?? 0) + 1);
  for (const c of cartes) {
    if (c.race) inc(`race:${c.race}`);
    if (c.clan) inc(`clan:${c.clan}`);
    if (c.faction) inc(`faction:${c.faction}`);
    let ids: Set<string>;
    try { ids = new Set(getCapabilities(c as Card).map((k) => k.abilityId)); } catch { ids = new Set(); }
    for (const id of ids) inc(`kw:${id}`);
    for (let m = 0; m <= 10; m++) if (c.mana_cost <= m) inc(`cout<=${m}`);
  }
  const parts: Record<string, number> = {};
  for (const [k, v] of compte) parts[k] = Math.round((v / n) * 10000) / 10000;
  return parts;
}

// ─── Algèbre ────────────────────────────────────────────────────────────────

/** Résout A x = b (A symétrique définie positive grâce au ridge). */
function resoudre(A: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length;
  const M = A.map((r) => Float64Array.from(r));
  const v = Float64Array.from(b);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    [v[i], v[p]] = [v[p], v[i]];
    const piv = M[i][i] || 1e-12;
    for (let r = i + 1; r < n; r++) {
      const f = M[r][i] / piv;
      if (f === 0) continue;
      for (let c = i; c < n; c++) M[r][c] -= f * M[i][c];
      v[r] -= f * v[i];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = v[i];
    for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c];
    x[i] = s / (M[i][i] || 1e-12);
  }
  return x;
}

function ecrireParametre(b: Bareme, cle: string, v: number): void {
  const [fam, a, champ] = cle.split(".");
  const r = Math.round(v * 100) / 100;
  if (fam === "stat") b.stat[a as "atk" | "def"] = r;
  else if (fam === "socle") b.socle[a as keyof Bareme["socle"]] = r;
  else if (fam === "add") b.additionnel[a as keyof Bareme["additionnel"]] = r;
  else if (fam === "cap" || fam === "comp") {
    const map = (fam === "cap" ? b.capacites : b.composes) as Record<string, CoutLineaire>;
    const c = map[a] ?? (map[a] = { base: 0, perX: 0, perY: 0, n: 0 });
    c[champ as "base" | "perX" | "perY"] = r;
  }
}

// ─── Calibrage ──────────────────────────────────────────────────────────────

interface Ligne { carte: CarteCalibree; y: number; w: number }

function prediction(b: Bareme, c: CarteCalibree): number {
  const { termes, additionnels } = termesCarte(b, c);
  let pts = 0;
  for (const t of [...termes, ...additionnels]) pts += t.coef * valeurParametre(b, t.cle);
  return pts / facteurBudget(b, c) - b.eveil * (c.eveil_cost ?? 0);
}

function perte(b: Bareme, lignes: Ligne[]): number {
  let s = 0;
  for (const l of lignes) { const r = prediction(b, l.carte) - l.y; s += l.w * r * r; }
  return s;
}

/** Étage 1 : paramètres en points, à multiplicateurs figés. */
function ajusterLineaire(b: Bareme, a0: Bareme, lignes: Ligne[], tau: number): Map<string, number> {
  const index = new Map<string, number>();
  const rows: { coefs: Map<number, number>; y: number; w: number }[] = [];
  const presence = new Map<string, number>();
  for (const l of lignes) {
    const { termes, additionnels } = termesCarte(b, l.carte);
    const f = facteurBudget(b, l.carte);
    const coefs = new Map<number, number>();
    const vus = new Set<string>();
    for (const t of [...termes, ...additionnels]) {
      if (!index.has(t.cle)) index.set(t.cle, index.size);
      const i = index.get(t.cle)!;
      coefs.set(i, (coefs.get(i) ?? 0) + t.coef / f);
      vus.add(t.cle);
    }
    for (const k of vus) presence.set(k, (presence.get(k) ?? 0) + 1);
    rows.push({ coefs, y: l.y + b.eveil * (l.carte.eveil_cost ?? 0), w: l.w });
  }
  const n = index.size;
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const rhs = new Float64Array(n);
  const echelle = new Float64Array(n);
  for (const r of rows) {
    for (const [i, ci] of r.coefs) {
      rhs[i] += r.w * ci * r.y;
      echelle[i] += r.w * ci * ci;
      for (const [j, cj] of r.coefs) A[i][j] += r.w * ci * cj;
    }
  }
  const cles = [...index.keys()];
  for (const [k, i] of index) {
    // Force du rappel vers l'a priori : `tau` cartes « moyennes » pour ce
    // paramètre. Plus le paramètre est vu, plus les données l'emportent.
    const moy = echelle[i] / Math.max(1, presence.get(k) ?? 1);
    const faible = k.startsWith("stat.") || k.startsWith("socle.");
    const lambda = (faible ? 0.5 : tau) * Math.max(moy, 1e-4);
    const prior = valeurParametre(a0, k);
    A[i][i] += lambda;
    rhs[i] += lambda * prior;
  }
  const x = resoudre(A, rhs);
  cles.forEach((k, i) => ecrireParametre(b, k, x[i]));
  return presence;
}

interface Multiplicateur {
  nom: string;
  lire: (b: Bareme) => number;
  ecrire: (b: Bareme, v: number) => void;
  min: number; max: number;
}

function multiplicateurs(): Multiplicateur[] {
  const out: Multiplicateur[] = [];
  const libres = ["on_death", "on_return", "on_activation", "on_attack", "on_end_of_turn", "on_end_of_turn_in_hand",
    "on_start_of_turn", "on_start_of_turn_in_hand", "on_draw", "on_low_hp", "on_wound", "spell_resolution"] as const;
  for (const t of libres) out.push({ nom: `declencheur.${t}`, lire: (b) => b.declencheur[t] ?? 1, ecrire: (b, v) => { b.declencheur[t] = v; }, min: 0.15, max: 4 });
  for (const p of ["all_enemies", "all_allies", "all"] as const) out.push({ nom: `portee.${p}`, lire: (b) => b.portee[p], ecrire: (b, v) => { b.portee[p] = v; }, min: 0.5, max: 5 });
  for (const c of ["hero", "both", "self"] as const) out.push({ nom: `cible.${c}`, lire: (b) => b.cible[c], ecrire: (b, v) => { b.cible[c] = v; }, min: 0.2, max: 4 });
  out.push({ nom: "cible.parCible", lire: (b) => b.cible.parCible, ecrire: (b, v) => { b.cible.parCible = v; }, min: 0, max: 1.5 });
  out.push({ nom: "filtre.a", lire: (b) => b.filtre.a, ecrire: (b, v) => { b.filtre.a = v; }, min: 0, max: 1 });
  out.push({ nom: "hasard", lire: (b) => b.hasard, ecrire: (b, v) => { b.hasard = v; }, min: 0.3, max: 1.5 });
  out.push({ nom: "singulier", lire: (b) => b.singulier, ecrire: (b, v) => { b.singulier = v; }, min: 0.2, max: 1.5 });
  // Retard X : un multiplicateur par X (1 à 3).
  RETARD_A_PRIORI.forEach((apriori, i) => out.push({
    nom: `retard.${i + 1}`,
    lire: (b) => b.retard?.[i] ?? apriori,
    ecrire: (b, v) => { b.retard = RETARD_A_PRIORI.map((d, j) => (j === i ? v : b.retard?.[j] ?? d)); },
    min: 0.2, max: 1.2,
  }));
  out.push({ nom: "don", lire: (b) => b.don, ecrire: (b, v) => { b.don = v; }, min: 0.1, max: 2 });
  out.push({ nom: "type.item", lire: (b) => b.type.item, ecrire: (b, v) => { b.type.item = v; }, min: 0.4, max: 2.5 });
  out.push({ nom: "eveil", lire: (b) => b.eveil, ecrire: (b, v) => { b.eveil = v; }, min: 0, max: 2 });
  // Rareté : fixée par l'auteur (RARETE_FIXEE), jamais réestimée.
  return out;
}

const GRILLE = [0.6, 0.75, 0.9, 0.97, 1, 1.03, 1.1, 1.25, 1.5];

/** Étage 2 : chaque multiplicateur à son tour, les autres figés. */
function ajusterMultiplicateurs(b: Bareme, a0: Bareme, lignes: Ligne[], mu: number): void {
  for (const m of multiplicateurs()) {
    const v0 = m.lire(b);
    const prior = m.lire(a0);
    let best = v0;
    let bestPerte = Infinity;
    const base = v0 === 0 ? 0.1 : v0;
    for (const g of GRILLE) {
      const v = Math.min(m.max, Math.max(m.min, Math.round(base * g * 1000) / 1000));
      m.ecrire(b, v);
      const p = perte(b, lignes) + mu * (v - prior) * (v - prior);
      if (p < bestPerte) { bestPerte = p; best = v; }
    }
    m.ecrire(b, best);
  }
}

export interface RapportCalibrage {
  bareme: Bareme;
  r2: number;
  erreurMediane: number;
  cartes: number;
  ecarts: { id: number; name: string; mana: number; rarete: string; type: string; ratio: number; predit: number }[];
  peuDeDonnees: { cle: string; n: number }[];
}

export function calibrer(cartes: CarteCalibree[], opts: { iterations?: number; tau?: number; mu?: number } = {}): RapportCalibrage {
  const a0 = baremeAPriori();
  a0.parts = calculerParts(cartes);
  const b: Bareme = structuredClone(a0);
  const lignes: Ligne[] = cartes.map((c) => ({ carte: c, y: c.mana_cost, w: 1 }));
  const tau = opts.tau ?? 4;
  const mu = opts.mu ?? 3;
  let presence = new Map<string, number>();
  for (let it = 0; it < (opts.iterations ?? 6); it++) {
    presence = ajusterLineaire(b, a0, lignes, tau);
    ajusterMultiplicateurs(b, a0, lignes, mu);
    // Huber : au-delà de 1,5 mana d'écart, le poids décroît en 1/|écart|.
    if (it >= 1) for (const l of lignes) {
      const r = Math.abs(prediction(b, l.carte) - l.y);
      l.w = r <= 1.5 ? 1 : 1.5 / r;
    }
  }
  presence = ajusterLineaire(b, a0, lignes, tau);

  for (const [k, n] of presence) {
    const [fam, a, champ] = k.split(".");
    if ((fam === "cap" || fam === "comp") && champ === "base") {
      const map = (fam === "cap" ? b.capacites : b.composes) as Record<string, CoutLineaire>;
      if (map[a]) map[a].n = n;
    }
  }

  const residus = cartes.map((c) => prediction(b, c) - c.mana_cost);
  const moy = cartes.reduce((s, c) => s + c.mana_cost, 0) / Math.max(1, cartes.length);
  const sst = cartes.reduce((s, c) => s + (c.mana_cost - moy) ** 2, 0);
  const sse = residus.reduce((s, r) => s + r * r, 0);
  const abs = residus.map(Math.abs).sort((x, y) => x - y);
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  const erreurMediane = abs[Math.floor(abs.length / 2)] ?? 0;
  b.qualite = { r2: Math.round(r2 * 1000) / 1000, erreurMedianeMana: Math.round(erreurMediane * 100) / 100, cartes: cartes.length, date: new Date().toISOString().slice(0, 10) };

  const ecarts = cartes.map((c) => {
    const { termes, additionnels } = termesCarte(b, c);
    const pts = [...termes, ...additionnels].reduce((s, t) => s + t.coef * valeurParametre(b, t.cle), 0);
    const budget = budgetCarte(b, c);
    return {
      id: c.id, name: c.name, mana: c.mana_cost, rarete: c.rarity ?? "Commune", type: c.card_type,
      ratio: budget > 0 ? Math.round((pts / budget) * 100) / 100 : 0,
      predit: Math.round((prediction(b, c)) * 10) / 10,
    };
  });

  const peuDeDonnees = [...presence.entries()]
    .filter(([k, n]) => (k.startsWith("cap.") || k.startsWith("comp.")) && k.endsWith(".base") && n < 8)
    .map(([cle, n]) => ({ cle: cle.replace(/\.base$/, ""), n }))
    .sort((x, y) => x.n - y.n);

  return { bareme: b, r2, erreurMediane, cartes: cartes.length, ecarts, peuDeDonnees };
}
