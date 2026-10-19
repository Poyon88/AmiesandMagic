// A/B — règle actuelle contre DÉCOUVERTE un tour sur deux (variante, cf.
// src/lib/game/decouverte.ts). Mêmes graines, mêmes decks, mêmes bots
// heuristiques des deux côtés : seule la règle de pioche change.
//
// Usage :
//   npx vite-node --config vitest.config.ts scripts/sim/run-decouverte.ts <catalogue.json> <N>
import { coupsHeuristiques } from "@/lib/sim/heuristic-bot";
import { seededRand } from "@/lib/sim/random-bot";
import { simulerPartie, type DeckSim, type Politique, type ResultatPartie } from "@/lib/sim/simulate";
import type { ReglesPartie } from "@/lib/game/types";
import { chargerCatalogue, silence } from "./catalogue";

const [, , fichier, nArg] = process.argv;
if (!fichier || !nArg) throw new Error("usage : <catalogue.json> <N>");
const N = Number(nArg);
const { deck, pools } = chargerCatalogue(fichier);
const heur: Politique = (s, r) => coupsHeuristiques(s, r);

// Decks tirés une fois, rejoués sous les deux règles.
const parties: { a: DeckSim; b: DeckSim; seed: number }[] = [];
for (let i = 0; i < N; i++) {
  const rand = seededRand(31000 + i);
  parties.push({ a: deck(rand), b: deck(rand), seed: 31000 + i });
}

function campagne(regles?: ReglesPartie) {
  const res: (ResultatPartie & { labels: [string, string] })[] = [];
  for (const p of parties) res.push({ ...simulerPartie(p.a, p.b, p.seed, pools, [heur, heur], { regles }), labels: [p.a.label, p.b.label] });
  const finies = res.filter((r) => r.fin === "victoire" && r.winner !== null);
  const parClan = new Map<string, { v: number; n: number }>();
  for (const r of finies) r.labels.forEach((l, i) => {
    const c = parClan.get(l) ?? { v: 0, n: 0 };
    c.n++; if (r.winner === i) c.v++;
    parClan.set(l, c);
  });
  const taux = [...parClan.values()].filter((c) => c.n >= 5).map((c) => c.v / c.n);
  const moy = taux.reduce((a, b) => a + b, 0) / Math.max(1, taux.length);
  const ecart = Math.sqrt(taux.reduce((a, t) => a + (t - moy) ** 2, 0) / Math.max(1, taux.length));
  const dec = finies.flatMap((r) => r.decouvertes);
  const offres = dec.reduce((a, d) => a + d.offres, 0);
  return {
    finies: finies.length,
    sansFin: res.length - finies.length,
    tours: finies.reduce((a, r) => a + r.tours, 0) / Math.max(1, finies.length),
    premier: finies.filter((r) => r.winner === r.premier).length / Math.max(1, finies.length),
    fatigue: finies.filter((r) => r.fatigue[r.winner === 0 ? 1 : 0] > 0).length / Math.max(1, finies.length),
    ecartClans: ecart,
    offres,
    autreClan: offres ? dec.reduce((a, d) => a + d.autreClan, 0) / offres : 0,
    mortes: offres ? dec.reduce((a, d) => a + d.mortes, 0) / offres : 0,
    incidents: res.reduce((a, r) => a + r.incidents.filter((x) => x.kind !== "refus").length, 0),
  };
}

const retablir = silence();
const t0 = Date.now();
const A = campagne();
const B = campagne({ decouverteAlternee: true });
retablir();

const pct = (x: number) => `${(100 * x).toFixed(1)} %`;
console.log(`| Mesure | Règle actuelle | Découverte |
|---|---|---|
| Parties terminées / sans vainqueur | ${A.finies} / ${A.sansFin} | ${B.finies} / ${B.sansFin} |
| Durée moyenne (tours) | ${A.tours.toFixed(1)} | ${B.tours.toFixed(1)} |
| Victoires du 1er joueur | ${pct(A.premier)} | ${pct(B.premier)} |
| Perdant entré en fatigue | ${pct(A.fatigue)} | ${pct(B.fatigue)} |
| Écart-type des taux de victoire par clan | ${pct(A.ecartClans)} | ${pct(B.ecartClans)} |
| Découvertes proposées | — | ${B.offres} |
| Carte « autre clan » retenue | — | ${pct(B.autreClan)} |
| Offres mortes (rien de jouable sous 3 tours) | — | ${pct(B.mortes)} |
| Incidents moteur (hors refus) | ${A.incidents} | ${B.incidents} |`);
console.log(`\n${N} parties par règle, ${((Date.now() - t0) / 1000).toFixed(0)} s, bots heuristiques en miroir.`);
