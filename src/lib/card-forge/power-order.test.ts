import { describe, expect, it } from "vitest";
import { movePowerInKeywords } from "./power-order";

describe("movePowerInKeywords", () => {
  const pouvoirs = ["divination", "preincanter", "inspiration"];

  it("remonte un pouvoir d'un rang", () => {
    expect(movePowerInKeywords(pouvoirs, "preincanter", -1, pouvoirs))
      .toEqual(["preincanter", "divination", "inspiration"]);
  });

  it("descend un pouvoir d'un rang", () => {
    expect(movePowerInKeywords(pouvoirs, "divination", 1, pouvoirs))
      .toEqual(["preincanter", "divination", "inspiration"]);
  });

  it("ne fait rien en bout de liste", () => {
    expect(movePowerInKeywords(pouvoirs, "divination", -1, pouvoirs)).toEqual(pouvoirs);
    expect(movePowerInKeywords(pouvoirs, "inspiration", 1, pouvoirs)).toEqual(pouvoirs);
  });

  it("rend un NOUVEAU tableau, sans muter l'entrée", () => {
    const source = [...pouvoirs];
    const suivant = movePowerInKeywords(source, "preincanter", -1, pouvoirs);
    expect(source).toEqual(pouvoirs); // intact
    expect(suivant).not.toBe(source);
  });
});

describe("movePowerInKeywords — les passifs intercalés sont préservés", () => {
  // `keywords[]` mêle pouvoirs curés et passifs ; le panneau n'affiche que les
  // premiers. Reconstruire le tableau depuis la seule liste visible aurait perdu
  // les seconds — c'est tout l'objet de cette fonction.
  const complet = ["armure", "divination", "vol", "preincanter", "ombre", "inspiration"];
  const affiches = ["divination", "preincanter", "inspiration"];

  it("échanger deux pouvoirs NON adjacents dans le tableau complet garde les passifs", () => {
    const suivant = movePowerInKeywords(complet, "preincanter", -1, affiches);
    // divination et preincanter ont permuté ; armure, vol, ombre n'ont pas bougé.
    expect(suivant).toEqual(["armure", "preincanter", "vol", "divination", "ombre", "inspiration"]);
  });

  it("aucun mot-clé n'est perdu ni dupliqué, quel que soit le déplacement", () => {
    for (const kw of affiches) {
      for (const sens of [-1, 1] as const) {
        const suivant = movePowerInKeywords(complet, kw, sens, affiches);
        expect(suivant).toHaveLength(complet.length);
        expect([...suivant].sort()).toEqual([...complet].sort());
      }
    }
  });

  it("l'ordre des pouvoirs AFFICHÉS suit bien le déplacement demandé", () => {
    const suivant = movePowerInKeywords(complet, "inspiration", -1, affiches);
    const visibles = suivant.filter((k) => affiches.includes(k));
    expect(visibles).toEqual(["divination", "inspiration", "preincanter"]);
  });
});

describe("movePowerInKeywords — entrées douteuses", () => {
  it("un id absent des voisins ne change rien", () => {
    const kws = ["a", "b"];
    expect(movePowerInKeywords(kws, "zzz", 1, kws)).toEqual(kws);
  });

  it("un voisin absent du tableau complet ne change rien (donnée incohérente)", () => {
    expect(movePowerInKeywords(["a"], "a", 1, ["a", "fantome"])).toEqual(["a"]);
  });

  it("une liste d'un seul pouvoir est inerte", () => {
    expect(movePowerInKeywords(["a"], "a", -1, ["a"])).toEqual(["a"]);
    expect(movePowerInKeywords(["a"], "a", 1, ["a"])).toEqual(["a"]);
  });
});
