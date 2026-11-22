// PROFANATION en effet composé : même règle que le mot-clé — la SOURCE exile
// jusqu'à X cartes de son cimetière (les plus récentes d'abord) et gagne +1/+1
// par carte exilée. Il faut une UNITÉ source : portée par une action, elle ne
// fait rien. Au cimetière (« fin de tour au cimetière », râle d'agonie) ou en
// main, elle ne s'exile jamais elle-même et garde son gain hors plateau.
import { describe, expect, it } from "vitest";
import { applyAction, persistentStats } from "./engine";
import { describeComposedCap, composedKeywordName } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameAction, GameState } from "./types";

const cap = (trigger: Capability["trigger"], x: number): Capability => ({
  uid: "cx_0", trigger, effectKind: "immediate", abilityId: "_composed", targets: [],
  composed: { content: "profanation", magnitude: { x } },
});
const morte = (name: string) => mkInstance(mkCard({ name, attack: 1, health: 1 }));
function avecCimetiere(n: number): GameState {
  const s = mkState();
  for (const p of s.players) p.deck = [morte("Pioche"), morte("Pioche"), morte("Pioche")];
  s.players[0].graveyard = Array.from({ length: n }, (_, i) => morte(`Morte ${i + 1}`));
  return s;
}
const jouer = (s: GameState, c: CardInstance) => {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
};

describe("Profanation composée", () => {
  it("à l'entrée en jeu : exile X cartes, les plus récentes, et gagne +1/+1 par carte", () => {
    const s = avecCimetiere(4);
    const goule = mkInstance(mkCard({ name: "Goule", mana_cost: 0, attack: 2, health: 2, capabilities: [cap("on_play", 3)] }));
    const st = jouer(s, goule);
    const g = st.players[0].board[0];
    expect([g.currentAttack, g.currentHealth, g.maxHealth]).toEqual([5, 5, 5]);
    expect(st.players[0].graveyard.map((c) => c.card.name)).toEqual(["Morte 1"]);
  });

  it("cimetière plus petit que X : exile ce qu'il y a", () => {
    const s = avecCimetiere(1);
    const goule = mkInstance(mkCard({ name: "Goule", mana_cost: 0, attack: 2, health: 2, capabilities: [cap("on_play", 3)] }));
    const st = jouer(s, goule);
    expect(st.players[0].board[0].currentAttack).toBe(3);
    expect(st.players[0].graveyard).toHaveLength(0);
  });

  it("en fin de tour : se répète à chaque fin de tour du contrôleur, bonus conservé", () => {
    const s = avecCimetiere(3);
    const goule = mkInstance(mkCard({ name: "Goule", mana_cost: 0, attack: 2, health: 2, capabilities: [cap("on_end_of_turn", 1)] }));
    s.players[0].board = [goule];
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    const g = st.players[0].board[0];
    expect([g.currentAttack, g.currentHealth]).toEqual([3, 3]);
    expect(st.players[0].graveyard).toHaveLength(2);
  });

  it("portée par une action : rien n'est exilé", () => {
    const s = avecCimetiere(3);
    const sort = mkInstance(mkCard({ name: "Rite", card_type: "spell", mana_cost: 0, attack: null, health: null, capabilities: [cap("spell_resolution", 2)] }));
    const st = jouer(s, sort);
    // Le cimetière garde ses 3 mortes (l'action jouée peut s'y ajouter).
    expect(st.players[0].graveyard.filter((c) => c.card.name.startsWith("Morte"))).toHaveLength(3);
  });

  it("fin de tour AU CIMETIÈRE : exile X autres cartes, jamais elle-même, et garde le gain", () => {
    const s = avecCimetiere(4);
    const ancienne = mkInstance(mkCard({ name: "Ancienne", mana_cost: 6, attack: 5, health: 5, capabilities: [cap("on_end_of_turn_in_graveyard", 2)] }));
    // Elle repose au MILIEU du cimetière : les plus récentes partent, pas elle.
    s.players[0].graveyard.splice(2, 0, ancienne);
    let st = applyAction(s, { type: "end_turn" } as GameAction);
    let a = st.players[0].graveyard.find((c) => c.card.name === "Ancienne")!;
    expect(st.players[0].graveyard.map((c) => c.card.name)).toEqual(["Morte 1", "Morte 2", "Ancienne"]);
    expect(persistentStats(a)).toEqual({ attack: 7, health: 7 });

    // Tour adverse : rien. Fin de son tour suivant : elle recommence.
    st = applyAction(st, { type: "end_turn" } as GameAction);
    expect(st.players[0].graveyard).toHaveLength(3);
    st = applyAction(st, { type: "end_turn" } as GameAction);
    a = st.players[0].graveyard.find((c) => c.card.name === "Ancienne")!;
    expect(st.players[0].graveyard.map((c) => c.card.name)).toEqual(["Ancienne"]);
    expect(persistentStats(a)).toEqual({ attack: 9, health: 9 });

    // Seule au cimetière : plus rien à exiler, elle ne s'exile pas.
    st = applyAction(applyAction(st, { type: "end_turn" } as GameAction), { type: "end_turn" } as GameAction);
    expect(st.players[0].graveyard.map((c) => c.card.name)).toEqual(["Ancienne"]);
    expect(persistentStats(st.players[0].graveyard[0])).toEqual({ attack: 9, health: 9 });
  });

  it("à la mort de la porteuse : elle exile les autres, pas elle-même", () => {
    const s = avecCimetiere(0);
    const goule = mkInstance(mkCard({ name: "Goule", mana_cost: 0, attack: 0, health: 1, capabilities: [cap("on_death", 2)] }));
    const tueur = mkInstance(mkCard({ name: "Tueur", attack: 3, health: 5 }));
    s.players[0].board = [tueur];
    s.players[1].board = [goule];
    s.players[1].graveyard = [morte("Morte A"), morte("Morte B"), morte("Morte C")];
    const st = applyAction(s, { type: "attack", attackerInstanceId: tueur.instanceId, targetInstanceId: goule.instanceId } as GameAction);
    expect(st.players[1].graveyard.map((c) => c.card.name)).toEqual(["Morte A", "Goule"]);
    expect(persistentStats(st.players[1].graveyard[1])).toEqual({ attack: 2, health: 3 });
  });

  it("s'affiche sous le nom et la phrase de Profanation", () => {
    expect(composedKeywordName(cap("on_play", 3))).toBe("Profanation");
    expect(describeComposedCap(cap("on_play", 3)))
      .toBe("Exile jusqu'à 3 cartes de votre cimetière, les plus récentes d'abord, et gagne +1/+1 par carte exilée.");
    expect(describeComposedCap(cap("on_play", 1)))
      .toBe("Exile la carte la plus récente de votre cimetière et gagne +1/+1.");
  });
});
