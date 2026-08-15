// DISCIPLINE +X/+Y : un Renforcement qui ne tombe que si le plateau du
// déclencheur est « discipliné » — tous ses coûts de la même parité que celui
// de la carte qui déclenche.
//
// Trois choses à verrouiller, dans cet ordre d'importance :
//
//   1. Le COÛT RÉEL, pas le coût imprimé. C'est l'arbitrage explicite de
//      l'auteur, et c'est aussi le seul point que la lecture du code ne rend
//      pas évident : Entraide et Concentration peuvent faire basculer une
//      parité sans qu'aucune carte ne bouge.
//   2. La condition est lue UNE FOIS, au déclenchement, et le gain est
//      DÉFINITIF. Discipline n'est pas une aura : ce qui a été gagné ne doit
//      pas retomber quand le plateau se dépareille ensuite. C'est ce qui la
//      sépare de Pureté, Force des ancêtres et Seuil Sacrificiel.
//   3. Les deux faces : créature → elle-même, sort → une alliée CIBLÉE.
import { describe, expect, it } from "vitest";
import { applyAction, boardIsDisciplined, recalculateAuras } from "./engine";
import { mkCard, mkInstance, mkPlayer, mkState } from "./test-harness";
import type { GameAction, SpellKeywordInstance } from "./types";

/** Une créature nue au coût voulu, juste pour peupler un plateau. */
function figurant(mana_cost: number, name = `F${mana_cost}`) {
  return mkInstance(mkCard({ name, mana_cost, attack: 1, health: 1 }));
}

/** Créature porteuse de Discipline. `mode` absent ⇒ entrée en jeu. */
function disciplinee(opts: {
  mana_cost: number; x: number; y: number; mode?: "death" | "attack" | "tap";
  attack?: number; health?: number; name?: string;
}) {
  const { mana_cost, x, y, mode, attack = 2, health = 2, name = "Sergent" } = opts;
  return mkInstance(mkCard({
    name, mana_cost, attack, health,
    keywords: ["discipline"] as never,
    keyword_instances: [{ id: "discipline", x, y, ...(mode ? { mode } : {}) }] as never,
  }));
}

function play(state: ReturnType<typeof mkState>, ci: ReturnType<typeof mkInstance>, targetInstanceId?: string): GameAction {
  state.players[0].hand.push(ci);
  return { type: "play_card", cardInstanceId: ci.instanceId, targetInstanceId };
}

// ───────────────────────────────────────────────────────────────────────────

describe("le prédicat de parité", () => {
  it("plateau tout pair + déclencheur pair ⇒ discipliné", () => {
    const p = mkPlayer("P1");
    p.board.push(figurant(2), figurant(4), figurant(6));
    expect(boardIsDisciplined(p, 4)).toBe(true);
  });

  it("plateau tout pair + déclencheur IMPAIR ⇒ rompu", () => {
    const p = mkPlayer("P1");
    p.board.push(figurant(2), figurant(4));
    expect(boardIsDisciplined(p, 3)).toBe(false);
  });

  it("une seule créature de la mauvaise parité suffit à tout rompre", () => {
    const p = mkPlayer("P1");
    p.board.push(figurant(2), figurant(4), figurant(3));
    expect(boardIsDisciplined(p, 2)).toBe(false);
  });

  it("plateau tout impair + déclencheur impair ⇒ discipliné", () => {
    const p = mkPlayer("P1");
    p.board.push(figurant(1), figurant(3), figurant(7));
    expect(boardIsDisciplined(p, 5)).toBe(true);
  });

  it("0 est PAIR — un jeton gratuit range le plateau du côté pair", () => {
    const p = mkPlayer("P1");
    p.board.push(figurant(0), figurant(2));
    expect(boardIsDisciplined(p, 4)).toBe(true);
    expect(boardIsDisciplined(p, 3)).toBe(false);
  });

  it("plateau VIDE ⇒ vrai, faute de contre-exemple", () => {
    expect(boardIsDisciplined(mkPlayer("P1"), 3)).toBe(true);
  });

  it("le plateau ADVERSE n'entre pas dans le calcul", () => {
    // Le prédicat prend un joueur, pas un état : c'est structurellement
    // impossible de se tromper de camp — ce test le fige quand même, parce que
    // le jour où la signature changera, la règle devra rester celle-ci.
    const moi = mkPlayer("P1");
    const lui = mkPlayer("P2");
    moi.board.push(figurant(2));
    lui.board.push(figurant(3));
    expect(boardIsDisciplined(moi, 2)).toBe(true);
  });
});

describe("le coût lu est le coût RÉEL, pas le coût imprimé", () => {
  it("Concentration déplace la parité d'une créature du plateau", () => {
    // Coût imprimé 3 (impair), remise de 1 gravée sur l'instance ⇒ coût réel 2
    // (pair). Avec le coût imprimé, un plateau pair serait rompu ; avec le coût
    // réel, il tient. C'est LE test qui distingue les deux lectures.
    const p = mkPlayer("P1");
    const remisee = figurant(3);
    remisee.manaCostReduction = 1;
    p.board.push(figurant(2), remisee);
    expect(boardIsDisciplined(p, 4)).toBe(true);
    // Et la lecture « coût imprimé » donnerait exactement l'inverse :
    expect(p.board.map(c => c.card.mana_cost % 2)).toEqual([0, 1]);
  });

  it("Entraide déplace la parité, et donc la discipline, sans qu'aucune carte ne bouge", () => {
    // Entraide réduit le coût d'une créature d'autant d'alliés de la race
    // visée. La réduction se recalcule sur le plateau COURANT : la parité d'une
    // créature déjà en jeu peut basculer parce qu'une AUTRE est arrivée.
    const p = mkPlayer("P1");
    const solidaire = mkInstance(mkCard({
      name: "Solidaire", mana_cost: 5, attack: 1, health: 1,
      keywords: ["entraide"] as never, entraide_race: "elves" as never,
    }));
    p.board.push(solidaire);
    // Seule en jeu : aucun elfe, coût réel 5 (impair).
    expect(boardIsDisciplined(p, 3)).toBe(true);

    p.board.push(mkInstance(mkCard({ name: "Elfe", mana_cost: 3, attack: 1, health: 1, race: "elves" as never })));
    // Un elfe ⇒ coût réel 4 (pair), l'elfe lui-même est à 3 (impair) : rompu.
    expect(boardIsDisciplined(p, 3)).toBe(false);
    expect(boardIsDisciplined(p, 4)).toBe(false);
  });
});

describe("face CRÉATURE — à l'entrée en jeu", () => {
  it("plateau discipliné ⇒ elle se renforce elle-même", () => {
    const s = mkState();
    s.players[0].board.push(figurant(2), figurant(6));
    const st = applyAction(s, play(s, disciplinee({ mana_cost: 4, x: 2, y: 3 })));
    const c = st.players[0].board.find(u => u.card.name === "Sergent")!;
    expect([c.currentAttack, c.currentHealth, c.maxHealth]).toEqual([4, 5, 5]); // 2/2 + 2/3
  });

  it("plateau dépareillé ⇒ rien du tout", () => {
    const s = mkState();
    s.players[0].board.push(figurant(2), figurant(3));
    const st = applyAction(s, play(s, disciplinee({ mana_cost: 4, x: 2, y: 3 })));
    const c = st.players[0].board.find(u => u.card.name === "Sergent")!;
    expect([c.currentAttack, c.currentHealth, c.maxHealth]).toEqual([2, 2, 2]);
  });

  it("arrivée SEULE en jeu ⇒ disciplinée (elle compte dans son propre plateau)", () => {
    const s = mkState();
    const st = applyAction(s, play(s, disciplinee({ mana_cost: 3, x: 1, y: 1 })));
    const c = st.players[0].board.find(u => u.card.name === "Sergent")!;
    expect([c.currentAttack, c.maxHealth]).toEqual([3, 3]);
  });

  it("sa PROPRE parité est celle qui fait foi", () => {
    // Plateau tout impair : une Discipline paire n'y trouve pas son compte,
    // une impaire oui. Même plateau, deux résultats.
    const paire = mkState();
    paire.players[0].board.push(figurant(1), figurant(5));
    const a = applyAction(paire, play(paire, disciplinee({ mana_cost: 4, x: 2, y: 2 })));
    expect(a.players[0].board.find(u => u.card.name === "Sergent")!.currentAttack).toBe(2);

    const impaire = mkState();
    impaire.players[0].board.push(figurant(1), figurant(5));
    const b = applyAction(impaire, play(impaire, disciplinee({ mana_cost: 3, x: 2, y: 2 })));
    expect(b.players[0].board.find(u => u.card.name === "Sergent")!.currentAttack).toBe(4);
  });

  it("le plateau ADVERSE ne rompt jamais la discipline", () => {
    const s = mkState();
    s.players[0].board.push(figurant(2));
    s.players[1].board.push(figurant(3), figurant(7));
    const st = applyAction(s, play(s, disciplinee({ mana_cost: 4, x: 2, y: 2 })));
    expect(st.players[0].board.find(u => u.card.name === "Sergent")!.currentAttack).toBe(4);
  });
});

describe("le gain est DÉFINITIF — Discipline n'est pas une aura", () => {
  it("le bonus survit à un plateau qui se dépareille ensuite", () => {
    // Le piège que ce test garde : implémenter Discipline dans
    // recalculateAuras, comme ses quatre voisines conditionnelles. Le bonus
    // retomberait alors dès la première créature de mauvaise parité.
    const s = mkState();
    s.players[0].board.push(figurant(2));
    const st = applyAction(s, play(s, disciplinee({ mana_cost: 4, x: 2, y: 3 })));
    const c = st.players[0].board.find(u => u.card.name === "Sergent")!;
    expect(c.currentAttack).toBe(4);

    st.players[0].board.push(figurant(5)); // le rang se rompt…
    recalculateAuras(st.players[0], st.players[1]);
    expect([c.currentAttack, c.maxHealth]).toEqual([4, 5]); // …le gain reste
  });

  it("plusieurs recalculs d'auras n'empilent pas le bonus", () => {
    const s = mkState();
    const st = applyAction(s, play(s, disciplinee({ mana_cost: 4, x: 2, y: 3 })));
    for (let i = 0; i < 5; i++) recalculateAuras(st.players[0], st.players[1]);
    const c = st.players[0].board.find(u => u.card.name === "Sergent")!;
    expect([c.currentAttack, c.maxHealth]).toEqual([4, 5]);
  });
});

describe("face CRÉATURE — déclencheur « à l'attaque »", () => {
  it("plateau discipliné ⇒ elle se renforce en attaquant", () => {
    const s = mkState();
    const sergent = disciplinee({ mana_cost: 4, x: 2, y: 2, mode: "attack", attack: 3, health: 5 });
    sergent.hasSummoningSickness = false;
    s.players[0].board.push(sergent, figurant(6));

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: sergent.instanceId, targetInstanceId: "enemy_hero",
    });

    const c = st.players[0].board.find(u => u.card.name === "Sergent")!;
    expect(c.card.attack).toBe(5); // 3 + 2, cuit dans la carte comme Renforcement
  });

  it("plateau dépareillé ⇒ elle attaque sans rien gagner", () => {
    const s = mkState();
    const sergent = disciplinee({ mana_cost: 4, x: 2, y: 2, mode: "attack", attack: 3, health: 5 });
    sergent.hasSummoningSickness = false;
    s.players[0].board.push(sergent, figurant(7));

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: sergent.instanceId, targetInstanceId: "enemy_hero",
    });

    expect(st.players[0].board.find(u => u.card.name === "Sergent")!.card.attack).toBe(3);
  });
});

describe("face SORT — une alliée ciblée", () => {
  const sort = (attack: number, health: number, mana_cost: number) => mkInstance(mkCard({
    name: "Ordre serré", card_type: "spell", mana_cost, attack: null, health: null,
    spell_keywords: [{ id: "discipline", attack, health }] as SpellKeywordInstance[],
  }));

  it("plateau discipliné ⇒ la cible alliée gagne +X/+Y", () => {
    const s = mkState();
    const cible = mkInstance(mkCard({ name: "Cible", mana_cost: 2, attack: 2, health: 3 }));
    s.players[0].board.push(cible, figurant(6));

    const st = applyAction(s, play(s, sort(3, 4, 4), cible.instanceId));
    const t = st.players[0].board.find(c => c.card.name === "Cible")!;
    expect([t.currentAttack, t.currentHealth, t.maxHealth]).toEqual([5, 7, 7]);
  });

  it("plateau dépareillé ⇒ le sort ne donne rien", () => {
    const s = mkState();
    const cible = mkInstance(mkCard({ name: "Cible", mana_cost: 2, attack: 2, health: 3 }));
    s.players[0].board.push(cible, figurant(5));

    const st = applyAction(s, play(s, sort(3, 4, 4), cible.instanceId));
    const t = st.players[0].board.find(c => c.card.name === "Cible")!;
    expect([t.currentAttack, t.currentHealth, t.maxHealth]).toEqual([2, 3, 3]);
  });

  it("c'est la parité du COÛT DU SORT qui décide, pas celle de la cible", () => {
    const s = mkState();
    // Cible impaire sur un plateau… impair. Un sort pair ne trouve pas son
    // compte, un sort impair oui.
    const cible = mkInstance(mkCard({ name: "Cible", mana_cost: 3, attack: 2, health: 3 }));
    s.players[0].board.push(cible);
    const pair = applyAction(s, play(s, sort(3, 4, 4), cible.instanceId));
    expect(pair.players[0].board.find(c => c.card.name === "Cible")!.currentAttack).toBe(2);

    const s2 = mkState();
    const cible2 = mkInstance(mkCard({ name: "Cible", mana_cost: 3, attack: 2, health: 3 }));
    s2.players[0].board.push(cible2);
    const impair = applyAction(s2, play(s2, sort(3, 4, 5), cible2.instanceId));
    expect(impair.players[0].board.find(c => c.card.name === "Cible")!.currentAttack).toBe(5);
  });

  it("une cible ENNEMIE n'est jamais renforcée", () => {
    // Le mot-clé déclare targetType "friendly_creature" ; le résolveur ne
    // cherche donc la cible que du côté du lanceur. Sans cette restriction,
    // un targetMap forgé à la main buffait l'adversaire.
    const s = mkState();
    s.players[0].board.push(figurant(2));
    const ennemi = mkInstance(mkCard({ name: "Ennemi", mana_cost: 2, attack: 2, health: 3 }));
    s.players[1].board.push(ennemi);

    const st = applyAction(s, play(s, sort(3, 4, 4), ennemi.instanceId));
    const e = st.players[1].board.find(c => c.card.name === "Ennemi")!;
    expect([e.currentAttack, e.maxHealth]).toEqual([2, 3]);
  });
});
