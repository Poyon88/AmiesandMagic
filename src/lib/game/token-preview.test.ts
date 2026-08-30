// Le token créé par une capacité : son NOM dans la phrase, son VERSO au survol.
//
// Le descriptif l'écrivait en toutes lettres — « 3 tokens Archer Sylvain 1/1
// (Vol, Provocation) ». La ligne s'allongeait à chaque mot-clé, et depuis que
// les jetons acceptent des EFFETS COMPOSÉS, aucune phrase ne peut plus les
// décrire. Le verso, lui, les montre comme ceux de n'importe quelle créature.
import { describe, expect, it } from "vitest";
import { formatConvocationToken, formatConvocationTokens } from "./spell-keywords";
import { tokenCardsForComposed, tokenCardsForKeyword, tokenTemplateToCard } from "./token-preview";
import type { Capability, Card, TokenTemplate } from "./types";

const ARCHER: TokenTemplate = {
  id: 9, race: "Elfes", faction: "Elfes", clan: null, name: "Archer Sylvain",
  attack: 1, health: 1, image_url: null, keywords: ["vol", "taunt"] as never,
};
const LOUP: TokenTemplate = {
  id: 12, race: "Hommes-Loups", faction: null, clan: null, name: "Loup",
  attack: 2, health: 2, image_url: null, keywords: [] as never,
};
const REGISTRE = [ARCHER, LOUP];

const carte = (p: Record<string, unknown>) => p as unknown as Card;

describe("le texte ne garde que le nom", () => {
  it("ni stats ni mots-clés dans la phrase", () => {
    const texte = formatConvocationTokens(
      [{ token_id: 9 }, { token_id: 9 }, { token_id: 9 }] as never, REGISTRE,
    );
    expect(texte).toBe("3 tokens Archer Sylvain");
    expect(texte).not.toMatch(/1\/1/);
    expect(texte).not.toMatch(/Vol|Provocation/i);
  });

  it("vaut aussi pour un token unique", () => {
    expect(formatConvocationToken(9, REGISTRE)).toBe("un token Archer Sylvain");
    // Convocation X crée un X/X : la valeur part dans la pastille, pas la phrase.
    expect(formatConvocationToken(9, REGISTRE, 3)).toBe("un token Archer Sylvain");
  });

  it("groupe toujours les tokens différents", () => {
    expect(formatConvocationTokens([{ token_id: 9 }, { token_id: 12 }] as never, REGISTRE))
      .toBe("un token Archer Sylvain et un token Loup");
  });
});

describe("carte d'aperçu d'un token", () => {
  it("porte les stats, les mots-clés ET les effets composés", () => {
    // Les effets composés sont la raison d'être de l'aperçu : c'est justement ce
    // qu'aucune phrase ne savait dire.
    const cap = { uid: "cx_0", trigger: "on_death", effectKind: "immediate",
      abilityId: "_composed", composed: { content: "deal_damage", magnitude: { x: 2 } } } as unknown as Capability;
    const c = tokenTemplateToCard({ ...ARCHER, capabilities: [cap] });

    expect(c.name).toBe("Archer Sylvain");
    expect(c.attack).toBe(1);
    expect(c.keywords).toContain("vol");
    expect(c.capabilities).toHaveLength(1);
    // Une créature de coût nul : un jeton ne se paie pas.
    expect(c.mana_cost).toBe(0);
    expect(c.card_type).toBe("creature");
  });

  it("prend les stats SURCHARGÉES quand on les lui donne", () => {
    expect(tokenTemplateToCard(ARCHER, 4, 5).attack).toBe(4);
    expect(tokenTemplateToCard(ARCHER, 4, 5).health).toBe(5);
  });
});

describe("résolution par capacité", () => {
  it("Convocations multiples lit la liste, et DÉDOUBLONNE", () => {
    // « 3 tokens Archer Sylvain » ne doit montrer qu'UNE pastille : le nombre
    // est déjà dans la phrase, et trois survols montreraient trois fois le même
    // verso.
    const cards = tokenCardsForKeyword("convocations_multiples",
      carte({ convocation_tokens: [{ token_id: 9 }, { token_id: 9 }, { token_id: 12 }] }), REGISTRE);
    expect(cards.map(c => c.name)).toEqual(["Archer Sylvain", "Loup"]);
  });

  it("garde DEUX pastilles quand les stats diffèrent", () => {
    const cards = tokenCardsForKeyword("convocations_multiples",
      carte({ convocation_tokens: [{ token_id: 9 }, { token_id: 9, attack: 5, health: 5 }] }), REGISTRE);
    expect(cards).toHaveLength(2);
    expect(cards[1].attack).toBe(5);
  });

  it("Convocation X applique sa surcharge de stats à l'aperçu", () => {
    // La phrase ne dit plus « 3/3 » : si la pastille ne le portait pas, la
    // valeur disparaîtrait de l'écran.
    const cards = tokenCardsForKeyword("convocation", carte({ convocation_token_id: 9 }), REGISTRE, 3);
    expect(cards[0].attack).toBe(3);
    expect(cards[0].health).toBe(3);
  });

  it("Lycanthropie lit sa propre colonne", () => {
    expect(tokenCardsForKeyword("lycanthropie", carte({ lycanthropie_token_id: 12 }), REGISTRE)[0].name)
      .toBe("Loup");
  });

  it("rend une liste VIDE là où il n'y a rien à montrer", () => {
    expect(tokenCardsForKeyword("vol", carte({}), REGISTRE)).toEqual([]);
    expect(tokenCardsForKeyword("convocation", carte({}), REGISTRE)).toEqual([]);
    // Token configuré mais absent du registre : pas de pastille fantôme.
    expect(tokenCardsForKeyword("convocation", carte({ convocation_token_id: 999 }), REGISTRE)).toEqual([]);
    expect(tokenCardsForKeyword("convocation", null, REGISTRE)).toEqual([]);
  });
});

describe("effet composé summon_token", () => {
  it("rend le token invoqué", () => {
    expect(tokenCardsForComposed({ content: "summon_token", tokenId: 12 } as never, REGISTRE)[0].name)
      .toBe("Loup");
  });

  it("ignore tout autre contenu", () => {
    expect(tokenCardsForComposed({ content: "deal_damage", tokenId: 12 } as never, REGISTRE)).toEqual([]);
    expect(tokenCardsForComposed(undefined, REGISTRE)).toEqual([]);
  });
});
