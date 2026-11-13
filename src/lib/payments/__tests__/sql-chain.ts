// CHAÎNE SQL des paiements, telle qu'elle est appliquée en production — une
// seule liste, partagée par tous les bancs d'essai PGlite qui touchent aux
// paiements (webhook Stripe, tickets de tournoi, boutique de factions).
//
// Pourquoi une liste unique : `apply_checkout_completed` et
// `apply_charge_refunded` sont définies par la migration Stripe, puis
// REDÉFINIES par les tickets, puis `apply_charge_refunded` une troisième fois
// par la boutique. Un banc qui s'arrête en chemin éprouve une version qui ne
// tourne plus nulle part — c'est ce que faisait celui du webhook.
//
// Ordre = ordre d'application (dépendances + date d'ajout au dépôt) :
//   2026-04-09  supabase-economy.sql
//   2026-08-15  supabase-migration-stripe-payments.sql
//   2026-08-16  supabase-migration-tournament-tickets.sql   (09:44)
//   2026-08-16  supabase-migration-faction-shop.sql         (18:20)
//
// Volontairement HORS de la chaîne — ces fichiers retouchent les mêmes objets
// sans en changer le comportement, et ne se chargent pas hors Supabase :
//   - supabase-migration-faction-shop-durcissement.sql : rattrapage déjà
//     intégré à faction-shop.sql ; REVOKE sur des rôles absents de PGlite.
//   - supabase-migration-or-divise-par-10.sql : données seules (tarifs de la
//     boutique, pas d'enchère) ; réclame `auction_settings`.
//   - supabase-migration-security-advisors-2026-10-b.sql : `SET search_path`
//     sur des fonctions de tout le schéma, dont la plupart n'existent pas ici.
// Toute migration qui REDÉFINIT une fonction de paiement doit être ajoutée ici.

import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PAYMENTS_SQL_CHAIN = [
  "supabase-economy.sql",
  "supabase-migration-stripe-payments.sql",
  "supabase-migration-tournament-tickets.sql",
  "supabase-migration-faction-shop.sql",
] as const;

// Objets Supabase attendus par les migrations mais définis ailleurs. `profiles`
// est réclamée par la boutique de factions (déclencheur de faction de départ).
export const PAYMENTS_SQL_PREAMBLE = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE TABLE profiles (
    id uuid PRIMARY KEY,
    starter_faction text,
    all_commons_unlocked boolean NOT NULL DEFAULT false,
    legacy_full_access boolean NOT NULL DEFAULT false
  );
`;

/** Préambule + chaîne complète, dans l'ordre de production. */
export async function loadPaymentsSqlChain(db: PGlite): Promise<void> {
  await db.exec(PAYMENTS_SQL_PREAMBLE);
  for (const file of PAYMENTS_SQL_CHAIN) {
    await db.exec(readFileSync(join(process.cwd(), file), "utf8"));
  }
}
