// Règles par pays : résolution (pays réglé / pays inconnu / table vide), pays
// de connexion, et déclaration de majorité.
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCountry, normalizeCountry } from "@/lib/geo/country";
import { CLOSED_RULES, isAdultDeclared, resolveRules, type CountryRules } from "@/lib/geo/rules";

const regle = (code: string, over: Partial<CountryRules> = {}): CountryRules => ({
  country_code: code, gold_purchases: true, tickets: true, auctions: true, cash_prizes: true, min_age: 18, ...over,
});
const ROWS = [
  regle("ZZ", { gold_purchases: false, tickets: false, cash_prizes: false }),
  regle("LU"),
  regle("BE", { tickets: false, cash_prizes: false }),
];

describe("resolveRules", () => {
  it("pays réglé ⇒ sa ligne", () => {
    expect(resolveRules(ROWS, "BE")).toMatchObject({ gold_purchases: true, tickets: false });
  });
  it("pays sans ligne ⇒ règle par défaut ZZ", () => {
    expect(resolveRules(ROWS, "US")).toMatchObject({ country_code: "ZZ", gold_purchases: false, auctions: true });
  });
  it("table vide ou illisible ⇒ tout fermé", () => {
    expect(resolveRules([], "LU")).toEqual(CLOSED_RULES);
  });
});

describe("requestCountry", () => {
  afterEach(() => vi.unstubAllEnvs());
  const h = (v?: string) => new Headers(v ? { "x-vercel-ip-country": v } : {});

  it("lit l'en-tête Vercel, sans tenir compte de la casse", () => {
    expect(requestCountry(h("lu"))).toBe("LU");
  });
  it("en-tête prioritaire sur le repli de développement", () => {
    vi.stubEnv("GEO_DEV_COUNTRY", "BE");
    expect(requestCountry(h("FR"))).toBe("FR");
  });
  it("hors production, sans en-tête ⇒ GEO_DEV_COUNTRY", () => {
    vi.stubEnv("GEO_DEV_COUNTRY", "BE");
    expect(requestCountry(h())).toBe("BE");
  });
  it("en PRODUCTION, sans en-tête ⇒ ZZ, le repli de développement est ignoré", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GEO_DEV_COUNTRY", "LU");
    expect(requestCountry(h())).toBe("ZZ");
  });
  it("valeur qui n'est pas un code pays ⇒ ZZ", () => {
    vi.stubEnv("GEO_DEV_COUNTRY", "");
    expect(requestCountry(h("France"))).toBe("ZZ");
    expect(normalizeCountry("1A")).toBeNull();
  });
});

describe("isAdultDeclared", () => {
  it("aucune déclaration ⇒ non", () => {
    expect(isAdultDeclared(null, 18)).toBe(false);
    expect(isAdultDeclared({ adult_declared_at: null }, 18)).toBe(false);
  });
  it("déclaré pour 18 ans ⇒ vaut dans un pays à 18 ans, pas dans un pays à 19", () => {
    const p = { adult_declared_at: "2026-11-13T00:00:00Z", adult_declared_min_age: 18 };
    expect(isAdultDeclared(p, 18)).toBe(true);
    expect(isAdultDeclared(p, 19)).toBe(false);
  });
});
