// PROTOTYPE — duels entre politiques (heuristique / aléatoire) sur decks aléatoires.
// Usage : npx vite-node --config vitest.config.ts scripts/sim/run-duel.ts <catalogue.json> [N] [heur-alea|heur-heur]
import { coupsHeuristiques } from "@/lib/sim/heuristic-bot";
import { seededRand } from "@/lib/sim/random-bot";
import { politiqueAleatoire, simulerPartie, type Politique } from "@/lib/sim/simulate";
import { chargerCatalogue, silence } from "./catalogue";

const [, , fichier, nArg, modeArg] = process.argv;
const N = Number(nArg ?? 100);
const mode = modeArg ?? "heur-alea";
const { deck, pools } = chargerCatalogue(fichier);
const heur: Politique = (s, r) => coupsHeuristiques(s, r);
const rand = seededRand(4242);

const retablir = silence();
const t0 = Date.now();
let gainsHeur = 0, finies = 0, tours = 0, incidents = 0, gains1er = 0;
const fins: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const a = deck(rand), b = deck(rand);
  // Le bot heuristique change de siège une partie sur deux (p1 / p2).
  const heurEn = Math.floor(i / 2) % 2; // indépendant du 1er joueur (graine % 2)
  const pol: [Politique, Politique] = mode === "heur-heur" ? [heur, heur] : heurEn === 0 ? [heur, politiqueAleatoire] : [politiqueAleatoire, heur];
  const r = simulerPartie(a, b, 5000 + i, pools, pol);
  fins[r.fin] = (fins[r.fin] ?? 0) + 1;
  incidents += r.incidents.filter((x) => x.kind !== "refus").length;
  if (r.fin === "victoire") {
    finies++; tours += r.tours;
    if (r.winner === heurEn) gainsHeur++;
    if (r.winner === (5000 + i) % 2) gains1er++;
  }
}
retablir();
const s = (Date.now() - t0) / 1000;
console.log(`${mode} — ${N} parties en ${s.toFixed(1)} s (${(s / N).toFixed(2)} s/partie)`);
console.log("Fins :", fins, `— ${(tours / Math.max(1, finies)).toFixed(1)} tours en moyenne`);
if (mode === "heur-alea") console.log(`Victoires de l'heuristique : ${gainsHeur} / ${finies} (${(100 * gainsHeur / Math.max(1, finies)).toFixed(1)} %)`);
console.log(`Victoires du 1er joueur : ${gains1er} / ${finies} (${(100 * gains1er / Math.max(1, finies)).toFixed(1)} %)`);
console.log(`Incidents (hors refus) : ${incidents}`);
