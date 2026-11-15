// MALÉDICTION en effet COMPOSÉ : chaque unité visée est exilée au début du
// prochain tour du contrôleur de l'effet (donc à la fin du prochain tour
// adverse). Utilisable partout où vit un effet composé — action, créature,
// EMBLÈME (« à la fin du tour : maudit une unité ennemie »). La malédiction est
// portée par le joueur, pas par une créature source. Plafond de coût : le
// filtre commun `target.maxCost`.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { composedChoicePrompt, describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CapabilityTrigger, CardInstance, ComposedEffect, GameAction, GameState, TargetSpec } from "./types";

const cibleSpec = (t: Partial<TargetSpec> = {}): TargetSpec =>
  ({ entity: "unit", count: 1, side: "enemy", location: "board", designation: "random", ...t }) as TargetSpec;
const maudire = (t: Partial<TargetSpec> = {}): ComposedEffect => ({ content: "malediction", target: cibleSpec(t) });
const cap = (trigger: CapabilityTrigger, composed: ComposedEffect, extra: Partial<Capability> = {}): Capability =>
  ({ uid: "cx_0", trigger, effectKind: "immediate", abilityId: "_composed", targets: [], composed, ...extra }) as Capability;
const unite = (name: string, mana_cost = 3) => mkInstance(mkCard({ name, mana_cost, attack: 1, health: 5 }));

function etat(ennemis: CardInstance[]): GameState {
  const s = mkState();
  for (const p of s.players) for (let i = 0; i < 10; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}`, mana_cost: 9 })));
  s.players[1].board.push(...ennemis);
  return s;
}
function jouer(s: GameState, carte: CardInstance, targetMap?: Record<string, string>): GameState {
  s.players[0].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, targetMap } as GameAction);
}
const finDeTour = (st: GameState) => applyAction(st, { type: "end_turn" } as GameAction);
const adverses = (st: GameState) => st.players[1].board.map((c) => c.card.name).sort();
const action = (composed: ComposedEffect) => mkInstance(mkCard({
  name: "Sceau", card_type: "spell", mana_cost: 0, attack: null, health: null,
  capabilities: [cap("spell_resolution", composed)],
}));

describe("Malédiction composée — action", () => {
  it("la créature reste en jeu pendant le tour adverse, puis est exilée (pas au cimetière)", () => {
    let st = jouer(etat([unite("Victime")]), action(maudire()));
    expect(adverses(st)).toEqual(["Victime"]);
    st = finDeTour(st);            // tour de l'adversaire : toujours là
    expect(adverses(st)).toEqual(["Victime"]);
    st = finDeTour(st);            // retour au lanceur : exil
    expect(adverses(st)).toEqual([]);
    expect(st.players[1].graveyard.some((c) => c.card.name === "Victime")).toBe(false);
    expect(st.players[0].maledictions).toBeUndefined();
  });

  it("toutes les unités ennemies", () => {
    let st = jouer(etat([unite("A"), unite("B")]), action(maudire({ count: "all" })));
    st = finDeTour(finDeTour(st));
    expect(adverses(st)).toEqual([]);
  });

  it("plafond de coût (`maxCost`) : seules les créatures de coût ≤ N sont maudites", () => {
    let st = jouer(etat([unite("Petite", 2), unite("Grosse", 6)]), action(maudire({ count: "all", maxCost: 3 })));
    st = finDeTour(finDeTour(st));
    expect(adverses(st)).toEqual(["Grosse"]);
  });

  it("au choix : la cible désignée, et elle seule", () => {
    const a = unite("A"), b = unite("B");
    let st = jouer(etat([a, b]), action(maudire({ designation: "choice" })), { "cx_0#0": b.instanceId });
    st = finDeTour(finDeTour(st));
    expect(adverses(st)).toEqual(["A"]);
  });
});

describe("Malédiction composée — créature et emblème", () => {
  it("créature, à l'entrée en jeu : la malédiction tient même si la créature meurt entre-temps", () => {
    const porteuse = mkInstance(mkCard({ name: "Oracle", mana_cost: 0, attack: 1, health: 1, capabilities: [cap("on_play", maudire())] }));
    let st = jouer(etat([unite("Victime")]), porteuse);
    st.players[0].board = [];      // la source disparaît
    st = finDeTour(finDeTour(st));
    expect(adverses(st)).toEqual([]);
  });

  it("EMBLÈME « à la fin du tour : maudit une unité ennemie » — une victime par tour du porteur", () => {
    const embleme = mkInstance(mkCard({
      name: "Linceul", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [cap("on_end_of_turn", maudire(), { effectKind: "emblem" })],
    }));
    let st = jouer(etat([unite("A"), unite("B"), unite("C")]), embleme);
    expect(st.players[0].emblems).toHaveLength(1);
    st = finDeTour(st);            // fin du tour du porteur : une ennemie maudite
    expect(adverses(st)).toHaveLength(3);
    st = finDeTour(st);            // début du tour suivant du porteur : exil
    expect(adverses(st)).toHaveLength(2);
    st = finDeTour(finDeTour(st)); // un tour de plus : une autre
    expect(adverses(st)).toHaveLength(1);
  });
});

describe("Malédiction composée — textes", () => {
  it("la phrase dit ce que fait la malédiction", () => {
    const texte = describeComposedCap(cap("spell_resolution", maudire({ designation: "choice" })));
    expect(texte.toLowerCase()).toContain("maudit");
    expect(texte).toBe("Maudit une unité ennemie au choix, exilée à la fin du prochain tour adverse.");
    // Plusieurs victimes : accord au pluriel.
    expect(describeComposedCap(cap("spell_resolution", maudire({ count: "all", designation: "automatic" }))))
      .toContain("exilées à la fin du prochain tour adverse");
  });

  it("invite de choix dédiée", () => {
    expect(composedChoicePrompt(cap("spell_resolution", maudire({ designation: "choice" })))).toContain("maudire");
  });
});
