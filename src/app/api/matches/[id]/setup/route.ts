// POST /api/matches/[id]/setup — FIGE la configuration de la partie au
// lancement (decks, héros, pools, jetons, exemplaires possédés, règles), pour
// que le serveur puisse la rejouer à l'identique à la fin. Idempotent : la
// première capture fait foi, les suivantes ne changent rien.
import { NextResponse } from "next/server";
import { matchContext } from "@/lib/game/server/match-auth";
import { loadMatchSetup, snapshotSetup } from "@/lib/game/match-setup";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await matchContext(id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { db, match } = ctx;

  const { data: existing, error: readErr } = await db.from("match_setups").select("match_id").eq("match_id", id).maybeSingle();
  // Migration absente : la capture est simplement indisponible, la partie
  // continue (résultat « client », comme avant).
  if (readErr) return NextResponse.json({ captured: false, reason: "unavailable" }, { status: 200 });
  if (existing) return NextResponse.json({ captured: true, already: true });
  if (match.status === "finished") return NextResponse.json({ captured: false, reason: "finished" });

  try {
    const setup = await loadMatchSetup(db, match);
    const { error } = await db
      .from("match_setups")
      .insert({ match_id: id, setup: snapshotSetup(setup) });
    // 23505 : l'autre joueur a capturé au même instant — sa capture fait foi.
    if (error && error.code !== "23505") throw new Error(error.message);
    return NextResponse.json({ captured: true });
  } catch (e) {
    console.error("[match-setup] capture", id, e);
    return NextResponse.json({ captured: false, reason: "error" }, { status: 500 });
  }
}
