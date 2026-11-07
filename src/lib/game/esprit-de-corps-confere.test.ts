// ESPRIT DE CORPS CONFÉRÉ — un don composé vers le deck ou la main doit pouvoir
// partir à l'entrée en jeu : c'est le moment où la carte compte, et gagne.
// La forge ne proposait pas ce déclencheur, retiré pour les cibles déjà en jeu.
import { describe, expect, it } from "vitest";
import { getCapabilityTriggers, grantTriggersFor } from "./abilities";
import { applyAction, initRNG } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CapabilityTrigger, CardInstance, ComposedEffect, GameAction, GameState, TargetSpec } from "./types";

const sortDon = (location: TargetSpec["location"], grantTrigger: CapabilityTrigger): CardInstance => {
  const composed: ComposedEffect = {
    content: "grant_keyword", grantAbilityId: "esprit_de_corps", grantTrigger,
    target: { side: "ally", count: "all", entity: "unit", location, designation: "automatic" },
  };
  const caps: Capability[] = [{ uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed }];
  return mkInstance(mkCard({ name: "Serment", card_type: "spell", mana_cost: 0, attack: null, health: null, keywords: [], capabilities: caps as never }));
};

const jouer = (s: GameState, c: CardInstance) => applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);

function apresDon(s: GameState, location: TargetSpec["location"], trigger: CapabilityTrigger): GameState {
  const sort = sortDon(location, trigger);
  s.players[0].hand.push(sort);
  return jouer(s, sort);
}

describe("Déclencheurs d'un don selon la zone de la cible", () => {
  it("propose l'entrée en jeu en main et dans le deck, en premier", () => {
    expect(grantTriggersFor("esprit_de_corps", "deck")[0]).toBe("on_play");
    expect(grantTriggersFor("esprit_de_corps", "hand")[0]).toBe("on_play");
  });

  it("ne la propose ni sur le plateau ni au cimetière", () => {
    expect(grantTriggersFor("esprit_de_corps", "board")).not.toContain("on_play");
    expect(grantTriggersFor("esprit_de_corps", "graveyard")).not.toContain("on_play");
    expect(grantTriggersFor("esprit_de_corps")).not.toContain("on_play");
  });

  it("garde tous les autres déclencheurs", () => {
    const tous = getCapabilityTriggers("creature", "esprit_de_corps").filter((t) => t !== "on_play");
    expect(grantTriggersFor("esprit_de_corps", "board")).toEqual(tous);
  });

  it("ne donne aucun choix à une passive", () => {
    expect(grantTriggersFor("divine_shield", "deck")).toEqual([]);
  });
});

describe("Esprit de corps conféré", () => {
  it.each(["deck", "hand"] as const)("depuis la zone %s : la créature gagne à sa pose et compte pour la suite", (zone) => {
    initRNG(42);
    const s = mkState();
    s.players[0].espritDeCorpsPlayed = { Autre: 2 };
    const c = mkInstance(mkCard({ name: "Recrue", attack: 1, health: 1, mana_cost: 0, keywords: [] }));
    s.players[0][zone] = [c];
    const st = apresDon(s, zone, "on_play");
    const p = st.players[0];
    const recrue = [...p.deck, ...p.hand].find((x) => x.card.name === "Recrue")!;
    p.deck = []; p.hand = [recrue];
    const fin = jouer(st, recrue);
    const posee = fin.players[0].board.find((x) => x.card.name === "Recrue")!;
    expect(posee.currentAttack + posee.currentHealth).toBe(4);
    expect(posee.espritDeCorpsCounted).toBe(true);
    expect(Object.values(fin.players[0].espritDeCorpsPlayed ?? {}).reduce((n, v) => n + v, 0)).toBe(3);
  });

  it("sur le plateau, part en fin de tour et compte toutes les porteuses jouées", () => {
    initRNG(42);
    const s = mkState();
    s.players[0].espritDeCorpsPlayed = { Autre: 2 };
    s.players[0].board = [mkInstance(mkCard({ name: "Vétérane", attack: 1, health: 1, keywords: [] }))];
    const st = apresDon(s, "board", "on_end_of_turn");
    const fin = applyAction(st, { type: "end_turn" } as GameAction);
    const v = fin.players[0].board[0];
    expect(v.currentAttack + v.currentHealth).toBe(4);
  });

  it("le texte annonce l'entrée en jeu", () => {
    const composed: ComposedEffect = {
      content: "grant_keyword", grantAbilityId: "esprit_de_corps", grantTrigger: "on_play",
      target: { side: "ally", count: "all", entity: "unit", location: "deck", designation: "automatic" },
    };
    expect(describeComposedCap({ uid: "x", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed } as Capability))
      .toContain("à son entrée en jeu");
  });
});
