// Harness de test pour la logique argent (enchères) — audit « tests logique argent ».
//
// On exécute le VRAI PL/pgSQL de production (supabase-economy.sql +
// supabase-migration-auction.sql) dans un Postgres in-process (PGlite, WASM,
// sans Docker). Les tests appellent donc réellement place_bid / settle_auction /
// adjust_wallet_balance et vérifient les invariants monétaires (escrow,
// remboursement du surenchéri, commission, conservation de l'or).
//
// Un préambule stubbe les objets Supabase absents en test : le schéma auth +
// auth.users + auth.uid() (les policies RLS y font référence ; RLS n'est pas
// forcée pour le propriétaire des tables sous PGlite, donc jamais bloquante ici),
// et les tables touchées uniquement par la settlement (cards, card_prints,
// user_collections).

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function loadSql(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

// Objets Supabase que les migrations attendent mais qui vivent hors de ces deux
// fichiers (schéma auth, tables référencées par les FK / corps de fonctions).
const PREAMBLE = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text
  );
  -- Stub : RLS jamais forcée sous PGlite (propriétaire), renvoie NULL.
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

  -- Tables référencées seulement par les corps de fonction / FK d'items.
  CREATE TABLE cards (
    id integer PRIMARY KEY,
    name text
  );
  CREATE TABLE card_prints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id integer,
    owner_id uuid,
    assigned_at timestamptz
  );
  CREATE TABLE user_collections (
    user_id uuid NOT NULL,
    card_id integer NOT NULL,
    PRIMARY KEY (user_id, card_id)
  );
`;

export interface AuctionDb {
  db: PGlite;
  /** Crée un utilisateur auth + son portefeuille au solde donné, renvoie son id. */
  createUser(balance?: number): Promise<string>;
  /** Solde courant du portefeuille (0 si inexistant). */
  balance(userId: string): Promise<number>;
  /** Crée une enchère active et renvoie son id. */
  createAuction(opts: CreateAuctionOpts): Promise<string>;
  /** Ligne d'enchère brute. */
  auction(id: string): Promise<AuctionRow>;
  /** Appelle place_bid et renvoie le JSONB résultat. */
  placeBid(auctionId: string, bidderId: string, amount: number, isBuyout?: boolean): Promise<BidResult>;
  /** Appelle settle_auction et renvoie le JSONB résultat. */
  settle(auctionId: string): Promise<SettleResult>;
  /** Nombre de lignes wallet_transactions d'un type pour un user. */
  txCount(userId: string, type: string): Promise<number>;
}

export interface CreateAuctionOpts {
  sellerId: string;
  sellerType?: "player" | "admin";
  startingBid: number;
  buyoutPrice?: number | null;
  commissionRate?: number;
  /** Minutes avant expiration ; négatif = déjà expirée. Défaut 60. */
  durationMinutes?: number;
}

export interface AuctionRow {
  id: string;
  status: string;
  current_bid: number | null;
  current_bidder_id: string | null;
  bid_count: number;
  seller_id: string;
  settled_at: string | null;
}

export type BidResult =
  | { success: true; bid_id: string; amount: number; is_buyout: boolean }
  | { error: string };

export type SettleResult = { success: true; sold: boolean } | { error: string };

export async function createAuctionDb(): Promise<AuctionDb> {
  const db = new PGlite();
  await db.exec(PREAMBLE);
  await db.exec(loadSql("supabase-economy.sql"));
  await db.exec(loadSql("supabase-migration-auction.sql"));

  const api: AuctionDb = {
    db,

    async createUser(balance = 0) {
      const { rows } = await db.query<{ id: string }>(
        "INSERT INTO auth.users DEFAULT VALUES RETURNING id",
      );
      const id = rows[0].id;
      if (balance > 0) {
        await db.query("INSERT INTO wallets (user_id, balance) VALUES ($1, $2)", [id, balance]);
      } else {
        await db.query("INSERT INTO wallets (user_id, balance) VALUES ($1, 0)", [id]);
      }
      return id;
    },

    async balance(userId) {
      const { rows } = await db.query<{ balance: number }>(
        "SELECT balance FROM wallets WHERE user_id = $1",
        [userId],
      );
      return rows.length ? rows[0].balance : 0;
    },

    async createAuction(opts) {
      const duration = opts.durationMinutes ?? 60;
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO auctions
          (seller_id, seller_type, starting_bid, buyout_price, commission_rate,
           duration_minutes, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' minutes')::interval)
         RETURNING id`,
        [
          opts.sellerId,
          opts.sellerType ?? "player",
          opts.startingBid,
          opts.buyoutPrice ?? null,
          opts.commissionRate ?? 5.0,
          Math.abs(duration),
          String(duration),
        ],
      );
      return rows[0].id;
    },

    async auction(id) {
      const { rows } = await db.query<AuctionRow>("SELECT * FROM auctions WHERE id = $1", [id]);
      return rows[0];
    },

    async placeBid(auctionId, bidderId, amount, isBuyout = false) {
      const { rows } = await db.query<{ r: BidResult }>(
        "SELECT place_bid($1, $2, $3, $4) AS r",
        [auctionId, bidderId, amount, isBuyout],
      );
      return rows[0].r;
    },

    async settle(auctionId) {
      const { rows } = await db.query<{ r: SettleResult }>(
        "SELECT settle_auction($1) AS r",
        [auctionId],
      );
      return rows[0].r;
    },

    async txCount(userId, type) {
      const { rows } = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM wallet_transactions WHERE user_id = $1 AND type = $2",
        [userId, type],
      );
      return rows[0].n;
    },
  };

  return api;
}
