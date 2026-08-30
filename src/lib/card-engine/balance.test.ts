// Barème modifiable : la surcharge locale du modèle de coût.
import { afterEach, describe, expect, it, vi } from "vitest";
import { KEYWORDS } from "@/lib/game/abilities";
import { STAT_COST, ADDITIONAL_COST_POINTS, BUDGET, RARITIES, RARITY_MAP } from "./constants";
import {
  applyBalanceOverrides, balanceDefaults, clearBrowserOverrides, countBalanceChanges,
  getBalanceOverrides, loadBrowserOverrides, mergeBalanceOverrides,
  sanitizeBalanceOverrides,
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

describe("assainissement", () => {
  const d = balanceDefaults();

  it("garde ce qui est connu et fini", () => {
    const ov = {
      keywords: { "Provocation": { cost: 4, costPerX: 2 } },
      stat: { atk: 3, def: 2 }, additional: { life: -1 },
      budgetBase: 11, rarityMultipliers: { "Rare": 1.5 },
    };
    expect(sanitizeBalanceOverrides(ov)).toEqual(ov);
  });

  it("ÉCARTE une capacité qui n'existe plus", () => {
    // Sinon renommer un mot-clé laisserait une entrée morte que chaque
    // enregistrement recopierait, indéfiniment.
    expect(sanitizeBalanceOverrides({
      keywords: { "Capacité Fantôme": { cost: 3 }, "Provocation": { cost: 4 } },
    })).toEqual({ keywords: { "Provocation": { cost: 4 } } });
  });

  it("ÉCARTE tout ce qui n'est pas un nombre fini", () => {
    // Le vrai danger : NaN et Infinity traversent JSON.parse et arrivent
    // jusqu'à la jauge, qui affiche alors « NaN/NaN » sans dire pourquoi.
    expect(sanitizeBalanceOverrides({
      stat: { atk: NaN, def: "3" }, budgetBase: Infinity,
      keywords: { "Provocation": { cost: null } },
    })).toEqual({});
  });

  it("ÉCARTE les clés inventées, sans rien perdre des autres", () => {
    expect(sanitizeBalanceOverrides({
      additional: { life: -1, inventé: 9 },
      rarityMultipliers: { "Rare": 2, "Mythique": 5 },
      napoleon: 1,
    })).toEqual({ additional: { life: -1 }, rarityMultipliers: { "Rare": 2 } });
  });

  it("rend un barème VIDE pour tout ce qui n'est pas un objet", () => {
    for (const brut of [null, undefined, 3, "x", [], [{ cost: 1 }]]) {
      expect(sanitizeBalanceOverrides(brut), String(brut)).toEqual({});
    }
  });

  it("survit à ce que la base peut rendre : un barème vierge", () => {
    expect(sanitizeBalanceOverrides({})).toEqual({});
    // Et un barème assaini reste applicable tel quel.
    expect(() => applyBalanceOverrides(sanitizeBalanceOverrides({ stat: { atk: d.stat.atk } }))).not.toThrow();
  });
});

describe("barème appliqué", () => {
  it("se relit après application — l'éditeur lit ce que la forge a posé", () => {
    const ov = { stat: { atk: 7 } };
    applyBalanceOverrides(ov);
    expect(getBalanceOverrides()).toEqual(ov);
    applyBalanceOverrides({});
    expect(getBalanceOverrides()).toEqual({});
  });
});

describe("fusion", () => {
  it("superpose valeur par valeur, sans effacer ce qui n'est pas mentionné", () => {
    const fusion = mergeBalanceOverrides(
      { stat: { atk: 3, def: 2 }, budgetBase: 11, keywords: { "Provocation": { cost: 4 } } },
      { stat: { atk: 9 }, keywords: { "Vol": { cost: 5 } } },
    );
    expect(fusion.stat).toEqual({ atk: 9, def: 2 });   // def survit
    expect(fusion.budgetBase).toBe(11);                 // non mentionné, gardé
    expect(fusion.keywords).toEqual({ "Provocation": { cost: 4 }, "Vol": { cost: 5 } });
  });

  it("fusionne DANS une capacité : cost et costPerX peuvent venir de deux barèmes", () => {
    // Le piège d'un `...` naïf : l'entrée entrante remplacerait l'objet complet
    // et emporterait le costPerX que l'autre barème était seul à porter.
    const fusion = mergeBalanceOverrides(
      { keywords: { "Provocation": { costPerX: 2 } } },
      { keywords: { "Provocation": { cost: 6 } } },
    );
    expect(fusion.keywords?.["Provocation"]).toEqual({ costPerX: 2, cost: 6 });
  });

  it("laisse un barème vide intact des deux côtés", () => {
    expect(mergeBalanceOverrides({}, {})).toEqual({});
    expect(mergeBalanceOverrides({}, { budgetBase: 12 })).toEqual({ budgetBase: 12 });
  });
});

describe("reprise du navigateur", () => {
  const CLE = "am.balance.overrides.v1";
  const faireStockage = (contenu: Record<string, string>) => ({
    getItem: (k: string) => contenu[k] ?? null,
    setItem: (k: string, v: string) => { contenu[k] = v; },
    removeItem: (k: string) => { delete contenu[k]; },
  });

  it("relit le barème laissé par l'ancienne version, assaini", () => {
    vi.stubGlobal("window", {
      localStorage: faireStockage({
        [CLE]: JSON.stringify({ stat: { atk: 7 }, "Capacité Fantôme": { cost: 1 } }),
      }),
    });
    expect(loadBrowserOverrides()).toEqual({ stat: { atk: 7 } });
    vi.unstubAllGlobals();
  });

  it("OUBLIE le barème local une fois repris", () => {
    // Sans effacement, la proposition de reprise reviendrait à chaque ouverture
    // de l'onglet, alors que les valeurs sont déjà en base.
    const contenu: Record<string, string> = { [CLE]: JSON.stringify({ stat: { atk: 7 } }) };
    vi.stubGlobal("window", { localStorage: faireStockage(contenu) });
    clearBrowserOverrides();
    expect(loadBrowserOverrides()).toEqual({});
    vi.unstubAllGlobals();
  });

  it("rend un barème VIDE si le stockage est illisible", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "{ pas du json" } });
    expect(loadBrowserOverrides()).toEqual({});
    vi.unstubAllGlobals();
  });

  it("ne fait rien côté serveur, où window n'existe pas", () => {
    expect(loadBrowserOverrides()).toEqual({});
    expect(() => clearBrowserOverrides()).not.toThrow();
  });
});
