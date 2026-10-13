// Simulation EN MASSE pour le module d'Équilibrage : chaque paire de clans
// s'affronte `parPaire` fois (decks tirés à neuf à chaque partie), entre deux
// bots heuristiques, et les résultats partent dans `sim_deck_snapshots`.
//
// Usage :
//   npx vite-node --config vitest.config.ts scripts/sim/run-batch.ts \
//     <catalogue.json> <parPaire> <runId> [shard=0] [shards=1] [--dry]
// Les shards se lancent en parallèle (un processus chacun) avec le même runId.
// Annuler un lot : DELETE FROM sim_deck_snapshots WHERE run_id = '<runId>';
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { coupsHeuristiques } from "@/lib/sim/heuristic-bot";
import { seededRand } from "@/lib/sim/random-bot";
import { simulerPartie, type DeckSim, type Politique } from "@/lib/sim/simulate";
import { chargerCatalogue, silence } from "./catalogue";

const [, , fichier, parPaireArg, runId, shardArg, shardsArg] = process.argv;
const dry = process.argv.includes("--dry");
if (!fichier || !parPaireArg || !runId) throw new Error("usage : <catalogue.json> <parPaire> <runId> [shard] [shards] [--dry]");
const parPaire = Number(parPaireArg), shard = Number(shardArg ?? 0), shards = Number(shardsArg ?? 1);

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// v2 (2026-10-13) : dépense Épargne / Foi / Conquête / Invention, Éveil, Seconde vie, tap.
// v3 : pose et équipe les objets (coup « poser puis équiper » évalué d'un bloc).
const POLICY = "heuristique-v3";
const { clans, deck, pools } = chargerCatalogue(fichier);
const heur: Politique = (s, r) => coupsHeuristiques(s, r);

// Toutes les paires de clans distincts × parPaire ; la partie k va au shard k % shards.
const parties: { a: number; b: number; k: number }[] = [];
for (let i = 0; i < clans.length; i++) for (let j = i + 1; j < clans.length; j++) for (let r = 0; r < parPaire; r++) parties.push({ a: i, b: j, k: parties.length });
const miennes = parties.filter((p) => p.k % shards === shard);

type Ligne = Record<string, unknown>;
let tampon: Ligne[] = [];
async function vider() {
  if (!tampon.length || dry) { tampon = []; return; }
  const { error } = await sb.from("sim_deck_snapshots").insert(tampon);
  if (error) throw new Error(`insert : ${error.message}`);
  tampon = [];
}
const ligne = (d: DeckSim, clan: string, faction: string, matchId: string, gagne: boolean, premier: boolean, tours: number, counters: unknown): Ligne => ({
  run_id: runId, match_id: matchId, player_id: randomUUID(), deck_id: null, hero_id: d.hero?.id ?? null,
  is_winner: gagne, went_first: premier, cards: d.cards.map((c) => ({ card_id: c.card.id, copies: c.quantity })),
  primary_faction: faction, clan, policy: POLICY, turns: tours, counters,
});

const retablir = silence();
const t0 = Date.now();
let ecrites = 0, ratees = 0;
for (const p of miennes) {
  const seed = 100000 + p.k;
  const rand = seededRand(seed);
  // Sièges alternés : le clan A n'est pas toujours p1. Le 1er joueur vaut
  // seed % 2 = k % 2 ; le siège suit floor(k / 2) % 2 pour ne PAS lui être lié.
  const inverse = Math.floor(p.k / 2) % 2 === 1;
  const [ia, ib] = inverse ? [p.b, p.a] : [p.a, p.b];
  const da = deck(rand, clans[ia]), db = deck(rand, clans[ib]);
  const r = simulerPartie(da, db, seed, pools, [heur, heur]);
  if (r.fin !== "victoire" || r.winner === null) { ratees++; continue; }
  const premier = seed % 2; // firstPlayerIndex du simulateur
  const matchId = randomUUID();
  tampon.push(ligne(da, clans[ia].clan, clans[ia].faction, matchId, r.winner === 0, premier === 0, r.tours, { ...r.compteurs[0], objets: r.objets[0] }));
  tampon.push(ligne(db, clans[ib].clan, clans[ib].faction, matchId, r.winner === 1, premier === 1, r.tours, { ...r.compteurs[1], objets: r.objets[1] }));
  ecrites++;
  if (tampon.length >= 200) await vider();
  if (ecrites % 50 === 0) process.stderr.write(`[shard ${shard}] ${ecrites}/${miennes.length} parties (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
}
await vider();
retablir();
console.log(`[shard ${shard}/${shards}] ${ecrites} parties écrites, ${ratees} sans vainqueur, ${((Date.now() - t0) / 1000).toFixed(0)} s${dry ? " (à blanc)" : ""}`);
