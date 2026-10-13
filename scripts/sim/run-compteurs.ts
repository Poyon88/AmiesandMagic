// Usage des compteurs (Épargne, Foi, Conquête, Invention, Exploration) par les
// bots heuristiques, clan par clan : gagnés, dépensés, laissés en fin de partie.
// Usage : npx vite-node --config vitest.config.ts scripts/sim/run-compteurs.ts <catalogue.json> [N par clan] [clan,clan…]
import { coupsHeuristiques } from "@/lib/sim/heuristic-bot";
import { pick, seededRand } from "@/lib/sim/random-bot";
import { COMPTEURS, simulerPartie, type Politique } from "@/lib/sim/simulate";
import { chargerCatalogue, silence } from "./catalogue";

const [, , fichier, nArg, clansArg] = process.argv;
const N = Number(nArg ?? 40);
const { clans, deck, pools } = chargerCatalogue(fichier);
const cibles = clansArg ? clans.filter((c) => clansArg.split(",").includes(c.clan)) : clans;
const heur: Politique = (s, r) => coupsHeuristiques(s, r);
const rand = seededRand(777);

const retablir = silence();
const lignes: string[] = [];
let incidents = 0;
const parAction: Record<string, number> = {};
for (const c of cibles) {
  let gains = 0;
  const agg: Record<string, { parties: number; gagne: number; depense: number; depenses: number; reste: number; avecDepense: number }> = {};
  for (let i = 0; i < N; i++) {
    const adv = pick(rand, clans.filter((x) => x !== c))!;
    const siege = i % 2; // siège du clan étudié
    const d = deck(rand, c), o = deck(rand, adv);
    const r = simulerPartie(siege === 0 ? d : o, siege === 0 ? o : d, 900000 + i * 7 + cibles.indexOf(c), pools, [heur, heur]);
    incidents += r.incidents.filter((x) => x.kind !== "refus").length;
    for (const [k, v] of Object.entries(r.parType)) parAction[k] = (parAction[k] ?? 0) + v;
    if (r.winner === siege) gains++;
    for (const k of COMPTEURS) {
      const u = r.compteurs[siege][k];
      if (!u) continue;
      const a = (agg[k] ??= { parties: 0, gagne: 0, depense: 0, depenses: 0, reste: 0, avecDepense: 0 });
      a.parties++; a.gagne += u.gagne; a.depense += u.depense; a.depenses += u.depenses; a.reste += u.reste;
      if (u.depenses > 0) a.avecDepense++;
    }
  }
  const detail = Object.entries(agg).map(([k, a]) =>
    `${k} (${a.parties} p.) gagné ${(a.gagne / a.parties).toFixed(1)}, dépensé ${(a.depense / a.parties).toFixed(1)} en ${(a.depenses / a.parties).toFixed(1)} fois, reste ${(a.reste / a.parties).toFixed(1)}, ${Math.round(100 * a.avecDepense / a.parties)} % des parties avec dépense`);
  lignes.push(`${c.clan} — ${Math.round(100 * gains / N)} % de victoires\n    ${detail.join("\n    ") || "(aucun compteur)"}`);
}
retablir();
console.log(lignes.join("\n"));
console.log("\nCoups joués :", parAction);
console.log("Incidents hors refus :", incidents);
