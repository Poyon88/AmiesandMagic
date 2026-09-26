// APPEL composé : met en jeu, depuis le DECK, la 1re unité de coût ≤ X qui
// satisfait un filtre de pool.
//
// Généralise le mot-clé « Appel du clan », dont le résolveur curé ne sait viser
// que le clan de sa PROPRE carte (`ctx.card.clan`) — impossible d'écrire « un
// sort qui appelle une unité Elfe » sur une carte qui n'est pas elfe. Ici la
// cible se déclare, et le même contenu marche sur un sort comme sur une
// créature, à n'importe quel déclencheur.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { composedIcon, composedKeywordName, describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedPoolFilter, GameState } from "./types";

function sortAppel(x: number, pool?: ComposedPoolFilter): CardInstance {
  const caps = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "appel", magnitude: { x }, ...(pool ? { pool } : {}) },
  }] as unknown as Capability[];
  return mkInstance(mkCard({
    name: "Le Cor", card_type: "spell", attack: null, health: null,
    // Le sort n'a NI race NI clan : c'est tout l'intérêt — le mot-clé curé
    // n'aurait rien pu appeler.
    capabilities: caps as never,
  }));
}

const unite = (nom: string, cout: number, p: Record<string, unknown> = {}) =>
  mkInstance(mkCard({ name: nom, mana_cost: cout, attack: 1, health: 1, ...p }));

function lancer(deck: CardInstance[], x: number, pool?: ComposedPoolFilter): GameState {
  const s = mkState();
  s.players[0].deck = deck;
  const sort = sortAppel(x, pool);
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
}

const surPlateau = (s: GameState) => s.players[0].board.map(c => c.card.name);

describe("appel depuis le deck", () => {
  it("met en jeu la 1re unité de coût ≤ X", () => {
    const s = lancer([unite("Chère", 7), unite("Juste", 2), unite("Autre", 1)], 2);
    expect(surPlateau(s)).toEqual(["Juste"]);
    // Elle QUITTE le deck.
    expect(s.players[0].deck.map(c => c.card.name)).toEqual(["Chère", "Autre"]);
  });

  it("filtre par RACE — le cas demandé, sur un sort sans race", () => {
    const s = lancer([
      unite("Nain", 2, { race: "Nains" }),
      unite("Elfe", 2, { race: "Elfes" }),
    ], 2, { race: "Elfes" });
    expect(surPlateau(s)).toEqual(["Elfe"]);
  });

  it("filtre aussi par clan, faction et mot-clé porté", () => {
    expect(surPlateau(lancer([unite("A", 1, { clan: "X" }), unite("B", 1, { clan: "Y" })], 3, { clan: "Y" })))
      .toEqual(["B"]);
    expect(surPlateau(lancer([unite("A", 1, { faction: "Elfes" }), unite("B", 1, { faction: "Nains" })], 3, { faction: "Nains" })))
      .toEqual(["B"]);
    expect(surPlateau(lancer([
      unite("Sans", 1),
      unite("Avec", 1, { keywords: ["taunt"] as never }),
    ], 3, { keywordId: "taunt" }))).toEqual(["Avec"]);
  });

  it("cumule les filtres", () => {
    const s = lancer([
      unite("Elfe cher", 9, { race: "Elfes" }),
      unite("Nain juste", 2, { race: "Nains" }),
      unite("Elfe juste", 2, { race: "Elfes" }),
    ], 2, { race: "Elfes" });
    expect(surPlateau(s)).toEqual(["Elfe juste"]);
  });

  it("n'appelle RIEN quand aucune unité ne convient — sans planter", () => {
    expect(surPlateau(lancer([unite("Trop chère", 9)], 2))).toEqual([]);
    expect(surPlateau(lancer([], 2))).toEqual([]);
    // Un SORT dans le deck n'est jamais appelé.
    expect(surPlateau(lancer([mkInstance(mkCard({ name: "Sort", card_type: "spell", mana_cost: 1, attack: null, health: null }))], 5)))
      .toEqual([]);
  });

  it("l'appelée garde sa Traque — elle n'attaque pas le tour même", () => {
    // Une unité mise en jeu GRATUITEMENT ne doit pas frapper aussitôt ; c'est le
    // garde-fou que porte déjà le chemin curé.
    const s = lancer([unite("Normale", 1)], 2);
    expect(s.players[0].board[0].hasSummoningSickness).toBe(true);
  });

  it("…sauf si elle porte Traque (charge)", () => {
    const s = lancer([unite("Rapide", 1, { keywords: ["charge"] as never })], 2);
    expect(s.players[0].board[0].hasSummoningSickness).toBe(false);
  });
});

describe("texte de carte", () => {
  const cap = (x: number, pool?: ComposedPoolFilter) => ({
    uid: "u", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "appel", magnitude: { x }, ...(pool ? { pool } : {}) },
  } as unknown as Capability);

  it("dit le plafond de coût", () => {
    expect(describeComposedCap(cap(2))).toBe("Met en jeu la 1re unité de votre deck de coût ≤ 2.");
  });

  it("accole le filtre de pool", () => {
    expect(describeComposedCap(cap(2, { race: "Elfes" }))).toContain("Elfes");
  });

  it("s'accorde avec une amplitude ALÉATOIRE", () => {
    const c = { ...cap(4), composed: { content: "appel", magnitude: { x: 4, randomX: true } } } as unknown as Capability;
    expect(describeComposedCap(c)).toContain("1 à 4");
  });
});

describe("icône sur la carte", () => {
  const cap = {
    uid: "u", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "appel", magnitude: { x: 2 }, pool: { race: "Elfes" } },
  } as unknown as Capability;

  it("emprunte l'icône et le nom d'« Appel du clan »", () => {
    // Sans entrée dédiée, le contenu tombait sur le repli générique « ✦ », qui
    // ne dit rien de ce que l'effet fait — la carte n'affichait qu'une étoile.
    expect(composedIcon(cap)).toEqual({ symbol: "📯", keyword: "appel_du_clan" });
    expect(composedKeywordName(cap)).toBe("Appel du clan");
  });

  it("n'est PAS le repli générique", () => {
    expect(composedIcon(cap).symbol).not.toBe("✦");
    expect(composedIcon(cap).keyword).not.toBe("");
  });
});

describe("appel d'un OBJET (filtre de type « Objets »)", () => {
  const objet = (nom: string, cout: number, p: Record<string, unknown> = {}) =>
    mkInstance(mkCard({ name: nom, card_type: "item", mana_cost: cout, attack: null, health: null, ...p }));

  it("pose le 1er objet de coût ≤ X dans une place, non équipé, et laisse les unités", () => {
    const s = lancer([unite("Soldat", 1), objet("Cher", 5), objet("Épée", 2), objet("Anneau", 1)], 2, { cardType: "item" });
    expect(surPlateau(s)).toEqual([]);
    const items = s.players[0].items ?? [];
    expect(items.map(c => c.card.name)).toEqual(["Épée"]);
    expect(items[0].equippedToInstanceId ?? null).toBeNull();
    expect(s.players[0].deck.map(c => c.card.name)).toEqual(["Soldat", "Cher", "Anneau"]);
  });

  it("sans filtre de type, l'Appel ignore les objets et appelle une unité", () => {
    const s = lancer([objet("Épée", 1), unite("Soldat", 1)], 2);
    expect(surPlateau(s)).toEqual(["Soldat"]);
    expect(s.players[0].items ?? []).toHaveLength(0);
  });

  it("l'objet occupe une place : plateau plein ⇒ rien n'est posé", () => {
    const s = mkState();
    s.players[0].board = Array.from({ length: 8 }, (_, i) => unite(`U${i}`, 1));
    s.players[0].deck = [objet("Épée", 1)];
    const sort = sortAppel(2, { cardType: "item" });
    s.players[0].hand.push(sort);
    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
    expect(next.players[0].items ?? []).toHaveLength(0);
    expect(next.players[0].deck).toHaveLength(1);
  });

  it("le texte nomme l'objet, sans « unité … de type objet »", () => {
    const c = {
      uid: "u", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "appel", magnitude: { x: 2 }, pool: { cardType: "item" } },
    } as unknown as Capability;
    expect(describeComposedCap(c)).toBe("Met en jeu le 1er objet de votre deck de coût ≤ 2.");
  });
});

describe("appel suprême d'un OBJET", () => {
  it("met en main l'objet le plus cher du deck", () => {
    const s = mkState();
    s.players[0].deck = [
      mkInstance(mkCard({ name: "Géant", mana_cost: 9, attack: 5, health: 5 })),
      mkInstance(mkCard({ name: "Épée", card_type: "item", mana_cost: 2, attack: null, health: null })),
      mkInstance(mkCard({ name: "Anneau", card_type: "item", mana_cost: 1, attack: null, health: null })),
    ];
    const sort = mkInstance(mkCard({
      name: "Le Grand Cor", card_type: "spell", attack: null, health: null,
      capabilities: [{
        uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "appel_supreme", magnitude: { x: 0 }, pool: { cardType: "item" } },
      }] as never,
    }));
    s.players[0].hand.push(sort);
    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
    expect(next.players[0].hand.map(c => c.card.name)).toEqual(["Épée"]);
  });
});
