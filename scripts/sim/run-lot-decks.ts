// GRAND LOT sur DECKS EXISTANTS en ligne de commande (même plan et mêmes
// lignes en base que le bouton « Tous contre tous » de /admin/simulator).
// Usage :
//   npx vite-node --config vitest.config.ts scripts/sim/run-lot-decks.ts <parPaire> [deckIds,…|tous] [shards=1]
//   npx vite-node --config vitest.config.ts scripts/sim/run-lot-decks.ts --reprendre <testId> [shards=1]
// Crée le test (sim_tests, kind = lot), lance `shards` processus en parallèle
// (sous-commande interne `--shard i/n <testId>`) puis marque le lot « fini ».
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chargerSim } from "@/lib/sim/catalogue-db";
import { POLICY, planDuLot, preparer, type DeckFige } from "@/lib/sim/deck-test";
import { kDepuisMatchId, lignesLot } from "@/lib/sim/lot-rows";
import { silence } from "./catalogue";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const args = process.argv.slice(2);

/** Écriture avec nouvelles tentatives : après plusieurs minutes de calcul pur,
 *  la connexion HTTP gardée ouverte a pu être fermée côté serveur (« fetch
 *  failed ») — le 1er lot de 17 110 parties a perdu ses 8 processus ainsi. */
async function inserer(lignes: unknown[]) {
  for (let essai = 1; ; essai++) {
    try {
      const { error } = await sb.from("sim_deck_snapshots").insert(lignes);
      if (!error) return;
      if (essai >= 5) throw new Error(error.message);
    } catch (e) {
      if (essai >= 5) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000 * essai));
  }
}

async function dejaFaits(testId: number): Promise<Set<number>> {
  const ks = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("sim_deck_snapshots").select("match_id").eq("sim_test_id", testId).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) ks.add(kDepuisMatchId(r.match_id));
    if ((data?.length ?? 0) < 1000) break;
  }
  return ks;
}

if (args[0] === "--shard") {
  // ── Processus fils : joue sa part du plan et écrit en base ────────────────
  const [i, n] = args[1].split("/").map(Number);
  const testId = Number(args[2]);
  const { data: t, error } = await sb.from("sim_tests").select("decks, config").eq("id", testId).single();
  if (error) throw new Error(error.message);
  const decks = t.decks as DeckFige[];
  const { catalogue } = await chargerSim(sb);
  const plan = planDuLot(decks.map((d) => d.id), t.config.parPaire, t.config.graine);
  const faits = await dejaFaits(testId);
  const miennes = plan.filter((p) => p.k % n === i && !faits.has(p.k));
  const { jouer } = preparer(catalogue, decks);
  const parDeck = new Map(decks.map((d) => [d.id, d]));
  const retablir = silence();
  let tampon: ReturnType<typeof lignesLot> = [];
  const t0 = Date.now();
  for (const [j, p] of miennes.entries()) {
    tampon.push(...lignesLot(testId, jouer(p).partie, parDeck));
    if (tampon.length >= 100) { await inserer(tampon); tampon = []; }
    if ((j + 1) % 100 === 0) process.stderr.write(`[shard ${i}] ${j + 1}/${miennes.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
  }
  if (tampon.length) await inserer(tampon);
  retablir();
  console.log(`[shard ${i}/${n}] ${miennes.length} parties, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} else {
  // ── Processus parent : crée (ou reprend) le lot, lance les shards, conclut ─
  let cree: { id: number }, total: number, shards: number;
  if (args[0] === "--reprendre") {
    cree = { id: Number(args[1]) };
    shards = Number(args[2] ?? 1);
    const { data: t, error } = await sb.from("sim_tests").select("decks, config").eq("id", cree.id).single();
    if (error) throw new Error(error.message);
    total = planDuLot((t.decks as DeckFige[]).map((d) => d.id), t.config.parPaire, 0).length;
    await sb.from("sim_tests").update({ status: "en_cours" }).eq("id", cree.id);
  } else {
    const parPaire = Number(args[0] ?? 10);
    shards = Number(args[2] ?? 1);
    const { decks: tous, empreinte } = await chargerSim(sb);
    const decks = !args[1] || args[1] === "tous" ? tous : tous.filter((d) => args[1].split(",").map(Number).includes(d.id));
    const { data, error } = await sb.from("sim_tests").insert({
      kind: "lot", label: `Tous contre tous — ${decks.length} decks × ${parPaire}`, policy: POLICY, catalogue_hash: empreinte,
      config: { parPaire, graine: 1_000_000 }, decks,
    }).select("id").single();
    if (error) throw new Error(error.message);
    cree = data;
    total = planDuLot(decks.map((d) => d.id), parPaire, 0).length;
  }
  console.log(`lot ${cree.id} : ${total} parties, ${shards} processus`);
  await Promise.all(Array.from({ length: shards }, (_, i) => new Promise<void>((ok, ko) => {
    const p = spawn("npx", ["vite-node", "--config", "vitest.config.ts", "scripts/sim/run-lot-decks.ts", "--shard", `${i}/${shards}`, String(cree.id)], { stdio: ["ignore", "inherit", "inherit"] });
    p.on("exit", (c) => { if (c !== 0) console.error(`shard ${i} terminé avec le code ${c} — relancer avec --reprendre ${cree.id}`); ok(); });
    p.on("error", ko);
  })));
  const faits = await dejaFaits(cree.id);
  await sb.from("sim_tests").update({ status: faits.size >= total ? "fini" : "interrompu", results: { parties: faits.size }, updated_at: new Date().toISOString() }).eq("id", cree.id);
  console.log(`lot ${cree.id} : ${faits.size}/${total} parties enregistrées`);
}
