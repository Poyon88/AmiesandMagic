// Le classement des capacités d'un clan se fait sur les CARTES.
//
// Il se lisait auparavant dans `clanProfiles.likelyKeywords`, c'est-à-dire dans
// l'intention du générateur. Les deux divergent : L'Ordre de l'Aube plaçait
// Bénédiction en deuxième position, une seule de ses cartes la porte. Ce qui
// est mis en avant doit refléter ce qu'on trouve vraiment dans le clan.
import { describe, expect, it } from "vitest";
import { signatureFromCards, SIGNATURE_MAX } from "./clan-signature";

const creature = (...kws: string[]) => ({ keywords: kws });
const sort = (...ids: string[]) => ({ spell_keywords: ids.map((id) => ({ id })) });

describe("Classement", () => {
  it("met la plus portée en tête", () => {
    const s = signatureFromCards([
      creature("taunt", "armure"), creature("taunt"), creature("taunt"), creature("armure"),
    ]);
    expect(s[0]).toEqual({ id: "taunt", spell: false, count: 3 });
    expect(s[1]).toEqual({ id: "armure", spell: false, count: 2 });
  });

  it("en retient six par défaut", () => {
    const cartes = Array.from({ length: 12 }, (_, i) => creature(`kw_${i}`));
    expect(signatureFromCards(cartes)).toHaveLength(SIGNATURE_MAX);
    expect(SIGNATURE_MAX).toBe(6);
  });

  it("compte des CARTES, pas des occurrences", () => {
    // Une carte qui porterait deux fois la même capacité ne la rend pas deux
    // fois plus emblématique du clan.
    expect(signatureFromCards([creature("fureur", "fureur")])[0].count).toBe(1);
  });

  it("départage les égalités de façon STABLE", () => {
    // Sur un clan d'une trentaine de cartes, les premières places tiennent
    // souvent à une unité : sans ordre de repli, deux rendus de la même page
    // pourraient différer.
    const cartes = [creature("zeta"), creature("alpha")];
    expect(signatureFromCards(cartes).map((e) => e.id)).toEqual(["alpha", "zeta"]);
  });
});

describe("Les deux registres", () => {
  it("comptent les capacités de SORT aussi", () => {
    // Un quart des cartes d'un clan sont des sorts. Les ignorer amputerait le
    // classement d'autant.
    const s = signatureFromCards([sort("impact"), sort("impact"), creature("taunt")]);
    expect(s[0]).toEqual({ id: "impact", spell: true, count: 2 });
  });

  it("ne confond PAS une capacité homonyme des deux côtés", () => {
    // `incineration` existe en créature ET en sort, et n'y désigne pas la même
    // chose : les fusionner inventerait une capacité deux fois plus fréquente
    // qu'elle ne l'est, et afficherait la mauvaise icône.
    const s = signatureFromCards([creature("incineration"), sort("incineration")]);
    expect(s).toHaveLength(2);
    expect(s.filter((e) => e.spell)).toHaveLength(1);
    expect(s.every((e) => e.count === 1)).toBe(true);
  });
});

describe("Entrées malformées", () => {
  it("survit aux colonnes vides ou absentes", () => {
    expect(signatureFromCards([{}, { keywords: null }, { spell_keywords: null }])).toEqual([]);
  });

  it("ignore les valeurs vides plutôt que d'afficher une pastille sans nom", () => {
    expect(signatureFromCards([creature(""), sort(""), creature("taunt")]))
      .toEqual([{ id: "taunt", spell: false, count: 1 }]);
  });

  it("rend un classement vide sur un clan sans carte", () => {
    expect(signatureFromCards([])).toEqual([]);
  });
});
