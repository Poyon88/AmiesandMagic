// PROLONGATION ANTI-SNIPING — une mise déposée dans les dernières secondes
// repousse la fin, pour laisser aux autres le temps de répondre.
//
// Sans cela, une enchère à heure fixe récompense la latence réseau plutôt que
// l'envie : celui qui mise à la dernière seconde gagne parce que personne ne
// peut lui répondre.
//
// Ce que ce fichier verrouille, et pourquoi chaque point vaut un test :
//
//   · la prolongation ne s'applique QU'AU-DELÀ du seuil — sinon toute enchère
//     durerait éternellement ;
//   · elle se REJOUE à chaque mise tardive — une seule prolongation rendrait la
//     mise suivante imbattable, soit le problème d'origine déplacé ;
//   · un ACHAT IMMÉDIAT ne prolonge rien — il clôt, et l'ordre des écritures
//     dans la fonction est ce qui le garantit ;
//   · une mise REFUSÉE ne prolonge rien — sinon on tiendrait une enchère
//     ouverte indéfiniment avec des mises invalides, sans jamais payer.
import { beforeEach, describe, expect, it } from "vitest";
import { createAuctionDb, type AuctionDb } from "./db-harness";

let t: AuctionDb;
beforeEach(async () => { t = await createAuctionDb(); });

/** Secondes restantes avant la fin d'une enchère. */
async function secondesRestantes(t: AuctionDb, id: string): Promise<number> {
  const { rows } = await t.db.query<{ s: number }>(
    "SELECT EXTRACT(EPOCH FROM (ends_at - now())) AS s FROM auctions WHERE id = $1", [id]);
  return Number(rows[0].s);
}

async function reglerSeuil(t: AuctionDb, secondes: number) {
  await t.db.query("UPDATE auction_settings SET anti_snipe_seconds = $1 WHERE id = 1", [secondes]);
}

/** Rapproche artificiellement la fin, pour se placer dans la zone tardive. */
async function finDansSecondes(t: AuctionDb, id: string, secondes: number) {
  await t.db.query(
    "UPDATE auctions SET ends_at = now() + ($2 || ' seconds')::interval WHERE id = $1",
    [id, String(secondes)]);
}

// ───────────────────────────────────────────────────────────────────────────

describe("le réglage", () => {
  it("vaut 30 secondes par défaut", async () => {
    const { rows } = await t.db.query<{ n: number }>(
      "SELECT anti_snipe_seconds AS n FROM auction_settings WHERE id = 1");
    expect(rows[0].n).toBe(30);
  });

  it("refuse une valeur négative", async () => {
    await expect(reglerSeuil(t, -1)).rejects.toThrow();
  });
});

describe("prolongation", () => {
  it("une mise dans les dernières secondes repousse la fin à 30 s", async () => {
    const vendeur = await t.createUser(0);
    const acheteur = await t.createUser(500);
    const a = await t.createAuction({ sellerId: vendeur, startingBid: 10, durationMinutes: 60 });
    await finDansSecondes(t, a, 5);

    const r = await t.placeBid(a, acheteur, 20);

    expect(r).toMatchObject({ success: true, extended: true });
    const restant = await secondesRestantes(t, a);
    expect(restant).toBeGreaterThan(28);
    expect(restant).toBeLessThanOrEqual(30);
  });

  it("une mise LOIN de la fin ne prolonge rien", async () => {
    // Le garde-fou qui évite qu'une enchère ne se termine jamais : sans le
    // seuil, chaque mise repousserait la fin, même à trois jours du terme.
    const vendeur = await t.createUser(0);
    const acheteur = await t.createUser(500);
    const a = await t.createAuction({ sellerId: vendeur, startingBid: 10, durationMinutes: 60 });
    const avant = await secondesRestantes(t, a);

    const r = await t.placeBid(a, acheteur, 20);

    expect(r).toMatchObject({ success: true, extended: false });
    const apres = await secondesRestantes(t, a);
    // L'échéance n'a pas bougé (à la seconde d'exécution près).
    expect(Math.abs(apres - avant)).toBeLessThan(2);
  });

  it("elle se REJOUE : chaque mise tardive redonne 30 s", async () => {
    // Une prolongation unique déplacerait le problème — la mise suivante
    // redeviendrait imbattable.
    const vendeur = await t.createUser(0);
    const a1 = await t.createUser(500);
    const a2 = await t.createUser(500);
    const a = await t.createAuction({ sellerId: vendeur, startingBid: 10, durationMinutes: 60 });

    await finDansSecondes(t, a, 3);
    expect(await t.placeBid(a, a1, 20)).toMatchObject({ extended: true });

    await finDansSecondes(t, a, 3);
    expect(await t.placeBid(a, a2, 40)).toMatchObject({ extended: true });

    expect(await secondesRestantes(t, a)).toBeGreaterThan(28);
  });

  it("un seuil à 0 désactive entièrement la prolongation", async () => {
    const vendeur = await t.createUser(0);
    const acheteur = await t.createUser(500);
    const a = await t.createAuction({ sellerId: vendeur, startingBid: 10, durationMinutes: 60 });
    await reglerSeuil(t, 0);
    await finDansSecondes(t, a, 2);

    const r = await t.placeBid(a, acheteur, 20);

    expect(r).toMatchObject({ success: true, extended: false });
    expect(await secondesRestantes(t, a)).toBeLessThan(5);
  });

  it("le seuil est celui du RÉGLAGE, pas 30 en dur", async () => {
    const vendeur = await t.createUser(0);
    const acheteur = await t.createUser(500);
    const a = await t.createAuction({ sellerId: vendeur, startingBid: 10, durationMinutes: 60 });
    await reglerSeuil(t, 120);
    await finDansSecondes(t, a, 60); // au-delà de 30, mais sous 120

    expect(await t.placeBid(a, acheteur, 20)).toMatchObject({ extended: true });
    expect(await secondesRestantes(t, a)).toBeGreaterThan(115);
  });
});

describe("ce qui ne prolonge PAS", () => {
  it("un achat immédiat clôt l'enchère au lieu de la repousser", async () => {
    const vendeur = await t.createUser(0);
    const acheteur = await t.createUser(500);
    const a = await t.createAuction({
      sellerId: vendeur, startingBid: 10, buyoutPrice: 100, durationMinutes: 60,
    });
    await finDansSecondes(t, a, 5);

    const r = await t.placeBid(a, acheteur, 100, true);

    expect(r).toMatchObject({ success: true, extended: false });
    // L'enchère est réglée : elle ne doit plus être active, et sûrement pas
    // repartie pour trente secondes.
    expect(await secondesRestantes(t, a)).toBeLessThanOrEqual(0);
    expect((await t.auction(a)).status).not.toBe("active");
  });

  it("une mise REFUSÉE ne repousse rien", async () => {
    // Sinon on tiendrait une enchère ouverte indéfiniment en envoyant des mises
    // invalides, sans jamais engager un sou.
    const vendeur = await t.createUser(0);
    const acheteur = await t.createUser(500);
    const a = await t.createAuction({ sellerId: vendeur, startingBid: 50, durationMinutes: 60 });
    await finDansSecondes(t, a, 4);
    const avant = await secondesRestantes(t, a);

    const r = await t.placeBid(a, acheteur, 10); // sous la mise de départ

    expect(r).toHaveProperty("error");
    const apres = await secondesRestantes(t, a);
    expect(Math.abs(apres - avant)).toBeLessThan(2);
  });

  it("le vendeur ne peut pas prolonger sa propre enchère", async () => {
    // Il ne peut pas enchérir ; il ne doit donc pas pouvoir gagner du temps.
    const vendeur = await t.createUser(500);
    const a = await t.createAuction({ sellerId: vendeur, startingBid: 10, durationMinutes: 60 });
    await finDansSecondes(t, a, 3);
    const avant = await secondesRestantes(t, a);

    expect(await t.placeBid(a, vendeur, 20)).toHaveProperty("error");
    expect(Math.abs((await secondesRestantes(t, a)) - avant)).toBeLessThan(2);
  });

  it("une enchère DÉJÀ expirée n'est pas ressuscitée", async () => {
    const vendeur = await t.createUser(0);
    const acheteur = await t.createUser(500);
    const a = await t.createAuction({ sellerId: vendeur, startingBid: 10, durationMinutes: 60 });
    await t.db.query("UPDATE auctions SET ends_at = now() - interval '1 second' WHERE id = $1", [a]);

    expect(await t.placeBid(a, acheteur, 20)).toHaveProperty("error");
    expect(await secondesRestantes(t, a)).toBeLessThan(0);
  });
});

describe("l'argent reste juste malgré la prolongation", () => {
  it("le surenchéri est remboursé, le nouveau est retenu", async () => {
    // La prolongation ne touche qu'à `ends_at` ; ce test le prouve plutôt que
    // de le supposer.
    const vendeur = await t.createUser(0);
    const a1 = await t.createUser(100);
    const a2 = await t.createUser(100);
    const a = await t.createAuction({ sellerId: vendeur, startingBid: 10, durationMinutes: 60 });

    await finDansSecondes(t, a, 3);
    await t.placeBid(a, a1, 20);
    expect(await t.balance(a1)).toBe(80);

    await finDansSecondes(t, a, 3);
    await t.placeBid(a, a2, 40);

    expect(await t.balance(a1)).toBe(100); // remboursé
    expect(await t.balance(a2)).toBe(60);  // retenu
  });
});
