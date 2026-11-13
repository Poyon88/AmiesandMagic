// Routes d'achat face aux règles par pays et à la majorité, exécutées pour de
// bon (Stripe et Supabase doublés). Ce qu'on éprouve : un pays fermé ou une
// majorité non déclarée n'ouvrent JAMAIS de session Stripe, et une session
// ouverte porte les informations de conformité.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionsCreate = vi.fn();
const insert = vi.fn();
let rules: Record<string, unknown>[] = [];
let profile: Record<string, unknown> | null = null;

const supabase = {
  from: (table: string) => {
    if (table === "payments") return { insert };
    // profiles : .select().eq().maybeSingle()
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) };
  },
};

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: sessionsCreate, expire: vi.fn() } } }),
  getAuthUser: async () => ({ id: "user-1", email: "joueur@example.test" }),
  getAdminClient: () => supabase,
  ensureStripeCustomer: async () => "cus_1",
  siteUrl: () => "http://localhost",
}));
vi.mock("@/lib/admin/requireAdmin", () => ({
  getAdminClient: () => ({ from: () => ({ select: async () => ({ data: rules, error: null }) }) }),
}));

import { POST as goldPack } from "@/app/api/checkout/gold-pack/route";
import { POST as ticketPack } from "@/app/api/checkout/ticket-pack/route";
import { clearCountryRulesCache } from "@/lib/geo/rules";

const regle = (code: string, over = {}) => ({
  country_code: code, gold_purchases: true, tickets: true, auctions: true, cash_prizes: true, min_age: 18, ...over,
});

function acheter(route: typeof goldPack, pack: string, pays: string) {
  return route(new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-vercel-ip-country": pays },
    body: JSON.stringify({ pack_code: pack }),
  }));
}

beforeEach(() => {
  process.env.STRIPE_PRICE_GOLD_PACK_S = "price_gold_s";
  process.env.STRIPE_PRICE_TICKET_PACK_S = "price_ticket_s";
  clearCountryRulesCache();
  rules = [
    regle("ZZ", { gold_purchases: false, tickets: false, cash_prizes: false }),
    regle("LU"),
    regle("BE", { tickets: false, cash_prizes: false }),
  ];
  profile = { adult_declared_at: "2026-11-13T10:00:00Z", adult_declared_min_age: 18 };
  sessionsCreate.mockReset();
  sessionsCreate.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe("pays fermé", () => {
  it("or depuis un pays hors liste ⇒ 403, aucune session Stripe", async () => {
    const res = await acheter(goldPack, "gold_pack_s", "US");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("country_restricted");
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("Belgique : tickets refusés, or accepté", async () => {
    expect((await acheter(ticketPack, "ticket_pack_s", "BE")).status).toBe(403);
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect((await acheter(goldPack, "gold_pack_s", "BE")).status).toBe(200);
  });
});

describe("majorité", () => {
  it("non déclarée ⇒ 403 age_required, aucune session Stripe", async () => {
    profile = { adult_declared_at: null, adult_declared_min_age: null };
    const res = await acheter(goldPack, "gold_pack_s", "LU");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "age_required", minAge: 18 });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("déclarée pour 18 ans, pays à 19 ans ⇒ redemandée", async () => {
    rules.push(regle("KR", { min_age: 19 }));
    const res = await acheter(goldPack, "gold_pack_s", "KR");
    expect(await res.json()).toMatchObject({ code: "age_required", minAge: 19 });
  });
});

describe("session ouverte", () => {
  it("porte l'adresse de facturation exigée et les informations de conformité", async () => {
    const res = await acheter(ticketPack, "ticket_pack_s", "LU");
    expect(res.status).toBe(200);
    const params = sessionsCreate.mock.calls[0][0];
    const conformite = { request_country: "LU", min_age: "18", adult_declared_at: "2026-11-13T10:00:00Z" };
    expect(params.billing_address_collection).toBe("required");
    expect(params.customer_update).toEqual({ address: "auto" });
    expect(params.metadata).toMatchObject({ user_id: "user-1", type: "ticket_pack", ...conformite });
    expect(params.payment_intent_data.metadata).toMatchObject(conformite);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ request_country: "LU", status: "pending" }));
  });
});
