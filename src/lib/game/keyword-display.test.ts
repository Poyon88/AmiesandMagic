import { describe, it, expect } from "vitest";
import { describeKeyword, describeKeywordLabel, MARKERS_FR } from "./keyword-display";
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { KEYWORD_DESC_BY_ID } from "./abilities";
import type { Card, TokenTemplate } from "./types";

const card = (over: Partial<Card> = {}) => over as Card;

describe("describeKeyword — valeurs concrètes", () => {
  it("nomme la race au singulier avec son article", () => {
    const d = describeKeyword("appel_supreme", { card: card({ race: "Démons" }) });
    expect(d).toBe(
      "Ajoute en main le Démon au coût le plus élevé de votre deck (au hasard si égalité).",
    );
  });

  it("élide l'article devant une voyelle", () => {
    const d = describeKeyword("appel_supreme", { card: card({ race: "Elfes" }) });
    expect(d).toContain("l'Elfe");
  });

  // Seule race stockée au singulier : ne doit pas être « dé-pluralisée ».
  it("gère Élémentaire, déjà singulier en base", () => {
    const d = describeKeyword("appel_supreme", { card: card({ race: "Élémentaire" }) });
    expect(d).toContain("l'Élémentaire");
  });

  // h aspiré : « le Hobbit », pas « l'Hobbit ».
  it("n'élide pas devant un h aspiré", () => {
    const d = describeKeyword("appel_supreme", { card: card({ race: "Hobbits" }) });
    expect(d).toContain("le Hobbit");
    expect(d).not.toContain("l'Hobbit");
  });

  it("place le qualificatif post-nominal au pluriel des formes nues", () => {
    expect(describeKeyword("loyaute", { card: card({ race: "Démons" }) }))
      .toBe("+1/+1 par allié Démon en jeu.");
  });

  it("emploie le pluriel après déterminant", () => {
    expect(describeKeyword("martyr", { card: card({ race: "Démons" }) }))
      .toBe("+1/+1 permanent à vos Démons en jeu.");
  });

  it("Entraide lit entraide_race, pas la race de la carte", () => {
    const d = describeKeyword("entraide", {
      card: card({ race: "Démons", entraide_race: "Elfes" }),
    });
    expect(d).toContain("Elfe");
    expect(d).not.toContain("Démon");
  });

  it("la race de l'instance prime sur celle de la carte", () => {
    const d = describeKeyword("appel_supreme", {
      card: card({ race: "Démons" }),
      instance: { id: "appel_supreme", race: "Nains" },
    });
    expect(d).toContain("le Nain");
    expect(d).not.toContain("Démon");
  });

  it("nomme le clan avec son article contracté", () => {
    const d = describeKeyword("appel_du_clan", { card: card({ clan: "L'Empire de Jade" }), x: 3 });
    expect(d).toContain("de l'Empire de Jade");
    expect(d).toContain("≤ 3");
  });

  it("nomme la faction", () => {
    expect(describeKeyword("commandement", { card: card({ faction: "Humains" }) }))
      .toBe("+1/+1 à vos alliés des Royaumes Libres.");
  });

  it("nomme l'alignement effectif", () => {
    const d = describeKeyword("selection", { card: card({ faction: "Elfes" }), x: 2 });
    expect(d).toContain("d'alignement");
    expect(d).not.toContain("{alignment}");
  });
});

describe("describeKeyword — replis génériques", () => {
  // Cas nominal de la forge : la carte n'a pas encore de race choisie.
  it("retombe sur l'ancienne formulation générique", () => {
    expect(describeKeyword("appel_supreme", { card: card({}) })).toBe(
      "Ajoute en main la créature de la race choisie au coût le plus élevé de votre deck (au hasard si égalité).",
    );
  });

  it("le repli post-nominal reste grammatical", () => {
    expect(describeKeyword("loyaute", { card: card({}) }))
      .toBe("+1/+1 par allié de même race en jeu.");
  });

  it("ne laisse jamais de marqueur brut, quelle que soit la capacité", () => {
    for (const kw of Object.keys(KEYWORD_DESC_BY_ID)) {
      const out = describeKeyword(kw as never, { card: card({}) });
      expect(out, kw).not.toMatch(/\{\w+\}/);
    }
  });

  it("substitue X à l'intérieur d'un repli porteur de gabarit", () => {
    // « un token X/X » est un REPLI, pas le gabarit : il doit quand même
    // recevoir la valeur X (d'où l'ordre marqueurs → X).
    const d = describeKeyword("lycanthropie", { card: card({}), x: 4 });
    expect(d).toBe("Se transforme en un token 4/4 avec Traque.");
  });
});

describe("describeKeyword — convocations (non-régression)", () => {
  const tokens = [
    { id: 7, name: "Gobelin", attack: 1, health: 1, keywords: [] },
  ] as unknown as TokenTemplate[];

  it("résout le token configuré", () => {
    const d = describeKeyword("convocation_simple", {
      card: card({ convocation_token_id: 7 }),
      tokens,
    });
    expect(d).toBe("Crée un token Gobelin 1/1.");
  });

  it("Convocation X force les stats du token à X/X", () => {
    const d = describeKeyword("convocation", {
      card: card({ convocation_token_id: 7 }),
      tokens,
      x: 3,
    });
    expect(d).toBe("Crée un token Gobelin 3/3.");
  });

  it("compose la liste des convocations multiples", () => {
    const d = describeKeyword("convocations_multiples", {
      card: card({ convocation_tokens: [{ token_id: 7 }, { token_id: 7 }] }),
      tokens,
    });
    expect(d).toContain("2 tokens Gobelin 1/1");
  });
});

describe("describeKeywordLabel", () => {
  it("suffixe Entraide de sa race, localisée", () => {
    expect(describeKeywordLabel("entraide", { card: card({ entraide_race: "Elfes" }) }))
      .toBe("Entraide (Elfes)");
  });

  it("laisse les autres mots-clés intacts", () => {
    expect(describeKeywordLabel("loyaute", { card: card({ race: "Démons" }) }))
      .toBe("Loyauté");
  });
});

describe("contrat des descriptions", () => {
  it("tout marqueur employé a un repli déclaré", () => {
    const used = new Set<string>();
    for (const desc of Object.values(KEYWORD_DESC_BY_ID)) {
      for (const m of desc.matchAll(/\{(\w+)\}/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const key of used) expect(MARKERS_FR, key).toHaveProperty(key);
  });

  it("aucune description ne dépasse 120 caractères une fois substituée", () => {
    const ctx = {
      card: card({ race: "Guerriers du Chaos", clan: "Les Gardiens de la Montagne", faction: "Humains" }),
      x: 3,
    };
    const long = Object.keys(KEYWORD_DESC_BY_ID)
      .map((kw) => [kw, describeKeyword(kw as never, ctx) ?? ""] as const)
      .filter(([, d]) => d.length > 120);
    expect(long.map(([kw, d]) => `${kw} (${d.length})`)).toEqual([]);
  });

  it("chaque race connue a ses formes fléchies", () => {
    // Empêche qu'une race ajoutée plus tard n'affiche que son pluriel.
    const fr = require("../../../messages/fr.json");
    for (const race of Object.keys(fr.vocab.races)) {
      expect(RACE_FORMS_FR, race).toHaveProperty(race);
    }
  });
});
