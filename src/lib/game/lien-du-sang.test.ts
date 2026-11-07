// LIEN DU SANG X : selon son déclencheur, la créature gagne +X/+X PERMANENT et
// son propriétaire perd X PV.
//
// Arbitrages de l'auteur (2026-11-07), verrouillés ici :
//   1. le paiement doit laisser le héros à 1 PV minimum ; sinon RIEN ne se
//      passe, ni perte ni bonus (pas de paiement partiel, jamais de suicide) ;
//   2. perte DIRECTE, comme le coût en vie : l'armure n'absorbe rien et la
//      perte ne compte pas comme des dégâts ;
//   3. paiement automatique, aucune fenêtre de choix ;
//   4. tous les déclencheurs, mort, retour et pioche compris ;
//   5. bénéficiaire : la créature porteuse, jamais une autre.
import { describe, expect, it } from "vitest";
import { CURATED_KEYWORD_MODES } from "@/lib/card-engine/constants";
import { applyAction } from "./engine";
import { describeKeyword } from "./keyword-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, GameState, KeywordInstance, KeywordMode, SpellKeywordInstance } from "./types";

/** Porteuse 2/2 de Lien du sang. `mode` absent ⇒ entrée en jeu. */
function liee(x = 2, mode?: KeywordMode, extra: Record<string, unknown> = {}) {
  return mkInstance(mkCard({
    name: "Liée", mana_cost: 0, attack: 2, health: 2, keywords: ["lien_du_sang"],
    keyword_instances: [{ id: "lien_du_sang", x, ...(mode ? { mode } : {}) } as KeywordInstance],
    ...extra,
  }));
}

function jouer(s: GameState, ci: ReturnType<typeof mkInstance>): GameState {
  s.players[0].hand.push(ci);
  return applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId } as GameAction);
}

const surPlateau = (st: GameState) => st.players[0].board.find(c => c.card.name === "Liée")!;
const pv = (st: GameState) => st.players[0].hero.hp;
const stats = (c: ReturnType<typeof mkInstance>) => [c.currentAttack, c.currentHealth, c.maxHealth];

/** Plateau posé d'avance : la porteuse est déjà en jeu, réveillée. */
function enJeu(x: number, mode: KeywordMode, hp = 30) {
  const s = mkState();
  s.players[0].hero.hp = hp;
  const c = liee(x, mode);
  c.hasSummoningSickness = false;
  s.players[0].board.push(c);
  // Decks garnis : sans eux, la fatigue de pioche fausserait le décompte des PV.
  for (const p of s.players) p.deck.push(...Array.from({ length: 6 }, () => mkInstance(mkCard({ name: "Pioche", attack: 1, health: 1 }))));
  return { s, c };
}

// ───────────────────────────────────────────────────────────────────────────

describe("à l'entrée en jeu", () => {
  it("+X/+X à la créature, X PV de moins au héros", () => {
    const st = jouer(mkState(), liee(3));
    expect(stats(surPlateau(st))).toEqual([5, 5, 5]);
    expect(pv(st)).toBe(27);
  });

  it("le bonus est cuit dans la carte, donc permanent", () => {
    const st = jouer(mkState(), liee(2));
    const c = surPlateau(st);
    expect([c.card.attack, c.card.health]).toEqual([4, 4]);
  });

  it("le héros adverse n'est pas touché", () => {
    expect(jouer(mkState(), liee(3)).players[1].hero.hp).toBe(30);
  });
});

describe("la garde de PV", () => {
  it.each([
    ["exactement X PV", 3],
    ["moins de X PV", 2],
  ])("%s : ni perte ni bonus", (_, hp) => {
    const s = mkState();
    s.players[0].hero.hp = hp;
    const st = jouer(s, liee(3));
    expect(pv(st)).toBe(hp);
    expect(stats(surPlateau(st))).toEqual([2, 2, 2]);
    expect(st.winner).toBeNull();
  });

  it("X + 1 PV : paie et reste à 1 PV", () => {
    const s = mkState();
    s.players[0].hero.hp = 4;
    const st = jouer(s, liee(3));
    expect(pv(st)).toBe(1);
    expect(stats(surPlateau(st))).toEqual([5, 5, 5]);
  });

  it("la garde lit les PV APRÈS le coût en vie de la carte", () => {
    const s = mkState();
    s.players[0].hero.hp = 5;
    const st = jouer(s, liee(3, undefined, { life_cost: 2 }));
    expect(pv(st)).toBe(3); // 5 - 2 de coût ; 3 - 3 tomberait à 0 : pas de lien
    expect(stats(surPlateau(st))).toEqual([2, 2, 2]);
  });
});

describe("une perte directe, pas des dégâts", () => {
  it("l'armure n'absorbe rien et reste intacte", () => {
    const s = mkState();
    s.players[0].hero.armor = 5;
    const st = jouer(s, liee(3));
    expect(pv(st)).toBe(27);
    expect(st.players[0].hero.armor).toBe(5);
  });

  it("une armure ne permet pas de payer sans PV", () => {
    const s = mkState();
    s.players[0].hero.hp = 3;
    s.players[0].hero.armor = 10;
    const st = jouer(s, liee(3));
    expect(pv(st)).toBe(3);
    expect(stats(surPlateau(st))).toEqual([2, 2, 2]);
  });
});

describe("les autres déclencheurs", () => {
  it("fin de tour : se répète à chaque tour et s'arrête quand les PV manquent", () => {
    const { s } = enJeu(2, "end_of_turn", 5);
    let st = applyAction(s, { type: "end_turn" });
    expect(pv(st)).toBe(3);
    expect(stats(surPlateau(st))).toEqual([4, 4, 4]);
    st = applyAction(st, { type: "end_turn" }); // tour de P2
    st = applyAction(st, { type: "end_turn" });
    expect(pv(st)).toBe(1);
    expect(stats(surPlateau(st))).toEqual([6, 6, 6]);
    st = applyAction(st, { type: "end_turn" });
    st = applyAction(st, { type: "end_turn" });
    expect(pv(st)).toBe(1);
    expect(stats(surPlateau(st))).toEqual([6, 6, 6]);
  });

  it("début de tour", () => {
    const { s } = enJeu(2, "start_of_turn");
    let st = applyAction(s, { type: "end_turn" });
    expect(pv(st)).toBe(30);
    st = applyAction(st, { type: "end_turn" });
    expect(pv(st)).toBe(28);
    expect(stats(surPlateau(st))).toEqual([4, 4, 4]);
  });

  it("à l'attaque : le bonus compte, et une seule fois", () => {
    const { s, c } = enJeu(2, "attack");
    const st = applyAction(s, { type: "attack", attackerInstanceId: c.instanceId, targetInstanceId: "enemy_hero" } as GameAction);
    expect(pv(st)).toBe(28);
    expect(surPlateau(st).card.attack).toBe(4);
  });

  it("à l'activation", () => {
    const { s, c } = enJeu(2, "tap");
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: c.instanceId, instanceIdx: 0 });
    expect(pv(st)).toBe(28);
    expect(stats(surPlateau(st))).toEqual([4, 4, 4]);
  });

  it("à la mort : le héros paie, le bonus part avec la carte au cimetière", () => {
    const { s, c } = enJeu(2, "death");
    c.currentHealth = 1;
    const tueuse = mkInstance(mkCard({ name: "Tueuse", attack: 5, health: 9 }));
    tueuse.hasSummoningSickness = false;
    s.players[1].board.push(tueuse);
    s.currentPlayerIndex = 1;
    const st = applyAction(s, { type: "attack", attackerInstanceId: tueuse.instanceId, targetInstanceId: c.instanceId } as GameAction);
    expect(pv(st)).toBe(28);
    expect(st.players[0].graveyard.find(g => g.card.name === "Liée")!.card.attack).toBe(4);
  });

  it("à la pioche : le bonus reste sur la carte en main", () => {
    const s = mkState();
    s.players[0].deck.push(liee(2, "draw"));
    let st = applyAction(s, { type: "end_turn" });
    st = applyAction(st, { type: "end_turn" });
    expect(pv(st)).toBe(28);
    expect(st.players[0].hand.find(c => c.card.name === "Liée")!.card.attack).toBe(4);
  });

  it("à la blessure : se déclenche quand la créature survit au coup", () => {
    const { s, c } = enJeu(2, "wound");
    const griffe = mkInstance(mkCard({ name: "Griffe", attack: 1, health: 9 }));
    griffe.hasSummoningSickness = false;
    s.players[1].board.push(griffe);
    s.currentPlayerIndex = 1;
    const st = applyAction(s, { type: "attack", attackerInstanceId: griffe.instanceId, targetInstanceId: c.instanceId } as GameAction);
    expect(pv(st)).toBe(28);
    expect(surPlateau(st).card.attack).toBe(4);
  });

  it("au retour en main : le bonus reste sur la carte", () => {
    const { s, c } = enJeu(2, "return");
    const renvoi = mkInstance(mkCard({
      name: "Renvoi", mana_cost: 0, card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "remontee" }] as SpellKeywordInstance[],
    }));
    s.players[0].hand.push(renvoi);
    const st = applyAction(s, { type: "play_card", cardInstanceId: renvoi.instanceId, targetInstanceId: c.instanceId } as GameAction);
    expect(pv(st)).toBe(28);
    expect(st.players[0].hand.find(x => x.card.name === "Liée")!.card.attack).toBe(4);
  });

  it("sous 15 PV : la capacité ne repart pas d'elle-même", () => {
    const { s } = enJeu(2, "low_hp", 14);
    const st = applyAction(s, { type: "end_turn" });
    expect(pv(st)).toBe(12);
    expect(stats(surPlateau(st))).toEqual([4, 4, 4]);
  });
});

describe("la permanence du bonus", () => {
  it("survit au recalcul des auras d'une action suivante", () => {
    const st = jouer(jouer(mkState(), liee(2)), mkInstance(mkCard({ name: "Suiveuse", mana_cost: 0, attack: 1, health: 1 })));
    expect(stats(surPlateau(st))).toEqual([4, 4, 4]);
  });
});

describe("le seuil des 15 PV", () => {
  it("la perte fait partir les effets « sous 15 PV » d'une alliée", () => {
    const s = mkState();
    s.players[0].hero.hp = 16;
    const veilleuse = liee(1, "low_hp", { name: "Veilleuse" });
    s.players[0].board.push(veilleuse);
    const st = jouer(s, liee(2));
    expect(pv(st)).toBe(13); // 16 - 2 (entrée) - 1 (Veilleuse, sous le seuil)
    expect(st.players[0].board.find(c => c.card.name === "Veilleuse")!.currentAttack).toBe(3);
  });
});

describe("l'exposition aux auteurs", () => {
  it("la forge propose tous les déclencheurs", () => {
    const modes = CURATED_KEYWORD_MODES["Lien du sang X"];
    for (const m of ["death", "tap", "return", "end_of_turn", "start_of_turn", "attack", "draw", "low_hp", "wound", "delay"]) {
      expect(modes.has(m as never), m).toBe(true);
    }
  });

  it("le descriptif porte la valeur de X", () => {
    expect(describeKeyword("lien_du_sang", { x: 3 })).toBe("Gagne +3/+3 et vous perdez 3 PV, si vos PV le permettent.");
  });
});
