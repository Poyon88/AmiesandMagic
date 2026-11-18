// Cartes choisies à la main pour les visuels de la page d'accueil (admin).
// Lecture + ajout + retrait + ordre, par section. Les textes ont leur route :
// ./textes/route.ts.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { estSectionVitrine } from "@/lib/vitrine/config";

/** Message lisible quand les tables n'existent pas encore. */
function erreur(message: string) {
  const absente = /vitrine_(cards|textes)/.test(message) && /(does not exist|schema cache|not find)/i.test(message);
  return NextResponse.json(
    { error: absente ? "Tables de la vitrine absentes : appliquer supabase-migration-vitrine.sql." : message },
    { status: 500 },
  );
}

// GET /api/admin/vitrine — les sélections de toutes les sections et les textes.
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [cartes, textes] = await Promise.all([
    auth.supabase.from("vitrine_cards").select("section, card_id, sort_order").order("sort_order").order("id"),
    auth.supabase.from("vitrine_textes").select("key, fr, translations, updated_at"),
  ]);
  if (cartes.error) return erreur(cartes.error.message);
  if (textes.error) return erreur(textes.error.message);

  return NextResponse.json({ cartes: cartes.data ?? [], textes: textes.data ?? [] });
}

// POST /api/admin/vitrine — body { section, card_id } : ajoute en fin de liste.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { section, card_id } = (await request.json()) as { section?: unknown; card_id?: unknown };
  if (!estSectionVitrine(section)) return NextResponse.json({ error: "section inconnue" }, { status: 400 });
  if (typeof card_id !== "number" || !Number.isInteger(card_id)) {
    return NextResponse.json({ error: "card_id requis" }, { status: 400 });
  }

  const { data: derniere } = await auth.supabase
    .from("vitrine_cards")
    .select("sort_order")
    .eq("section", section)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await auth.supabase
    .from("vitrine_cards")
    .insert({ section, card_id, sort_order: (derniere?.sort_order ?? -1) + 1 });
  if (error) {
    // Doublon (index unique section + carte) : déjà dans la liste, rien à faire.
    if (error.code === "23505") return NextResponse.json({ success: true });
    return erreur(error.message);
  }
  return NextResponse.json({ success: true });
}

// DELETE /api/admin/vitrine — body { section, card_id }.
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { section, card_id } = (await request.json()) as { section?: unknown; card_id?: unknown };
  if (!estSectionVitrine(section)) return NextResponse.json({ error: "section inconnue" }, { status: 400 });
  if (typeof card_id !== "number") return NextResponse.json({ error: "card_id requis" }, { status: 400 });

  const { error } = await auth.supabase.from("vitrine_cards").delete().eq("section", section).eq("card_id", card_id);
  if (error) return erreur(error.message);
  return NextResponse.json({ success: true });
}

// PATCH /api/admin/vitrine — body { section, card_ids } : l'ordre voulu, en entier.
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { section, card_ids } = (await request.json()) as { section?: unknown; card_ids?: unknown };
  if (!estSectionVitrine(section)) return NextResponse.json({ error: "section inconnue" }, { status: 400 });
  if (!Array.isArray(card_ids) || card_ids.some((id) => typeof id !== "number")) {
    return NextResponse.json({ error: "card_ids requis" }, { status: 400 });
  }

  for (const [i, card_id] of (card_ids as number[]).entries()) {
    const { error } = await auth.supabase
      .from("vitrine_cards")
      .update({ sort_order: i })
      .eq("section", section)
      .eq("card_id", card_id);
    if (error) return erreur(error.message);
  }
  return NextResponse.json({ success: true });
}
