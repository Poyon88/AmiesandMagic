// La Traque de Corruption dure le temps du vol ; une Traque de naissance reste.
import { describe, expect, it } from "vitest";
import { applyAction, canAttack } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, GameState } from "./types";

const decret = () => mkInstance(mkCard({
  name: "Décret", card_type: "spell", mana_cost: 0, attack: null, health: null,
  capabilities: [{ uid: "sk_0", targets: [{ type: "enemy_creature", label: "Corruption" }], trigger: "spell_resolution", abilityId: "corruption", effectKind: "immediate" }] as never,
}));

function etat(): GameState {
  const s = mkState();
  for (const p of s.players) for (let i = 0; i < 6; i++) p.deck.push(mkInstance(mkCard({ name: "Pioche" })));
  return s;
}

/** L'adversaire corrompt mon unité à son tour ; elle me revient à mon tour. */
function corrompreEtRendre(capabilities?: unknown, keywords: string[] = []) {
  const s = etat();
  const matrice = mkInstance(mkCard({
    name: "Matrice", attack: 6, health: 7, keywords: keywords as never,
    ...(capabilities ? { capabilities: capabilities as never } : {}),
  }));
  matrice.hasSummoningSickness = false;
  s.players[1].board.push(matrice);
  const d = decret();
  s.players[0].hand.push(d);
  let st = applyAction(s, { type: "play_card", cardInstanceId: d.instanceId, targetMap: { sk_0: matrice.instanceId, target_0: matrice.instanceId, "kw_0": matrice.instanceId } } as GameAction);
  expect(st.players[0].board.map((c) => c.card.name)).toEqual(["Matrice"]);
  st = applyAction(st, { type: "end_turn" } as GameAction);
  return st;
}

describe("retour après Corruption", () => {
  const moi = (st: GameState) => st.players[st.currentPlayerIndex].board[0];
  const seconde = [{ uid: "cw_0", params: { x: 5 }, targets: [], trigger: "on_play", abilityId: "seconde_vie", effectKind: "immediate" }];
  const traque = [{ uid: "cw_0", targets: [], trigger: "automatic", abilityId: "charge", effectKind: "immediate" }];

  it("sans Traque de naissance : la Traque du vol disparaît, elle ne peut pas attaquer", () => {
    for (const capacites of [undefined, seconde]) {
      const st = corrompreEtRendre(capacites);
      expect(moi(st).card.name).toBe("Matrice");
      expect(moi(st).card.keywords).not.toContain("charge");
      expect(moi(st).traqueDeCorruption).toBe(false);
      expect(canAttack(st, moi(st).instanceId)).toBe(false);
    }
  });

  it("le tour suivant, elle attaque normalement", () => {
    let st = corrompreEtRendre();
    st = applyAction(applyAction(st, { type: "end_turn" } as GameAction), { type: "end_turn" } as GameAction);
    expect(canAttack(st, moi(st).instanceId)).toBe(true);
  });

  it("Traque de naissance : elle reste, et l'unité peut attaquer au retour", () => {
    const st = corrompreEtRendre(traque, ["charge"]);
    expect(moi(st).card.keywords).toContain("charge");
    expect(canAttack(st, moi(st).instanceId)).toBe(true);
  });

  it("pendant le vol, elle a bien Traque", () => {
    const s = etat();
    const m = mkInstance(mkCard({ name: "Matrice", attack: 6, health: 7 }));
    s.players[1].board.push(m);
    const d = decret();
    s.players[0].hand.push(d);
    const st = applyAction(s, { type: "play_card", cardInstanceId: d.instanceId, targetMap: { sk_0: m.instanceId, target_0: m.instanceId, kw_0: m.instanceId } } as GameAction);
    expect(canAttack(st, st.players[0].board[0].instanceId)).toBe(true);
  });

  it("renvoyée en main pendant le vol : plus de Traque", () => {
    const s = etat();
    const m = mkInstance(mkCard({ name: "Matrice", attack: 6, health: 7 }));
    s.players[1].board.push(m);
    const d = decret();
    s.players[0].hand.push(d);
    const st = applyAction(s, { type: "play_card", cardInstanceId: d.instanceId, targetMap: { sk_0: m.instanceId, target_0: m.instanceId, kw_0: m.instanceId } } as GameAction);
    const renvoi = mkInstance(mkCard({
      name: "Renvoi", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{ uid: "b", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [],
        composed: { content: "bounce", target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic" } } }] as never,
    }));
    st.players[0].hand.push(renvoi);
    const fin = applyAction(st, { type: "play_card", cardInstanceId: renvoi.instanceId } as GameAction);
    const enMain = fin.players[1].hand.find((c) => c.card.name === "Matrice")!;
    expect(enMain.card.keywords).not.toContain("charge");
  });
});
