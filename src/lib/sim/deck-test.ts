// Tests sur DECKS EXISTANTS — plan des parties, exécution d'une partie et
// agrégation des résultats. Pur (aucun accès réseau, aucun DOM) : partagé par
// le Web Worker de la page /admin/simulator et par scripts/sim/run-batch.ts.
import type { Card, FormatCode, HeroDefinition, TokenTemplate } from "@/lib/game/types";
import { coupsHeuristiques } from "./heuristic-bot";
import { viviersDuMatch } from "./match-pools";
import {
  COMPTEURS, simulerPartie,
  type Compteur, type DeckSim, type Politique, type ResultatPartie, type UsageCompteur, type UsageEtincelle, type UsageObjets,
} from "./simulate";

export const POLICY = "heuristique-v3";

/** Un deck FIGÉ au moment du test : il ne bouge plus si son auteur le modifie. */
export interface DeckFige {
  id: number;
  name: string;
  owner: string;
  faction: string | null;
  clans: string[];
  hero: HeroDefinition | null;
  formatCode: FormatCode | null;
  cards: { card_id: number; quantity: number }[];
}

/** Ce que le moteur doit avoir en mémoire pour jouer n'importe quel match. */
export interface CatalogueSim {
  cards: Card[];               // tous statuts : les cartes liées suivent leur mère
  tokens: TokenTemplate[];
  machines: Card[];
  specialSetIds: number[];
}

/** Une partie à jouer : `p1` / `p2` sont des ids de deck, `premier` l'index qui commence. */
export interface PartiePlan { k: number; p1: number; p2: number; seed: number; premier: 0 | 1 }

/** Résultat COMPACT d'une partie (ce qui remonte du worker et se stocke). */
export interface PartieJouee {
  k: number; p1: number; p2: number; seed: number; premier: 0 | 1;
  vainqueur: 0 | 1 | null; tours: number;
  cartes: ResultatPartie["cartes"];
  compteurs: ResultatPartie["compteurs"];
  objets: [UsageObjets, UsageObjets];
  etincelle: [UsageEtincelle, UsageEtincelle];
  incidents: number;
}

// ── Plans ───────────────────────────────────────────────────────────────────

/** Test CIBLÉ : `teste` contre chaque adversaire, `parAdversaire` fois.
 *  Sur 4 parties consécutives, le deck testé occupe les deux sièges et chacun
 *  commence une fois par siège : siège et initiative ne sont jamais liés. */
export function planDuTest(teste: number, adversaires: number[], parAdversaire: number, graine: number): PartiePlan[] {
  const out: PartiePlan[] = [];
  for (const adv of adversaires) {
    for (let r = 0; r < parAdversaire; r++) {
      const k = out.length;
      const testeEnP1 = Math.floor(r / 2) % 2 === 0;
      out.push({ k, p1: testeEnP1 ? teste : adv, p2: testeEnP1 ? adv : teste, seed: graine + k, premier: (r % 2) as 0 | 1 });
    }
  }
  return out;
}

/** LOT « tous contre tous » : chaque paire de decks distincts, `parPaire` fois. */
export function planDuLot(decks: number[], parPaire: number, graine: number): PartiePlan[] {
  const out: PartiePlan[] = [];
  for (let i = 0; i < decks.length; i++) for (let j = i + 1; j < decks.length; j++) {
    for (let r = 0; r < parPaire; r++) {
      const k = out.length;
      const iEnP1 = Math.floor(r / 2) % 2 === 0;
      out.push({ k, p1: iEnP1 ? decks[i] : decks[j], p2: iEnP1 ? decks[j] : decks[i], seed: graine + k, premier: (r % 2) as 0 | 1 });
    }
  }
  return out;
}

// ── Exécution ───────────────────────────────────────────────────────────────

/** Prépare de quoi jouer : index des cartes, decks résolus, viviers par paire (mis en cache). */
export function preparer(catalogue: CatalogueSim, decks: DeckFige[]) {
  const parId = new Map(catalogue.cards.map((c) => [c.id, c]));
  const speciaux = new Set(catalogue.specialSetIds);
  const resolu = new Map<number, DeckSim>();
  for (const d of decks) {
    resolu.set(d.id, {
      label: d.name, hero: d.hero,
      cards: [...d.cards].sort((a, b) => a.card_id - b.card_id)
        .map((c) => ({ card: parId.get(c.card_id)!, quantity: c.quantity }))
        .filter((c) => !!c.card),
    });
  }
  const viviers = new Map<string, ReturnType<typeof viviersDuMatch>>();
  const heur: Politique = (s, r) => coupsHeuristiques(s, r);
  const formats = new Map(decks.map((d) => [d.id, d.formatCode]));

  function jouer(p: PartiePlan, journal = false): { partie: PartieJouee; resultat: ResultatPartie } {
    const a = resolu.get(p.p1), b = resolu.get(p.p2);
    if (!a || !b) throw new Error(`deck inconnu (${p.p1} / ${p.p2})`);
    const cle = `${Math.min(p.p1, p.p2)}-${Math.max(p.p1, p.p2)}`;
    let v = viviers.get(cle);
    if (!v) { v = viviersDuMatch(catalogue.cards, speciaux, [a.cards, b.cards], [a.hero, b.hero]); viviers.set(cle, v); }
    // Format : celui des decks (le matchmaking apparie deux decks du même format).
    const formatCode = formats.get(p.p1) ?? formats.get(p.p2) ?? null;
    const r = simulerPartie(a, b, p.seed, { ...v, tokens: catalogue.tokens, machines: catalogue.machines, formatCode },
      [heur, heur], { premier: p.premier, journal });
    return {
      resultat: r,
      partie: {
        k: p.k, p1: p.p1, p2: p.p2, seed: p.seed, premier: p.premier,
        vainqueur: r.fin === "victoire" ? r.winner : null, tours: r.tours,
        cartes: r.cartes, compteurs: r.compteurs, objets: r.objets, etincelle: r.etincelle,
        incidents: r.incidents.filter((i) => i.kind !== "refus").length,
      },
    };
  }
  return { jouer };
}

// ── Agrégation (test ciblé) ─────────────────────────────────────────────────

/** Intervalle de Wilson à 95 % pour v victoires sur n. */
export function wilson(v: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96, p = v / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const m = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}

export interface StatTaux { v: number; n: number; taux: number; ic: [number, number] }
const taux = (v: number, n: number): StatTaux => ({ v, n, taux: n ? v / n : 0, ic: wilson(v, n) });

export interface ResultatsTest {
  total: StatTaux;
  commence: StatTaux;
  second: StatTaux;
  parAdversaire: ({ deckId: number } & StatTaux)[];
  cartes: { cardId: number; piochee: number; jouee: number; poses: number; quandJouee: StatTaux; sinon: StatTaux; ecart: number }[];
  mecaniques: {
    compteurs: Partial<Record<Compteur, { parties: number; gagne: number; depense: number; depenses: number; reste: number; avecDepense: number }>>;
    objets: { recus: number; poses: number; equipes: number; inutilises: number };
    etincelle: { recue: number; jouee: number; manaPerdu: number };
  };
  sansVainqueur: number;
  incidents: number;
}

/** Agrège les parties d'un test ciblé, du point de vue du deck `teste`. */
export function agregerTest(teste: number, parties: PartieJouee[]): ResultatsTest {
  let v = 0, n = 0, vc = 0, nc = 0, vs = 0, ns = 0, sansVainqueur = 0, incidents = 0;
  const parAdv = new Map<number, { v: number; n: number }>();
  const cartes = new Map<number, { piochee: number; jouee: number; poses: number; vJ: number; nJ: number }>();
  const comp: ResultatsTest["mecaniques"]["compteurs"] = {};
  const objets = { recus: 0, poses: 0, equipes: 0, inutilises: 0 };
  const etincelle = { recue: 0, jouee: 0, manaPerdu: 0 };

  for (const p of parties) {
    incidents += p.incidents;
    if (p.vainqueur === null) { sansVainqueur++; continue; }
    const siege: 0 | 1 = p.p1 === teste ? 0 : 1;
    const adv = siege === 0 ? p.p2 : p.p1;
    const gagne = p.vainqueur === siege ? 1 : 0;
    v += gagne; n++;
    if (p.premier === siege) { vc += gagne; nc++; } else { vs += gagne; ns++; }
    const a = parAdv.get(adv) ?? { v: 0, n: 0 };
    a.v += gagne; a.n++; parAdv.set(adv, a);

    const c = p.cartes[siege];
    const piochees = new Set(c.piochees);
    for (const id of new Set([...piochees, ...Object.keys(c.jouees).map(Number)])) {
      const s = cartes.get(id) ?? { piochee: 0, jouee: 0, poses: 0, vJ: 0, nJ: 0 };
      if (piochees.has(id)) s.piochee++;
      const poses = c.jouees[id] ?? 0;
      if (poses > 0) { s.jouee++; s.poses += poses; s.vJ += gagne; s.nJ++; }
      cartes.set(id, s);
    }
    for (const k of COMPTEURS) {
      const u: UsageCompteur | undefined = p.compteurs[siege][k];
      if (!u) continue;
      const x = (comp[k] ??= { parties: 0, gagne: 0, depense: 0, depenses: 0, reste: 0, avecDepense: 0 });
      x.parties++; x.gagne += u.gagne; x.depense += u.depense; x.depenses += u.depenses; x.reste += u.reste;
      if (u.depenses > 0) x.avecDepense++;
    }
    const o = p.objets[siege];
    objets.recus += o.recus; objets.poses += o.poses; objets.equipes += o.equipes; objets.inutilises += o.inutilises;
    const e = p.etincelle[siege];
    if (e.recue) etincelle.recue++;
    if (e.joueeAuTour !== null) etincelle.jouee++;
    if (e.manaPerdu) etincelle.manaPerdu++;
  }

  return {
    total: taux(v, n), commence: taux(vc, nc), second: taux(vs, ns),
    parAdversaire: [...parAdv].map(([deckId, a]) => ({ deckId, ...taux(a.v, a.n) })).sort((x, y) => x.taux - y.taux),
    cartes: [...cartes].map(([cardId, s]) => {
      const quandJouee = taux(s.vJ, s.nJ);
      const sinon = taux(v - s.vJ, n - s.nJ);
      return { cardId, piochee: s.piochee, jouee: s.jouee, poses: s.poses, quandJouee, sinon, ecart: quandJouee.taux - sinon.taux };
    }).sort((x, y) => y.ecart - x.ecart),
    mecaniques: { compteurs: comp, objets, etincelle },
    sansVainqueur, incidents,
  };
}

/** Forme stockée d'une partie dans `sim_tests.games` : [k, p1, p2, seed, premier, vainqueur(-1 = aucun), tours]. */
export type PartieStockee = [number, number, number, number, 0 | 1, 0 | 1 | -1, number];
export const stocker = (p: PartieJouee): PartieStockee => [p.k, p.p1, p.p2, p.seed, p.premier, p.vainqueur ?? -1, p.tours];
export const relire = (g: PartieStockee): PartiePlan => ({ k: g[0], p1: g[1], p2: g[2], seed: g[3], premier: g[4] });
