// Les handlers de webhook Stripe, éprouvés sur le VRAI PL/pgSQL de production.
//
// Ce qui est verrouillé ici, dans l'ordre de ce qui coûte le plus cher à rater :
//
//   1. L'IDEMPOTENCE. Stripe redélivre ses événements — c'est documenté, c'est
//      normal, et ça arrive. Un rejeu qui recrédite, c'est de la monnaie créée
//      à partir de rien. Chaque événement est donc rejoué explicitement.
//   2. Le tournoi qui se remplit PENDANT le paiement : le joueur a payé, il ne
//      doit ni être inscrit ni être spolié. Le handler doit réclamer un
//      remboursement.
//   3. La REPRISE de l'or après remboursement, y compris quand il a déjà été
//      dépensé — le cas qui a dicté toute la mécanique de dette.
import { beforeEach, describe, expect, it } from "vitest";
import { createPaymentsDb, type PaymentsDb } from "./db-harness";

let t: PaymentsDb;
beforeEach(async () => { t = await createPaymentsDb(); });

// ───────────────────────────────────────────────────────────────────────────

describe("checkout.session.completed — pack de pièces d'or", () => {
  it("crédite le portefeuille EXISTANT, avec le type `purchase`", async () => {
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_1", type: "gold_pack",
      reference: "gold_pack_m", goldAmount: 500 });

    const r = await t.completed("cs_1", { amountCents: 1000, country: "FR" });

    expect(r.status).toBe("credited");
    expect(await t.balance(u)).toBe(500);
    expect(await t.txCount(u, "purchase")).toBe(1);
  });

  it("copie le montant et le PAYS depuis Stripe, jamais depuis le client", async () => {
    // `customer_country` n'a aucune règle métier aujourd'hui : il n'existe que
    // pour le futur chantier TVA/OSS. Mais s'il n'est pas capté au moment du
    // paiement, il est perdu pour toujours.
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_2", type: "gold_pack", goldAmount: 100 });

    await t.completed("cs_2", { amountCents: 499, currency: "eur", country: "BE" });

    const p = await t.payment("cs_2");
    expect([p.amount_cents, p.currency, p.customer_country]).toEqual([499, "eur", "BE"]);
  });

  it("REJEU : le second passage ne crédite rien", async () => {
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_3", type: "gold_pack", goldAmount: 500 });

    expect((await t.completed("cs_3")).status).toBe("credited");
    expect((await t.completed("cs_3")).status).toBe("duplicate");
    expect((await t.completed("cs_3")).status).toBe("duplicate");

    expect(await t.balance(u)).toBe(500);          // et non 1500
    expect(await t.txCount(u, "purchase")).toBe(1); // une seule écriture
  });

  it("une session INCONNUE ne crée rien et ne lève pas", async () => {
    // Répondre en erreur ferait retenter Stripe sans fin sur un événement qui
    // ne nous concerne pas.
    expect((await t.completed("cs_jamais_vue")).status).toBe("duplicate");
  });
});

describe("checkout.session.completed — inscription à un tournoi", () => {
  it("inscrit le joueur et relie l'inscription au paiement", async () => {
    const u = await t.createUser(0);
    const tour = await t.createTournament({ capacity: 32 });
    await t.createPendingPayment({ userId: u, sessionId: "cs_t1", type: "tournament_entry", reference: tour });

    const r = await t.completed("cs_t1");

    expect(r.status).toBe("entered");
    expect(await t.entryCount(tour)).toBe(1);
  });

  it("REJEU : pas de double inscription", async () => {
    const u = await t.createUser(0);
    const tour = await t.createTournament();
    await t.createPendingPayment({ userId: u, sessionId: "cs_t2", type: "tournament_entry", reference: tour });

    await t.completed("cs_t2");
    expect((await t.completed("cs_t2")).status).toBe("duplicate");
    expect(await t.entryCount(tour)).toBe(1);
  });

  it("tournoi PLEIN entre l'ouverture de session et le paiement ⇒ remboursement, pas d'inscription", async () => {
    const tour = await t.createTournament({ capacity: 2 });
    // Deux places prises pendant que notre joueur payait.
    for (let i = 0; i < 2; i++) {
      const other = await t.createUser(0);
      await t.createPendingPayment({ userId: other, sessionId: `cs_pre${i}`, type: "tournament_entry", reference: tour });
      await t.completed(`cs_pre${i}`);
    }
    expect(await t.entryCount(tour)).toBe(2);

    const late = await t.createUser(0);
    await t.createPendingPayment({ userId: late, sessionId: "cs_late", type: "tournament_entry", reference: tour });
    const r = await t.completed("cs_late");

    expect(r.status).toBe("refund_needed");
    expect(r.reason).toBe("tournament_full");
    expect(await t.entryCount(tour)).toBe(2); // toujours 2
    // Le paiement est bien marqué encaissé : l'argent A été pris, le
    // remboursement est un second mouvement, pas une annulation.
    expect((await t.payment("cs_late")).status).toBe("completed");
  });

  it("tournoi FERMÉ (déjà commencé) ⇒ remboursement", async () => {
    const tour = await t.createTournament({ status: "running" });
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_run", type: "tournament_entry", reference: tour });

    const r = await t.completed("cs_run");
    expect([r.status, r.reason]).toEqual(["refund_needed", "tournament_closed"]);
    expect(await t.entryCount(tour)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("checkout.session.expired", () => {
  it("passe le paiement en échec", async () => {
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_x", type: "gold_pack", goldAmount: 100 });

    expect((await t.expired("cs_x")).status).toBe("failed");
    expect((await t.payment("cs_x")).status).toBe("failed");
    expect(await t.balance(u)).toBe(0);
  });

  it("REJEU : inerte", async () => {
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_x2", type: "gold_pack", goldAmount: 100 });
    await t.expired("cs_x2");
    expect((await t.expired("cs_x2")).status).toBe("duplicate");
  });

  it("n'écrase JAMAIS un paiement déjà abouti", async () => {
    // Les événements Stripe n'arrivent pas forcément dans l'ordre. Un `expired`
    // en retard ne doit pas défaire un paiement encaissé — et surtout pas
    // laisser le joueur crédité avec un paiement marqué en échec.
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_x3", type: "gold_pack", goldAmount: 300 });
    await t.completed("cs_x3");

    expect((await t.expired("cs_x3")).status).toBe("duplicate");
    expect((await t.payment("cs_x3")).status).toBe("completed");
    expect(await t.balance(u)).toBe(300);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("charge.refunded — reprise des pièces d'or", () => {
  it("reprend intégralement l'or encore en solde", async () => {
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_r1", type: "gold_pack",
      goldAmount: 500, paymentIntentId: "pi_r1" });
    await t.completed("cs_r1", { paymentIntentId: "pi_r1" });
    expect(await t.balance(u)).toBe(500);

    const r = await t.refunded("pi_r1");

    expect(r.status).toBe("refunded");
    expect([r.gold_debited, r.gold_debt_added]).toEqual([500, 0]);
    expect(await t.balance(u)).toBe(0);
    expect(await t.debt(u)).toBe(0);
  });

  it("or DÉJÀ DÉPENSÉ : on débite ce qu'on peut, le reste devient une DETTE", async () => {
    // Le cas qui a dicté l'architecture. Sans la dette, il faudrait un solde
    // négatif — donc lever le CHECK (balance >= 0), donc ouvrir les enchères
    // à découvert (place_bid n'a aucune garde en propre).
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_r2", type: "gold_pack",
      goldAmount: 500, paymentIntentId: "pi_r2" });
    await t.completed("cs_r2", { paymentIntentId: "pi_r2" });

    // Il en dépense 400 (enchère, boutique…).
    await t.db.query("SELECT adjust_wallet_balance($1, -400, 'shop_card', NULL, '{}', NULL)", [u]);
    expect(await t.balance(u)).toBe(100);

    const r = await t.refunded("pi_r2");

    expect([r.gold_debited, r.gold_debt_added]).toEqual([100, 400]);
    expect(await t.balance(u)).toBe(0);
    expect(await t.debt(u)).toBe(400);
  });

  it("un joueur endetté ne peut plus rien dépenser", async () => {
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_r3", type: "gold_pack",
      goldAmount: 500, paymentIntentId: "pi_r3" });
    await t.completed("cs_r3", { paymentIntentId: "pi_r3" });
    await t.db.query("SELECT adjust_wallet_balance($1, -400, 'shop_card', NULL, '{}', NULL)", [u]);
    await t.refunded("pi_r3");

    // Il peut regagner de l'or en jouant…
    await t.db.query("SELECT credit_gold_absorbing_debt($1, 50, 'reward_victory')", [u]);
    // …mais ça éponge la dette, ça n'alimente pas le solde.
    expect(await t.balance(u)).toBe(0);
    expect(await t.debt(u)).toBe(350);
    expect(await t.spendable(u)).toBe(0);
  });

  it("la dette une fois soldée, le surplus revient au solde", async () => {
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_r4", type: "gold_pack",
      goldAmount: 200, paymentIntentId: "pi_r4" });
    await t.completed("cs_r4", { paymentIntentId: "pi_r4" });
    await t.db.query("SELECT adjust_wallet_balance($1, -200, 'shop_card', NULL, '{}', NULL)", [u]);
    await t.refunded("pi_r4");
    expect(await t.debt(u)).toBe(200);

    await t.db.query("SELECT credit_gold_absorbing_debt($1, 250, 'reward_quest')", [u]);

    expect(await t.debt(u)).toBe(0);
    expect(await t.balance(u)).toBe(50);
    expect(await t.spendable(u)).toBe(50);
  });

  it("REJEU : aucun double débit", async () => {
    const u = await t.createUser(0);
    await t.createPendingPayment({ userId: u, sessionId: "cs_r5", type: "gold_pack",
      goldAmount: 300, paymentIntentId: "pi_r5" });
    await t.completed("cs_r5", { paymentIntentId: "pi_r5" });

    expect((await t.refunded("pi_r5")).status).toBe("refunded");
    expect((await t.refunded("pi_r5")).status).toBe("duplicate");
    expect((await t.refunded("pi_r5")).status).toBe("duplicate");

    expect(await t.balance(u)).toBe(0);
    expect(await t.debt(u)).toBe(0); // et non 600 de dette
  });

  it("conservation : achat puis remboursement laissent le joueur à son point de départ", async () => {
    const u = await t.createUser(120);
    await t.createPendingPayment({ userId: u, sessionId: "cs_r6", type: "gold_pack",
      goldAmount: 500, paymentIntentId: "pi_r6" });
    await t.completed("cs_r6", { paymentIntentId: "pi_r6" });
    expect(await t.balance(u)).toBe(620);

    await t.refunded("pi_r6");

    expect(await t.balance(u)).toBe(120); // son or d'avant, intact
    expect(await t.debt(u)).toBe(0);
  });
});

describe("charge.refunded — inscription à un tournoi", () => {
  it("retire l'inscription si le tournoi n'a pas commencé", async () => {
    const u = await t.createUser(0);
    const tour = await t.createTournament({ status: "open" });
    await t.createPendingPayment({ userId: u, sessionId: "cs_tr1", type: "tournament_entry",
      reference: tour, paymentIntentId: "pi_tr1" });
    await t.completed("cs_tr1", { paymentIntentId: "pi_tr1" });
    expect(await t.entryCount(tour)).toBe(1);

    const r = await t.refunded("pi_tr1");

    expect(r.entry_removed).toBe(true);
    expect(await t.entryCount(tour)).toBe(0);
  });

  it("GARDE la place si le tournoi a déjà commencé", async () => {
    // La prestation a été consommée. Rembourser l'argent est une décision
    // commerciale ; retirer un joueur d'un arbre en cours en serait une autre,
    // et elle casserait le tournoi des autres.
    const u = await t.createUser(0);
    const tour = await t.createTournament({ status: "open" });
    await t.createPendingPayment({ userId: u, sessionId: "cs_tr2", type: "tournament_entry",
      reference: tour, paymentIntentId: "pi_tr2" });
    await t.completed("cs_tr2", { paymentIntentId: "pi_tr2" });

    await t.db.query("UPDATE tournaments SET status = 'running' WHERE id = $1", [tour]);
    const r = await t.refunded("pi_tr2");

    expect(r.entry_removed).toBe(false);
    expect(await t.entryCount(tour)).toBe(1);
    expect((await t.payment("cs_tr2")).status).toBe("refunded");
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("circuit fermé", () => {
  it("aucune fonction de la base ne convertit des pièces d'or en argent", async () => {
    // Garde-fou de conformité : le jour où quelqu'un ajoute un `payout`, un
    // `withdraw` ou un `cash_out` en base, ce test tombe et force la
    // revalidation juridique annoncée dans l'en-tête de la migration.
    const { rows } = await t.db.query<{ proname: string }>(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND (proname ILIKE '%payout%' OR proname ILIKE '%withdraw%'
              OR proname ILIKE '%cash_out%' OR proname ILIKE '%cashout%')`,
    );
    expect(rows.map(r => r.proname)).toEqual([]);
  });
});
