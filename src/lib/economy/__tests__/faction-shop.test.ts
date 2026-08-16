// BOUTIQUE DE FACTIONS — achat d'une faction, forfait, et révocation.
//
// Le vrai PL/pgSQL de production sous PGlite, sans bouchon : c'est le même
// `adjust_wallet_balance` que les enchères, donc les mêmes contraintes
// monétaires — dont le CHECK (balance >= 0) qui refuse un débit à découvert.
//
// Ce qui compte le plus ici :
//
//   1. L'ATOMICITÉ de l'achat : jamais un débit sans déblocage, jamais un
//      déblocage sans débit.
//   2. La RÉVOCATION au remboursement. L'or étant fongible, on ne peut pas
//      « annuler l'achat financé par le paiement remboursé » ; la règle reprend
//      donc les déblocages du plus récent au plus ancien, au PRIX PAYÉ, jusqu'à
//      couvrir la dette. La faction OFFERTE n'est jamais reprise.
//   3. Qu'un joueur ENDETTÉ ne puisse rien acheter — sinon la dette ne veut
//      plus rien dire.
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const sql = (f: string) => readFileSync(join(ROOT, f), "utf8");

const PREAMBLE = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE TABLE profiles (
    id uuid PRIMARY KEY,
    starter_faction text,
    all_commons_unlocked boolean NOT NULL DEFAULT false,
    legacy_full_access boolean NOT NULL DEFAULT false
  );
`;

interface Boutique {
  db: PGlite;
  joueur(or?: number, factionDepart?: string | null): Promise<string>;
  or(u: string): Promise<number>;
  dette(u: string): Promise<number>;
  factions(u: string): Promise<string[]>;
  forfait(u: string): Promise<boolean>;
  acheter(u: string, faction: string): Promise<Record<string, unknown>>;
  acheterForfait(u: string): Promise<Record<string, unknown>>;
  poserDette(u: string, montant: number): Promise<void>;
  revoquer(u: string): Promise<{ revoked: string[]; debt_remaining: number }>;
}

async function boutique(): Promise<Boutique> {
  const db = new PGlite();
  await db.exec(PREAMBLE);
  // La VRAIE chaîne de migrations, dans l'ordre de production : la boutique se
  // termine en redéfinissant `apply_charge_refunded`, qui s'appuie sur les
  // tables des deux migrations de paiement. Charger un extrait isolé aurait
  // testé un SQL qui n'existe nulle part.
  await db.exec(sql("supabase-economy.sql"));
  await db.exec(sql("supabase-migration-stripe-payments.sql"));
  await db.exec(sql("supabase-migration-tournament-tickets.sql"));
  await db.exec(sql("supabase-migration-faction-shop.sql"));

  const un = async <T>(q: string, p: unknown[] = []): Promise<T> => (await db.query<T>(q, p)).rows[0];

  return {
    db,
    async joueur(or = 0, factionDepart = null) {
      const { id } = await un<{ id: string }>("INSERT INTO auth.users DEFAULT VALUES RETURNING id");
      // La ligne `user_faction_unlocks` de la faction offerte n'est PAS insérée
      // ici : c'est le trigger `trg_sync_starter_faction` qui doit s'en charger.
      // L'insérer à la main masquerait sa disparition.
      await db.query("INSERT INTO profiles (id, starter_faction) VALUES ($1, $2)", [id, factionDepart]);
      await db.query("INSERT INTO wallets (user_id, balance) VALUES ($1, $2)", [id, or]);
      return id;
    },
    async or(u) {
      const r = await un<{ b: number }>("SELECT balance AS b FROM wallets WHERE user_id = $1", [u]);
      return r?.b ?? 0;
    },
    async dette(u) {
      const r = await un<{ d: number }>("SELECT COALESCE(gold_debt,0) AS d FROM wallets WHERE user_id = $1", [u]);
      return r?.d ?? 0;
    },
    async factions(u) {
      const { rows } = await db.query<{ faction: string }>(
        "SELECT faction FROM user_faction_unlocks WHERE user_id = $1 ORDER BY faction", [u]);
      return rows.map((r) => r.faction);
    },
    async forfait(u) {
      const r = await un<{ b: boolean }>("SELECT all_commons_unlocked AS b FROM profiles WHERE id = $1", [u]);
      return r?.b ?? false;
    },
    async acheter(u, faction) {
      return (await un<{ r: Record<string, unknown> }>("SELECT purchase_faction($1,$2) AS r", [u, faction])).r;
    },
    async acheterForfait(u) {
      return (await un<{ r: Record<string, unknown> }>("SELECT purchase_faction_bundle($1) AS r", [u])).r;
    },
    async poserDette(u, montant) {
      await db.query("UPDATE wallets SET gold_debt = $2 WHERE user_id = $1", [u, montant]);
    },
    async revoquer(u) {
      return (await un<{ r: { revoked: string[]; debt_remaining: number } }>(
        "SELECT revoke_faction_unlocks_for_debt($1) AS r", [u])).r;
    },
  };
}

let t: Boutique;
beforeEach(async () => { t = await boutique(); });

// ───────────────────────────────────────────────────────────────────────────

describe("faction offerte", () => {
  it("choisir sa faction de départ la débloque, sans que personne l'ait écrite", async () => {
    // L'onboarding n'écrit que `profiles.starter_faction`. C'est le trigger qui
    // doit alimenter la table, sinon chaque nouvel inscrit diverge.
    const u = await t.joueur(0, "Nains");
    expect(await t.factions(u)).toEqual(["Nains"]);
  });

  it("elle est marquée 'starter' et n'a rien coûté", async () => {
    const u = await t.joueur(0, "Nains");
    const { rows } = await t.db.query<{ source: string; price_paid: number }>(
      "SELECT source, price_paid FROM user_faction_unlocks WHERE user_id = $1", [u]);
    expect(rows).toEqual([{ source: "starter", price_paid: 0 }]);
  });

  it("la choisir APRÈS l'inscription la débloque aussi", async () => {
    // Cas réel : le profil naît sans faction, l'écran d'onboarding la pose
    // ensuite par UPDATE.
    const u = await t.joueur(0, null);
    expect(await t.factions(u)).toEqual([]);
    await t.db.query("UPDATE profiles SET starter_faction = 'Elfes' WHERE id = $1", [u]);
    expect(await t.factions(u)).toEqual(["Elfes"]);
  });
});

describe("achat d'une faction", () => {
  it("débite le prix et débloque", async () => {
    const u = await t.joueur(2000, "Nains");
    const r = await t.acheter(u, "Elfes");

    expect(r).toMatchObject({ unlocked: "Elfes", price: 1200 });
    expect(await t.or(u)).toBe(800);
    expect(await t.factions(u)).toEqual(["Elfes", "Nains"]);
  });

  it("enregistre le prix PAYÉ, pas le tarif du jour", async () => {
    // Sans cela, une hausse de tarif ferait mentir la révocation.
    const u = await t.joueur(5000, "Nains");
    await t.acheter(u, "Elfes");
    await t.db.query("UPDATE faction_shop_settings SET faction_price = 3000 WHERE id = 1");
    await t.acheter(u, "Humains");

    const { rows } = await t.db.query<{ faction: string; price_paid: number }>(
      "SELECT faction, price_paid FROM user_faction_unlocks WHERE user_id=$1 AND source='purchase' ORDER BY price_paid",
      [u]);
    expect(rows).toEqual([
      { faction: "Elfes", price_paid: 1200 },
      { faction: "Humains", price_paid: 3000 },
    ]);
  });

  it("or insuffisant ⇒ refus, et RIEN n'est débité", async () => {
    const u = await t.joueur(500, "Nains");
    const r = await t.acheter(u, "Elfes");

    expect(r).toMatchObject({ error: "insufficient_gold", price: 1200, balance: 500 });
    expect(await t.or(u)).toBe(500);
    expect(await t.factions(u)).toEqual(["Nains"]);
  });

  it("acheter deux fois la même faction est refusé", async () => {
    // C'est aussi ce qui rend un double clic inoffensif.
    const u = await t.joueur(5000, "Nains");
    await t.acheter(u, "Elfes");
    expect(await t.acheter(u, "Elfes")).toMatchObject({ error: "already_unlocked" });
    expect(await t.or(u)).toBe(3800); // débité une seule fois
  });

  it("un joueur ENDETTÉ ne peut rien acheter", async () => {
    const u = await t.joueur(5000, "Nains");
    await t.poserDette(u, 300);

    expect(await t.acheter(u, "Elfes")).toMatchObject({ error: "gold_debt", debt: 300 });
    expect(await t.or(u)).toBe(5000);
  });

  it("celui qui a le FORFAIT ne se voit pas vendre une faction", async () => {
    const u = await t.joueur(5000, "Nains");
    await t.acheterForfait(u);
    expect(await t.acheter(u, "Elfes")).toMatchObject({ error: "already_owns_bundle" });
  });
});

describe("forfait", () => {
  it("bascule le droit et débite le prix de lancement", async () => {
    const u = await t.joueur(5000, "Nains");
    const r = await t.acheterForfait(u);

    expect(r).toMatchObject({ unlocked: "*", price: 2300 });
    expect(await t.forfait(u)).toBe(true);
    expect(await t.or(u)).toBe(2700);
  });

  it("il vaut mieux que deux factions — c'est le but du prix de lancement", async () => {
    const { rows } = await t.db.query<{ f: number; b: number }>(
      "SELECT faction_price AS f, bundle_price AS b FROM faction_shop_settings WHERE id = 1");
    expect(rows[0].b).toBeLessThan(rows[0].f * 2);
  });

  it("acheté deux fois ⇒ refus, sans second débit", async () => {
    const u = await t.joueur(9000, "Nains");
    await t.acheterForfait(u);
    expect(await t.acheterForfait(u)).toMatchObject({ error: "already_unlocked" });
    expect(await t.or(u)).toBe(6700);
  });
});

describe("révocation pour dette", () => {
  it("reprend du PLUS RÉCENT, au prix payé, jusqu'à couvrir la dette", async () => {
    const u = await t.joueur(5000, "Nains");
    await t.acheter(u, "Elfes");
    await t.acheter(u, "Humains");   // la plus récente
    await t.poserDette(u, 1200);

    const r = await t.revoquer(u);

    expect(r.revoked).toEqual(["Humains"]);
    expect(r.debt_remaining).toBe(0);
    expect(await t.factions(u)).toEqual(["Elfes", "Nains"]);
  });

  it("n'en reprend pas plus que nécessaire", async () => {
    const u = await t.joueur(5000, "Nains");
    await t.acheter(u, "Elfes");
    await t.acheter(u, "Humains");
    await t.poserDette(u, 300); // bien moins qu'une faction

    const r = await t.revoquer(u);

    expect(r.revoked).toHaveLength(1);
    expect(r.debt_remaining).toBe(0); // l'excédent est rendu, pas conservé
  });

  it("la faction OFFERTE n'est jamais reprise", async () => {
    // La retirer laisserait le joueur sans aucune carte — et elle n'a rien
    // coûté, donc elle n'éponge aucune dette.
    const u = await t.joueur(2000, "Nains");
    await t.poserDette(u, 5000);

    const r = await t.revoquer(u);

    expect(r.revoked).toEqual([]);
    expect(r.debt_remaining).toBe(5000);
    expect(await t.factions(u)).toEqual(["Nains"]);
  });

  it("la dette qui dépasse tous les déblocages SUBSISTE", async () => {
    const u = await t.joueur(5000, "Nains");
    await t.acheter(u, "Elfes");
    await t.poserDette(u, 3000);

    const r = await t.revoquer(u);

    expect(r.revoked).toEqual(["Elfes"]);
    expect(r.debt_remaining).toBe(1800); // 3000 − 1200
  });

  it("le FORFAIT est repris comme le reste, et rend son droit", async () => {
    const u = await t.joueur(5000, "Nains");
    await t.acheterForfait(u);
    expect(await t.forfait(u)).toBe(true);
    await t.poserDette(u, 2300);

    const r = await t.revoquer(u);

    expect(r.revoked).toEqual(["*"]);
    expect(await t.forfait(u)).toBe(false);
    expect(r.debt_remaining).toBe(0);
  });

  it("sans dette, elle ne reprend rien", async () => {
    const u = await t.joueur(5000, "Nains");
    await t.acheter(u, "Elfes");

    const r = await t.revoquer(u);

    expect(r.revoked).toEqual([]);
    expect(await t.factions(u)).toEqual(["Elfes", "Nains"]);
  });
});
