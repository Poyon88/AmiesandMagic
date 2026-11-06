// VÉRIFICATION DU REJEU SERVEUR — rejoue des parties terminées et compare :
//   * le vainqueur rejoué à `matches.winner_id` ;
//   * l'ÉTAT rejoué au dernier snapshot client (`match_state`), par hash de
//     synchro — c'est la vraie preuve de fidélité (un abandon rend le
//     vainqueur trivial, pas l'état).
//
// Utilise la configuration FIGÉE (match_setups) et les mulligans journalisés
// quand ils existent ; sinon recharge la configuration actuelle (fiable
// seulement si decks et cartes n'ont pas bougé depuis la partie).
//
// Lecture seule. Usage :
//   npx vite-node --config vitest.config.ts scripts/replay-check.ts [N=20] [jours=30] [figees]
//   (`figees` : seulement les parties qui ont une configuration figée)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  initialStateFromSetup, loadMatchSetup, setupFromSnapshot,
  type MatchRow, type MatchSetupSnapshot,
} from "@/lib/game/match-setup";
import { replayMatch, type ActionRow, type MulliganRow } from "@/lib/game/replay";
import { syncHash } from "@/lib/game/stateHash";
import type { GameState } from "@/lib/game/types";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const [, , nArg, joursArg, filtre] = process.argv;
const N = Number(nArg ?? 20);
const jours = Number(joursArg ?? 30);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const log = console.log, warn = console.warn, info = console.info, debug = console.debug;
const silence = () => { console.log = console.warn = console.info = console.debug = () => {}; };
const parler = () => { console.log = log; console.warn = warn; console.info = info; console.debug = debug; };

async function main() {
  const depuis = new Date(Date.now() - jours * 86_400_000).toISOString();
  let ids: string[] | null = null;
  if (filtre === "figees") {
    const { data } = await db.from("match_setups").select("match_id").gte("captured_at", depuis);
    ids = (data ?? []).map((r) => r.match_id as string);
    if (ids.length === 0) { log("Aucune partie à configuration figée."); return; }
  }
  let q = db
    .from("matches")
    .select("*")
    .eq("status", "finished")
    .not("winner_id", "is", null)
    .gte("created_at", depuis)
    .order("created_at", { ascending: false })
    .limit(N);
  if (ids) q = q.in("id", ids);
  const { data: matches, error } = await q;
  if (error) throw error;

  const bilan = { vainqueurOk: 0, vainqueurDivergent: 0, inacheve: 0, erreur: 0, etatIdentique: 0, etatDifferent: 0, sansSnapshot: 0, finParAbandon: 0 };
  for (const m of matches ?? []) {
    const tag = `${m.id.slice(0, 8)} ${String(m.created_at).slice(0, 10)}`;
    try {
      // Tables du lot 0 absentes avant migration : leurs lectures échouent et
      // renvoient null, le script retombe alors sur la configuration actuelle.
      const [{ data: setupRow }, { data: rows, error: aErr }, { data: mulls }, { data: snap }] = await Promise.all([
        db.from("match_setups").select("setup").eq("match_id", m.id).maybeSingle(),
        db.from("match_actions").select("*").eq("match_id", m.id).order("seq", { ascending: true }),
        db.from("match_mulligans").select("player_id, action").eq("match_id", m.id),
        db.from("match_state").select("seq, state").eq("match_id", m.id).maybeSingle(),
      ]);
      if (aErr) throw aErr;

      let initial: () => GameState;
      let source = "config actuelle";
      if (setupRow?.setup) {
        const snapSetup = setupRow.setup as MatchSetupSnapshot;
        const restored = await setupFromSnapshot(db, snapSetup);
        const n = restored.changedCardIds.length;
        initial = () => initialStateFromSetup(restored.setup, snapSetup.decouverteAlternee);
        source = `config figée${n ? ` (${n} cartes modifiées depuis)` : ""}`;
      } else {
        const setup = await loadMatchSetup(db, m as MatchRow);
        initial = () => initialStateFromSetup(setup);
      }

      const actions = (rows ?? []) as ActionRow[];
      const mulligans = (mulls ?? []) as MulliganRow[];
      silence();
      let r, etat = "pas de snapshot";
      try {
        r = replayMatch(initial(), mulligans, actions);
        if (snap?.state) {
          const jusque = replayMatch(initial(), mulligans, actions.filter((a) => a.seq <= snap.seq));
          const identique = syncHash(jusque.state) === syncHash(snap.state as GameState);
          etat = identique ? `état = snapshot @${snap.seq}` : `ÉTAT ≠ snapshot @${snap.seq}`;
          if (identique) bilan.etatIdentique++; else bilan.etatDifferent++;
        } else bilan.sansSnapshot++;
      } finally {
        parler();
      }
      const derniere = actions[actions.length - 1]?.action.type;
      if (derniere === "concede") bilan.finParAbandon++;
      const anomalies = r.anomalies.filter((a) => a.kind !== "unsigned");
      const note = `${source} · ${mulligans.length} mulligan(s) · ${etat} · ${r.applied}/${actions.length} actions · fin: ${derniere ?? "?"}${anomalies.length ? ` · anomalies: ${anomalies.map((a) => a.kind).join(",")}` : ""}${m.result_source ? ` · résultat base: ${m.result_source}` : ""}`;
      if (r.state.phase !== "finished") {
        bilan.inacheve++;
        log(`⏸  ${tag} rejeu INACHEVÉ (tour ${r.state.turnNumber}) — ${note}`);
      } else if (r.state.winner === m.winner_id) {
        bilan.vainqueurOk++;
        log(`✅ ${tag} même vainqueur — ${note}`);
      } else {
        bilan.vainqueurDivergent++;
        log(`❌ ${tag} vainqueur DIVERGENT — ${note}`);
      }
    } catch (e) {
      parler();
      bilan.erreur++;
      log(`💥 ${tag} ${(e as Error).message}`);
    }
  }
  log("\nBilan :", bilan);
}

main().catch((e) => { parler(); console.error(e); process.exit(1); });
