// Règles de légalité « pures » du moteur : jouabilité (coûts), attaque, cibles
// de combat. Le snapshot de régression ne couvre ces arêtes que globalement ;
// ici on les épingle individuellement.
import { describe, expect, it } from "vitest";
import { canAttack, canPlayCard, getLifeCost, getDiscardCost, getSacrificeCost, getValidTargets } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_BOARD_SIZE } from "./constants";

/** Place une carte en main du joueur courant et renvoie son instanceId. */
function inHand(state: ReturnType<typeof mkState>, card: ReturnType<typeof mkCard>) {
  const inst = mkInstance(card);
  state.players[0].hand.push(inst);
  return inst.instanceId;
}

describe("getLifeCost / getDiscardCost / getSacrificeCost", () => {
  it("clampent null/undefined/négatif à 0", () => {
    expect(getLifeCost(mkCard({ life_cost: null }))).toBe(0);
    expect(getDiscardCost(mkCard({ discard_cost: -3 }))).toBe(0);
    expect(getSacrificeCost(mkCard({}))).toBe(0);
    expect(getLifeCost(mkCard({ life_cost: 4 }))).toBe(4);
  });
});

describe("canPlayCard — coûts", () => {
  it("mana exactement suffisant → jouable ; à 1 près → non", () => {
    const s = mkState();
    s.players[0].mana = 3;
    expect(canPlayCard(s, inHand(s, mkCard({ mana_cost: 3 })))).toBe(true);
    expect(canPlayCard(s, inHand(s, mkCard({ mana_cost: 4 })))).toBe(false);
  });

  it("manaCostReduction réduit le coût effectif", () => {
    const s = mkState();
    s.players[0].mana = 3;
    const inst = mkInstance(mkCard({ mana_cost: 5 }));
    inst.manaCostReduction = 2; // 5 − 2 = 3 ≤ 3
    s.players[0].hand.push(inst);
    expect(canPlayCard(s, inst.instanceId)).toBe(true);
  });

  it("coût en vie : refusé s'il amène le héros à ≤ 0 PV", () => {
    const s = mkState();
    s.players[0].hero.hp = 5;
    expect(canPlayCard(s, inHand(s, mkCard({ mana_cost: 0, life_cost: 5 })))).toBe(false); // 5−5=0
    s.players[0].hero.hp = 6;
    expect(canPlayCard(s, inHand(s, mkCard({ mana_cost: 0, life_cost: 5 })))).toBe(true);  // 6−5=1
  });

  it("coût en défausse : exige assez de cartes EN PLUS de la carte jouée", () => {
    const s = mkState();
    const id = inHand(s, mkCard({ mana_cost: 0, discard_cost: 2 }));
    expect(canPlayCard(s, id)).toBe(false);            // main = [carte] → 1−1=0 < 2
    s.players[0].hand.push(mkInstance(mkCard({})), mkInstance(mkCard({})));
    expect(canPlayCard(s, id)).toBe(true);             // main = 3 → 3−1=2 ≥ 2
  });

  it("coût en sacrifice : exige assez d'unités sur le plateau", () => {
    const s = mkState();
    const id = inHand(s, mkCard({ mana_cost: 0, sacrifice_cost: 2, card_type: "spell", attack: null, health: null }));
    expect(canPlayCard(s, id)).toBe(false);
    s.players[0].board.push(mkInstance(mkCard({})), mkInstance(mkCard({})));
    expect(canPlayCard(s, id)).toBe(true);
  });

  it("créature refusée si le plateau dépasserait la taille max (après sacrifice)", () => {
    const s = mkState();
    for (let i = 0; i < MAX_BOARD_SIZE; i++) s.players[0].board.push(mkInstance(mkCard({})));
    const id = inHand(s, mkCard({ mana_cost: 0 }));
    expect(canPlayCard(s, id)).toBe(false); // 8 − 0 + 1 = 9 > 8
  });

  it("carte absente de la main → non jouable", () => {
    expect(canPlayCard(mkState(), "inexistant")).toBe(false);
  });
});

describe("canAttack", () => {
  function attacker(over: Partial<ReturnType<typeof mkInstance>>) {
    const s = mkState();
    const a = mkInstance(mkCard({ attack: 2 }));
    Object.assign(a, over);
    s.players[0].board.push(a);
    return { s, id: a.instanceId };
  }

  it("attaque OK par défaut", () => {
    const { s, id } = attacker({});
    expect(canAttack(s, id)).toBe(true);
  });

  it("refusé si plus d'attaques restantes, si tapé, ou si ATK ≤ 0", () => {
    let a = attacker({ attacksRemaining: 0 }); expect(canAttack(a.s, a.id)).toBe(false);
    a = attacker({ tapped: true }); expect(canAttack(a.s, a.id)).toBe(false);
    a = attacker({ currentAttack: 0 }); expect(canAttack(a.s, a.id)).toBe(false);
  });

  it("mal d'invocation bloque, sauf Raid", () => {
    const a = attacker({ hasSummoningSickness: true });
    expect(canAttack(a.s, a.id)).toBe(false);
    const s = mkState();
    const r = mkInstance(mkCard({ attack: 2, keywords: ["raid"] }));
    r.hasSummoningSickness = true;
    s.players[0].board.push(r);
    expect(canAttack(s, r.instanceId)).toBe(true);
  });
});

describe("getValidTargets", () => {
  it("sans provocation : toutes les unités ennemies + le héros", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ attack: 2 })); s.players[0].board.push(a);
    const e1 = mkInstance(mkCard({})); const e2 = mkInstance(mkCard({}));
    s.players[1].board.push(e1, e2);
    expect(getValidTargets(s, a.instanceId).sort()).toEqual([e1.instanceId, e2.instanceId, "enemy_hero"].sort());
  });

  it("avec provocation : uniquement les provocateurs (héros exclu)", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ attack: 2 })); s.players[0].board.push(a);
    const taunt = mkInstance(mkCard({ keywords: ["taunt"] }));
    const plain = mkInstance(mkCard({}));
    s.players[1].board.push(plain, taunt);
    expect(getValidTargets(s, a.instanceId)).toEqual([taunt.instanceId]);
  });

  it("Vol ignore les provocations adverses (héros de nouveau ciblable)", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ attack: 2, keywords: ["vol"] })); s.players[0].board.push(a);
    s.players[1].board.push(mkInstance(mkCard({ keywords: ["taunt"] })));
    expect(getValidTargets(s, a.instanceId)).toContain("enemy_hero");
  });

  it("Ombre non révélée n'est pas ciblable", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ attack: 2 })); s.players[0].board.push(a);
    const shade = mkInstance(mkCard({ keywords: ["ombre"] })); // ombreRevealed=false par défaut
    s.players[1].board.push(shade);
    expect(getValidTargets(s, a.instanceId)).not.toContain(shade.instanceId);
  });

  it("Raid avec mal d'invocation : ne peut PAS viser le héros", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ attack: 2, keywords: ["raid"] }));
    a.hasSummoningSickness = true;
    s.players[0].board.push(a);
    s.players[1].board.push(mkInstance(mkCard({})));
    expect(getValidTargets(s, a.instanceId)).not.toContain("enemy_hero");
  });
});
