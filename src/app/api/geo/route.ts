// GET /api/geo — ce que le pays de connexion ouvre au visiteur.
//
// Sert l'AFFICHAGE (boutons d'achat, messages « pas disponible dans votre
// pays », case de majorité). La décision, elle, est reprise par chaque route
// serveur concernée : rien de ce que renvoie cette route ne fait autorité.
import { NextResponse } from "next/server";
import { getAuthUser, getAdminClient } from "@/lib/payments/stripe";
import { geoContext, isAdultDeclared } from "@/lib/geo/rules";

export async function GET(request: Request) {
  const { country, rules } = await geoContext(request.headers);

  let adultDeclared = false;
  const user = await getAuthUser();
  if (user) {
    const { data } = await getAdminClient()
      .from("profiles")
      .select("adult_declared_at, adult_declared_min_age")
      .eq("id", user.id)
      .maybeSingle();
    adultDeclared = isAdultDeclared(data, rules.min_age);
  }

  return NextResponse.json(
    {
      country,
      features: {
        gold_purchases: rules.gold_purchases,
        tickets: rules.tickets,
        auctions: rules.auctions,
        cash_prizes: rules.cash_prizes,
      },
      minAge: rules.min_age,
      adultDeclared,
    },
    // Dépend du pays ET du joueur : jamais de cache partagé.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
