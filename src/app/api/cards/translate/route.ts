import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { upsertCardTranslations } from "@/lib/cards/cardTranslations";
import { CARD_TARGET_LOCALES } from "@/lib/cards/translateCards";

// POST : (re)génère par IA les traductions nom + ambiance de cartes.
// Body : { cardIds: number[] }  (ou { cardId: number }).
// Saute les locales verrouillées à la main (source='manual').
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabaseAdmin = auth.supabase;

  const body = await request.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.cardIds)
    ? body.cardIds
    : typeof body.cardId === "number"
      ? [body.cardId]
      : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "cardIds requis" }, { status: 400 });
  }

  const { data: cards, error } = await supabaseAdmin
    .from("cards")
    .select("id, name, flavor_text")
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let written = 0;
  for (const card of cards ?? []) {
    written += await upsertCardTranslations(supabaseAdmin, card);
  }
  return NextResponse.json({ success: true, cards: cards?.length ?? 0, written });
}

// PUT : override manuel d'une traduction. Body :
// { card_id, locale, name?, flavor_text?, effect_text? } → source='manual'.
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabaseAdmin = auth.supabase;

  const body = await request.json().catch(() => ({}));
  const { card_id, locale } = body;
  if (typeof card_id !== "number" || !CARD_TARGET_LOCALES.includes(locale)) {
    return NextResponse.json(
      { error: "card_id (number) et locale valide requis" },
      { status: 400 },
    );
  }

  const row: Record<string, unknown> = {
    card_id,
    locale,
    source: "manual",
    updated_at: new Date().toISOString(),
  };
  for (const f of ["name", "flavor_text", "effect_text"] as const) {
    if (f in body) row[f] = body[f] ?? null;
  }

  const { error } = await supabaseAdmin
    .from("card_translations")
    .upsert(row, { onConflict: "card_id,locale" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
