// Contenu composé « Tuteur » : la carte DÉSIGNÉE (`composed.cardId`), créature
// ou sort, rejoint la main du contrôleur. Résolue par id dans les pools du
// match (complétés au chargement par les cartes hors pool, comme Compagnons et
// l'Invocation désignée). Aucune cible, aucune amplitude.
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { groupDesignatedIds } from "./tuteur";
import type { Capability, Card, CardInstance, GameState } from "./types";

function tuteurSpell(cardId: number | null, cardIds?: number[]): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "tuteur", cardId, ...(cardIds ? { cardIds } : {}) },
  }];
  return mkInstance(mkCard({ name: "Leçon", card_type: "spell", attack: null, health: null, capabilities: caps as never }));
}
function tuteurCreature(cardId: number): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "tuteur", cardId },
  }];
  return mkInstance(mkCard({ name: "Précepteur", attack: 1, health: 3, capabilities: caps as never }));
}
const poolCard = (name: string, over: Partial<Card> = {}): Card =>
  mkCard({ name, faction: "Mercenaires", rarity: "Commune", mana_cost: 2, attack: 1, health: 1, ...over });

function jouer(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}
const main = (s: GameState) => s.players[0].hand.map((c) => c.card.name).sort();

afterEach(() => vi.restoreAllMocks());

describe("Tuteur (composé)", () => {
  it("un sort ajoute la créature désignée à la main, depuis le pool des factions", () => {
    const s = mkState();
    const elue = poolCard("Élue", { id: 9101, rarity: "Rare", mana_cost: 7 });
    s.factionCardPool = [poolCard("Autre", { id: 9100 }), elue];

    const apres = jouer(s, tuteurSpell(9101));

    expect(main(apres)).toEqual(["Élue"]);
    expect(apres.players[0].board).toHaveLength(0);
  });

  it("la carte désignée peut être un SORT, trouvé dans le pool des sorts", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Autre", { id: 9100 })];
    s.allSpellsPool = [mkCard({ id: 9102, name: "Sortilège", card_type: "spell", attack: null, health: null, faction: "Mercenaires" })];

    const apres = jouer(s, tuteurSpell(9102));

    expect(main(apres)).toEqual(["Sortilège"]);
  });

  it("une créature à l'entrée en jeu : elle se pose ET la carte désignée arrive en main", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Manuel", { id: 9103 })];

    const apres = jouer(s, tuteurCreature(9103));

    expect(apres.players[0].board.map((c) => c.card.name)).toEqual(["Précepteur"]);
    expect(main(apres)).toEqual(["Manuel"]);
  });

  it("id introuvable ou absent : rien n'est ajouté, et un warn le dit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = mkState();
    s.factionCardPool = [poolCard("Autre", { id: 9100 })];

    expect(main(jouer(s, tuteurSpell(4242)))).toEqual([]);
    expect(main(jouer(mkState(), tuteurSpell(null)))).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("id=4242 introuvable"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("aucune carte désignée"));
  });

  it("main pleine : rien n'est ajouté", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Manuel", { id: 9103 })];
    for (let i = 0; i < 10; i++) s.players[0].hand.push(mkInstance(mkCard({ name: `Bourre ${i}` })));
    const tailleAvant = s.players[0].hand.length;

    const apres = jouer(s, tuteurSpell(9103));

    expect(apres.players[0].hand.some((c) => c.card.name === "Manuel")).toBe(false);
    expect(apres.players[0].hand.length).toBeLessThanOrEqual(tailleAvant);
  });
});

describe("Tuteur — plusieurs cartes, doublons compris", () => {
  it("ajoute chaque carte désignée, dans l'ordre, une instance NEUVE par entrée", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Alpha", { id: 9301 }), poolCard("Bêta", { id: 9302 })];

    const apres = jouer(s, tuteurSpell(null, [9302, 9301, 9302]));

    expect(apres.players[0].hand.map((c) => c.card.name)).toEqual(["Bêta", "Alpha", "Bêta"]);
    const ids = apres.players[0].hand.map((c) => c.instanceId);
    expect(new Set(ids).size).toBe(3);
  });

  it("`cardIds` prime sur le `cardId` legacy ; un id inconnu au milieu est sauté, pas bloquant", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = mkState();
    s.factionCardPool = [poolCard("Alpha", { id: 9301 }), poolCard("Bêta", { id: 9302 })];

    const apres = jouer(s, tuteurSpell(9301, [9302, 4242, 9302]));

    expect(main(apres)).toEqual(["Bêta", "Bêta"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("id=4242 introuvable"));
  });

  it("s'arrête à la main pleine : les entrées suivantes sont perdues", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Alpha", { id: 9301 })];
    for (let i = 0; i < 6; i++) s.players[0].hand.push(mkInstance(mkCard({ name: `Bourre ${i}` })));

    const apres = jouer(s, tuteurSpell(null, [9301, 9301, 9301, 9301, 9301]));

    // 6 en main + le sort joué (qui la quitte) → 2 places libres sur 8.
    expect(apres.players[0].hand.length).toBe(8);
    expect(apres.players[0].hand.filter((c) => c.card.name === "Alpha")).toHaveLength(2);
  });

  it("l'affichage compte les cartes désignées", async () => {
    const { describeComposedCap } = await import("./composed-display");
    const cap: Capability = { uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed: { content: "tuteur", cardIds: [1, 1, 2] } };
    expect(describeComposedCap(cap)).toContain("3 cartes désignées");
    expect(describeComposedCap({ ...cap, composed: { content: "tuteur", cardId: 1 } })).toContain("la carte désignée");
  });

  it("une SEULE carte désignée N fois : « N exemplaires », pas « les N cartes »", async () => {
    const { describeComposedCap } = await import("./composed-display");
    const cap: Capability = { uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed: { content: "tuteur", cardIds: [7, 7, 7, 7, 7, 7, 7] } };
    expect(describeComposedCap(cap)).toContain("7 exemplaires de la carte désignée");
    expect(describeComposedCap(cap)).not.toContain("cartes désignées");
    // Même règle pour l'Invocation désignée.
    const inv: Capability = { ...cap, composed: { content: "invocation", cardIds: [7, 7] } };
    expect(describeComposedCap(inv)).toContain("2 exemplaires de la carte désignée");
    // Deux cartes distinctes : la formule générique reste.
    expect(describeComposedCap({ ...cap, composed: { content: "tuteur", cardIds: [7, 8] } })).toContain("2 cartes désignées");
  });

  it("groupDesignatedIds : une entrée par carte, ordre de première apparition, exemplaires comptés", () => {
    expect(groupDesignatedIds([7, 7, 7])).toEqual([{ id: 7, count: 3 }]);
    expect(groupDesignatedIds([2, 1, 2, 3, 1])).toEqual([{ id: 2, count: 2 }, { id: 1, count: 2 }, { id: 3, count: 1 }]);
    expect(groupDesignatedIds([])).toEqual([]);
  });
});
