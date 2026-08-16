// Administration MINIMALE des tournois — juste ce qu'il faut pour qu'un
// tournoi payant existe et soit testable de bout en bout.
//
// Le tournoi lui-même (arbre à 32, appariement, report des résultats,
// distribution des gains en pièces d'or) est un chantier distinct,
// volontairement hors de ce lot : mélanger le moteur de tournoi et le système
// de paiement aurait rendu les deux intestables.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

const STATUSES = ["draft", "open", "running", "finished", "cancelled"] as const;
/** Type de tournoi. `weekly` et `special` coûtent un ticket, `free` non — la
 *  règle elle-même vit en base (`tournament_requires_ticket`), on ne la recopie
 *  pas ici, on ne fait que valider la valeur saisie. */
const KINDS = ["weekly", "free", "special"] as const;

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("tournaments")
    .select("id, name, status, kind, entry_price_cents, capacity, starts_at, format_code, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Nombre d'inscrits par tournoi. Une seule requête pour tout le monde plutôt
  // qu'un comptage par ligne : l'écran en affiche une quinzaine, et N+1 requêtes
  // pour un chiffre est le genre de détail qui ne se voit qu'en production.
  const { data: entries } = await auth.supabase
    .from("tournament_entries")
    .select("tournament_id");

  const counts = new Map<string, number>();
  for (const e of entries ?? []) {
    counts.set(e.tournament_id, (counts.get(e.tournament_id) ?? 0) + 1);
  }

  return NextResponse.json({
    tournaments: (data ?? []).map((t) => ({ ...t, entries_count: counts.get(t.id) ?? 0 })),
  });
}

/** Suppression réservée aux tournois SANS AUCUN INSCRIT — pour effacer une
 *  coquille, pas pour défaire une vente. Un tournoi qui a des inscrits a des
 *  paiements derrière lui : le supprimer romprait la traçabilité de l'argent
 *  encaissé. Pour fermer un tournoi vendu, on l'ANNULE (status `cancelled`) et
 *  on rembourse depuis Stripe. */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { count } = await auth.supabase
    .from("tournament_entries")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Impossible : ${count} inscription(s) enregistrée(s). Annulez le tournoi plutôt que de le supprimer.` },
      { status: 409 },
    );
  }

  const { error } = await auth.supabase.from("tournaments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });

  const capacity = Number.isInteger(body?.capacity) ? body.capacity : 32;
  if (capacity < 2 || capacity > 512) {
    return NextResponse.json({ error: "Capacité hors bornes" }, { status: 400 });
  }

  // `entry_price_cents` est INDICATIF : il alimente l'affichage. Le montant
  // facturé vient du Price Stripe (STRIPE_PRICE_TOURNAMENT_ENTRY) et de nulle
  // part ailleurs. Le renseigner autrement qu'en accord avec ce Price ferait
  // mentir l'écran, jamais la facture.
  const priceCents = Number.isInteger(body?.entry_price_cents) ? body.entry_price_cents : 250;
  if (priceCents < 0 || priceCents > 100_000) {
    return NextResponse.json({ error: "Prix hors bornes" }, { status: 400 });
  }

  const status = STATUSES.includes(body?.status) ? body.status : "draft";
  const kind = KINDS.includes(body?.kind) ? body.kind : "weekly";

  const { data, error } = await auth.supabase
    .from("tournaments")
    .insert({
      name,
      capacity,
      entry_price_cents: priceCents,
      status,
      kind,
      starts_at: typeof body?.starts_at === "string" ? body.starts_at : null,
      format_code: typeof body?.format_code === "string" ? body.format_code : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tournament: data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (STATUSES.includes(body?.status)) patch.status = body.status;
  if (KINDS.includes(body?.kind)) patch.kind = body.kind;
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body?.starts_at === "string") patch.starts_at = body.starts_at;

  const { data, error } = await auth.supabase
    .from("tournaments").update(patch).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tournament: data });
}
