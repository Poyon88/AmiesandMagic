// Test CIBLÉ en ligne de commande : un deck contre des adversaires, sur les
// decks existants (admin + testeurs). Mêmes calculs que la page /admin/simulator.
// Usage : npx vite-node --config vitest.config.ts scripts/sim/run-deck-test.ts <deckId> <adv,adv|tous> [parAdversaire=10]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chargerSim } from "@/lib/sim/catalogue-db";
import { agregerTest, planDuTest, preparer } from "@/lib/sim/deck-test";
import { silence } from "./catalogue";

const [, , testeArg, advArg, nArg] = process.argv;
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { catalogue, decks, empreinte } = await chargerSim(sb);
const teste = Number(testeArg);
const adversaires = advArg === "tous" ? decks.map((d) => d.id).filter((id) => id !== teste) : advArg.split(",").map(Number);
const plan = planDuTest(teste, adversaires, Number(nArg ?? 10), 1);
const { jouer } = preparer(catalogue, decks);
const retablir = silence();
const t0 = Date.now();
const parties = plan.map((p) => jouer(p).partie);
retablir();
const r = agregerTest(teste, parties);
const nom = (id: number) => decks.find((d) => d.id === id)?.name ?? id;
const carte = (id: number) => catalogue.cards.find((c) => c.id === id)?.name ?? id;
const pct = (x: number) => `${(100 * x).toFixed(0)} %`;
console.log(`${decks.length} decks, empreinte ${empreinte}, ${parties.length} parties en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`${nom(teste)} : ${pct(r.total.taux)} [${pct(r.total.ic[0])}–${pct(r.total.ic[1])}] · commence ${pct(r.commence.taux)} · second ${pct(r.second.taux)} · sans vainqueur ${r.sansVainqueur} · incidents ${r.incidents}`);
for (const a of r.parAdversaire) console.log(`  vs ${nom(a.deckId)} : ${a.v}/${a.n} (${pct(a.taux)})`);
console.log("Cartes (écart quand jouée) :");
for (const c of [...r.cartes.slice(0, 5), ...r.cartes.slice(-3)]) console.log(`  ${carte(c.cardId)} : jouée ${c.jouee}/${r.total.n}, ${pct(c.quandJouee.taux)} vs ${pct(c.sinon.taux)}`);
console.log("Mécaniques :", JSON.stringify(r.mecaniques));
