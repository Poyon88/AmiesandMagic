// GET  /api/faction-shop — l'état de la boutique pour le joueur connecté.
// POST /api/faction-shop — { faction } ou { bundle: true } : l'achat.
//
// Toute la règle monétaire vit dans `purchase_faction` /
// `purchase_faction_bundle` (PL/pgSQL) : débit et déblocage y sont dans la même
// transaction, donc jamais l'un sans l'autre. Cette route ne fait que porter la
// demande et traduire le refus. Elle ne recalcule RIEN — dupliquer ici le test
// de solde donnerait deux vérités qui finiraient par diverger, et c'est celle du
// serveur SQL qui compte.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import { STARTER_FACTION_IDS } from "@/lib/auth/starterFaction";
import { FREE_RARITY } from "@/lib/game/collection";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* lecture seule */ },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Traduction des refus SQL en messages destinés au joueur.
 *
 *  Volontairement exhaustive et sans repli générique silencieux : un code
 *  inconnu doit ressortir tel quel plutôt que d'être maquillé en « erreur
 *  serveur », sinon un refus légitime passerait pour une panne. */
const REFUS: Readonly<Record<string, { message: string; status: number }>> = {
  gold_debt: {
    message: "Votre dette d'or doit être réglée avant tout nouvel achat.",
    status: 409,
  },
  already_unlocked: { message: "Vous possédez déjà cette faction.", status: 409 },
  already_owns_bundle: {
    message: "Le forfait vous donne déjà toutes les factions.",
    status: 409,
  },
  insufficient_gold: { message: "Or insuffisant.", status: 402 },
  no_wallet: { message: "Portefeuille introuvable.", status: 500 },
};

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = getAdminClient();

  const [{ data: settings }, { data: unlocks }, { data: profile }, { data: wallet }] =
    await Promise.all([
      supabase.from("faction_shop_settings").select("faction_price, bundle_price").eq("id", 1).maybeSingle(),
      supabase.from("user_faction_unlocks").select("faction, source, unlocked_at").eq("user_id", user.id),
      supabase.from("profiles").select("starter_faction, all_commons_unlocked").eq("id", user.id).maybeSingle(),
      supabase.from("wallets").select("balance, gold_debt").eq("user_id", user.id).maybeSingle(),
    ]);

  // Le nombre de communes par faction : c'est l'information qui décide l'achat.
  // Une faction à trois cartes et une à cent au même prix, il faut que le joueur
  // le voie AVANT de payer, pas après.
  const { data: commons } = await supabase
    .from("cards")
    .select("faction")
    .eq("rarity", FREE_RARITY)
    .not("set_id", "is", null);

  const compte = new Map<string, number>();
  for (const c of commons ?? []) {
    const f = (c as { faction: string | null }).faction;
    if (f) compte.set(f, (compte.get(f) ?? 0) + 1);
  }

  const possedees = new Set((unlocks ?? []).map((u) => u.faction as string));
  const forfait = profile?.all_commons_unlocked === true;

  return NextResponse.json({
    factionPrice: settings?.faction_price ?? null,
    bundlePrice: settings?.bundle_price ?? null,
    balance: wallet?.balance ?? 0,
    goldDebt: wallet?.gold_debt ?? 0,
    ownsBundle: forfait,
    starterFaction: profile?.starter_faction ?? null,
    factions: STARTER_FACTION_IDS.map((id) => ({
      id,
      commonCount: compte.get(id) ?? 0,
      // Le forfait rend tout possédé, même les lignes qui n'existent pas en
      // table : c'est un droit, pas une collection de déblocages.
      owned: forfait || possedees.has(id),
      isStarter: (unlocks ?? []).some((u) => u.faction === id && u.source === "starter"),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { faction?: unknown; bundle?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = getAdminClient();
  const veutForfait = body.bundle === true;

  if (!veutForfait) {
    // La liste blanche vient du même inventaire que l'onboarding : une faction
    // inventée ne doit pas pouvoir créer une ligne de déblocage inerte.
    if (typeof body.faction !== "string" || !STARTER_FACTION_IDS.includes(body.faction)) {
      return NextResponse.json({ error: "invalid_faction" }, { status: 422 });
    }
  }

  const { data, error } = veutForfait
    ? await supabase.rpc("purchase_faction_bundle", { p_user_id: user.id })
    : await supabase.rpc("purchase_faction", { p_user_id: user.id, p_faction: body.faction as string });

  if (error) {
    console.error("[faction-shop] achat", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const resultat = data as { error?: string; unlocked?: string; price?: number; balance?: number };

  if (resultat?.error) {
    const refus = REFUS[resultat.error];
    return NextResponse.json(
      { error: resultat.error, message: refus?.message ?? resultat.error, ...resultat },
      { status: refus?.status ?? 409 },
    );
  }

  return NextResponse.json(resultat);
}
