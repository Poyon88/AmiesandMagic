// Tests de settle_auction (PL/pgSQL réel via PGlite) — maths de commission,
// paiement vendeur, idempotence (pas de double-règlement), invendu, vendeur
// admin, conservation de l'or.
import { describe, it, expect, beforeEach } from "vitest";
import { createAuctionDb, type AuctionDb } from "./db-harness";

let t: AuctionDb;
beforeEach(async () => {
  t = await createAuctionDb();
});

/** Monte une enchère VENDUE au montant `amount` puis renvoie seller/bidder. */
async function soldAuction(amount: number, commissionRate = 5) {
  const seller = await t.createUser(0);
  const bidder = await t.createUser(amount + 100);
  const a = await t.createAuction({
    sellerId: seller,
    startingBid: Math.min(amount, 1),
    commissionRate,
  });
  await t.placeBid(a, bidder, amount);
  return { seller, bidder, a };
}

describe("settle_auction — commission", () => {
  // Règle : ventes 10..20 → commission fixe 1 ; sinon floor(bid * rate/100).
  it.each([
    { bid: 15, commission: 1, payout: 14 }, // dans la plage → fixe 1
    { bid: 10, commission: 1, payout: 9 }, // borne basse de la plage
    { bid: 20, commission: 1, payout: 19 }, // borne haute de la plage
    { bid: 21, commission: 1, payout: 20 }, // juste au-dessus → floor(1.05)=1
    { bid: 100, commission: 5, payout: 95 }, // pourcentage plein
    { bid: 9, commission: 0, payout: 9 }, // sous 10 → floor(0.45)=0
  ])("vente à $bid → commission $commission, vendeur reçoit $payout", async ({ bid, payout }) => {
    const { seller, a } = await soldAuction(bid);

    const r = await t.settle(a);

    expect(r).toMatchObject({ success: true, sold: true });
    expect(await t.balance(seller)).toBe(payout);
    expect((await t.auction(a)).status).toBe("ended_sold");
    expect(await t.txCount(seller, "auction_sale")).toBe(payout > 0 ? 1 : 0);
  });
});

describe("settle_auction — conservation de l'or", () => {
  it("l'acheteur perd la mise, le vendeur gagne mise - commission", async () => {
    const seller = await t.createUser(0);
    const bidder = await t.createUser(500);
    const a = await t.createAuction({ sellerId: seller, startingBid: 10, commissionRate: 5 });

    await t.placeBid(a, bidder, 200); // escrow -> bidder 300
    await t.settle(a);

    // commission = floor(200 * 5 / 100) = 10 ; payout = 190
    expect(await t.balance(bidder)).toBe(300); // 500 - 200
    expect(await t.balance(seller)).toBe(190); // 200 - 10
    // Le delta global joueurs = -commission (la commission est un puits).
    expect(300 + 190).toBe(500 - 10);
  });
});

describe("settle_auction — idempotence", () => {
  it("ne règle pas deux fois (pas de double paiement du vendeur)", async () => {
    const { seller, a } = await soldAuction(50); // commission floor(2.5)=2, payout 48

    const first = await t.settle(a);
    expect(first).toMatchObject({ success: true, sold: true });
    expect(await t.balance(seller)).toBe(48);

    const second = await t.settle(a);
    expect(second).toHaveProperty("error");
    expect(await t.balance(seller)).toBe(48); // inchangé
    expect(await t.txCount(seller, "auction_sale")).toBe(1);
  });
});

describe("settle_auction — invendu", () => {
  it("une enchère sans enchérisseur passe en ended_unsold sans paiement", async () => {
    const seller = await t.createUser(0);
    const a = await t.createAuction({ sellerId: seller, startingBid: 10 });

    const r = await t.settle(a);

    expect(r).toMatchObject({ success: true, sold: false });
    expect((await t.auction(a)).status).toBe("ended_unsold");
    expect(await t.balance(seller)).toBe(0);
    expect(await t.txCount(seller, "auction_sale")).toBe(0);
  });
});

describe("settle_auction — vendeur admin", () => {
  it("ne paie pas un vendeur de type admin", async () => {
    const admin = await t.createUser(0);
    const bidder = await t.createUser(200);
    const a = await t.createAuction({
      sellerId: admin,
      sellerType: "admin",
      startingBid: 10,
      commissionRate: 5,
    });

    await t.placeBid(a, bidder, 100);
    const r = await t.settle(a);

    expect(r).toMatchObject({ success: true, sold: true });
    expect(await t.balance(admin)).toBe(0); // aucun payout
    expect(await t.txCount(admin, "auction_sale")).toBe(0);
    // L'or de l'acheteur reste bien débité (escrow), non restitué.
    expect(await t.balance(bidder)).toBe(100);
  });
});
