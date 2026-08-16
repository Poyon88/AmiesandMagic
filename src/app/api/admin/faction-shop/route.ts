// Tarifs de la boutique de factions — lecture et réglage, réservés à
// l'administration.
//
// Ces deux nombres vivent en base et non dans le code parce qu'ils sont faits
// pour BOUGER : le prix du forfait est un prix de lancement, destiné à monter
// une fois la période promotionnelle close. Un redéploiement pour changer un
// prix serait le mauvais outil.
//
// Ce que la route NE fait pas : toucher aux achats déjà passés. Chaque ligne de
// `user_faction_unlocks` conserve son `price_paid`, si bien qu'une hausse de
// tarif n'a aucun effet rétroactif — ni sur ce que le joueur a payé, ni sur ce
// que lui rendrait une révocation.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("faction_shop_settings")
    .select("faction_price, bundle_price, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Nombre de déblocages vendus, par tarif payé : c'est ce qui permet de juger
  // si le prix de lancement a fait son office avant de le relever.
  const { data: ventes } = await auth.supabase
    .from("user_faction_unlocks")
    .select("source, price_paid")
    .in("source", ["purchase", "bundle"]);

  const factionsVendues = (ventes ?? []).filter((v) => v.source === "purchase").length;
  const forfaitsVendus = (ventes ?? []).filter((v) => v.source === "bundle").length;

  return NextResponse.json({
    settings: data ?? null,
    stats: {
      factionsVendues,
      forfaitsVendus,
      orDepense: (ventes ?? []).reduce((s, v) => s + (v.price_paid ?? 0), 0),
    },
  });
}

function entierPositif(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return null;
  return v;
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: { faction_price?: unknown; bundle_price?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corps illisible" }, { status: 400 });
  }

  const patch: Record<string, number> = {};
  if (body.faction_price !== undefined) {
    const v = entierPositif(body.faction_price);
    if (v === null) return NextResponse.json({ error: "faction_price invalide" }, { status: 422 });
    patch.faction_price = v;
  }
  if (body.bundle_price !== undefined) {
    const v = entierPositif(body.bundle_price);
    if (v === null) return NextResponse.json({ error: "bundle_price invalide" }, { status: 422 });
    patch.bundle_price = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "rien à modifier" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("faction_shop_settings")
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: auth.user.id })
    .eq("id", 1)
    .select("faction_price, bundle_price, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}
