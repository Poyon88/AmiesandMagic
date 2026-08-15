// Banc d'essai des PAIEMENTS — même principe que celui des enchères
// (src/lib/economy/__tests__/db-harness.ts) : on exécute le VRAI PL/pgSQL de
// production dans un Postgres in-process (PGlite, WASM, sans Docker).
//
// Aucun bouchon : `apply_checkout_completed`, `apply_charge_refunded` et
// `credit_gold_absorbing_debt` sont ceux qui tourneront en prod, avec le vrai
// `adjust_wallet_balance` et les vraies contraintes — dont le
// CHECK (balance >= 0) autour duquel toute la mécanique de dette est bâtie.
//
// C'est ce qui rend l'IDEMPOTENCE testable pour de bon : rejouer un webhook,
// ici, c'est rappeler la fonction, pas simuler un appel.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const loadSql = (f: string) => readFileSync(join(ROOT, f), "utf8");

// Objets Supabase attendus par les migrations mais définis ailleurs.
const PREAMBLE = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
`;

export interface PaymentsDb {
  db: PGlite;
  createUser(balance?: number): Promise<string>;
  balance(userId: string): Promise<number>;
  debt(userId: string): Promise<number>;
  spendable(userId: string): Promise<number>;
  createTournament(opts?: TournamentOpts): Promise<string>;
  /** Insère le paiement `pending` que la route Checkout crée à l'ouverture de session. */
  createPendingPayment(opts: PendingPaymentOpts): Promise<string>;
  payment(sessionId: string): Promise<PaymentRow>;
  entryCount(tournamentId: string): Promise<number>;
  txCount(userId: string, type: string): Promise<number>;

  completed(sessionId: string, opts?: CompletedOpts): Promise<WebhookResult>;
  expired(sessionId: string): Promise<WebhookResult>;
  refunded(paymentIntentId: string): Promise<WebhookResult>;
}

export interface TournamentOpts {
  status?: "draft" | "open" | "running" | "finished" | "cancelled";
  capacity?: number;
}

export interface PendingPaymentOpts {
  userId: string;
  sessionId: string;
  type: "tournament_entry" | "gold_pack";
  reference?: string | null;
  goldAmount?: number;
  paymentIntentId?: string | null;
}

export interface CompletedOpts {
  paymentIntentId?: string;
  amountCents?: number;
  currency?: string;
  country?: string;
}

export interface PaymentRow {
  id: string;
  status: "pending" | "completed" | "refunded" | "failed";
  amount_cents: number;
  currency: string;
  customer_country: string | null;
  gold_amount: number;
  gold_clawed_back: number;
  stripe_payment_intent_id: string | null;
}

export type WebhookResult = {
  status: "duplicate" | "credited" | "entered" | "refunded" | "failed" | "refund_needed" | "ignored";
  reason?: string;
  payment_id?: string;
  tournament_id?: string;
  gold?: { credited: number; debt_absorbed: number };
  gold_debited?: number;
  gold_debt_added?: number;
  entry_removed?: boolean;
};

export async function createPaymentsDb(): Promise<PaymentsDb> {
  const db = new PGlite();
  await db.exec(PREAMBLE);
  await db.exec(loadSql("supabase-economy.sql"));
  await db.exec(loadSql("supabase-migration-stripe-payments.sql"));

  const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => {
    const { rows } = await db.query<T>(sql, params);
    return rows[0];
  };

  return {
    db,

    async createUser(balance = 0) {
      const { id } = await one<{ id: string }>("INSERT INTO auth.users DEFAULT VALUES RETURNING id");
      await db.query("INSERT INTO wallets (user_id, balance) VALUES ($1, $2)", [id, balance]);
      return id;
    },

    async balance(userId) {
      const r = await one<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1", [userId]);
      return r ? r.balance : 0;
    },

    async debt(userId) {
      const r = await one<{ gold_debt: number }>("SELECT gold_debt FROM wallets WHERE user_id = $1", [userId]);
      return r ? r.gold_debt : 0;
    },

    async spendable(userId) {
      const r = await one<{ s: number }>("SELECT gold_spendable($1) AS s", [userId]);
      return r?.s ?? 0;
    },

    async createTournament(opts = {}) {
      const { id } = await one<{ id: string }>(
        `INSERT INTO tournaments (name, status, capacity) VALUES ('Tournoi', $1, $2) RETURNING id`,
        [opts.status ?? "open", opts.capacity ?? 32],
      );
      return id;
    },

    async createPendingPayment(o) {
      const { id } = await one<{ id: string }>(
        `INSERT INTO payments (user_id, stripe_session_id, stripe_payment_intent_id, type, reference, gold_amount)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [o.userId, o.sessionId, o.paymentIntentId ?? null, o.type, o.reference ?? null, o.goldAmount ?? 0],
      );
      return id;
    },

    async payment(sessionId) {
      return one<PaymentRow>("SELECT * FROM payments WHERE stripe_session_id = $1", [sessionId]);
    },

    async entryCount(tournamentId) {
      const r = await one<{ n: number }>(
        "SELECT count(*)::int AS n FROM tournament_entries WHERE tournament_id = $1", [tournamentId]);
      return r.n;
    },

    async txCount(userId, type) {
      const r = await one<{ n: number }>(
        "SELECT count(*)::int AS n FROM wallet_transactions WHERE user_id = $1 AND type = $2",
        [userId, type]);
      return r.n;
    },

    async completed(sessionId, o = {}) {
      const r = await one<{ r: WebhookResult }>(
        "SELECT apply_checkout_completed($1, $2, $3, $4, $5) AS r",
        [sessionId, o.paymentIntentId ?? `pi_${sessionId}`, o.amountCents ?? 250,
         o.currency ?? "eur", o.country ?? "FR"],
      );
      return r.r;
    },

    async expired(sessionId) {
      const r = await one<{ r: WebhookResult }>("SELECT apply_checkout_expired($1) AS r", [sessionId]);
      return r.r;
    },

    async refunded(paymentIntentId) {
      const r = await one<{ r: WebhookResult }>("SELECT apply_charge_refunded($1) AS r", [paymentIntentId]);
      return r.r;
    },
  };
}
