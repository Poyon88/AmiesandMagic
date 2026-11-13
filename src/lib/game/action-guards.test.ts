// GARDES D'ENTRÉE d'applyAction : ce que le moteur REFUSE.
//
// Le rejeu serveur et le client adverse rejouent les actions telles qu'elles
// arrivent ; les gardes du store ne protègent que le client local. Une action
// refusée rend l'état d'origine (même référence).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

function enMulligan() {
  const s = mkState();
  s.phase = "mulligan";
  s.mulliganReady = [false, false];
  for (const p of s.players) {
    p.hand = [mkInstance(mkCard({})), mkInstance(mkCard({}))];
    p.deck = [mkInstance(mkCard({})), mkInstance(mkCard({})), mkInstance(mkCard({}))];
  }
  return s;
}

describe("mulligan", () => {
  it("est refusé une fois la partie lancée", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(mkCard({}))];
    expect(applyAction(s, { type: "mulligan", playerId: "P1", replacedInstanceIds: [] })).toBe(s);
  });

  it("n'est accepté qu'une fois par joueur", () => {
    const s = enMulligan();
    const apres = applyAction(s, { type: "mulligan", playerId: "P1", replacedInstanceIds: [] });
    expect(apres.mulliganReady).toEqual([true, false]);
    const main = apres.players[0].hand.map((c) => c.instanceId);
    const encore = applyAction(apres, { type: "mulligan", playerId: "P1", replacedInstanceIds: [main[0]] });
    expect(encore).toBe(apres);
  });

  it("est refusé pour un joueur inconnu", () => {
    const s = enMulligan();
    expect(applyAction(s, { type: "mulligan", playerId: "X", replacedInstanceIds: [] })).toBe(s);
  });

  it("la phase mulligan n'accepte aucune action de tour", () => {
    const s = enMulligan();
    expect(applyAction(s, { type: "end_turn" })).toBe(s);
  });

  it("la phase mulligan accepte un abandon", () => {
    const s = enMulligan();
    const apres = applyAction(s, { type: "concede", playerId: "P1" });
    expect(apres.phase).toBe("finished");
    expect(apres.winner).toBe("P2");
  });
});

describe("partie terminée", () => {
  it("un second abandon n'inverse pas le vainqueur", () => {
    const fini = applyAction(mkState(), { type: "concede", playerId: "P1" });
    expect(fini.winner).toBe("P2");
    const encore = applyAction(fini, { type: "concede", playerId: "P2" });
    expect(encore).toBe(fini);
    expect(encore.winner).toBe("P2");
  });

  it("n'accepte plus aucune action", () => {
    const fini = applyAction(mkState(), { type: "concede", playerId: "P1" });
    expect(applyAction(fini, { type: "end_turn" })).toBe(fini);
  });
});

describe("abandon", () => {
  it("d'un joueur inconnu : refusé, la partie continue", () => {
    const s = mkState();
    const apres = applyAction(s, { type: "concede", playerId: "X" });
    expect(apres).toBe(s);
    expect(apres.phase).toBe("playing");
  });
});

describe("coûts additionnels en doublon", () => {
  it("le même sacrifice donné deux fois ne paie pas un coût de 2", () => {
    const s = mkState();
    const carte = mkInstance(mkCard({ sacrifice_cost: 2 }));
    const victime = mkInstance(mkCard({}));
    s.players[0].hand = [carte];
    s.players[0].board = [victime];
    const apres = applyAction(s, {
      type: "play_card",
      cardInstanceId: carte.instanceId,
      sacrificeInstanceIds: [victime.instanceId, victime.instanceId],
    });
    expect(apres).toBe(s);
  });

  it("la même défausse donnée deux fois ne paie pas un coût de 2", () => {
    const s = mkState();
    const carte = mkInstance(mkCard({ discard_cost: 2 }));
    const jetee = mkInstance(mkCard({}));
    s.players[0].hand = [carte, jetee];
    const apres = applyAction(s, {
      type: "play_card",
      cardInstanceId: carte.instanceId,
      discardInstanceIds: [jetee.instanceId, jetee.instanceId],
    });
    expect(apres).toBe(s);
  });

  it("deux sacrifices distincts paient bien le coût", () => {
    const s = mkState();
    const carte = mkInstance(mkCard({ sacrifice_cost: 2 }));
    const a = mkInstance(mkCard({}));
    const b = mkInstance(mkCard({}));
    s.players[0].hand = [carte];
    s.players[0].board = [a, b];
    const apres = applyAction(s, {
      type: "play_card",
      cardInstanceId: carte.instanceId,
      sacrificeInstanceIds: [a.instanceId, b.instanceId],
    });
    expect(apres).not.toBe(s);
    expect(apres.players[0].board.map((c) => c.instanceId)).toEqual([carte.instanceId]);
  });
});

describe("cible d'un effet composé", () => {
  const frappe = () => mkInstance(mkCard({
    name: "Frappe", attack: 1, health: 1,
    capabilities: [{
      uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
      composed: {
        content: "deal_damage", magnitude: { x: 3 },
        target: { entity: "unit", side: "enemy", count: 1, location: "board", designation: "choice" },
      },
    }] as never,
  }));

  it("« une unité » ne peut pas être détourné sur le héros", () => {
    const s = mkState();
    const carte = frappe();
    s.players[0].hand = [carte];
    s.players[1].board = [mkInstance(mkCard({ health: 10 }))];
    const pv = s.players[1].hero.hp;
    const apres = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, targetMap: { "cx_0#0": "enemy_hero" } });
    expect(apres.players[1].hero.hp).toBe(pv);
  });

  it("l'unité désignée encaisse bien", () => {
    const s = mkState();
    const carte = frappe();
    const cible = mkInstance(mkCard({ health: 10 }));
    s.players[0].hand = [carte];
    s.players[1].board = [cible];
    const apres = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, targetMap: { "cx_0#0": cible.instanceId } });
    expect(apres.players[1].board[0].currentHealth).toBe(7);
  });
});
