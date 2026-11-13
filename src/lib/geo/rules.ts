// Règles par pays : quelles fonctions à enjeu sont ouvertes, et à partir de
// quel âge on peut acheter. Réglées depuis /admin/pays (table `country_rules`).
//
// ⚠️ SERVEUR UNIQUEMENT (client service_role). Les composants client passent
// par GET /api/geo.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import { DEFAULT_COUNTRY, requestCountry } from "./country";

export const GEO_FEATURES = ["gold_purchases", "tickets", "auctions", "cash_prizes"] as const;
export type GeoFeature = (typeof GEO_FEATURES)[number];

export interface CountryRules {
  country_code: string;
  gold_purchases: boolean;
  tickets: boolean;
  auctions: boolean;
  cash_prizes: boolean;
  min_age: number;
  note?: string | null;
}

/** Filet si la table est illisible ou vide : tout ce qui touche à l'argent est
 *  fermé. On préfère refuser une vente que vendre là où c'est interdit. */
export const CLOSED_RULES: CountryRules = {
  country_code: DEFAULT_COUNTRY,
  gold_purchases: false,
  tickets: false,
  auctions: false,
  cash_prizes: false,
  min_age: 18,
};

/** La règle du pays, sinon la règle par défaut (`ZZ`), sinon tout fermé. */
export function resolveRules(rows: CountryRules[], country: string): CountryRules {
  return (
    rows.find((r) => r.country_code === country) ??
    rows.find((r) => r.country_code === DEFAULT_COUNTRY) ??
    CLOSED_RULES
  );
}

const CACHE_MS = 60_000;
let cache: { at: number; rows: CountryRules[] } | null = null;

/** À appeler après toute écriture admin. */
export function clearCountryRulesCache() {
  cache = null;
}

async function loadRules(): Promise<CountryRules[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const { data, error } = await getAdminClient()
    .from("country_rules")
    .select("country_code, gold_purchases, tickets, auctions, cash_prizes, min_age, note");
  if (error || !data) {
    console.error("[geo] lecture de country_rules", error);
    return []; // ⇒ CLOSED_RULES ; pas mis en cache, on réessaie à la prochaine requête
  }
  cache = { at: Date.now(), rows: data as CountryRules[] };
  return cache.rows;
}

export async function getCountryRules(country: string): Promise<CountryRules> {
  return resolveRules(await loadRules(), country);
}

/** Pays de connexion + ses règles. */
export async function geoContext(headers: Headers): Promise<{ country: string; rules: CountryRules }> {
  const country = requestCountry(headers);
  return { country, rules: await getCountryRules(country) };
}

type GateResult =
  | { error: NextResponse; country?: never; rules?: never }
  | { error?: never; country: string; rules: CountryRules };

/** Garde de route : la fonction est-elle ouverte dans le pays de connexion ?
 *  Usage : `const geo = await gateFeature(request, "tickets"); if (geo.error) return geo.error;` */
export async function gateFeature(request: Request, feature: GeoFeature): Promise<GateResult> {
  const { country, rules } = await geoContext(request.headers);
  if (!rules[feature]) {
    return {
      error: NextResponse.json(
        { error: "Cette fonction n'est pas encore disponible dans votre pays.", code: "country_restricted", country },
        { status: 403 },
      ),
    };
  }
  return { country, rules };
}

type AdultResult =
  | { error: NextResponse; declaredAt?: never }
  | { error?: never; declaredAt: string };

/** Garde d'achat : le joueur a-t-il déclaré avoir l'âge requis dans ce pays ?
 *  Une déclaration faite pour un âge inférieur (pays à 18 ans, puis achat
 *  depuis un pays à 19) ne suffit pas : elle est redemandée. */
export async function requireAdult(
  supabase: SupabaseClient,
  userId: string,
  rules: CountryRules,
): Promise<AdultResult> {
  const { data } = await supabase
    .from("profiles")
    .select("adult_declared_at, adult_declared_min_age")
    .eq("id", userId)
    .maybeSingle();
  if (!isAdultDeclared(data, rules.min_age)) {
    return {
      error: NextResponse.json(
        { error: `Les achats sont réservés aux personnes d'au moins ${rules.min_age} ans.`, code: "age_required", minAge: rules.min_age },
        { status: 403 },
      ),
    };
  }
  return { declaredAt: data!.adult_declared_at as string };
}

export function isAdultDeclared(
  profile: { adult_declared_at?: string | null; adult_declared_min_age?: number | null } | null | undefined,
  minAge: number,
): boolean {
  return !!profile?.adult_declared_at && (profile.adult_declared_min_age ?? 0) >= minAge;
}
