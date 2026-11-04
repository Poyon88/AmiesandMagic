// FORGE D'ESSENCE — 2000 essence = une carte limitée LIBRE tirée au hasard.
//
// Le vrai PL/pgSQL de production sous PGlite. Ce qui compte :
//   1. ATOMICITÉ : jamais de débit sans attribution, ni l'inverse ; un refus ne
//      débite rien.
//   2. CASCADE sans branche vide : faction et clan sont tirés parmi ceux qui ont
//      encore un exemplaire libre dans la rareté tirée.
//   3. REPLI : rareté épuisée → on descend d'un cran.
//   4. Le pool exclut les cartes non jouables et les sets spéciaux.
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const sql = (f: string) => readFileSync(join(ROOT, f), "utf8");

// Schéma minimal des tables de catalogue que la forge lit (colonnes réelles).
const PREAMBLE = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE TABLE sets (id serial PRIMARY KEY, name text NOT NULL DEFAULT 's', code text NOT NULL DEFAULT 's',
                     type text NOT NULL DEFAULT 'base');
  CREATE TABLE cards (id serial PRIMARY KEY, name text NOT NULL, rarity text, faction text, clan text,
                      status text NOT NULL DEFAULT 'playable', set_id int REFERENCES sets(id));
  CREATE TABLE card_prints (id bigserial PRIMARY KEY, card_id int NOT NULL REFERENCES cards(id),
                            print_number int NOT NULL, max_prints int NOT NULL, owner_id uuid,
                            is_tradeable boolean NOT NULL DEFAULT true, assigned_at timestamptz);
  CREATE TABLE heroes (id serial PRIMARY KEY, name text NOT NULL, rarity text NOT NULL DEFAULT 'Commune',
                       max_prints int, faction text, clan text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE user_hero_prints (id bigserial PRIMARY KEY, user_id uuid NOT NULL, hero_id bigint NOT NULL,
                                 acquired_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, hero_id));
`;

type Craft = Record<string, unknown>;

let db: PGlite;

async function un<T>(q: string, p: unknown[] = []): Promise<T> {
  return (await db.query<T>(q, p)).rows[0];
}

async function joueur(essence = 0): Promise<string> {
  const { id } = await un<{ id: string }>("INSERT INTO auth.users DEFAULT VALUES RETURNING id");
  await db.query("INSERT INTO wallets (user_id, balance, essence) VALUES ($1, 0, $2)", [id, essence]);
  return id;
}

async function essence(u: string): Promise<number> {
  return (await un<{ e: number }>("SELECT essence AS e FROM wallets WHERE user_id = $1", [u])).e;
}

/** Carte limitée avec `n` exemplaires libres. */
async function carte(rarity: string, faction: string, clan: string | null, n = 1,
                     opts: { status?: string; setType?: string } = {}): Promise<number> {
  let setId: number | null = null;
  if (opts.setType) {
    setId = (await un<{ id: number }>("INSERT INTO sets (type) VALUES ($1) RETURNING id", [opts.setType])).id;
  }
  const { id } = await un<{ id: number }>(
    "INSERT INTO cards (name, rarity, faction, clan, status, set_id) VALUES ('c',$1,$2,$3,$4,$5) RETURNING id",
    [rarity, faction, clan, opts.status ?? "playable", setId]);
  await db.query(
    "INSERT INTO card_prints (card_id, print_number, max_prints) SELECT $1, g, $2 FROM generate_series(1,$2) g",
    [id, n]);
  return id;
}

async function forger(u: string, roll?: number): Promise<Craft> {
  return (await un<{ r: Craft }>("SELECT craft_with_essence($1, $2) AS r", [u, roll ?? null])).r;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(PREAMBLE);
  await db.exec(sql("supabase-economy.sql"));
  await db.exec(sql("supabase-migration-essence.sql"));
});

// Bandes cumulées : < 0.0001 héros L, < 0.0011 L, < 0.0111 É, < 0.1111 R, sinon PC.
const ROLL = { heros: 0.00005, leg: 0.0005, epi: 0.005, rare: 0.05, pc: 0.5 };

describe("solde", () => {
  it("refuse sous 2000 sans rien débiter ni attribuer", async () => {
    await carte("Peu Commune", "Elfes", "A", 5);
    const u = await joueur(1999);
    expect(await forger(u)).toMatchObject({ error: "insufficient_essence", essence: 1999 });
    expect(await essence(u)).toBe(1999);
    expect((await un<{ n: number }>("SELECT count(*)::int n FROM card_prints WHERE owner_id IS NOT NULL")).n).toBe(0);
  });

  it("débite 2000, attribue un exemplaire et journalise", async () => {
    const c = await carte("Peu Commune", "Elfes", "A", 5);
    const u = await joueur(3500);
    const r = await forger(u, ROLL.pc);
    expect(r).toMatchObject({ kind: "card", rarity: "Peu Commune", faction: "Elfes", clan: "A",
                              id: c, print_number: 1, max_prints: 5, essence: 1500, fallback: false });
    expect(await essence(u)).toBe(1500);
    const p = await un<{ owner_id: string }>("SELECT owner_id FROM card_prints WHERE card_id=$1 AND print_number=1", [c]);
    expect(p.owner_id).toBe(u);
    const tx = await un<{ type: string; amount: number; essence_after: number }>(
      "SELECT type, amount, essence_after FROM essence_transactions WHERE user_id=$1", [u]);
    expect(tx).toEqual({ type: "craft", amount: -2000, essence_after: 1500 });
  });

  it("adjust_essence refuse un débit à découvert", async () => {
    const u = await joueur(100);
    await expect(db.query("SELECT adjust_essence($1, -200, 'admin_debit')", [u])).rejects.toThrow();
    expect(await essence(u)).toBe(100);
  });
});

describe("tirage", () => {
  it("la rareté tirée est respectée quand son pool existe", async () => {
    await carte("Peu Commune", "Elfes", "A", 5);
    await carte("Rare", "Nains", "B", 5);
    await carte("Épique", "Humains", "C", 5);
    await carte("Légendaire", "Orcs", "D", 1);
    const u = await joueur(10_000);
    expect((await forger(u, ROLL.rare)).rarity).toBe("Rare");
    expect((await forger(u, ROLL.epi)).rarity).toBe("Épique");
    expect((await forger(u, ROLL.leg)).rarity).toBe("Légendaire");
    expect((await forger(u, ROLL.pc)).rarity).toBe("Peu Commune");
  });

  it("rareté épuisée → repli d'un cran", async () => {
    const leg = await carte("Légendaire", "Orcs", "D", 1);
    await carte("Épique", "Humains", "C", 3);
    const u = await joueur(5000);
    expect(await forger(u, ROLL.leg)).toMatchObject({ rarity: "Légendaire", id: leg, fallback: false });
    // L'unique légendaire est parti : le même tirage retombe sur Épique.
    expect(await forger(u, ROLL.leg)).toMatchObject({ rarity: "Épique", fallback: true });
  });

  it("faction et clan ne tombent jamais sur une branche vide", async () => {
    // Elfes n'a que des exemplaires DÉJÀ possédés ; Nains a un clan vide.
    const pris = await carte("Rare", "Elfes", "X", 2);
    await db.query("UPDATE card_prints SET owner_id = gen_random_uuid() WHERE card_id = $1", [pris]);
    const plein = await carte("Rare", "Nains", "Y", 50);
    const u = await joueur(40_000);
    for (let i = 0; i < 20; i++) {
      expect(await forger(u, ROLL.rare)).toMatchObject({ rarity: "Rare", faction: "Nains", clan: "Y", id: plein });
    }
  });

  it("exclut les cartes non jouables et les sets spéciaux", async () => {
    await carte("Rare", "Elfes", "A", 50, { status: "draft" });
    await carte("Rare", "Elfes", "B", 50, { setType: "special" });
    const ok = await carte("Peu Commune", "Nains", "C", 50);
    const u = await joueur(10_000);
    for (let i = 0; i < 5; i++) {
      expect(await forger(u, ROLL.rare)).toMatchObject({ id: ok, fallback: true });
    }
  });

  it("cartes sans clan : un groupe à part entière", async () => {
    const c = await carte("Rare", "Bâtisseurs", null, 3);
    const u = await joueur(2000);
    expect(await forger(u, ROLL.rare)).toMatchObject({ id: c, clan: null });
  });

  it("pool entièrement vide → refus sans débit", async () => {
    const u = await joueur(5000);
    expect(await forger(u, ROLL.pc)).toEqual({ error: "pool_empty" });
    expect(await essence(u)).toBe(5000);
  });

  it("deux forges n'attribuent jamais le même exemplaire", async () => {
    const c = await carte("Peu Commune", "Elfes", "A", 3);
    const a = await joueur(6000);
    const b = await joueur(6000);
    await forger(a, ROLL.pc);
    await forger(b, ROLL.pc);
    await forger(a, ROLL.pc);
    const { rows } = await db.query<{ print_number: number }>(
      "SELECT print_number FROM card_prints WHERE card_id=$1 AND owner_id IS NOT NULL ORDER BY 1", [c]);
    expect(rows.map((r) => r.print_number)).toEqual([1, 2, 3]);
    expect(await forger(b, ROLL.pc)).toEqual({ error: "pool_empty" });
  });
});

describe("héros légendaire", () => {
  it("les exemplaires naissent avec le héros (trigger) et se forgent", async () => {
    const { id: h } = await un<{ id: number }>(
      "INSERT INTO heroes (name, rarity, max_prints, faction, clan) VALUES ('h','Légendaire',2,'Humains','Aube') RETURNING id");
    await un("INSERT INTO heroes (name) VALUES ('commun')"); // Commune : aucun exemplaire
    expect((await un<{ n: number }>("SELECT count(*)::int n FROM hero_prints")).n).toBe(2);

    const u = await joueur(2000);
    expect(await forger(u, ROLL.heros)).toMatchObject({
      kind: "hero", rarity: "Légendaire", faction: "Humains", clan: "Aube", id: h, print_number: 1, max_prints: 2 });
    expect((await un<{ n: number }>("SELECT count(*)::int n FROM user_hero_prints WHERE user_id=$1 AND hero_id=$2", [u, h])).n).toBe(1);
  });

  it("héros épuisés → repli sur une carte Légendaire", async () => {
    await un("INSERT INTO heroes (name, rarity, max_prints) VALUES ('h','Légendaire',1)");
    const autre = await joueur(0);
    await db.query("UPDATE hero_prints SET owner_id = $1", [autre]);
    const leg = await carte("Légendaire", "Orcs", "D", 1);
    const u = await joueur(2000);
    expect(await forger(u, ROLL.heros)).toMatchObject({ kind: "card", id: leg, fallback: true });
  });

  it("augmenter max_prints ajoute les numéros manquants", async () => {
    const { id: h } = await un<{ id: number }>(
      "INSERT INTO heroes (name, rarity, max_prints) VALUES ('h','Épique',2) RETURNING id");
    await db.query("UPDATE heroes SET max_prints = 5 WHERE id = $1", [h]);
    const { rows } = await db.query<{ print_number: number; max_prints: number }>(
      "SELECT print_number, max_prints FROM hero_prints WHERE hero_id=$1 ORDER BY 1", [h]);
    expect(rows.map((r) => r.print_number)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.every((r) => r.max_prints === 5)).toBe(true);
  });
});
