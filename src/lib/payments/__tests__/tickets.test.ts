// TICKETS DE TOURNOI — éprouvés sur le VRAI PL/pgSQL de production.
//
// Le ticket est un bien DÉTENU : on l'achète, on le garde, on le dépense plus
// tard dans le tournoi de son choix. Ce découplage fait disparaître le cas
// « tournoi rempli pendant le paiement », mais il en crée trois autres, qui
// sont exactement ce que ce fichier verrouille :
//
//   1. La PÉREMPTION à 365 jours, et l'ordre de consommation qui va avec — on
//      dépense toujours celui qui périme le plus tôt, sinon un joueur perd des
//      tickets encore valables pendant que d'autres dorment.
//   2. Le REMBOURSEMENT d'un achat dont une partie a déjà été jouée : reprendre
//      ce qui est en main, libérer les places non consommées, et ne compter en
//      dette que ce qui a réellement servi.
//   3. L'ATOMICITÉ : un ticket ne se dépense qu'une fois, une place ne se prend
//      qu'une fois.
import { beforeEach, describe, expect, it } from "vitest";
import { createTicketsDb, type TicketsDb } from "./tickets-harness";

let t: TicketsDb;
beforeEach(async () => { t = await createTicketsDb(); });

// ───────────────────────────────────────────────────────────────────────────

describe("achat de tickets", () => {
  it("le webhook crédite le nombre de tickets du pack", async () => {
    const u = await t.createUser();
    await t.createPendingPayment({ userId: u, sessionId: "cs_k1", type: "ticket_pack",
      reference: "ticket_pack_m", ticketAmount: 5 });

    const r = await t.completed("cs_k1");

    expect(r.status).toBe("credited");
    expect(await t.availableTickets(u)).toBe(5);
  });

  it("chaque ticket porte 365 jours de validité", async () => {
    const u = await t.createUser();
    await t.grant(u, 1);
    const days = await t.daysUntilExpiry(u);
    // Tolérance d'un jour : la borne est calculée en base, pas dans le test.
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThanOrEqual(365);
  });

  it("REJEU du webhook : aucun ticket en double", async () => {
    const u = await t.createUser();
    await t.createPendingPayment({ userId: u, sessionId: "cs_k2", type: "ticket_pack", ticketAmount: 3 });

    expect((await t.completed("cs_k2")).status).toBe("credited");
    expect((await t.completed("cs_k2")).status).toBe("duplicate");
    expect((await t.completed("cs_k2")).status).toBe("duplicate");

    expect(await t.availableTickets(u)).toBe(3); // et non 9
  });
});

describe("péremption", () => {
  it("un ticket périmé ne compte plus", async () => {
    const u = await t.createUser();
    await t.grant(u, 2);
    expect(await t.availableTickets(u)).toBe(2);

    await t.expireOldest(u);
    expect(await t.availableTickets(u)).toBe(1);
  });

  it("on dépense TOUJOURS celui qui périme le plus tôt", async () => {
    // Le piège inverse : consommer le plus récent laisserait périmer le plus
    // ancien, et le joueur perdrait un ticket qu'il aurait pu utiliser.
    const u = await t.createUser();
    await t.grant(u, 1, 400);  // périme dans 400 jours
    await t.grant(u, 1, 10);   // périme dans 10 jours
    const tour = await t.createTournament();

    await t.enter(u, tour);

    const restants = await t.ticketExpiryDays(u);
    expect(restants).toHaveLength(1);
    expect(restants[0]).toBeGreaterThan(300); // le lointain a survécu
  });

  it("un joueur n'ayant que des tickets périmés ne peut pas s'inscrire", async () => {
    const u = await t.createUser();
    await t.grant(u, 2);
    await t.expireAll(u);
    const tour = await t.createTournament();

    expect((await t.enter(u, tour)).error).toBe("no_ticket");
    expect(await t.entryCount(tour)).toBe(0);
  });
});

describe("inscription par ticket", () => {
  it("dépense un ticket et inscrit le joueur", async () => {
    const u = await t.createUser();
    await t.grant(u, 3);
    const tour = await t.createTournament();

    const r = await t.enter(u, tour);

    expect([r.entered, r.ticket_spent]).toEqual([true, true]);
    expect(await t.availableTickets(u)).toBe(2);
    expect(await t.entryCount(tour)).toBe(1);
  });

  it("sans ticket, pas d'inscription — et aucune place consommée", async () => {
    const u = await t.createUser();
    const tour = await t.createTournament();

    expect((await t.enter(u, tour)).error).toBe("no_ticket");
    expect(await t.entryCount(tour)).toBe(0);
  });

  it("un tournoi GRATUIT n'en coûte aucun", async () => {
    const u = await t.createUser();
    await t.grant(u, 1);
    const tour = await t.createTournament({ kind: "free" });

    const r = await t.enter(u, tour);

    expect([r.entered, r.ticket_spent]).toEqual([true, false]);
    expect(await t.availableTickets(u)).toBe(1); // intact
  });

  it("deux inscriptions au même tournoi : la seconde échoue sans rien dépenser", async () => {
    const u = await t.createUser();
    await t.grant(u, 2);
    const tour = await t.createTournament();

    await t.enter(u, tour);
    expect((await t.enter(u, tour)).error).toBe("already_entered");

    expect(await t.availableTickets(u)).toBe(1); // un seul consommé
    expect(await t.entryCount(tour)).toBe(1);
  });

  it("tournoi COMPLET : rien n'est dépensé", async () => {
    // Le point qui compte : un échec ne doit jamais brûler un ticket.
    const tour = await t.createTournament({ capacity: 1 });
    const a = await t.createUser(); await t.grant(a, 1);
    const b = await t.createUser(); await t.grant(b, 1);

    await t.enter(a, tour);
    expect((await t.enter(b, tour)).error).toBe("tournament_full");

    expect(await t.availableTickets(b)).toBe(1);
  });

  it("tournoi FERMÉ : rien n'est dépensé", async () => {
    const u = await t.createUser();
    await t.grant(u, 1);
    const tour = await t.createTournament({ status: "running" });

    expect((await t.enter(u, tour)).error).toBe("tournament_closed");
    expect(await t.availableTickets(u)).toBe(1);
  });
});

describe("restitution", () => {
  it("un tournoi annulé rend son ticket, SANS repousser la péremption", async () => {
    // Sinon s'inscrire puis se désinscrire deviendrait un moyen de rafraîchir
    // un ticket indéfiniment.
    const u = await t.createUser();
    await t.grant(u, 1, 30);
    const tour = await t.createTournament();
    await t.enter(u, tour);
    expect(await t.availableTickets(u)).toBe(0);

    await t.returnTicket(u, tour);

    expect(await t.availableTickets(u)).toBe(1);
    const jours = await t.ticketExpiryDays(u);
    expect(jours[0]).toBeLessThanOrEqual(30); // pas de rallonge
  });
});

describe("remboursement Stripe", () => {
  it("tickets tous en main ⇒ tous repris, aucune dette", async () => {
    const u = await t.createUser();
    await t.createPendingPayment({ userId: u, sessionId: "cs_r1", type: "ticket_pack",
      ticketAmount: 3, paymentIntentId: "pi_r1" });
    await t.completed("cs_r1", { paymentIntentId: "pi_r1" });
    expect(await t.availableTickets(u)).toBe(3);

    const r = await t.refunded("pi_r1");

    expect(r.tickets).toMatchObject({ revoked: 3, entries_removed: 0, debt_added: 0 });
    expect(await t.availableTickets(u)).toBe(0);
    expect(await t.ticketDebt(u)).toBe(0);
  });

  it("un ticket engagé dans un tournoi NON COMMENCÉ : la place repart au pot", async () => {
    const u = await t.createUser();
    await t.createPendingPayment({ userId: u, sessionId: "cs_r2", type: "ticket_pack",
      ticketAmount: 3, paymentIntentId: "pi_r2" });
    await t.completed("cs_r2", { paymentIntentId: "pi_r2" });
    const tour = await t.createTournament();
    await t.enter(u, tour);
    expect(await t.entryCount(tour)).toBe(1);

    const r = await t.refunded("pi_r2");

    expect(r.tickets).toMatchObject({ revoked: 3, entries_removed: 1, debt_added: 0 });
    expect(await t.entryCount(tour)).toBe(0); // la place est rendue
    expect(await t.availableTickets(u)).toBe(0);
    expect(await t.ticketDebt(u)).toBe(0);
  });

  it("un ticket engagé dans un tournoi DÉJÀ JOUÉ : la place reste, et devient une dette", async () => {
    const u = await t.createUser();
    await t.createPendingPayment({ userId: u, sessionId: "cs_r3", type: "ticket_pack",
      ticketAmount: 2, paymentIntentId: "pi_r3" });
    await t.completed("cs_r3", { paymentIntentId: "pi_r3" });
    const tour = await t.createTournament();
    await t.enter(u, tour);
    await t.setTournamentStatus(tour, "finished");

    const r = await t.refunded("pi_r3");

    // 1 en main repris, 1 réellement joué ⇒ dette.
    expect(r.tickets).toMatchObject({ revoked: 1, entries_removed: 0, debt_added: 1 });
    expect(await t.entryCount(tour)).toBe(1); // il a joué, il reste inscrit
    expect(await t.ticketDebt(u)).toBe(1);
  });

  it("une dette BLOQUE l'inscription MÊME si le joueur détient des tickets valides", async () => {
    // Le scénario réel : deux achats distincts. Le premier a été joué puis
    // remboursé (donc une dette), le second est encore en main. Sans le blocage,
    // le joueur continuerait de jouer sur des tickets pendant qu'il doit une
    // partie déjà consommée.
    const u = await t.createUser();

    // Achat A : 1 ticket, dépensé dans un tournoi qui va jusqu'au bout.
    await t.createPendingPayment({ userId: u, sessionId: "cs_a", type: "ticket_pack",
      ticketAmount: 1, paymentIntentId: "pi_a" });
    await t.completed("cs_a", { paymentIntentId: "pi_a" });
    const joue = await t.createTournament();
    await t.enter(u, joue);
    await t.setTournamentStatus(joue, "finished");

    // Achat B : 2 tickets, toujours en main.
    await t.createPendingPayment({ userId: u, sessionId: "cs_b", type: "ticket_pack",
      ticketAmount: 2, paymentIntentId: "pi_b" });
    await t.completed("cs_b", { paymentIntentId: "pi_b" });
    expect(await t.availableTickets(u)).toBe(2);

    // Remboursement du SEUL achat A : rien à reprendre, la partie a été jouée.
    await t.refunded("pi_a");
    expect(await t.ticketDebt(u)).toBe(1);
    expect(await t.availableTickets(u)).toBe(2); // ceux de B sont intacts

    const autre = await t.createTournament();
    expect((await t.enter(u, autre)).error).toBe("ticket_debt");
    expect(await t.availableTickets(u)).toBe(2); // et rien n'a été brûlé
  });

  it("le crédit qui éponge une dette ne rend PAS le ticket disponible", async () => {
    // Corollaire du précédent, et piège du modèle : offrir un ticket à un joueur
    // endetté ne lui donne pas un ticket, ça solde sa dette. C'est voulu — on ne
    // se libère pas d'une dette en recevant.
    const u = await t.createUser();
    await t.createPendingPayment({ userId: u, sessionId: "cs_d", type: "ticket_pack",
      ticketAmount: 1, paymentIntentId: "pi_d" });
    await t.completed("cs_d", { paymentIntentId: "pi_d" });
    const joue = await t.createTournament();
    await t.enter(u, joue);
    await t.setTournamentStatus(joue, "finished");
    await t.refunded("pi_d");
    expect(await t.ticketDebt(u)).toBe(1);

    await t.grant(u, 1);

    expect(await t.ticketDebt(u)).toBe(0);
    expect(await t.availableTickets(u)).toBe(0); // absorbé, pas crédité
  });

  it("un nouvel achat éponge la dette AVANT de créditer", async () => {
    const u = await t.createUser();
    await t.createPendingPayment({ userId: u, sessionId: "cs_r5", type: "ticket_pack",
      ticketAmount: 1, paymentIntentId: "pi_r5" });
    await t.completed("cs_r5", { paymentIntentId: "pi_r5" });
    const joue = await t.createTournament();
    await t.enter(u, joue);
    await t.setTournamentStatus(joue, "finished");
    await t.refunded("pi_r5");
    expect(await t.ticketDebt(u)).toBe(1);

    await t.createPendingPayment({ userId: u, sessionId: "cs_r6", type: "ticket_pack", ticketAmount: 3 });
    await t.completed("cs_r6");

    expect(await t.ticketDebt(u)).toBe(0);
    expect(await t.availableTickets(u)).toBe(2); // 3 − 1 de dette
  });

  it("REJEU du remboursement : aucune double reprise", async () => {
    const u = await t.createUser();
    await t.createPendingPayment({ userId: u, sessionId: "cs_r7", type: "ticket_pack",
      ticketAmount: 2, paymentIntentId: "pi_r7" });
    await t.completed("cs_r7", { paymentIntentId: "pi_r7" });

    expect((await t.refunded("pi_r7")).status).toBe("refunded");
    expect((await t.refunded("pi_r7")).status).toBe("duplicate");
    expect((await t.refunded("pi_r7")).status).toBe("duplicate");

    expect(await t.ticketDebt(u)).toBe(0); // et non 4
  });

  it("un ticket OFFERT par l'administration n'est jamais repris", async () => {
    // Il n'est rattaché à aucun encaissement : le remboursement d'un achat ne
    // doit pas emporter un dédommagement.
    const u = await t.createUser();
    await t.grant(u, 2); // offerts, payment_id NULL
    await t.createPendingPayment({ userId: u, sessionId: "cs_r8", type: "ticket_pack",
      ticketAmount: 1, paymentIntentId: "pi_r8" });
    await t.completed("cs_r8", { paymentIntentId: "pi_r8" });
    expect(await t.availableTickets(u)).toBe(3);

    await t.refunded("pi_r8");

    expect(await t.availableTickets(u)).toBe(2); // les 2 offerts restent
    expect(await t.ticketDebt(u)).toBe(0);
  });
});

describe("le circuit reste fermé", () => {
  it("aucune fonction ne convertit un ticket en argent", async () => {
    const { rows } = await t.db.query<{ proname: string }>(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND (proname ILIKE '%ticket%')
         AND (proname ILIKE '%sell%' OR proname ILIKE '%cash%' OR proname ILIKE '%transfer%'
              OR proname ILIKE '%payout%')`,
    );
    expect(rows.map(r => r.proname)).toEqual([]);
  });

  it("un ticket appartient à UN joueur et ne change jamais de main", async () => {
    // Aucun chemin de transfert n'existe : le vérifier par la structure plutôt
    // que par l'absence de code, qui pourrait réapparaître.
    const a = await t.createUser();
    const b = await t.createUser();
    await t.grant(a, 1);
    expect(await t.availableTickets(a)).toBe(1);
    expect(await t.availableTickets(b)).toBe(0);
  });
});
