// Détermine quelles cartes sont légales par format. Dépend de `new Date()`
// (rotation Standard) → horloge figée pour des tests déterministes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFormatFilter, isWithinTwoYears, parseFormatCode } from "./format-legality";
import type { Card, FormatCode, GameFormat } from "./types";

function fmt(code: FormatCode): GameFormat {
  return { id: 1, code, name: code, is_active: true };
}
// getFormatFilter ne lit que rarity / card_year / card_month.
function card(rarity: string | null, year: number | null, month: number | null = null): Card {
  return { rarity, card_year: year, card_month: month } as unknown as Card;
}

describe("parseFormatCode", () => {
  it("décompose mode et étendue", () => {
    expect(parseFormatCode("classique-standard")).toEqual({ mode: "classique", extent: "standard" });
    expect(parseFormatCode("expert-etendu")).toEqual({ mode: "expert", extent: "etendu" });
  });
});

describe("isWithinTwoYears (horloge figée à juin 2026)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // 15 juin 2026 (mois index 5)
  });
  afterEach(() => vi.useRealTimers());

  it("carte non datée → illégale en Standard", () => {
    expect(isWithinTwoYears(null)).toBe(false);
    expect(isWithinTwoYears(undefined)).toBe(false);
  });

  it("borne inclusive au mois : juin 2024 encore légal en juin 2026", () => {
    expect(isWithinTwoYears(2024, 6)).toBe(true);
  });

  it("un mois trop tôt : mai 2024 illégal en juin 2026", () => {
    expect(isWithinTwoYears(2024, 5)).toBe(false);
  });

  it("carte récente légale", () => {
    expect(isWithinTwoYears(2025, 1)).toBe(true);
  });
});

describe("getFormatFilter (horloge figée à juin 2026)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
  });
  afterEach(() => vi.useRealTimers());

  it("classique-standard : seules les Communes, datées ≤ 2 ans (non datées OK)", () => {
    const f = getFormatFilter(fmt("classique-standard"));
    expect(f(card("Commune", null))).toBe(true);   // commune non datée
    expect(f(card("Rare", null))).toBe(false);     // non-commune rejetée (mode)
    expect(f(card("Commune", 2020, 1))).toBe(false); // commune trop ancienne (rotation)
    expect(f(card("Commune", 2026, 1))).toBe(true);  // commune récente
  });

  it("expert-standard : toutes raretés mais rotation appliquée", () => {
    const f = getFormatFilter(fmt("expert-standard"));
    expect(f(card("Rare", null))).toBe(true);     // non datée → légale
    expect(f(card("Rare", 2020, 1))).toBe(false); // datée trop ancienne → illégale
    expect(f(card("Rare", 2025, 6))).toBe(true);  // récente
  });

  it("étendu : aucune restriction de date", () => {
    expect(getFormatFilter(fmt("expert-etendu"))(card("Rare", 2010, 1))).toBe(true);
  });

  it("classique-etendu : pas de date mais rareté Commune exigée", () => {
    const f = getFormatFilter(fmt("classique-etendu"));
    expect(f(card("Commune", 2010, 1))).toBe(true);
    expect(f(card("Rare", 2010, 1))).toBe(false);
  });
});
