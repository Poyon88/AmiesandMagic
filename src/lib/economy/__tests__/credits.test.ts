// CRÉDITS MARCHÉ — vrai PL/pgSQL (supabase-migration-credits.sql) sous PGlite.
//
// Invariants : lots à 30 jours, dépense FIFO par échéance, aucun débit
// partiel, crédits acceptés seulement aux ventes admin, remboursement exact du
// surenchéri (sur le lot d'origine, échéance stricte), idempotence.
import { beforeEach, describe, expect, it } from "vitest";
import { createAuctionDb, type AuctionDb } from "./db-harness";

let h: AuctionDb;
let admin: string;

async function grant(user: string, amount: number, days = 30): Promise<string> {
  await h.db.query("SELECT grant_credits($1, $2, 'admin_credit', 'admin', NULL, '{}'::jsonb, NULL, $3)", [user, amount, days]);
  const { rows } = await h.db.query<{ id: string }>(
    "SELECT id FROM credit_grants WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT 1", [user]);
  return rows[0].id;
}
async function credits(user: string): Promise<number> {
  const { rows } = await h.db.query<{ b: number }>("SELECT credit_balance($1) AS b", [user]);
  return rows[0].b;
}
async function spent(grantId: string): Promise<number> {
  const { rows } = await h.db.query<{ spent: number }>("SELECT spent FROM credit_grants WHERE id = $1", [grantId]);
  return rows[0].spent;
}
async function expire(grantId: string) {
  await h.db.query("UPDATE credit_grants SET expires_at = now() - interval '1 second' WHERE id = $1", [grantId]);
}

beforeEach(async () => {
  h = await createAuctionDb();
  admin = await h.createUser(0);
});

describe("lots et solde", () => {
  it("un lot expire 30 jours après son émission", async () => {
    const u = await h.createUser();
    const g = await grant(u, 50);
    const { rows } = await h.db.query<{ days: number }>(
      "SELECT round(extract(epoch FROM expires_at - created_at) / 86400)::int AS days FROM credit_grants WHERE id = $1", [g]);
    expect(rows[0].days).toBe(30);
    expect(await credits(u)).toBe(50);
  });

  it("un lot expiré sort du solde", async () => {
    const u = await h.createUser();
    const g = await grant(u, 50);
    await grant(u, 20);
    await expire(g);
    expect(await credits(u)).toBe(20);
  });

  it("la dépense consomme d'abord le lot qui expire le plus tôt", async () => {
    const u = await h.createUser();
    const tard = await grant(u, 30, 30);
    const tot = await grant(u, 30, 5);
    await h.db.query("SELECT spend_credits($1, 40, 'admin_debit')", [u]);
    expect(await spent(tot)).toBe(30);
    expect(await spent(tard)).toBe(10);
    expect(await credits(u)).toBe(20);
  });

  it("solde insuffisant : erreur et aucun débit", async () => {
    const u = await h.createUser();
    const g = await grant(u, 10);
    await expect(h.db.query("SELECT spend_credits($1, 11, 'admin_debit')", [u])).rejects.toThrow(/insuffisants/);
    expect(await spent(g)).toBe(0);
  });
});

describe("enchères de la plateforme", () => {
  it("crédits d'abord, l'or complète ; conservation exacte", async () => {
    const u = await h.createUser(100);
    await grant(u, 50);
    const a = await h.createAuction({ sellerId: admin, sellerType: "admin", startingBid: 10 });
    const r = await h.placeBid(a, u, 80) as Record<string, unknown>;
    expect(r).toMatchObject({ success: true, credits_used: 50, gold_used: 30 });
    expect(await credits(u)).toBe(0);
    expect(await h.balance(u)).toBe(70);
  });

  it("tout en crédits quand ils suffisent", async () => {
    const u = await h.createUser(0);
    await grant(u, 50);
    const a = await h.createAuction({ sellerId: admin, sellerType: "admin", startingBid: 10 });
    expect(await h.placeBid(a, u, 40)).toMatchObject({ success: true, credits_used: 40, gold_used: 0 });
    expect(await credits(u)).toBe(10);
  });

  it("or insuffisant après les crédits : rien n'est débité", async () => {
    const u = await h.createUser(10);
    const g = await grant(u, 50);
    const a = await h.createAuction({ sellerId: admin, sellerType: "admin", startingBid: 10 });
    await expect(h.placeBid(a, u, 80)).rejects.toThrow();
    expect(await spent(g)).toBe(0);
    expect(await h.balance(u)).toBe(10);
  });

  it("le surenchéri récupère ses crédits SUR LE MÊME LOT et son or", async () => {
    const u1 = await h.createUser(100);
    const u2 = await h.createUser(500);
    const g = await grant(u1, 50);
    const a = await h.createAuction({ sellerId: admin, sellerType: "admin", startingBid: 10 });
    await h.placeBid(a, u1, 80);
    await h.placeBid(a, u2, 90);
    expect(await spent(g)).toBe(0);
    expect(await credits(u1)).toBe(50);
    expect(await h.balance(u1)).toBe(100);
    const { rows } = await h.db.query<{ message: string }>(
      "SELECT message FROM notifications WHERE user_id = $1 AND type = 'auction_outbid'", [u1]);
    expect(rows[0].message).toContain("30 or + 50 crédits");
  });

  it("un lot expiré pendant l'enchère n'est pas rendu (échéance stricte)", async () => {
    const u1 = await h.createUser(0);
    const u2 = await h.createUser(500);
    const g = await grant(u1, 50);
    const a = await h.createAuction({ sellerId: admin, sellerType: "admin", startingBid: 10 });
    await h.placeBid(a, u1, 50);
    await expire(g);
    await h.placeBid(a, u2, 60);
    expect(await credits(u1)).toBe(0);
    expect(await spent(g)).toBe(0); // rendu au lot… mais le lot est expiré
  });

  it("refund_bid est idempotent", async () => {
    const u = await h.createUser(100);
    await grant(u, 20);
    const a = await h.createAuction({ sellerId: admin, sellerType: "admin", startingBid: 10 });
    const r = await h.placeBid(a, u, 50) as { bid_id: string };
    await h.db.query("SELECT refund_bid($1)", [r.bid_id]);
    await h.db.query("SELECT refund_bid($1)", [r.bid_id]);
    expect(await credits(u)).toBe(20);
    expect(await h.balance(u)).toBe(100);
  });
});

describe("ventes entre joueurs", () => {
  it("aucun crédit consommé : 100 % or", async () => {
    const seller = await h.createUser(0);
    const u = await h.createUser(100);
    await grant(u, 50);
    const a = await h.createAuction({ sellerId: seller, sellerType: "player", startingBid: 10 });
    expect(await h.placeBid(a, u, 40)).toMatchObject({ success: true, credits_used: 0, gold_used: 40 });
    expect(await credits(u)).toBe(50);
    expect(await h.balance(u)).toBe(60);
  });
});
