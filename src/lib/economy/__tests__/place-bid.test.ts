// Tests de place_bid (PL/pgSQL réel via PGlite) — invariants monétaires des
// enchères : escrow atomique, validations, remboursement du surenchéri, buyout.
import { describe, it, expect, beforeEach } from "vitest";
import { createAuctionDb, type AuctionDb } from "./db-harness";

let t: AuctionDb;
beforeEach(async () => {
  t = await createAuctionDb();
});

describe("place_bid — escrow & happy path", () => {
  it("débite exactement le montant et enregistre une transaction d'escrow", async () => {
    const seller = await t.createUser(0);
    const bidder = await t.createUser(100);
    const a = await t.createAuction({ sellerId: seller, startingBid: 10 });

    const r = await t.placeBid(a, bidder, 50);

    expect(r).toMatchObject({ success: true, amount: 50, is_buyout: false });
    expect(await t.balance(bidder)).toBe(50); // 100 - 50 escrow
    expect(await t.txCount(bidder, "auction_escrow")).toBe(1);

    const row = await t.auction(a);
    expect(row.current_bid).toBe(50);
    expect(row.current_bidder_id).toBe(bidder);
    expect(row.bid_count).toBe(1);
  });
});

describe("place_bid — validations (aucun débit, aucun changement d'état)", () => {
  it("rejette une mise sous le prix de départ", async () => {
    const seller = await t.createUser(0);
    const bidder = await t.createUser(100);
    const a = await t.createAuction({ sellerId: seller, startingBid: 20 });

    const r = await t.placeBid(a, bidder, 15);

    expect(r).toHaveProperty("error");
    expect(await t.balance(bidder)).toBe(100); // intact
    expect((await t.auction(a)).bid_count).toBe(0);
  });

  it("rejette une mise sous current_bid + min_increment", async () => {
    const seller = await t.createUser(0);
    const a1 = await t.createUser(100);
    const a2 = await t.createUser(100);
    const a = await t.createAuction({ sellerId: seller, startingBid: 10 });

    await t.placeBid(a, a1, 50); // current_bid = 50, min_increment = 1
    const r = await t.placeBid(a, a2, 50); // doit être >= 51

    expect(r).toHaveProperty("error");
    expect(await t.balance(a2)).toBe(100);
    expect((await t.auction(a)).current_bidder_id).toBe(a1);
  });

  it("interdit d'enchérir sur sa propre enchère", async () => {
    const seller = await t.createUser(100);
    const a = await t.createAuction({ sellerId: seller, startingBid: 10 });

    const r = await t.placeBid(a, seller, 50);

    expect(r).toHaveProperty("error");
    expect(await t.balance(seller)).toBe(100);
  });

  it("rejette une mise sur une enchère expirée", async () => {
    const seller = await t.createUser(0);
    const bidder = await t.createUser(100);
    const a = await t.createAuction({ sellerId: seller, startingBid: 10, durationMinutes: -5 });

    const r = await t.placeBid(a, bidder, 50);

    expect(r).toHaveProperty("error");
    expect(await t.balance(bidder)).toBe(100);
  });
});

describe("place_bid — fonds insuffisants (atomicité)", () => {
  it("lève et ne laisse AUCUN état partiel si l'escrow dépasse le solde", async () => {
    const seller = await t.createUser(0);
    const bidder = await t.createUser(30); // pas assez pour 50
    const a = await t.createAuction({ sellerId: seller, startingBid: 10 });

    // La contrainte CHECK(balance >= 0) fait échouer adjust_wallet_balance ;
    // l'exception remonte → rollback complet de l'appel de fonction.
    await expect(t.placeBid(a, bidder, 50)).rejects.toThrow();

    expect(await t.balance(bidder)).toBe(30); // intact
    expect(await t.txCount(bidder, "auction_escrow")).toBe(0); // aucune tx
    const row = await t.auction(a);
    expect(row.bid_count).toBe(0); // aucun bid inséré
    expect(row.current_bidder_id).toBeNull();
  });
});

describe("place_bid — remboursement du surenchéri (conservation de l'or)", () => {
  it("rembourse intégralement l'ancien enchérisseur et retient le nouveau", async () => {
    const seller = await t.createUser(0);
    const alice = await t.createUser(100);
    const bob = await t.createUser(100);
    const a = await t.createAuction({ sellerId: seller, startingBid: 10 });

    await t.placeBid(a, alice, 50); // Alice: 100 -> 50
    expect(await t.balance(alice)).toBe(50);

    await t.placeBid(a, bob, 60); // Bob: 100 -> 40, Alice remboursée -> 100

    expect(await t.balance(alice)).toBe(100); // remboursée en entier
    expect(await t.balance(bob)).toBe(40); // escrow retenu
    expect(await t.txCount(alice, "auction_refund")).toBe(1);

    const row = await t.auction(a);
    expect(row.current_bidder_id).toBe(bob);
    expect(row.current_bid).toBe(60);
    expect(row.bid_count).toBe(2);

    // Conservation : total or joueurs = 200 - 60 (seul l'escrow de Bob est bloqué)
    expect((await t.balance(alice)) + (await t.balance(bob))).toBe(140);
  });
});

describe("place_bid — buyout", () => {
  it("un buyout au prix exact termine et règle l'enchère, paie le vendeur", async () => {
    const seller = await t.createUser(0);
    const bidder = await t.createUser(200);
    const a = await t.createAuction({
      sellerId: seller,
      startingBid: 10,
      buyoutPrice: 100,
      commissionRate: 5,
    });

    const r = await t.placeBid(a, bidder, 100, true);

    expect(r).toMatchObject({ success: true, is_buyout: true });
    expect(await t.balance(bidder)).toBe(100); // 200 - 100

    const row = await t.auction(a);
    expect(row.status).toBe("ended_sold");
    expect(row.settled_at).not.toBeNull();

    // Vendeur payé 100 - commission(5%) = 95
    expect(await t.balance(seller)).toBe(95);
  });

  it("rejette un buyout dont le montant ne correspond pas au prix", async () => {
    const seller = await t.createUser(0);
    const bidder = await t.createUser(200);
    const a = await t.createAuction({ sellerId: seller, startingBid: 10, buyoutPrice: 100 });

    const r = await t.placeBid(a, bidder, 80, true);

    expect(r).toHaveProperty("error");
    expect(await t.balance(bidder)).toBe(200);
    expect((await t.auction(a)).status).toBe("active");
  });
});
