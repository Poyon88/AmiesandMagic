// TACTIQUE X — X capacités tirées au hasard parmi celles des créatures
// COMMUNES (vivier de Mutation) de MÊME COÛT que l'unité qui les reçoit,
// copiées EN ENTIER (X, déclencheur, cibles, effet composé). Bénéficiaire
// réglable comme Renforcement : une autre unité ciblée (défaut), elle-même
// (« S »), ou toutes les unités alliées (« A »).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { getCapabilities } from "./capability-adapter";
import { tactiqueVivier } from "./mutation";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { describeComposedCap } from "./composed-display";
import type { Capability, Card, CardInstance, GameAction, GameState, KeywordInstance } from "./types";

let nextId = 5000;
const commune = (cout: number, extra: Partial<Card>): Card => mkCard({
  id: nextId++, name: `Commune ${nextId}`, mana_cost: cout, attack: 1, health: 1, rarity: "Commune", card_type: "creature", ...extra,
} as Partial<Card>);

const fureurFinDeTour: Capability = {
  uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed",
  composed: { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", side: "enemy", count: 1, location: "board", designation: "automatic" } },
};

/** Vivier : des communes de coût 3 aux capacités variées, plus du bruit ailleurs. */
function vivier(): Card[] {
  return [
    commune(3, { keywords: ["taunt"] as never }),
    commune(3, { keywords: ["taunt"] as never }), // doublon : une seule entrée
    commune(3, { keywords: ["divine_shield"] as never }),
    commune(3, { keywords: ["resistance"] as never, keyword_instances: [{ id: "resistance", x: 2 }] as KeywordInstance[] }),
    commune(3, { keywords: ["charge"] as never }),
    commune(3, { keywords: [] as never, capabilities: [fureurFinDeTour] as never }),
    commune(3, { keywords: ["selection"] as never, keyword_instances: [{ id: "selection", x: 2 }] as KeywordInstance[] }), // entrée en jeu : exclue
    commune(5, { keywords: ["ranged"] as never }), // autre coût
  ];
}

function tacticienne(x: number, extra: Partial<KeywordInstance> = {}, cout = 3): CardInstance {
  return mkInstance(mkCard({
    name: "Stratège", mana_cost: cout, attack: 2, health: 2,
    keywords: ["tactique"] as never,
    keyword_instances: [{ id: "tactique", x, ...extra }] as KeywordInstance[],
  }));
}
const allie = (cout = 3) => mkInstance(mkCard({ name: "Allié", mana_cost: cout, attack: 1, health: 5 }));

function etat(seed = 1): GameState {
  const s: GameState = { ...mkState(), rngState: seed };
  s.mutationPool = vivier();
  for (const p of s.players) for (let i = 0; i < 5; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}` })));
  return s;
}
const jouer = (s: GameState, c: CardInstance, cible?: string) => {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, targetInstanceId: cible } as GameAction);
};
const ids = (c: CardInstance) => getCapabilities(c.card).map((k) => k.abilityId);

describe("le vivier", () => {
  it("capacités distinctes des communes de MÊME coût, hors entrée en jeu", () => {
    const v = tactiqueVivier(vivier(), allie(3).card).map((l) => l.cap.abilityId);
    expect(v.sort()).toEqual(["_composed", "charge", "divine_shield", "resistance", "taunt"].sort());
  });

  it("un autre coût puise ailleurs ; coût sans commune : vivier vide", () => {
    expect(tactiqueVivier(vivier(), allie(5).card).map((l) => l.cap.abilityId)).toEqual(["ranged"]);
    expect(tactiqueVivier(vivier(), allie(9).card)).toEqual([]);
  });

  it("écarte ce que la cible porte déjà", () => {
    const porteuse = mkCard({ name: "Mur", mana_cost: 3, keywords: ["taunt"] as never });
    expect(tactiqueVivier(vivier(), porteuse).map((l) => l.cap.abilityId)).not.toContain("taunt");
  });
});

describe("le don", () => {
  it("défaut : X capacités à l'alliée ciblée, rien à la porteuse", () => {
    const s = etat();
    const a = allie();
    s.players[0].board.push(a);
    const t = tacticienne(2);
    const st = jouer(s, t, a.instanceId);
    const recue = st.players[0].board.find((c) => c.instanceId === a.instanceId)!;
    expect(ids(recue)).toHaveLength(2);
    const porteuse = st.players[0].board.find((c) => c.instanceId === t.instanceId)!;
    expect(ids(porteuse)).toEqual(["tactique"]);
  });

  it("copie complète : X et déclencheur conservés, effet composé sous un nouvel uid", () => {
    const s = etat();
    const a = allie();
    s.players[0].board.push(a);
    const st = jouer(s, tacticienne(10), a.instanceId); // X > vivier : tout le vivier
    const recue = st.players[0].board.find((c) => c.instanceId === a.instanceId)!;
    const caps = getCapabilities(recue.card);
    expect(caps).toHaveLength(5);
    expect(caps.find((c) => c.abilityId === "resistance")?.params?.x).toBe(2);
    const compose = caps.find((c) => c.composed)!;
    expect(compose.trigger).toBe("on_end_of_turn");
    expect(compose.uid).not.toBe("cx_0");
    // Effets de bord du don : Bouclier levé, Traque active.
    expect(recue.hasDivineShield).toBe(true);
    expect(recue.hasSummoningSickness).toBe(false);
  });

  it("« sur elle-même » (S) : la porteuse se les donne, sans cible", () => {
    const st = jouer(etat(), tacticienne(2, { recipient: "self" }));
    const porteuse = st.players[0].board[0];
    expect(ids(porteuse).filter((k) => k !== "tactique")).toHaveLength(2);
  });

  it("portée « toutes » (A) : chaque autre alliée reçoit, selon SON coût", () => {
    const s = etat();
    const a3 = allie(3), a5 = allie(5);
    s.players[0].board.push(a3, a5);
    const st = jouer(s, tacticienne(1, { targetScope: "all_allies" }));
    const b = st.players[0].board;
    expect(ids(b.find((c) => c.instanceId === a3.instanceId)!)).toHaveLength(1);
    expect(ids(b.find((c) => c.instanceId === a5.instanceId)!)).toEqual(["ranged"]);
  });

  it("en fin de tour, une Tactique « sur elle-même » se renforce", () => {
    const s = etat();
    const t = tacticienne(1, { recipient: "self", mode: "end_of_turn" });
    s.players[0].board.push(t);
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    expect(ids(st.players[0].board[0]).filter((k) => k !== "tactique")).toHaveLength(1);
  });
});

describe("hasard et synchro", () => {
  const tirage = (seed: number) => {
    const s = etat(seed);
    const a = allie();
    s.players[0].board.push(a);
    const st = jouer(s, tacticienne(1), a.instanceId);
    return ids(st.players[0].board.find((c) => c.instanceId === a.instanceId)!).join("|");
  };
  it("même graine ⇒ même tirage", () => expect(tirage(7)).toBe(tirage(7)));
  it("graines différentes ⇒ tirages variés", () => {
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(tirage)).size).toBeGreaterThan(1);
  });
});

describe("effet composé", () => {
  const capCompose = (x: number): Capability => ({
    uid: "cx_t", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "tactique", magnitude: { x }, target: { entity: "unit", side: "ally", count: "all", location: "board", designation: "automatic" } },
  });

  it("depuis un SORT : chaque unité visée reçoit X capacités de son coût", () => {
    const s = etat();
    const a = allie(3);
    s.players[0].board.push(a);
    const sort = mkInstance(mkCard({ name: "Conseil", card_type: "spell", mana_cost: 0, attack: null, health: null, keywords: [], capabilities: [capCompose(2)] as never }));
    s.players[0].hand.push(sort);
    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
    expect(ids(st.players[0].board.find((c) => c.instanceId === a.instanceId)!)).toHaveLength(2);
  });

  it("se décrit en français", () => {
    expect(describeComposedCap(capCompose(2))).toMatch(/2 capacités de créatures de même coût/);
  });
});
