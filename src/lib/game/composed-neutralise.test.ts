// NEUTRALISATION en effet COMPOSÉ : l'unité visée est neutralisée pendant X
// tours (paralysée, toutes ses capacités sans effet). La capacité de créature
// dure « tant que la porteuse est en jeu » ; une action ou un emblème n'ont pas
// de porteuse, d'où une durée — décomptée comme la paralysie, à chaque fin de
// tour du contrôleur de la victime.
import { describe, expect, it } from "vitest";
import { applyAction, canAttack, recalculateAuras } from "./engine";
import { composedValueText, describeComposedCap } from "./composed-display";
import { estNeutralisee } from "./neutralisation";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CapabilityTrigger, CardInstance, ComposedEffect, GameAction, GameState, Keyword, TargetSpec } from "./types";

const cibleSpec = (t: Partial<TargetSpec> = {}): TargetSpec =>
  ({ entity: "unit", count: 1, side: "enemy", location: "board", designation: "random", ...t }) as TargetSpec;
const neutraliser = (x?: number, t: Partial<TargetSpec> = {}): ComposedEffect =>
  ({ content: "neutralise", ...(x != null ? { magnitude: { x } } : {}), target: cibleSpec(t) });
const cap = (trigger: CapabilityTrigger, composed: ComposedEffect, extra: Partial<Capability> = {}): Capability =>
  ({ uid: "cx_0", trigger, effectKind: "immediate", abilityId: "_composed", targets: [], composed, ...extra }) as Capability;
const action = (composed: ComposedEffect) => mkInstance(mkCard({
  name: "Sceau", card_type: "spell", mana_cost: 0, attack: null, health: null, capabilities: [cap("spell_resolution", composed)],
}));
const victime = (kws: string[] = ["taunt"]) => {
  const u = mkInstance(mkCard({ name: "Victime", mana_cost: 3, attack: 2, health: 6, keywords: kws as unknown as Keyword[] }));
  u.hasSummoningSickness = false;
  return u;
};
function etat(ennemis: CardInstance[]): GameState {
  const s = mkState();
  for (const p of s.players) for (let i = 0; i < 12; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}`, mana_cost: 9 })));
  s.players[1].board.push(...ennemis);
  return s;
}
function jouer(s: GameState, carte: CardInstance): GameState {
  s.players[0].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId } as GameAction);
}
const finDeTour = (st: GameState) => applyAction(st, { type: "end_turn" } as GameAction);
const v = (st: GameState) => st.players[1].board.find((c) => c.card.name === "Victime")!;

describe("Neutralisation composée", () => {
  it("action : la cible perd ses capacités et ne peut pas attaquer à son tour", () => {
    let st = jouer(etat([victime()]), action(neutraliser(1)));
    expect(estNeutralisee(v(st))).toBe(true);
    expect(v(st).card.keywords).toEqual([]);
    st = finDeTour(st);                       // tour de la victime
    expect(canAttack(st, v(st).instanceId)).toBe(false);
  });

  it("1 tour : levée à la fin du tour de la victime, capacités rendues", () => {
    let st = jouer(etat([victime()]), action(neutraliser(1)));
    st = finDeTour(finDeTour(st));            // fin du tour de la victime
    expect(estNeutralisee(v(st))).toBe(false);
    expect(v(st).card.keywords).toEqual(["taunt"]);
    expect(v(st).neutralisationTurnsLeft).toBeUndefined();
  });

  it("2 tours : encore neutralisée après son premier tour, libre après le second", () => {
    let st = jouer(etat([victime()]), action(neutraliser(2)));
    st = finDeTour(finDeTour(st));
    expect(estNeutralisee(v(st))).toBe(true);
    st = finDeTour(finDeTour(st));
    expect(estNeutralisee(v(st))).toBe(false);
  });

  it("X absent = 1 tour ; une neutralisation plus courte ne raccourcit pas une plus longue", () => {
    let st = jouer(etat([victime()]), action(neutraliser()));
    expect(v(st).neutralisationTurnsLeft).toBe(1);
    st = jouer(etat([victime()]), action(neutraliser(3)));
    st = jouer(st, action(neutraliser(1)));
    expect(v(st).neutralisationTurnsLeft).toBe(3);
  });

  it("toutes les unités ennemies", () => {
    const a = victime(), b = victime(["ranged"]);
    b.card = { ...b.card, name: "Autre" };
    const st = jouer(etat([a, b]), action(neutraliser(1, { count: "all", designation: "automatic" })));
    expect(st.players[1].board.every((c) => estNeutralisee(c))).toBe(true);
  });

  it("EMBLÈME de fin de tour : neutralise une unité ennemie à chaque tour du porteur", () => {
    const embleme = mkInstance(mkCard({
      name: "Carcan", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [cap("on_end_of_turn", neutraliser(1), { effectKind: "emblem" })],
    }));
    let st = jouer(etat([victime()]), embleme);
    expect(estNeutralisee(v(st))).toBe(false);
    st = finDeTour(st);                       // fin du tour du porteur
    expect(estNeutralisee(v(st))).toBe(true);
  });

  it("texte d'une ACTION : la durée (jamais 0), puis ce que fait la neutralisation, accordé au nombre", () => {
    expect(describeComposedCap(cap("spell_resolution", neutraliser(2, { designation: "choice" }))))
      .toBe("Neutralise une unité ennemie au choix pendant 2 tours : paralysée, capacités sans effet.");
    expect(describeComposedCap(cap("spell_resolution", neutraliser(0, { designation: "choice", count: 2 }))))
      .toBe("Neutralise 2 unités ennemies au choix pendant 1 tour : paralysées, capacités sans effet.");
  });
});

describe("Neutralisation composée portée par une CRÉATURE", () => {
  const porteuse = (x?: number) => mkInstance(mkCard({
    name: "Poltergeist", mana_cost: 0, attack: 5, health: 6,
    capabilities: [cap("on_play", neutraliser(x, { count: "all", designation: "automatic" }))],
  }));

  it("tient tant qu'elle est en jeu : aucune durée, X ignoré", () => {
    let st = jouer(etat([victime()]), porteuse(0));
    expect(estNeutralisee(v(st))).toBe(true);
    expect(v(st).neutralisationTurnsLeft).toBeUndefined();
    // Plusieurs tours passent : toujours neutralisée.
    for (let i = 0; i < 6; i++) st = finDeTour(st);
    expect(estNeutralisee(v(st))).toBe(true);
  });

  it("levée dès que la porteuse quitte le plateau, capacités rendues", () => {
    const st = structuredClone(jouer(etat([victime()]), porteuse()));
    st.players[0].board = [];
    recalculateAuras(st.players[0], st.players[1]);
    expect(estNeutralisee(v(st))).toBe(false);
    expect(v(st).card.keywords).toEqual(["taunt"]);
  });

  it("texte : « tant qu'elle est en jeu », sans nombre de tours", () => {
    expect(describeComposedCap(cap("on_play", neutraliser(0, { designation: "choice", count: 2 }))))
      .toBe("Neutralise 2 unités ennemies au choix tant qu'elle est en jeu : paralysées, capacités sans effet.");
  });

  it("pas de chiffre à côté de l'icône pour une créature ; le nombre de tours pour une action", () => {
    expect(composedValueText(cap("on_play", neutraliser(1)))).toBeNull();
    expect(composedValueText(cap("spell_resolution", neutraliser(2)))).not.toBeNull();
  });

  it("à la MORT, la porteuse n'est plus en jeu : la neutralisation compte en tours", () => {
    expect(describeComposedCap(cap("on_death", neutraliser(1, { designation: "random" })))).toContain("pendant 1 tour");
  });
});
