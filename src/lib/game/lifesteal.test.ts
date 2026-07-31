// Drain de vie, désormais CENTRALISÉ (cf. applyLifesteal dans engine.ts).
//
// Le mot-clé dit « Soigne votre héros des dégâts infligés », sans restriction —
// mais l'implémentation ne vivait que dans le flux d'attaque : une Arbalétrière
// avec Impact 1 + Drain de vie ne soignait rien. Ces tests verrouillent la règle
// pour TOUTE source de dégât de la créature, et les deux garde-fous :
// on ne draine que sur le camp ADVERSE, et que sur les dégâts RÉELLEMENT subis.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkPlayer, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

/** Créature qui, à l'invocation, inflige X dégâts à une cible ciblée. */
function impactCreature(x: number, opts: { lifesteal?: boolean } = {}): CardInstance {
  return mkInstance(mkCard({
    name: "Arbalétrière du Crépuscule", mana_cost: 2, attack: 2, health: 1,
    keywords: opts.lifesteal ? ["impact", "drain_de_vie"] : ["impact"],
    effect_text: `[Impact ${x}]`,
  }));
}

function play(s: GameState, inst: CardInstance, targetInstanceId?: string): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId, targetInstanceId });
}

const p1Hp = (s: GameState) => s.players[0].hero.hp;
const p2Hp = (s: GameState) => s.players[1].hero.hp;

describe("Drain de vie — sources hors combat", () => {
  it("Impact sur le héros adverse soigne son propre héros (le cas signalé)", () => {
    const s = mkState();
    s.players[0].hero.hp = 20;

    const next = play(s, impactCreature(1, { lifesteal: true }), "enemy_hero");

    expect(p2Hp(next)).toBe(30 - 1); // les dégâts sont bien infligés
    expect(p1Hp(next)).toBe(20 + 1); // et rendus en soin
  });

  it("sans Drain de vie, Impact ne soigne pas", () => {
    const s = mkState();
    s.players[0].hero.hp = 20;

    const next = play(s, impactCreature(1), "enemy_hero");

    expect(p2Hp(next)).toBe(29);
    expect(p1Hp(next)).toBe(20); // inchangé
  });

  it("Impact sur une créature ennemie soigne aussi", () => {
    const s = mkState();
    s.players[0].hero.hp = 20;
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 5 }));
    s.players[1].board.push(cible);

    const next = play(s, impactCreature(3, { lifesteal: true }), cible.instanceId);

    expect(next.players[1].board[0].currentHealth).toBe(2);
    expect(p1Hp(next)).toBe(23);
  });

  it("ne soigne JAMAIS pour des dégâts infligés à son propre camp", () => {
    const s = mkState();
    s.players[0].hero.hp = 20;
    const allie = mkInstance(mkCard({ name: "Allié", attack: 1, health: 5 }));
    s.players[0].board.push(allie);

    const next = play(s, impactCreature(3, { lifesteal: true }), allie.instanceId);

    expect(next.players[0].board.find(c => c.card.name === "Allié")!.currentHealth).toBe(2);
    expect(p1Hp(next)).toBe(20); // aucun remboursement
  });

  it("ne soigne pas ce qu'un Bouclier divin a entièrement absorbé", () => {
    const s = mkState();
    s.players[0].hero.hp = 20;
    const cible = mkInstance(mkCard({ name: "Protégée", attack: 1, health: 5 }));
    cible.hasDivineShield = true;
    s.players[1].board.push(cible);

    const next = play(s, impactCreature(3, { lifesteal: true }), cible.instanceId);

    expect(next.players[1].board[0].currentHealth).toBe(5); // rien encaissé
    expect(p1Hp(next)).toBe(20);                            // donc rien drainé
  });

  it("soigne les dégâts NETS, pas le montant brut, face à Résistance", () => {
    const s = mkState();
    s.players[0].hero.hp = 20;
    const dur = mkInstance(mkCard({
      name: "Résistante", attack: 1, health: 9,
      keywords: ["resistance"], effect_text: "[Résistance 2]",
    }));
    s.players[1].board.push(dur);

    const next = play(s, impactCreature(5, { lifesteal: true }), dur.instanceId);

    const subis = 9 - next.players[1].board[0].currentHealth;
    expect(subis).toBe(3);            // 5 − 2 de Résistance
    expect(p1Hp(next)).toBe(20 + 3);  // le soin suit les dégâts réels
  });
});

describe("Drain de vie — combat (non-régression)", () => {
  it("attaquer le héros adverse soigne toujours", () => {
    const s = mkState();
    s.players[0].hero.hp = 20;
    const vampire = mkInstance(mkCard({
      name: "Vampire", mana_cost: 4, attack: 3, health: 3, keywords: ["drain_de_vie"],
    }));
    s.players[0].board.push(vampire);

    const next = applyAction(s, {
      type: "attack", attackerInstanceId: vampire.instanceId, targetInstanceId: "enemy_hero",
    });

    expect(p2Hp(next)).toBe(27);
    expect(p1Hp(next)).toBe(23);
  });

  it("attaquer une créature soigne des dégâts réellement infligés", () => {
    const s = mkState();
    s.players[0].hero.hp = 20;
    const vampire = mkInstance(mkCard({
      name: "Vampire", mana_cost: 4, attack: 3, health: 6, keywords: ["drain_de_vie"],
    }));
    const defenseur = mkInstance(mkCard({ name: "Défenseur", attack: 1, health: 10 }));
    s.players[0].board.push(vampire);
    s.players[1].board.push(defenseur);

    const next = applyAction(s, {
      type: "attack", attackerInstanceId: vampire.instanceId, targetInstanceId: defenseur.instanceId,
    });

    expect(next.players[1].board[0].currentHealth).toBe(7);
    expect(p1Hp(next)).toBe(23);
  });

  it("le DÉFENSEUR aussi draine, sur sa riposte", () => {
    const s = mkState();
    s.players[1].hero.hp = 20;
    const attaquant = mkInstance(mkCard({ name: "Attaquant", attack: 2, health: 10 }));
    const vampire = mkInstance(mkCard({
      name: "Vampire", attack: 3, health: 8, keywords: ["drain_de_vie"],
    }));
    s.players[0].board.push(attaquant);
    s.players[1].board.push(vampire);

    const next = applyAction(s, {
      type: "attack", attackerInstanceId: attaquant.instanceId, targetInstanceId: vampire.instanceId,
    });

    // La riposte du Vampire inflige 3 à l'attaquant → +3 au héros de P2.
    expect(next.players[0].board[0].currentHealth).toBe(7);
    expect(p2Hp(next)).toBe(23);
  });
});

describe("Drain de vie — garde-fous", () => {
  it("le coût de Douleur (auto-dégât) ne se rembourse pas", () => {
    const s = mkState();
    s.players[0].hero.hp = 20;
    const douloureuse = mkInstance(mkCard({
      name: "Pénitente", mana_cost: 2, attack: 3, health: 3,
      keywords: ["douleur", "drain_de_vie"], effect_text: "[Douleur 2]",
    }));

    const next = play(s, douloureuse);

    // Les 2 dégâts sont bien payés, et NON récupérés par le drain.
    expect(p1Hp(next)).toBe(18);
  });

  it("la fatigue ne soigne personne (aucune source)", () => {
    const s = mkState();
    const p2 = mkPlayer("P2");
    p2.hero.hp = 25;
    s.players[1] = p2;
    s.players[1].deck = [];
    s.players[1].fatigueDamage = 0;

    const next = applyAction(s, { type: "end_turn" });

    expect(p2Hp(next)).toBeLessThan(25); // la fatigue mord
    expect(p1Hp(next)).toBe(30);         // et ne soigne rien
  });
});
