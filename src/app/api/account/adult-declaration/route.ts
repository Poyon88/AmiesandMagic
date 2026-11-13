// POST /api/account/adult-declaration — { confirm: true }
//
// Enregistre la déclaration de majorité du joueur : « je certifie avoir au
// moins N ans », N étant l'âge minimum du pays de connexion. Recueillie une
// fois, avant le premier achat ; datée, avec l'âge et le pays du moment, pour
// pouvoir la produire en cas de litige.
//
// Ce n'est PAS une vérification d'identité — la loi n'en demande pas pour ce
// type d'achat. C'est une déclaration sur l'honneur, adossée aux CGU.
import { NextResponse } from "next/server";
import { getAuthUser, getAdminClient } from "@/lib/payments/stripe";
import { geoContext } from "@/lib/geo/rules";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json({ error: "Confirmation requise" }, { status: 400 });
  }

  const { country, rules } = await geoContext(request.headers);
  const { error } = await getAdminClient()
    .from("profiles")
    .update({
      adult_declared_at: new Date().toISOString(),
      adult_declared_min_age: rules.min_age,
      adult_declared_country: country,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[adult-declaration]", error);
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }
  return NextResponse.json({ adultDeclared: true, minAge: rules.min_age });
}
