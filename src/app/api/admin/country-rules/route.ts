// Règles par pays — lecture et réglage, réservés à l'administration.
//
// Une ligne par pays RÉGLÉ ; la ligne `ZZ` vaut pour tous les autres. Supprimer
// la ligne d'un pays le fait retomber sur `ZZ`. Les règles vivent en base parce
// qu'elles doivent pouvoir changer le jour même où une loi change, sans
// redéploiement.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { DEFAULT_COUNTRY, normalizeCountry } from "@/lib/geo/country";
import { GEO_FEATURES, clearCountryRulesCache } from "@/lib/geo/rules";

const COLONNES = "country_code, gold_purchases, tickets, auctions, cash_prizes, min_age, note, updated_at";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase.from("country_rules").select(COLONNES).order("country_code");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
}

// PUT — crée ou remplace la règle d'un pays. Tous les champs sont exigés : une
// règle à moitié décrite laisserait le reste à des valeurs par défaut que
// l'administrateur n'a pas vues.
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corps illisible" }, { status: 400 });
  }

  const code = normalizeCountry(typeof body.country_code === "string" ? body.country_code : null);
  if (!code) return NextResponse.json({ error: "country_code invalide (2 lettres)" }, { status: 422 });

  const ligne: Record<string, unknown> = { country_code: code };
  for (const f of GEO_FEATURES) {
    if (typeof body[f] !== "boolean") return NextResponse.json({ error: `${f} invalide` }, { status: 422 });
    ligne[f] = body[f];
  }
  const age = body.min_age;
  if (typeof age !== "number" || !Number.isInteger(age) || age < 13 || age > 25) {
    return NextResponse.json({ error: "min_age invalide (13 à 25)" }, { status: 422 });
  }
  ligne.min_age = age;
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return NextResponse.json({ error: "note invalide" }, { status: 422 });
  }
  ligne.note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;

  const { data, error } = await auth.supabase
    .from("country_rules")
    .upsert({ ...ligne, updated_at: new Date().toISOString(), updated_by: auth.user.id }, { onConflict: "country_code" })
    .select(COLONNES)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  clearCountryRulesCache();
  return NextResponse.json({ rule: data });
}

// DELETE ?country=XX — le pays retombe sur la règle par défaut.
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const code = normalizeCountry(new URL(request.url).searchParams.get("country"));
  if (!code) return NextResponse.json({ error: "country invalide" }, { status: 422 });
  if (code === DEFAULT_COUNTRY) {
    return NextResponse.json({ error: "La règle par défaut ne se supprime pas." }, { status: 400 });
  }

  const { error } = await auth.supabase.from("country_rules").delete().eq("country_code", code);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  clearCountryRulesCache();
  return NextResponse.json({ deleted: code });
}
