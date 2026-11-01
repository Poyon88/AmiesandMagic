// CAPACITÉ CONFÉRÉE À L'ENTRÉE EN JEU : la créature porteuse ne se la confère
// jamais à elle-même (cf. exclutPorteuse). Sans autre cible, l'effet ne fait
// rien, mais la créature est posée quand même.
import { describe, expect, it } from "vitest";
import { describeComposedCap } from "./composed-display";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState, TargetSpec } from "./types";

function porteuse(target: Partial<TargetSpec>): CardInstance {
  return mkInstance(mkCard({
    name: "Porteuse", attack: 2, health: 2, mana_cost: 2,
    capabilities: [{
      uid: "cx_0", trigger: "on_play", abilityId: "_composed", effectKind: "immediate",
      composed: {
        content: "grant_keyword", grantAbilityId: "divine_shield",
        target: { side: "ally", count: 1, entity: "unit", location: "board", designation: "choice", ...target },
      },
    }] as never,
  }));
}

const allie = (nom: string) => mkInstance(mkCard({ name: nom, attack: 1, health: 3 }));
const porte = (s: GameState, nom: string) =>
  (s.players[0].board.find((c) => c.card.name === nom)!.card.keywords as string[]).includes("divine_shield");

function poser(s: GameState, carte: CardInstance, targetMap?: Record<string, string>): GameState {
  s.players[0].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, boardPosition: s.players[0].board.length, targetMap } as never);
}

describe("Capacité conférée à l'entrée : jamais à la porteuse", () => {
  it("seule sur le plateau : posée, mais sans se conférer la capacité", () => {
    const next = poser(mkState(), porteuse({}));
    expect(next.players[0].board.map((c) => c.card.name)).toEqual(["Porteuse"]);
    expect(porte(next, "Porteuse")).toBe(false);
  });

  it("au hasard : tombe toujours sur l'autre alliée", () => {
    for (let i = 0; i < 20; i++) {
      const s = mkState();
      s.players[0].board.push(allie("Alliée"));
      const next = poser(s, porteuse({ designation: "random" }));
      expect(porte(next, "Alliée")).toBe(true);
      expect(porte(next, "Porteuse")).toBe(false);
    }
  });

  it("toutes : les autres alliées, pas la porteuse", () => {
    const s = mkState();
    s.players[0].board.push(allie("A"), allie("B"));
    const next = poser(s, porteuse({ count: "all", designation: "automatic" }));
    expect(porte(next, "A")).toBe(true);
    expect(porte(next, "B")).toBe(true);
    expect(porte(next, "Porteuse")).toBe(false);
  });

  it("au choix : une cible désignée la porteuse elle-même est ignorée", () => {
    const s = mkState();
    s.players[0].board.push(allie("Alliée"));
    const carte = porteuse({});
    const next = poser(s, carte, { cx_0: carte.instanceId });
    expect(porte(next, "Porteuse")).toBe(false);
  });

  it("au choix : la cible désignée reçoit bien la capacité", () => {
    const s = mkState();
    const a = allie("Alliée");
    s.players[0].board.push(a);
    const next = poser(s, porteuse({}), { cx_0: a.instanceId });
    expect(porte(next, "Alliée")).toBe(true);
  });
});

describe("Texte : « autres » quand la porteuse est exclue", () => {
  it("à l'entrée en jeu, toutes / une : « autres »", () => {
    const toutes = porteuse({ count: "all", designation: "automatic" }).card.capabilities![0];
    const une = porteuse({}).card.capabilities![0];
    expect(describeComposedCap(toutes)).toBe("Confère Bouclier à toutes les autres unités alliées.");
    expect(describeComposedCap(une)).toBe("Confère Bouclier à une autre unité alliée au choix.");
  });

  it("hors entrée en jeu, le texte ne change pas", () => {
    const cap = { ...porteuse({ count: "all", designation: "automatic" }).card.capabilities![0], trigger: "on_end_of_turn" as const };
    expect(describeComposedCap(cap)).toBe("Confère Bouclier à toutes les unités alliées.");
  });
});
