// Ce que la base ne peut pas garder : la SURFACE du système de paiement.
//
// Les invariants ci-dessous ne sont pas exprimables en SQL et ne se voient pas
// à l'exécution — ils se perdent par une modification innocente, six mois plus
// tard, par quelqu'un qui n'a pas lu l'en-tête de la migration. D'où des tests
// qui lisent le code source.
//
// Chacun correspond à un point explicite du cahier des charges :
//   · aucun montant ne peut venir du client ;
//   · aucune clé secrète ne peut atteindre le navigateur ;
//   · le webhook vérifie la signature sur le CORPS BRUT, avant tout effet ;
//   · aucune route de sortie d'argent n'existe.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { GOLD_PACKS, publicGoldPacks, findGoldPack } from "../config";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────

describe("le catalogue ne fuit pas côté navigateur", () => {
  it("`publicGoldPacks` ne livre ni price_id ni nom de variable d'environnement", () => {
    // `displayPriceCents` est bien présent — c'est un prix d'AFFICHAGE, et il
    // doit l'être. Ce qui ne doit jamais sortir, c'est l'identifiant Stripe
    // (`price_...`) et le nom de la variable qui le porte.
    const serialized = JSON.stringify(publicGoldPacks());
    expect(serialized).not.toMatch(/price_[A-Za-z0-9]/);
    expect(serialized).not.toMatch(/STRIPE/);
    expect(serialized).not.toMatch(/priceEnvVar/);
    for (const p of GOLD_PACKS) expect(serialized).not.toContain(p.priceEnvVar);
  });

  it("chaque pack garde tout de même son price_id côté serveur", () => {
    for (const p of GOLD_PACKS) {
      expect(p.priceEnvVar, `${p.code} sans variable de prix`).toMatch(/^STRIPE_PRICE_/);
      expect(p.gold).toBeGreaterThan(0);
    }
  });

  it("les codes de pack sont uniques — c'est la clé de résolution du webhook", () => {
    const codes = GOLD_PACKS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(findGoldPack(c)?.code).toBe(c);
  });

  it("un code inconnu ne résout rien (pas de repli silencieux sur le premier pack)", () => {
    expect(findGoldPack("gold_pack_xxl")).toBeUndefined();
    expect(findGoldPack("")).toBeUndefined();
  });
});

describe("aucun montant ne peut venir du client", () => {
  const routes = ["src/app/api/checkout/gold-pack/route.ts", "src/app/api/checkout/tournament/route.ts"];

  it.each(routes)("%s ne lit aucun montant dans le corps de la requête", (route) => {
    const src = read(route);
    // On cherche une lecture de montant depuis `body`. La session Checkout ne
    // doit référencer QUE des `price` définis chez Stripe.
    expect(src).not.toMatch(/body[?.]*\.\s*(amount|price|amount_cents|unit_amount|gold)/);
    expect(src).not.toMatch(/unit_amount/);
    expect(src).not.toMatch(/price_data/);
  });

  it.each(routes)("%s construit ses line_items depuis un price_id serveur", (route) => {
    const src = read(route);
    expect(src).toMatch(/line_items:\s*\[\{\s*price:\s*priceId/);
    expect(src).toMatch(/requirePriceId/);
  });

  it("le montant enregistré est celui que STRIPE rapporte, pas celui qu'on espérait", () => {
    // `apply_checkout_completed` reçoit amount_cents depuis l'événement.
    const webhook = read("src/app/api/stripe/webhook/route.ts");
    expect(webhook).toMatch(/p_amount_cents:\s*session\.amount_total/);
  });
});

describe("le webhook", () => {
  const src = read("src/app/api/stripe/webhook/route.ts");

  it("lit le corps BRUT — `.json()` invaliderait la signature", () => {
    expect(src).toMatch(/await request\.text\(\)/);
    expect(src).not.toMatch(/await request\.json\(\)/);
  });

  it("vérifie la signature AVANT tout accès à la base", () => {
    const verif = src.indexOf("constructEvent");
    const db = src.indexOf("getAdminClient()");
    expect(verif).toBeGreaterThan(-1);
    expect(db).toBeGreaterThan(-1);
    expect(verif, "constructEvent doit précéder toute écriture").toBeLessThan(db);
  });

  it("répond 400 sur signature invalide, et 500 seulement sur échec de traitement", () => {
    expect(src).toMatch(/Signature invalide[\s\S]*?status:\s*400/);
    // Le 500 doit être dans le `catch` du traitement, pour que Stripe retente.
    expect(src).toMatch(/catch[\s\S]{0,400}status:\s*500/);
  });

  it("traite les trois événements du cahier des charges et journalise le reste", () => {
    for (const e of ["checkout.session.completed", "checkout.session.expired", "charge.refunded"]) {
      expect(src, `événement ${e} non traité`).toContain(`case "${e}"`);
    }
    expect(src).toMatch(/default:/);
    expect(src).toMatch(/type ignoré/);
  });

  it("délègue tout effet de bord aux fonctions PL/pgSQL idempotentes", () => {
    // Aucune écriture directe : sans cela, l'atomicité et l'idempotence
    // reposeraient sur l'ordre des appels dans le handler.
    expect(src).not.toMatch(/\.from\(["'](payments|wallets|tournament_entries)["']\)/);
    for (const fn of ["apply_checkout_completed", "apply_checkout_expired", "apply_charge_refunded"]) {
      expect(src).toContain(fn);
    }
  });
});

describe("circuit fermé — aucune sortie d'argent", () => {
  const appFiles = walk("src/app");

  it("aucune route de payout, de retrait ou de conversion pièces→euros", () => {
    const offenders = appFiles.filter((f) =>
      /\/(payout|payouts|withdraw|withdrawal|cash-?out|retrait)\//.test(f));
    expect(offenders).toEqual([]);
  });

  it("aucun appel Stripe de transfert ou de virement", () => {
    // `refunds.create` est LÉGITIME : il rend l'argent au payeur, sur son moyen
    // de paiement d'origine. Ce qui est proscrit, c'est d'ENVOYER de l'argent
    // ailleurs — Connect, transferts, payouts.
    const offenders: string[] = [];
    for (const f of [...appFiles, ...walk("src/lib/payments")]) {
      const src = read(f);
      if (/stripe\.(payouts|transfers)\b/.test(src)) offenders.push(f);
      if (/stripe\.accounts\.create|stripe\.accountLinks/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("la note de conformité reste dans la migration", () => {
    // Elle n'est pas décorative : c'est elle qui dit au prochain développeur
    // pourquoi il ne doit PAS ajouter de retrait sans revalidation juridique.
    const sql = read("supabase-migration-stripe-payments.sql");
    expect(sql).toMatch(/CONFORMITÉ/);
    expect(sql).toMatch(/PSD2/);
    expect(sql).toMatch(/non convertibles/);
  });
});

describe("la clé secrète reste au serveur", () => {
  it("aucun composant client n'importe le module Stripe", () => {
    const clientFiles = [...walk("src/components"), ...walk("src/app")]
      .filter((f) => read(f).startsWith('"use client"') || read(f).startsWith("'use client'"));
    const offenders = clientFiles.filter((f) =>
      /from ["']@\/lib\/payments\/stripe["']|from ["']stripe["']/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("STRIPE_SECRET_KEY n'apparaît jamais sous un préfixe public", () => {
    // Ce fichier est exclu : il CITE les motifs interdits pour les traquer.
    const all = [...walk("src"), "supabase-migration-stripe-payments.sql"]
      .filter((f) => !f.includes("__tests__"));
    const offenders = all.filter((f) => /NEXT_PUBLIC_STRIPE_SECRET|NEXT_PUBLIC_.*WEBHOOK_SECRET/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
