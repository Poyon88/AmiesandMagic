// PROTOTYPE — lance N parties bot aléatoire contre bot aléatoire sur le
// catalogue réel exporté par export-catalog.mjs, et résume ce qui bloque.
// Usage : npx vite-node --config vitest.config.ts scripts/sim/run-prototype.ts <catalogue.json> [N]
import { readFileSync } from "node:fs";
import { DECK_SIZE } from "@/lib/game/constants";
import { getAllClanNames } from "@/lib/card-engine/constants";
import type { Card, HeroDefinition, Race, TokenTemplate } from "@/lib/game/types";
import { seededRand, pick } from "@/lib/sim/random-bot";
import { simulerPartie, type DeckSim, type ResultatPartie } from "@/lib/sim/simulate";

interface HeroRow { id: number; name: string; race: string; faction?: string | null; clan?: string | null; power_name: string; power_cost: number; power_effect: HeroDefinition["powerEffect"]; power_description: string; power_usage_limit?: number | null }

const [, , fichier, nArg] = process.argv;
const N = Number(nArg ?? 100);
const cat = JSON.parse(readFileSync(fichier, "utf8")) as { cards: Card[]; tokens: TokenTemplate[]; heroes: HeroRow[]; sets: { id: number; type: string }[] };
const speciaux = new Set(cat.sets.filter((s) => s.type === "special").map((s) => s.id));
const cartes = cat.cards.filter((c) => !c.set_id || !speciaux.has(c.set_id));
const jouables = cartes.filter((c) => c.card_type !== "item");

const hero = (r: HeroRow): HeroDefinition => ({
  id: r.id, name: r.name, race: r.race as Race, faction: r.faction ?? null, clan: r.clan ?? null,
  powerName: r.power_name, powerCost: r.power_cost, powerEffect: r.power_effect, powerDescription: r.power_description,
  powerUsageLimit: r.power_usage_limit ?? null, glbUrl: null, thumbnailUrl: null, powerImageUrl: null, powerSfxUrl: null,
});

// Decks mono-clan : cartes du clan + cartes sans clan de la faction, 2 ex. max,
// tirées au hasard jusqu'à DECK_SIZE. Le héros est pris dans la faction.
const candidats: { faction: string; clan: string; pool: Card[] }[] = [];
for (const f of [...new Set(jouables.map((c) => c.faction).filter(Boolean))] as string[]) {
  for (const clan of getAllClanNames(f)) {
    const pool = jouables.filter((c) => c.faction === f && (c.clan === clan || !c.clan));
    if (pool.length >= DECK_SIZE / 2) candidats.push({ faction: f, clan, pool });
  }
}

function deck(rand: () => number): DeckSim {
  const c = pick(rand, candidats)!;
  const qte = new Map<number, number>();
  const ordre = [...c.pool].sort(() => rand() - 0.5);
  let total = 0;
  for (let tour = 0; total < DECK_SIZE && tour < 2; tour++) {
    for (const card of ordre) { if (total >= DECK_SIZE) break; qte.set(card.id, (qte.get(card.id) ?? 0) + 1); total++; }
  }
  const h = cat.heroes.filter((x) => x.faction === c.faction && (!x.clan || x.clan === c.clan));
  return {
    label: `${c.faction} / ${c.clan}`,
    cards: [...qte].map(([id, quantity]) => ({ card: c.pool.find((x) => x.id === id)!, quantity })),
    hero: h.length ? hero(pick(rand, h)!) : null,
  };
}

// Le moteur journalise chaque bascule de tour : silence pendant la simulation.
const log = console.log;
console.log = () => {};
console.warn = () => {};
console.info = () => {};

const pools = { factionCardPool: cartes, allSpellsPool: cartes.filter((c) => c.card_type === "spell"), tokens: cat.tokens };
const rand = seededRand(20261013);
const resultats: (ResultatPartie & { a: string; b: string; heros: number })[] = [];
const t0 = Date.now();
const decks: [DeckSim, DeckSim][] = [];
for (let i = 0; i < N; i++) {
  const a = deck(rand), b = deck(rand);
  decks.push([a, b]);
  try {
    resultats.push({ ...simulerPartie(a, b, 1000 + i, pools), a: a.label, b: b.label, heros: (a.hero ? 1 : 0) + (b.hero ? 1 : 0) });
  } catch (e) {
    resultats.push({ seed: 1000 + i, winner: null, fin: "blocage", tours: 0, actions: 0, ms: 0, a: a.label, b: b.label, heros: 0,
      parType: {}, incidents: [{ kind: "exception", action: "hors boucle", detail: e instanceof Error ? e.message : String(e) }] });
  }
}

const compte = <T,>(xs: T[], k: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(k(x), (m.get(k(x)) ?? 0) + 1);
  return [...m].sort((x, y) => y[1] - x[1]);
};
// Reproductibilité : on rejoue les 20 premières parties, même graine.
let identiques = 0;
for (let i = 0; i < Math.min(20, N); i++) {
  const r = simulerPartie(decks[i][0], decks[i][1], 1000 + i, pools);
  if (r.winner === resultats[i].winner && r.actions === resultats[i].actions && r.tours === resultats[i].tours) identiques++;
}
console.log = log;
console.log(`Rejeu à l'identique : ${identiques} / ${Math.min(20, N)}`);
const inc = resultats.flatMap((r) => r.incidents.map((i) => ({ ...i, seed: r.seed })));
console.log(`\n${N} parties en ${((Date.now() - t0) / 1000).toFixed(1)} s (${candidats.length} decks clan possibles, ${cartes.length} cartes)`);
console.log("Fins :", Object.fromEntries(compte(resultats, (r) => r.fin)));
const fini = resultats.filter((r) => r.fin === "victoire");
if (fini.length) {
  const moy = (k: (r: ResultatPartie) => number) => (fini.reduce((s, r) => s + k(r), 0) / fini.length).toFixed(1);
  console.log(`Parties finies : ${fini.length} — ${moy((r) => r.tours)} tours, ${moy((r) => r.actions)} actions, ${moy((r) => r.ms)} ms en moyenne`);
}
const types: Record<string, number> = {};
for (const r of resultats) for (const [k, v] of Object.entries(r.parType)) types[k] = (types[k] ?? 0) + v;
console.log("Coups joués :", types);
console.log("Parties avec héros des 2 côtés : " + resultats.filter((r) => r.heros === 2).length);
console.log("Victoires du 1er joueur : " + resultats.filter((r) => r.fin === "victoire" && r.winner === r.seed % 2).length + " / " + fini.length);
console.log("\nIncidents par type :", Object.fromEntries(compte(inc, (i) => i.kind)));
for (const kind of ["exception", "blocage", "math_random", "refus"] as const) {
  const l = inc.filter((i) => i.kind === kind);
  if (!l.length) continue;
  console.log(`\n— ${kind} (${l.length}, dans ${new Set(l.map((i) => i.seed)).size} parties)`);
  for (const [k, n] of compte(l, (i) => `${i.action} | ${i.card ?? "-"} | ${i.detail}`).slice(0, 15)) console.log(`  ${n}× ${k}`);
}
