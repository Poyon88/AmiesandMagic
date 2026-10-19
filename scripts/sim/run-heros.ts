// ÉQUILIBRAGE DES HÉROS — taux de victoire par héros, et balayage de ses PV de
// départ. Rapport seulement : rien n'est écrit en base.
//
// Usage :
//   npx vite-node --config vitest.config.ts scripts/sim/run-heros.ts \
//     <catalogue.json> <partiesParPoint> [--hero=<id>] [--pv=24,27,30,33,36]
//
// Sans --hero : chaque héros (avec un clan jouable) affronte des decks de clans
// adverses tirés au hasard, à SES PV de départ. Avec --hero : ce héros seul,
// rejoué à chaque valeur de --pv sur les MÊMES graines (decks et adversaires
// identiques d'un palier à l'autre) — seul l'écart de PV change.
//
// Le héros testé joue toujours un deck de SON clan ; l'adversaire, un deck d'un
// autre clan avec un héros de ce clan. Siège et initiative alternent.
import { coupsHeuristiques } from "@/lib/sim/heuristic-bot";
import { seededRand } from "@/lib/sim/random-bot";
import { simulerPartie, type Politique } from "@/lib/sim/simulate";
import { wilson } from "@/lib/sim/deck-test";
import { pvDeDepart } from "@/lib/game/hero-hp";
import type { HeroDefinition } from "@/lib/game/types";
import { chargerCatalogue, silence } from "./catalogue";

const [, , fichier, nArg] = process.argv;
const opt = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
if (!fichier || !nArg) throw new Error("usage : <catalogue.json> <partiesParPoint> [--hero=<id>] [--pv=24,27,30]");
const N = Number(nArg);
const heroId = opt("hero") ? Number(opt("hero")) : null;
const paliers = (opt("pv") ?? "24,27,30,33,36").split(",").map(Number);

const { clans, deck, pools, heroes } = chargerCatalogue(fichier);
const heur: Politique = (s, r) => coupsHeuristiques(s, r);

/** N parties du héros contre des clans adverses ; mêmes graines pour un même héros. */
function mesurer(h: HeroDefinition) {
  const sien = clans.find((c) => c.faction === h.faction && c.clan === h.clan);
  if (!sien) return null;
  const autres = clans.filter((c) => c !== sien);
  let v = 0, n = 0, tours = 0;
  for (let i = 0; i < N; i++) {
    const seed = 70000 + h.id * 1000 + i;
    const rand = seededRand(seed);
    const lui = deck(rand, sien, h);
    const adv = deck(rand, autres[Math.floor(rand() * autres.length)]);
    const enP1 = Math.floor(i / 2) % 2 === 0;
    const r = simulerPartie(enP1 ? lui : adv, enP1 ? adv : lui, seed, pools, [heur, heur]);
    if (r.fin !== "victoire" || r.winner === null) continue;
    n++; tours += r.tours;
    if (r.winner === (enP1 ? 0 : 1)) v++;
  }
  const [bas, haut] = wilson(v, n);
  return { v, n, taux: n ? v / n : 0, bas, haut, tours: n ? tours / n : 0 };
}

const pct = (x: number) => `${(100 * x).toFixed(1)} %`;
const retablir = silence();
const t0 = Date.now();
const lignes: string[] = [];

if (heroId == null) {
  lignes.push(`| Héros | Clan | PV | Coût pouvoir | Victoires | Taux | IC 95 % |`, `|---|---|---|---|---|---|---|`);
  const res = heroes
    .map((h) => ({ h, m: mesurer(h) }))
    .filter((x): x is { h: HeroDefinition; m: NonNullable<ReturnType<typeof mesurer>> } => !!x.m && x.m.n > 0)
    .sort((a, b) => b.m.taux - a.m.taux);
  for (const { h, m } of res) {
    lignes.push(`| #${h.id} | ${h.clan} | ${pvDeDepart(h)} | ${h.powerCost} | ${m.v}/${m.n} | ${pct(m.taux)} | ${pct(m.bas)}–${pct(m.haut)} |`);
  }
} else {
  const h = heroes.find((x) => x.id === heroId);
  if (!h) throw new Error(`héros #${heroId} introuvable`);
  lignes.push(`Héros #${h.id} (${h.clan}), PV actuels ${pvDeDepart(h)}`, "", `| PV de départ | Victoires | Taux | IC 95 % | Tours moyens |`, `|---|---|---|---|---|`);
  for (const pv of paliers) {
    const m = mesurer({ ...h, startingHp: pv });
    if (!m) throw new Error(`clan du héros #${heroId} sans deck jouable`);
    lignes.push(`| ${pv} | ${m.v}/${m.n} | ${pct(m.taux)} | ${pct(m.bas)}–${pct(m.haut)} | ${m.tours.toFixed(1)} |`);
  }
}
retablir();
console.log(lignes.join("\n"));
console.log(`\n${N} parties par point, ${((Date.now() - t0) / 1000).toFixed(0)} s, bots heuristiques en miroir.`);
