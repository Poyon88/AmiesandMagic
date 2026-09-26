// OBJETS comme cibles et produits des effets composés, et des actions
// classiques Remontée / Retour différé / Silence.
import { describe, expect, it } from "vitest";
import { applyAction, getSpellTargets } from "./engine";
import { describeComposedCap } from "./composed-display";
import { objetsDe } from "./items";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, ComposedEffect, GameAction, GameState, SpellKeywordInstance, TargetSpec } from "./types";

const objet = (name: string, atk: number, pv: number, over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({ name, card_type: "item", mana_cost: 2, attack: atk, health: pv, faction: "Humains", equip_cost: 0, rarity: "Commune", ...over }));
const creature = (name: string, atk = 1, pv = 3): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 1, attack: atk, health: pv, faction: "Humains" }));
const cible = (over: Partial<TargetSpec>): TargetSpec =>
  ({ entity: "item", count: "all", side: "ally", location: "board", designation: "automatic", ...over }) as TargetSpec;

function sortCompose(composed: ComposedEffect): CardInstance {
  const cap = { uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed } as Capability;
  return mkInstance(mkCard({ name: "Sort", card_type: "spell", attack: null, health: null, mana_cost: 0, faction: "Humains", capabilities: [cap] as never }));
}
function jouer(s: GameState, sort: CardInstance, targetMap?: Record<string, string>): GameState {
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId, ...(targetMap ? { targetMap } : {}) } as GameAction);
}
/** Joueur 0 : un Soldat porte une Épée (+2/+1, Traque). Joueur 1 : un Garde porte une Hache (+1/+0). */
function table(): GameState {
  const s = mkState();
  const soldat = creature("Soldat"); const epee = objet("Épée", 2, 1, { keywords: ["charge"] as unknown as Card["keywords"] });
  const garde = creature("Garde"); const hache = objet("Hache", 1, 0);
  s.players[0].board.push(soldat); s.players[0].items = [epee];
  s.players[1].board.push(garde); s.players[1].items = [hache];
  epee.equippedToInstanceId = soldat.instanceId;
  hache.equippedToInstanceId = garde.instanceId;
  // Un passage par une action neutre recalcule les bonus d'équipement.
  return jouer(s, sortCompose({ content: "gain_mana", magnitude: { x: 0 } }));
}
const unite = (s: GameState, p: number, nom: string) => s.players[p].board.find(c => c.card.name === nom)!;

describe("Buff composé sur un objet", () => {
  it("l'objet donne plus : son porteur en profite", () => {
    const s = table();
    expect(unite(s, 0, "Soldat").currentAttack).toBe(3);
    const apres = jouer(s, sortCompose({ content: "buff", magnitude: { x: 1, y: 2 }, target: cible({}) }));
    expect(objetsDe(apres.players[0])[0].card.attack).toBe(3);
    expect(unite(apres, 0, "Soldat").currentAttack).toBe(4);
    expect(unite(apres, 0, "Soldat").maxHealth).toBe(6); // 3 + 1 + 2
  });
  it("type « Unité » : l'objet n'est pas touché", () => {
    const s = table();
    const apres = jouer(s, sortCompose({ content: "buff", magnitude: { x: 1, y: 1 }, target: cible({ entity: "unit" }) }));
    expect(objetsDe(apres.players[0])[0].card.attack).toBe(2);
  });
});

describe("Renvoi / Retour différé / Silence composés sur un objet", () => {
  it("renvoi : l'objet adverse revient dans la main de son propriétaire, déséquipé", () => {
    const s = table();
    const apres = jouer(s, sortCompose({ content: "bounce", target: cible({ side: "enemy" }) }));
    expect(objetsDe(apres.players[1])).toHaveLength(0);
    expect(apres.players[1].hand.map(c => c.card.name)).toContain("Hache");
    expect(unite(apres, 1, "Garde").currentAttack).toBe(1);
  });
  it("retour différé : sous le deck de son propriétaire", () => {
    const s = table();
    const apres = jouer(s, sortCompose({ content: "retour_differe", target: cible({ side: "enemy" }) }));
    expect(apres.players[1].deck[apres.players[1].deck.length - 1].card.name).toBe("Hache");
  });
  it("silence : l'objet perd ses mots-clés, garde ses caractéristiques", () => {
    const s = table();
    expect((unite(s, 0, "Soldat").card.keywords as unknown as string[])).toContain("charge");
    const apres = jouer(s, sortCompose({ content: "silence", target: cible({}) }));
    const epee = objetsDe(apres.players[0])[0];
    expect(epee.card.keywords).toEqual([]);
    expect(epee.card.attack).toBe(2);
    expect((unite(apres, 0, "Soldat").card.keywords as unknown as string[])).not.toContain("charge");
    expect(unite(apres, 0, "Soldat").currentAttack).toBe(3);
  });
});

describe("Exhumation / Rappel composés d'un objet", () => {
  it("exhumation : l'objet du cimetière revient sur la table, non équipé", () => {
    const s = table();
    s.players[0].graveyard.push(objet("Heaume", 0, 2));
    const apres = jouer(s, sortCompose({ content: "exhumation", magnitude: { x: 5 }, target: cible({ location: "graveyard", count: 1 }) }));
    const heaume = objetsDe(apres.players[0]).find(o => o.card.name === "Heaume");
    expect(heaume).toBeDefined();
    expect(heaume!.equippedToInstanceId ?? null).toBeNull();
  });
  it("rappel : l'objet du cimetière revient en main ; une créature du cimetière reste", () => {
    const s = table();
    s.players[0].graveyard.push(objet("Heaume", 0, 2), creature("Mort"));
    const apres = jouer(s, sortCompose({ content: "rappel", target: cible({ location: "graveyard", count: "all" }) }));
    expect(apres.players[0].hand.map(c => c.card.name)).toContain("Heaume");
    expect(apres.players[0].graveyard.map(c => c.card.name)).toContain("Mort");
  });
});

describe("Piocher et Invocation : option objet", () => {
  it("piocher « objets seulement » : les premiers objets du deck, le reste en place", () => {
    const s = table();
    s.players[0].deck = [creature("A"), objet("Anneau", 0, 1), creature("B")];
    const apres = jouer(s, sortCompose({ content: "draw_cards", magnitude: { x: 2 }, pool: { cardType: "item" } }));
    expect(apres.players[0].hand.map(c => c.card.name)).toEqual(["Anneau"]);
    expect(apres.players[0].deck.map(c => c.card.name)).toEqual(["A", "B"]);
  });
  it("invocation « objet » : pose un objet aléatoire du coût demandé", () => {
    const s = table();
    s.factionCardPool = [
      mkCard({ id: 8801, name: "Talisman", card_type: "item", mana_cost: 2, attack: 1, health: 1, faction: "Humains", rarity: "Commune" }),
      mkCard({ id: 8802, name: "Géant", mana_cost: 2, attack: 5, health: 5, faction: "Humains", rarity: "Commune" }),
    ];
    const apres = jouer(s, sortCompose({ content: "invocation", magnitude: { x: 2 }, pool: { cardType: "item" } }));
    expect(objetsDe(apres.players[0]).map(o => o.card.name)).toContain("Talisman");
    expect(apres.players[0].board.map(c => c.card.name)).not.toContain("Géant");
  });
});

describe("Actions classiques Remontée / Retour différé / Silence sur un objet", () => {
  const action = (id: string) => mkInstance(mkCard({
    name: id, card_type: "spell", attack: null, health: null, mana_cost: 0,
    spell_keywords: [{ id } as SpellKeywordInstance],
  }));
  it("les objets figurent parmi les cibles", () => {
    const s = table();
    const hache = objetsDe(s.players[1])[0];
    expect(getSpellTargets(s, action("remontee").card)).toContain(hache.instanceId);
  });
  it("Remontée renvoie l'objet en main, Retour différé sous le deck, Silence retire ses mots-clés", () => {
    let s = table();
    const hache = objetsDe(s.players[1])[0].instanceId;
    const epee = objetsDe(s.players[0])[0].instanceId;
    s = jouer(s, action("silence"), { kw_0: epee, target_0: epee });
    expect(objetsDe(s.players[0])[0].card.keywords).toEqual([]);
    s = jouer(s, action("remontee"), { kw_0: hache, target_0: hache });
    expect(s.players[1].hand.map(c => c.card.name)).toContain("Hache");
    s = jouer(s, action("retour_differe"), { kw_0: epee, target_0: epee });
    expect(s.players[0].deck[s.players[0].deck.length - 1].card.name).toBe("Épée");
  });
});

describe("texte de carte", () => {
  const cap = (composed: ComposedEffect) => ({ uid: "u", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed }) as Capability;
  it("nomme les objets", () => {
    expect(describeComposedCap(cap({ content: "buff", magnitude: { x: 1, y: 1 }, target: cible({ count: 1, designation: "choice" }) }))).toContain("un objet allié");
    expect(describeComposedCap(cap({ content: "draw_cards", magnitude: { x: 2 }, pool: { cardType: "item" } }))).toContain("2 objets de votre deck");
    expect(describeComposedCap(cap({ content: "invocation", magnitude: { x: 2 }, pool: { cardType: "item" } }))).toContain("ose un objet aléatoire de coût 2");
  });
});

describe("Invocation d'un OBJET désigné", () => {
  it("l'objet désigné est posé sur la table, non équipé ; le texte dit « pose »", () => {
    const s = table();
    s.factionCardPool = [mkCard({ id: 8850, name: "Marteau du Roi", card_type: "item", mana_cost: 3, attack: 2, health: 0, faction: "Humains" })];
    const composed = { content: "invocation", cardIds: [8850], pool: { cardType: "item" } } as ComposedEffect;
    const apres = jouer(s, sortCompose(composed));
    const marteau = objetsDe(apres.players[0]).find(o => o.card.name === "Marteau du Roi");
    expect(marteau).toBeDefined();
    expect(marteau!.equippedToInstanceId ?? null).toBeNull();
    const cap = { uid: "u", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed } as Capability;
    expect(describeComposedCap(cap)).toContain("ose l'objet désigné");
  });
});
