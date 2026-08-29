// Barème modifiable : la surcharge locale du modèle de coût.
import { afterEach, describe, expect, it, vi } from "vitest";
import { KEYWORDS } from "@/lib/game/abilities";
import { STAT_COST, ADDITIONAL_COST_POINTS, BUDGET, RARITIES, RARITY_MAP } from "./constants";
import {
  applyBalanceOverrides, balanceDefaults, countBalanceChanges,
  loadBalanceOverrides, saveBalanceOverrides,
} from "./balance";
import { generateCardStats } from "./generator";

// Chaque test repart des valeurs d'origine : muter des objets partagés sans
// remise à zéro contaminerait toute la suite.
afterEach(() => applyBalanceOverrides({}));

describe("application", () => {
  it("surcharge le coût d'une capacité, et le générateur le voit", () => {
    const avant = KEYWORDS["Provocation"].cost;
    applyBalanceOverrides({ keywords: { "Provocation": { cost: avant + 7 } } });
    expect(KEYWORDS["Provocation"].cost).toBe(avant + 7);
    // Le générateur lit le MÊME objet : la surcharge le suit sans câblage.
    expect(() => generateCardStats("Elfes", "Unité", "Rare", 5, "Elfes")).not.toThrow();
  });

  it("surcharge les caractéristiques, les coûts additionnels et le budget", () => {
    applyBalanceOverrides({
      stat: { atk: 9 }, additional: { life: -1 }, budgetBase: 20,
      rarityMultipliers: { "Rare": 2 },
    });
    expect(STAT_COST.atk).toBe(9);
    expect(STAT_COST.def).toBe(balanceDefaults().stat.def); // non touché
    expect(ADDITIONAL_COST_POINTS.life).toBe(-1);
    expect(BUDGET.base).toBe(20);
    expect(RARITY_MAP["Rare"].multiplier).toBe(2);
  });

  it("RÉTABLIT exactement l'origine — y compris ce qu'un réglage précédent avait bougé", () => {
    // Le piège : appliquer une surcharge vide doit défaire la précédente, et pas
    // seulement « ne rien faire ».
    const d = balanceDefaults();
    applyBalanceOverrides({ stat: { atk: 99 }, budgetBase: 99, keywords: { "Provocation": { cost: 99 } } });
    applyBalanceOverrides({});
    expect(STAT_COST.atk).toBe(d.stat.atk);
    expect(BUDGET.base).toBe(d.budgetBase);
    expect(KEYWORDS["Provocation"].cost).toBe(d.keywords["Provocation"].cost);
    for (const r of RARITIES) expect(r.multiplier, r.id).toBe(d.rarityMultipliers[r.id]);
  });

  it("ignore une capacité inconnue sans planter", () => {
    expect(() => applyBalanceOverrides({ keywords: { "Capacité Fantôme": { cost: 3 } } })).not.toThrow();
  });
});

describe("comptage des écarts", () => {
  it("ne compte pas une surcharge qui répète la valeur d'origine", () => {
    const d = balanceDefaults();
    expect(countBalanceChanges({ stat: { atk: d.stat.atk } })).toBe(0);
    expect(countBalanceChanges({ keywords: { "Provocation": { cost: d.keywords["Provocation"].cost } } })).toBe(0);
  });

  it("compte chaque valeur réellement déplacée", () => {
    const d = balanceDefaults();
    expect(countBalanceChanges({
      stat: { atk: d.stat.atk + 1, def: d.stat.def },     // 1 écart
      additional: { life: -1 },                            // 1
      budgetBase: d.budgetBase + 1,                        // 1
      keywords: { "Provocation": { cost: 1, costPerX: 2 } }, // 2
    })).toBe(5);
  });
});

describe("stockage", () => {
  const memoire: Record<string, string> = {};
  const faux = {
    getItem: (k: string) => memoire[k] ?? null,
    setItem: (k: string, v: string) => { memoire[k] = v; },
    removeItem: (k: string) => { delete memoire[k]; },
  };
  it("relit ce qu'il a écrit", () => {
    vi.stubGlobal("window", { localStorage: faux });
    saveBalanceOverrides({ stat: { atk: 7 } });
    expect(loadBalanceOverrides()).toEqual({ stat: { atk: 7 } });
    vi.unstubAllGlobals();
  });

  it("EFFACE l'entrée quand plus rien ne s'écarte de l'origine", () => {
    // Sinon un barème « rétabli » laisserait une entrée morte que la prochaine
    // session relirait comme une surcharge.
    vi.stubGlobal("window", { localStorage: faux });
    saveBalanceOverrides({ stat: { atk: 7 } });
    saveBalanceOverrides({ stat: { atk: balanceDefaults().stat.atk } });
    expect(loadBalanceOverrides()).toEqual({});
    vi.unstubAllGlobals();
  });

  it("rend un barème VIDE si le stockage est illisible", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "{ pas du json" } });
    expect(loadBalanceOverrides()).toEqual({});
    vi.unstubAllGlobals();
  });

  it("ne fait rien côté serveur, où window n'existe pas", () => {
    expect(loadBalanceOverrides()).toEqual({});
    expect(() => saveBalanceOverrides({ stat: { atk: 7 } })).not.toThrow();
  });
});
