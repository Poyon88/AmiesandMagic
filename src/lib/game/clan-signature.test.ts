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

/** Carte dont l'effet est ASSEMBLÉ dans la forge : aucune trace dans
 *  `keywords` ni `spell_keywords`, tout vit dans `capabilities`. */
const compose = (content: string, trigger = "on_play") => ({
  capabilities: [{ uid: "cx_0", trigger, abilityId: "_composed", effectKind: "immediate",
    composed: { content, target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "choice" } } }],
} as never);

describe("Classement", () => {
  it("met la plus portée en tête", () => {
    const s = signatureFromCards([
      creature("taunt", "armure"), creature("taunt"), creature("taunt"), creature("armure"),
    ]);
    expect(s[0]).toMatchObject({ id: "taunt", spell: false, count: 3 });
    expect(s[1]).toMatchObject({ id: "armure", spell: false, count: 2 });
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
    // classement d'autant. `deferlement` n'existe que côté sort.
    const s = signatureFromCards([sort("deferlement"), sort("deferlement"), creature("taunt")]);
    expect(s[0]).toMatchObject({ id: "deferlement", spell: true, count: 2 });
  });

  it("RÉUNIT une capacité offerte des deux côtés sous le même nom", () => {
    // Trente-sept ids existent dans les deux registres, et pour tous sauf un
    // c'est la MÊME capacité, offerte sur deux supports : le texte ne diffère
    // que par la façon de nommer sa source (« cette unité » / « ce sort »).
    // Les séparer affichait deux lignes jumelles — « Remontée ×4 · Remontée ×4 »
    // — et coupait le total en deux.
    const s = signatureFromCards([creature("remontee"), sort("remontee")]);
    expect(s).toMatchObject([{ id: "remontee", spell: false, count: 2 }]);
  });

  it("laisse séparée la seule paire qui porte des noms DIFFÉRENTS", () => {
    // Chant est asymétrique : côté créature un marqueur inerte qui habilite les
    // sorts, côté sort le X du bonus. Deux capacités, deux noms, deux lignes.
    const s = signatureFromCards([creature("chant"), sort("chant")]);
    expect(s).toHaveLength(2);
    expect(s.filter((e) => e.spell)).toHaveLength(1);
  });
});

describe("Entrées malformées", () => {
  it("survit aux colonnes vides ou absentes", () => {
    expect(signatureFromCards([{}, { keywords: null }, { spell_keywords: null }])).toEqual([]);
  });

  it("ignore les valeurs vides plutôt que d'afficher une pastille sans nom", () => {
    expect(signatureFromCards([creature(""), sort(""), creature("taunt")]))
      .toMatchObject([{ id: "taunt", spell: false, count: 1 }]);
  });

  it("rend un classement vide sur un clan sans carte", () => {
    expect(signatureFromCards([])).toEqual([]);
  });
});

describe("Les effets COMPOSÉS comptent aussi", () => {
  it("un renvoi en main assemblé compte comme une Remontée", () => {
    // C'est le manque signalé : « Remontée » n'additionnait que les sorts
    // portant le mot-clé. Un composé `bounce` fait pourtant la même chose.
    const s = signatureFromCards([sort("remontee"), compose("bounce")]);
    expect(s).toMatchObject([{ id: "remontee", spell: false, count: 2 }]);
  });

  it("se range sous la capacité INCARNÉE, pas sous une rubrique « composé »", () => {
    const s = signatureFromCards([compose("paralyze"), compose("heal")]);
    expect(s.map((e) => e.id).sort()).toEqual(["entrave", "guerison"]);
    expect(s.every((e) => e.spell)).toBe(true);
  });

  it("respecte le registre d'une capacité propre à un support", () => {
    // `entrave` et `guerison` n'existent QUE côté sort : ils ne doivent pas
    // basculer du côté créature, où ils n'ont ni icône ni traduction.
    const s = signatureFromCards([compose("paralyze"), compose("heal")]);
    expect(s.every((e) => e.spell)).toBe(true);
  });

  it("une carte ne compte qu'UNE fois, mot-clé ET composé confondus", () => {
    // Sinon une carte qui porte Poison et pose un composé Poison pèserait
    // double dans le classement de son clan.
    const carte = { keywords: ["poison"], capabilities: (compose("poison") as { capabilities: unknown }).capabilities };
    expect(signatureFromCards([carte as never])).toMatchObject([{ id: "poison", spell: false, count: 1 }]);
  });

  it("ignore les capacités NON composées — déjà couvertes par les colonnes", () => {
    // `capabilities` double souvent `keywords` (même abilityId) : les compter
    // ici gonflerait chaque total.
    const carte = { keywords: ["raid"], capabilities: [
      { uid: "cw_0", trigger: "automatic", abilityId: "raid", effectKind: "immediate" },
    ] } as never;
    expect(signatureFromCards([carte])).toMatchObject([{ id: "raid", spell: false, count: 1 }]);
  });

  it("saute un composé dont l'effet n'a pas d'icône connue", () => {
    expect(signatureFromCards([compose("effet_inconnu")])).toEqual([]);
  });
});

describe("Le déclencheur DOMINANT teinte l'icône", () => {
  /** Créature portant `kw` sous un mode explicite. */
  const avecMode = (kw: string, mode: string) => ({
    keywords: [kw], keyword_instances: [{ id: kw, mode }],
  } as never);

  it("retient le déclencheur le plus représenté dans le clan", () => {
    // Une capacité n'a pas de couleur en soi : un Renforcement à l'attaque
    // n'est pas un Renforcement à l'entrée. C'est l'usage du clan qui tranche.
    const s = signatureFromCards([
      avecMode("renforcement", "attack"),
      avecMode("renforcement", "attack"),
      avecMode("renforcement", "entry"),
    ]);
    expect(s[0]).toMatchObject({ id: "renforcement", count: 3, dominant: "attack" });
  });

  it("laisse BLANC en cas d'égalité, et NE DIT RIEN", () => {
    // Départager au hasard entre deux usages aussi fréquents afficherait une
    // couleur qui ne veut rien dire. `null` — pas « permanent » : annoncer
    // « (Permanent) » là où deux déclencheurs se valent serait faux.
    const s = signatureFromCards([avecMode("renforcement", "attack"), avecMode("renforcement", "entry")]);
    expect(s[0].dominant).toBeNull();
  });

  it("distingue l'égalité d'un PASSIF majoritaire", () => {
    // Les deux restent blancs, mais l'un affirme « Permanent » et l'autre pas.
    expect(signatureFromCards([creature("armure")])[0].dominant).toBe("permanent");
  });

  it("retombe sur la nature du mot-clé quand aucun mode n'est stocké", () => {
    // Cycle éternel n'a pas de mode en base ; c'est pourtant un râle d'agonie.
    expect(signatureFromCards([creature("cycle_eternel")])[0].dominant).toBe("death");
    expect(signatureFromCards([creature("armure")])[0].dominant).toBe("permanent");
  });

  it("compte un mot-clé de SORT comme déclenché au lancement", () => {
    expect(signatureFromCards([sort("deferlement")])[0].dominant).toBe("spell");
  });

  it("prend le déclencheur d'un composé sur SA capacité", () => {
    expect(signatureFromCards([compose("bounce", "on_attack")])[0].dominant).toBe("attack");
  });

  it("une carte portant la capacité sous DEUX déclencheurs les compte tous deux", () => {
    const carte = {
      keywords: ["renforcement"],
      keyword_instances: [{ id: "renforcement", mode: "attack" }, { id: "renforcement", mode: "death" }],
    } as never;
    // Une seule carte, donc un seul point au classement — mais deux voix pour
    // le déclencheur, qui s'annulent ici.
    const s = signatureFromCards([carte]);
    expect(s[0].count).toBe(1);
    expect(s[0].dominant).toBeNull();
  });
});
