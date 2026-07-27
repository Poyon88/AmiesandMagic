// « Touché mortel » : toute créature RÉELLEMENT blessée par la source meurt,
// quels que soient ses PV. Deux formes, comme Précision :
//  - créature : ses dégâts (combat comme capacité) sont mortels ;
//  - sort : modificateur global — tous les dégâts du sort sont mortels. Le sort
//    « a » le mot-clé, il ne le confère pas.
//
// Le mot n'est mortel que si la blessure a bien eu lieu : Bouclier divin,
// Transcendance et Indestructible sortent avant tout dégât, donc protègent.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

function killer(name = "Assassin", over: Record<string, unknown> = {}): CardInstance {
  const c = mkInstance(mkCard({ name, attack: 1, health: 5, keywords: ["touche_mortel"] as never, ...over }));
  c.hasSummoningSickness = false;
  return c;
}

function beefy(name = "Colosse", over: Record<string, unknown> = {}): CardInstance {
  const c = mkInstance(mkCard({ name, attack: 1, health: 12, ...over }));
  c.hasSummoningSickness = false;
  return c;
}

/** Sort de dégâts, avec ou sans Touché mortel. */
function boltSpell(lethal: boolean, amount = 1): CardInstance {
  return mkInstance(mkCard({
    name: "Trait", card_type: "spell", attack: null, health: null,
    spell_keywords: [
      { id: "impact", amount },
      ...(lethal ? [{ id: "touche_mortel" }] : []),
    ] as never,
  }));
}

const boardNames = (s: GameState, side: 0 | 1) => s.players[side].board.map((c) => c.card.name);

describe("Touché mortel — créature", () => {
  it("tue en attaquant, quels que soient les PV de la cible", () => {
    const s = mkState();
    const a = killer();
    const target = beefy();
    s.players[0].board.push(a);
    s.players[1].board.push(target);

    const next = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: target.instanceId });

    expect(boardNames(next, 1)).not.toContain("Colosse");
  });

  it("tue AUSSI l'attaquant quand il est le défenseur (riposte de combat)", () => {
    const s = mkState();
    const attacker = beefy("Brute");
    const defender = killer("Épine");
    s.players[0].board.push(attacker);
    s.players[1].board.push(defender);

    const next = applyAction(s, { type: "attack", attackerInstanceId: attacker.instanceId, targetInstanceId: defender.instanceId });

    expect(boardNames(next, 0)).not.toContain("Brute");
  });

  it("un Bouclier divin absorbe le coup : pas de blessure, donc pas de mort", () => {
    const s = mkState();
    const a = killer();
    const shielded = beefy("Gardien", { keywords: ["divine_shield"] });
    // mkInstance ne dérive pas l'état du mot-clé : on arme le bouclier à la main.
    shielded.hasDivineShield = true;
    s.players[0].board.push(a);
    s.players[1].board.push(shielded);

    const next = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: shielded.instanceId });

    const survivor = next.players[1].board.find((c) => c.card.name === "Gardien");
    expect(survivor).toBeDefined();
    expect(survivor!.hasDivineShield).toBe(false);
  });

  it("sans le mot-clé, la cible encaisse normalement", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ name: "Recrue", attack: 1, health: 5 }));
    a.hasSummoningSickness = false;
    const target = beefy();
    s.players[0].board.push(a);
    s.players[1].board.push(target);

    const next = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: target.instanceId });

    const survivor = next.players[1].board.find((c) => c.card.name === "Colosse");
    expect(survivor?.currentHealth).toBe(11);
  });
});

describe("Touché mortel — sort", () => {
  it("un sort porteur tue tout ce qu'il blesse", () => {
    const s = mkState();
    const target = beefy();
    s.players[1].board.push(target);
    const spell = boltSpell(true);
    s.players[0].hand.push(spell);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: spell.instanceId, targetInstanceId: target.instanceId,
    });

    expect(boardNames(next, 1)).not.toContain("Colosse");
  });

  it("le même sort sans le mot-clé laisse la cible en vie", () => {
    const s = mkState();
    const target = beefy();
    s.players[1].board.push(target);
    const spell = boltSpell(false);
    s.players[0].hand.push(spell);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: spell.instanceId, targetInstanceId: target.instanceId,
    });

    expect(next.players[1].board.find((c) => c.card.name === "Colosse")?.currentHealth).toBe(11);
  });

  it("le modificateur ne fuit pas sur l'action suivante", () => {
    const s = mkState();
    s.players[1].board.push(beefy("Colosse"), beefy("Second"));
    const lethal = boltSpell(true);
    const plain = boltSpell(false);
    s.players[0].hand.push(lethal, plain);

    const mid = applyAction(s, {
      type: "play_card", cardInstanceId: lethal.instanceId,
      targetInstanceId: s.players[1].board[0].instanceId,
    });
    const second = mid.players[1].board.find((c) => c.card.name === "Second")!;
    const next = applyAction(mid, {
      type: "play_card", cardInstanceId: plain.instanceId, targetInstanceId: second.instanceId,
    });

    expect(next.players[1].board.find((c) => c.card.name === "Second")?.currentHealth).toBe(11);
  });
});
