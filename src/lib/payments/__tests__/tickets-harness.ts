// Banc d'essai des TICKETS. Même principe que ses voisins : le vrai PL/pgSQL de
// production dans un Postgres in-process (PGlite), sans aucun bouchon.
//
// Charge les TROIS migrations dans l'ordre où elles s'appliquent en production
// — économie, paiements, tickets — pour que les redéfinitions de fonctions
// (`apply_checkout_completed` en particulier) soient exercées dans le même
// ordre qu'en vrai.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const loadSql = (f: string) => readFileSync(join(ROOT, f), "utf8");

const PREAMBLE = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
`;

export interface TicketsDb {
  db: PGlite;
  createUser(): Promise<string>;
  createTournament(opts?: { status?: string; capacity?: number; kind?: string }): Promise<string>;
  setTournamentStatus(id: string, status: string): Promise<void>;
  entryCount(tournamentId: string): Promise<number>;

  /** Octroi direct (administration) : aucun paiement rattaché. */
  grant(userId: string, count: number, validDays?: number): Promise<void>;
  availableTickets(userId: string): Promise<number>;
  ticketDebt(userId: string): Promise<number>;
  /** Jours restants de chaque ticket utilisable, du plus proche au plus lointain. */
  ticketExpiryDays(userId: string): Promise<number[]>;
  daysUntilExpiry(userId: string): Promise<number>;
  /** Fait périmer le ticket le plus proche / tous les tickets. */
  expireOldest(userId: string): Promise<void>;
  expireAll(userId: string): Promise<void>;

  enter(userId: string, tournamentId: string): Promise<EnterResult>;
  returnTicket(userId: string, tournamentId: string): Promise<boolean>;

  createPendingPayment(o: PendingPayment): Promise<string>;
  completed(sessionId: string, o?: { paymentIntentId?: string }): Promise<WebhookResult>;
  refunded(paymentIntentId: string): Promise<WebhookResult>;
}

export interface PendingPayment {
  userId: string;
  sessionId: string;
  type: "ticket_pack" | "gold_pack" | "tournament_entry";
  reference?: string | null;
  ticketAmount?: number;
  goldAmount?: number;
  paymentIntentId?: string | null;
}

export type EnterResult = {
  entered?: boolean;
  ticket_spent?: boolean;
  ticket_id?: string;
  error?: string;
  debt?: number;
};

export type WebhookResult = {
  status: string;
  tickets?: { revoked: number; entries_removed: number; debt_added: number };
  gold?: { credited: number; debt_absorbed: number };
};

export async function createTicketsDb(): Promise<TicketsDb> {
  const db = new PGlite();
  await db.exec(PREAMBLE);
  await db.exec(loadSql("supabase-economy.sql"));
  await db.exec(loadSql("supabase-migration-stripe-payments.sql"));
  await db.exec(loadSql("supabase-migration-tournament-tickets.sql"));

  const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => {
    const { rows } = await db.query<T>(sql, params);
    return rows[0];
  };

  return {
    db,

    async createUser() {
      const { id } = await one<{ id: string }>("INSERT INTO auth.users DEFAULT VALUES RETURNING id");
      await db.query("INSERT INTO wallets (user_id, balance) VALUES ($1, 0)", [id]);
      return id;
    },

    async createTournament(opts = {}) {
      const { id } = await one<{ id: string }>(
        `INSERT INTO tournaments (name, status, capacity, kind)
         VALUES ('Tournoi', $1, $2, $3) RETURNING id`,
        [opts.status ?? "open", opts.capacity ?? 32, opts.kind ?? "weekly"],
      );
      return id;
    },

    async setTournamentStatus(id, status) {
      await db.query("UPDATE tournaments SET status = $2::tournament_status WHERE id = $1", [id, status]);
    },

    async entryCount(tournamentId) {
      const r = await one<{ n: number }>(
        "SELECT count(*)::int AS n FROM tournament_entries WHERE tournament_id = $1", [tournamentId]);
      return r.n;
    },

    async grant(userId, count, validDays = 365) {
      await db.query("SELECT grant_tournament_tickets($1, $2, NULL, $3)", [userId, count, validDays]);
    },

    async availableTickets(userId) {
      const r = await one<{ n: number }>("SELECT available_tickets($1) AS n", [userId]);
      return r.n;
    },

    async ticketDebt(userId) {
      const r = await one<{ d: number }>("SELECT COALESCE(ticket_debt, 0) AS d FROM wallets WHERE user_id = $1", [userId]);
      return r ? r.d : 0;
    },

    async ticketExpiryDays(userId) {
      const { rows } = await db.query<{ d: number }>(
        `SELECT EXTRACT(EPOCH FROM (expires_at - now())) / 86400 AS d
         FROM tournament_tickets
         WHERE user_id = $1 AND spent_at IS NULL AND revoked_at IS NULL AND expires_at > now()
         ORDER BY expires_at ASC`, [userId]);
      return rows.map(r => Number(r.d));
    },

    async daysUntilExpiry(userId) {
      // `this` n'est pas typable ici (l'objet est encore en cours de
      // construction) : on relit directement plutôt que de déléguer.
      const r = await one<{ d: number }>(
        `SELECT EXTRACT(EPOCH FROM (expires_at - now())) / 86400 AS d
         FROM tournament_tickets
         WHERE user_id = $1 AND spent_at IS NULL AND revoked_at IS NULL AND expires_at > now()
         ORDER BY expires_at ASC LIMIT 1`, [userId]);
      return r ? Number(r.d) : 0;
    },

    async expireOldest(userId) {
      await db.query(
        `UPDATE tournament_tickets SET expires_at = now() - interval '1 day'
         WHERE id = (SELECT id FROM tournament_tickets
                     WHERE user_id = $1 AND spent_at IS NULL AND revoked_at IS NULL
                     ORDER BY expires_at ASC LIMIT 1)`, [userId]);
    },

    async expireAll(userId) {
      await db.query(
        `UPDATE tournament_tickets SET expires_at = now() - interval '1 day' WHERE user_id = $1`, [userId]);
    },

    async enter(userId, tournamentId) {
      const r = await one<{ r: EnterResult }>(
        "SELECT enter_tournament_with_ticket($1, $2) AS r", [userId, tournamentId]);
      return r.r;
    },

    async returnTicket(userId, tournamentId) {
      const r = await one<{ r: boolean }>(
        "SELECT return_ticket_for_entry($1, $2) AS r", [userId, tournamentId]);
      return r.r;
    },

    async createPendingPayment(o) {
      const { id } = await one<{ id: string }>(
        `INSERT INTO payments (user_id, stripe_session_id, stripe_payment_intent_id, type,
                               reference, ticket_amount, gold_amount)
         VALUES ($1, $2, $3, $4::payment_type, $5, $6, $7) RETURNING id`,
        [o.userId, o.sessionId, o.paymentIntentId ?? null, o.type, o.reference ?? null,
         o.ticketAmount ?? 0, o.goldAmount ?? 0],
      );
      return id;
    },

    async completed(sessionId, o = {}) {
      const r = await one<{ r: WebhookResult }>(
        "SELECT apply_checkout_completed($1, $2, $3, $4, $5) AS r",
        [sessionId, o.paymentIntentId ?? `pi_${sessionId}`, 499, "eur", "FR"],
      );
      return r.r;
    },

    async refunded(paymentIntentId) {
      const r = await one<{ r: WebhookResult }>(
        "SELECT apply_charge_refunded($1) AS r", [paymentIntentId]);
      return r.r;
    },
  };
}
