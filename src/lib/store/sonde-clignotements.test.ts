// SONDE DES CLIGNOTEMENTS — rejoue de VRAIES parties (match_actions) dans le
// store, minuteries simulées, et relève les incohérences d'affichage d'une
// même action :
//   • « aPaP »                    : une carte apparaît, disparaît, réapparaît ;
//   • « 0PV→vivante »             : créature affichée morte puis de nouveau vivante ;
//   • « mort jouée→présente »     : animation de mort puis créature encore là ;
//   • « portail après apparition »: portail d'invocation sur une créature déjà visible.
//
// Lecture seule, réseau requis : ne tourne QUE si SCAN_N est fourni.
//   SCAN_N=60 SCAN_OUT=/tmp/clignotements.json npx vitest run src/lib/store/sonde-clignotements.test.ts
// Référence du 2026-11-14 : 35 anomalies sur 60 parties avant correctifs, 0 après.
import { describe, it, vi, beforeAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { initialStateFromSetup, loadMatchSetup, reglesDuSnapshot, setupFromSnapshot, type MatchRow, type MatchSetupSnapshot } from "@/lib/game/match-setup";
import type { GameState, GameAction } from "@/lib/game/types";

if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = { querySelectorAll: () => [], querySelector: () => null };
}
const ENV = process.env.SCAN_ENV ?? ".env.local";
for (const line of (process.env.SCAN_N ? readFileSync(ENV, "utf8") : "").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const N = Number(process.env.SCAN_N ?? 12);
const OUT = process.env.SCAN_OUT ?? "clignotements.json";

type Hit = { match: string; seq: number; type: string; zone: string; nom: string; motif: string; local: number };
const hits: Hit[] = [];
let actionsJouees = 0, partiesJouees = 0, rejets = 0;

type Emis = { gs: GameState; morts: string[]; invoc: string[] };
function scannerEvenements(emis: Emis[], ctx: { match: string; seq: number; type: string; local: number }) {
  const plateau = (s: GameState) => [...s.players[0].board, ...s.players[1].board];
  const noms = new Map<string, string>();
  for (const e of emis) for (const c of plateau(e.gs)) noms.set(c.instanceId, c.card.name);
  for (const [id, nom] of noms) {
    // (1) affichée à 0 PV (ou moins) puis de nouveau vivante.
    let vu0 = false, m1 = false;
    // (2) animation de mort jouée, puis la créature est encore/à nouveau sur le plateau.
    let mortJouee = false, m2 = false;
    // (3) portail d'invocation joué alors qu'elle était déjà affichée avant.
    let presenteAvant = false, m3 = false;
    let annonceInvoc = false;
    for (const e of emis) {
      const c = plateau(e.gs).find((x) => x.instanceId === id);
      if (c && vu0 && c.currentHealth > 0) m1 = true;
      if (c && c.currentHealth <= 0) vu0 = true;
      if (mortJouee && c && c.currentHealth > 0) m2 = true;
      if (e.morts.includes(id)) mortJouee = true;
      if (e.invoc.includes(id) && !annonceInvoc) { annonceInvoc = true; if (presenteAvant) m3 = true; }
      if (c && !e.invoc.includes(id)) presenteAvant = presenteAvant || !annonceInvoc;
    }
    if (m1) hits.push({ ...ctx, zone: "plateau", nom, motif: "0PV→vivante" });
    if (m2) hits.push({ ...ctx, zone: "plateau", nom, motif: "mort jouée→présente" });
    if (m3) hits.push({ ...ctx, zone: "plateau", nom, motif: "portail après apparition" });
  }
}

function scanner(etats: GameState[], ctx: { match: string; seq: number; type: string; local: number }) {
  const zones: Array<[string, (s: GameState) => Array<{ instanceId: string; card: { name: string } }>]> = [
    ["plateau", (s) => [...s.players[0].board, ...s.players[1].board]],
    ["main", (s) => s.players[ctx.local].hand],
  ];
  for (const [zone, lire] of zones) {
    const ids = new Map<string, string>();
    for (const s of etats) for (const c of lire(s)) ids.set(c.instanceId, c.card.name);
    for (const [id, nom] of ids) {
      let motif = "";
      for (const s of etats) {
        const p = lire(s).some((c) => c.instanceId === id) ? "P" : "a";
        if (motif[motif.length - 1] !== p) motif += p;
      }
      // PaP : disparaît puis revient. aPaP / PaPa : apparaît, disparaît, revient.
      if (/PaP/.test(motif)) hits.push({ ...ctx, zone, nom, motif });
    }
  }
}

describe.skipIf(!process.env.SCAN_N)("sonde clignotements", () => {
  beforeAll(() => { vi.useFakeTimers(); });
  it("rejoue les dernières parties", async () => {
    vi.useRealTimers();
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: matches } = await db.from("matches").select("*").eq("status", "finished").order("created_at", { ascending: false }).limit(N);
    const jeux: Array<{ id: string; init: GameState; actions: Array<{ seq: number; action: GameAction }> }> = [];
    for (const m of matches ?? []) {
      try {
        const [{ data: setupRow }, { data: rows }, { data: mulls }] = await Promise.all([
          db.from("match_setups").select("setup").eq("match_id", m.id).maybeSingle(),
          db.from("match_actions").select("*").eq("match_id", m.id).order("seq", { ascending: true }),
          db.from("match_mulligans").select("player_id, action").eq("match_id", m.id),
        ]);
        let state: GameState;
        if (setupRow?.setup) { const s = setupRow.setup as MatchSetupSnapshot; const r = await setupFromSnapshot(db, s); state = initialStateFromSetup(r.setup, reglesDuSnapshot(s)); }
        else state = initialStateFromSetup(await loadMatchSetup(db, m as MatchRow));
        const ordre = state.players.map((p) => p.id);
        for (const mu of [...(mulls ?? [])].sort((a, b) => ordre.indexOf(a.player_id) - ordre.indexOf(b.player_id))) state = applyAction(state, mu.action);
        jeux.push({ id: m.id, init: state, actions: (rows ?? []).map((r) => ({ seq: r.seq, action: r.action })) });
      } catch { /* partie non rejouable */ }
    }
    vi.useFakeTimers();
    const sil = ["log", "warn", "info", "debug"] as const;
    const garde = sil.map((k) => console[k]);
    sil.forEach((k) => { console[k] = () => {}; });
    for (const j of jeux) {
      for (const local of [0, 1]) {
        useGameStore.setState({
          gameState: structuredClone(j.init), localPlayerId: j.init.players[local].id,
          isAnimating: false, pendingIncomingActions: [], damageEvents: [], deathEvents: [], spellCastEvent: null,
          targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
        });
        for (const { seq, action } of j.actions) {
          const avant = useGameStore.getState().gameState!;
          if (avant.phase === "finished") break;
          const etats: GameState[] = [avant];
          const emis: Emis[] = [];
          let dMorts: unknown = null, dInvoc: unknown = null;
          const des = useGameStore.subscribe((st) => {
            if (st.gameState && etats[etats.length - 1] !== st.gameState) etats.push(st.gameState);
            const morts = st.deathEvents !== dMorts ? (st.deathEvents ?? []).map((d: { instanceId: string }) => d.instanceId) : [];
            const invoc = st.summonEvents !== dInvoc ? ((st.summonEvents ?? []) as unknown[]).map((d) => typeof d === "string" ? d : (d as { instanceId: string }).instanceId) : [];
            dMorts = st.deathEvents; dInvoc = st.summonEvents;
            if (st.gameState) emis.push({ gs: st.gameState, morts, invoc });
          });
          let r: unknown = null;
          try { r = useGameStore.getState().dispatchAction(action); vi.runAllTimers(); } catch { /* */ }
          des();
          if (r == null) { rejets++; break; }
          actionsJouees++;
          scanner(etats, { match: j.id.slice(0, 8), seq, type: action.type, local });
          scannerEvenements(emis, { match: j.id.slice(0, 8), seq, type: action.type, local });
        }
      }
      partiesJouees++;
    }
    sil.forEach((k, i) => { console[k] = garde[i]; });
    writeFileSync(OUT, JSON.stringify({ partiesJouees, actionsJouees, rejets, hits }, null, 1));
  }, 600_000);
});
