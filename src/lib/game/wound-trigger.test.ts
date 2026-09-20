// Déclencheur « BLESSURE » (mode "wound" / trigger on_wound).
//
// Règle arbitrée par l'auteur : la capacité part quand CETTE créature subit des
// dégâts et y SURVIT, une fois par SOURCE de dégâts différente et par tour.
//
// Ce qui est verrouillé ici, point par point :
//   1. blessure RÉELLE seulement (un Bouclier qui absorbe tout ne compte pas) ;
//   2. la source est le LANCEMENT ou l'EXEMPLAIRE, pas le nom de la carte :
//      un sort qui frappe trois fois = 1, deux exemplaires = 2, une même
//      créature par deux canaux = 1 ;
//   3. « sans mourir » se juge à la frontière d'effet, pas au premier point ;
//   4. la mémoire des sources tombe à chaque fin de tour ;
//   5. Poison (tick) et Vampirisme (vol de PV) comptent, hors canal de dégâts ;
//   6. la cible « damage_source » vise le coupable, héros de son camp à défaut.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, GameState, TargetSpec } from "./types";

const HEROS_ENNEMI: TargetSpec = { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" };
const COUPABLE: TargetSpec = { entity: "damage_source", count: 1, side: "any", location: "board", designation: "automatic" };

function capWound(composed: ComposedEffect, uid = "w0"): Capability {
  return { uid, trigger: "on_wound", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** Créature « Blessure : 2 dégâts au héros ennemi » — un compteur lisible : le
 *  héros d'en face perd 2 PV par déclenchement. */
function ecorchee(pv = 5, atk = 0) {
  return mkInstance(mkCard({
    name: "Écorchée", mana_cost: 3, attack: atk, health: pv,
    capabilities: [capWound({ content: "deal_damage", magnitude: { x: 2 }, target: HEROS_ENNEMI })],
  }));
}

/** Créature « Blessure : 2 dégâts à ce qui l'a blessée ». */
function vengeresse(pv = 5, atk = 0) {
  return mkInstance(mkCard({
    name: "Vengeresse", mana_cost: 3, attack: atk, health: pv,
    capabilities: [capWound({ content: "deal_damage", magnitude: { x: 2 }, target: COUPABLE })],
  }));
}

/** Sort de dégâts sur les unités ennemies. `scatter` : x points servis un par un
 *  (donc x paquets de dégâts du MÊME lancement) ; sinon x d'un bloc à toutes. */
function sortDegats(x: number, scatter = false, nom = "Éclair") {
  return mkInstance(mkCard({
    name: nom, card_type: "spell", mana_cost: 0, attack: null, health: null,
    capabilities: [{
      uid: "s0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [],
      composed: {
        content: "deal_damage", magnitude: { x },
        target: { entity: "unit", count: scatter ? 1 : "all", side: "enemy", location: "board", designation: scatter ? "scatter" : "automatic" },
      },
    }],
  }));
}

function attaquant(atk: number, pv = 10) {
  return mkInstance(mkCard({ name: "Attaquant", mana_cost: 2, attack: atk, health: pv }));
}

/** État dont les decks ne sont PAS vides : une fin de tour à deck vide inflige
 *  1 de fatigue au héros, ce qui fausserait le compteur de déclenchements. */
function mkStateAvecDecks(): GameState {
  const s = mkState();
  for (const p of s.players) p.deck = [attaquant(1), attaquant(1), attaquant(1)];
  return s;
}

function lance(s: GameState, instanceId: string): GameState {
  return applyAction(s, { type: "play_card", cardInstanceId: instanceId });
}

/** PV perdus par le héros de P1 = 2 × nombre de déclenchements de l'Écorchée de P2. */
const declenchements = (s: GameState) => (30 - s.players[0].hero.hp) / 2;

describe("blessure — le cas de base", () => {
  it("un sort blesse sans tuer : le pouvoir part une fois, sans pause", () => {
    const s = mkState();
    s.players[1].board = [ecorchee()];
    const sort = sortDegats(1);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(4);
    expect(declenchements(st)).toBe(1);
    expect(st.pendingTriggers ?? []).toEqual([]);
    expect(st.effectStack ?? []).toEqual([]);
  });

  it("une créature sans le pouvoir ne déclenche rien (mais retient la source)", () => {
    const s = mkState();
    s.players[1].board = [attaquant(1, 5)];
    const sort = sortDegats(1);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[0].hero.hp).toBe(30);
    expect(st.players[1].board[0].woundSourcesThisTurn).toHaveLength(1);
  });

  it("un Bouclier qui absorbe tout n'est pas une blessure", () => {
    const s = mkState();
    const e = ecorchee();
    e.hasDivineShield = true;
    s.players[1].board = [e];
    const sort = sortDegats(3);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(5);
    expect(declenchements(st)).toBe(0);
    expect(st.players[1].board[0].woundSourcesThisTurn ?? []).toEqual([]);
  });
});

describe("blessure — une fois par SOURCE", () => {
  it("un même sort qui frappe trois fois ne déclenche qu'une fois", () => {
    const s = mkState();
    s.players[1].board = [ecorchee(5)];
    const sort = sortDegats(3, true);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(2);
    expect(declenchements(st)).toBe(1);
  });

  it("« sans mourir » se juge le sort FINI : 3×1 sur une 2 PV ne déclenche rien", () => {
    const s = mkState();
    s.players[1].board = [ecorchee(2)];
    const sort = sortDegats(3, true);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].board).toHaveLength(0);
    expect(declenchements(st)).toBe(0);
  });

  it("deux exemplaires de la MÊME carte sont deux sources", () => {
    const s = mkState();
    s.players[1].board = [ecorchee(5)];
    const carte = sortDegats(1).card;
    const a = mkInstance(carte), b = mkInstance(carte);
    s.players[0].hand = [a, b];

    let st = lance(s, a.instanceId);
    st = lance(st, b.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(3);
    expect(declenchements(st)).toBe(2);
  });

  it("une même créature qui frappe deux fois dans le tour ne compte qu'une fois ; une autre compte", () => {
    const s = mkState();
    const e = ecorchee(10);
    s.players[1].board = [e];
    const a = attaquant(1), b = attaquant(1);
    a.attacksRemaining = 2;
    s.players[0].board = [a, b];

    let st = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: e.instanceId });
    expect(declenchements(st)).toBe(1);

    // 2ᵉ assaut du MÊME attaquant : déjà encaissé ce tour-ci.
    const a2 = st.players[0].board.find(c => c.instanceId === a.instanceId)!;
    a2.hasAttacked = false; a2.attacksRemaining = 1; a2.tapped = false; a2.targetsAttackedThisTurn = [];
    st = applyAction(st, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: e.instanceId });
    expect(st.players[1].board[0].currentHealth).toBe(8);
    expect(declenchements(st)).toBe(1);

    // Un AUTRE attaquant : nouvelle source.
    st = applyAction(st, { type: "attack", attackerInstanceId: b.instanceId, targetInstanceId: e.instanceId });
    expect(declenchements(st)).toBe(2);
  });

  it("en combat, l'ATTAQUANT blessé par la riposte déclenche aussi", () => {
    const s = mkState();
    // Ici l'Écorchée est à P1 et attaque : son pouvoir frappe le héros de P2.
    const e = ecorchee(5, 1);
    s.players[0].board = [e];
    const cible = attaquant(2, 5);
    s.players[1].board = [cible];

    const st = applyAction(s, { type: "attack", attackerInstanceId: e.instanceId, targetInstanceId: cible.instanceId });

    expect(st.players[0].board[0].currentHealth).toBe(3);
    expect(st.players[1].hero.hp).toBe(28);
  });
});

describe("blessure — fenêtre d'un tour", () => {
  it("la mémoire des sources tombe à la fin du tour (des deux camps)", () => {
    const s = mkState();
    s.players[1].board = [ecorchee(10)];
    s.players[0].board = [attaquant(1, 10)];
    s.players[0].board[0].woundSourcesThisTurn = ["c:quelquun"];
    const sort = sortDegats(1);
    s.players[0].hand = [sort];

    let st = lance(s, sort.instanceId);
    expect(st.players[1].board[0].woundSourcesThisTurn).toHaveLength(1);

    st = applyAction(st, { type: "end_turn" });
    expect(st.players[1].board[0].woundSourcesThisTurn ?? []).toEqual([]);
    expect(st.players[0].board[0].woundSourcesThisTurn ?? []).toEqual([]);
  });

  it("le même attaquant redéclenche au tour suivant", () => {
    const s = mkStateAvecDecks();
    const e = ecorchee(10);
    s.players[1].board = [e];
    const a = attaquant(1);
    s.players[0].board = [a];

    let st = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: e.instanceId });
    st = applyAction(st, { type: "end_turn" }); // → P2
    st = applyAction(st, { type: "end_turn" }); // → P1
    st = applyAction(st, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: e.instanceId });

    expect(declenchements(st)).toBe(2);
  });
});

describe("blessure — hors canal de dégâts", () => {
  it("le tick de Poison blesse : le pouvoir part, et le Poison est SA propre source", () => {
    const s = mkStateAvecDecks();
    const e = ecorchee(5);
    e.isPoisoned = true;
    s.players[1].board = [e];

    const st = applyAction(s, { type: "end_turn" }); // début du tour de P2 : tick

    const apres = st.players[1].board[0];
    expect(apres.currentHealth).toBe(4);
    expect(declenchements(st)).toBe(1);
    expect(apres.woundSourcesThisTurn).toEqual(["poison"]);
  });

  it("le tick de Poison qui TUE ne déclenche rien", () => {
    const s = mkStateAvecDecks();
    const e = ecorchee(1);
    e.isPoisoned = true;
    s.players[1].board = [e];

    const st = applyAction(s, { type: "end_turn" });

    expect(st.players[1].board).toHaveLength(0);
    expect(declenchements(st)).toBe(0);
  });

  it("le vol de PV de Vampirisme blesse", () => {
    const s = mkState();
    const e = ecorchee(5);
    s.players[1].board = [e];
    const vampire = mkInstance(mkCard({
      name: "Vampire", mana_cost: 2, attack: 1, health: 1,
      keywords: ["vampirisme"] as never, effect_text: "[Vampirisme 2]",
    }));
    s.players[0].hand = [vampire];

    const st = applyAction(s, { type: "play_card", cardInstanceId: vampire.instanceId, targetInstanceId: e.instanceId });

    expect(st.players[1].board[0].currentHealth).toBe(3);
    expect(declenchements(st)).toBe(1);
    expect(st.players[1].board[0].woundSourcesThisTurn).toEqual([`c:${vampire.instanceId}`]);
  });
});

describe("blessure — cible « la source des dégâts »", () => {
  it("vise la créature coupable", () => {
    const s = mkState();
    const v = vengeresse(5, 1);
    s.players[1].board = [v];
    const a = attaquant(1, 10);
    s.players[0].board = [a];

    const st = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: v.instanceId });

    // 1 de riposte au combat + 2 du pouvoir.
    expect(st.players[0].board[0].currentHealth).toBe(10 - 1 - 2);
    expect(st.players[0].hero.hp).toBe(30);
  });

  it("un SORT n'est pas en jeu : le contrecoup retombe sur le héros du lanceur", () => {
    const s = mkState();
    s.players[1].board = [vengeresse()];
    const sort = sortDegats(1);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[0].hero.hp).toBe(28);
  });

  it("le Poison n'a ni créature ni héros : l'effet s'éteint", () => {
    const s = mkStateAvecDecks();
    const v = vengeresse();
    v.isPoisoned = true;
    s.players[1].board = [v];

    const st = applyAction(s, { type: "end_turn" });

    expect(st.players[1].board[0].currentHealth).toBe(4);
    expect(st.players[0].hero.hp).toBe(30);
    expect(st.players[1].hero.hp).toBe(30);
  });

  it("deux Vengeresses face à face ne bouclent pas : chacune ne compte l'autre qu'une fois", () => {
    const s = mkState();
    const a = vengeresse(20, 1), b = vengeresse(20, 1);
    s.players[0].board = [a];
    s.players[1].board = [b];

    const st = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: b.instanceId });

    // Combat 1/1, puis chacune rend 2 à l'autre UNE fois (la 2ᵉ blessure vient
    // d'une source déjà comptée ce tour-ci).
    expect(st.players[0].board[0].currentHealth).toBe(20 - 1 - 2);
    expect(st.players[1].board[0].currentHealth).toBe(20 - 1 - 2);
    expect(st.effectStack ?? []).toEqual([]);
  });
});

describe("blessure — mots-clés curés et multijoueur", () => {
  it("un mot-clé curé en mode « wound » se résout (Tempête 1 sur le camp adverse)", () => {
    const s = mkState();
    const porteuse = mkInstance(mkCard({
      name: "Orageuse", mana_cost: 3, attack: 0, health: 5,
      keywords: ["tempete"] as never,
      keyword_instances: [{ id: "tempete", x: 1, mode: "wound" }] as never,
    }));
    s.players[1].board = [porteuse];
    const temoin = attaquant(0, 5);
    s.players[0].board = [temoin];
    const sort = sortDegats(1);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    const pvP1 = st.players[0].board[0].currentHealth + st.players[0].hero.hp;
    expect(pvP1).toBe(5 + 30 - 1);
  });

  it("un pouvoir CONFÉRÉ par un sort en mode Blessure se déclenche chez sa nouvelle porteuse", () => {
    const s = mkStateAvecDecks();
    const receveuse = attaquant(0, 5);
    s.players[0].board = [receveuse];
    const temoin = attaquant(0, 5);
    s.players[1].board = [temoin];
    const don = mkInstance(mkCard({
      name: "Le Don", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{
        uid: "g0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [],
        composed: {
          content: "grant_keyword", grantAbilityId: "tempete", grantTrigger: "on_wound", magnitude: { x: 1 },
          target: { entity: "unit", count: 1, side: "ally", location: "board", designation: "choice" },
        },
      }] as never,
    }));
    s.players[0].hand = [don];
    let st = applyAction(s, { type: "play_card", cardInstanceId: don.instanceId, targetMap: { g0: receveuse.instanceId } });
    expect((st.players[0].board[0].card.keyword_instances ?? []).some(k => k.id === "tempete" && k.mode === "wound")).toBe(true);

    // P2 la blesse avec un sort : sa Tempête 1 conférée répond.
    st = applyAction(st, { type: "end_turn" });
    const eclair = sortDegats(1);
    st.players[1].hand.push(eclair);
    st = lance(st, eclair.instanceId);

    expect(st.players[0].board[0].currentHealth).toBe(4);
    const pvP2 = st.players[1].board[0].currentHealth + st.players[1].hero.hp;
    expect(pvP2).toBe(5 + 30 - 1);
  });

  it("pose une frontière d'animation : les dégâts reçus se jouent AVANT la réponse", () => {
    const s = mkState();
    s.players[1].board = [ecorchee()];
    const sort = sortDegats(1);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    const avant = (st.animationCheckpoints ?? []).at(-1);
    expect(avant?.label).toBe("effet");
    // Instantané : l'Écorchée a déjà pris son point, le héros de P1 rien encore.
    expect(avant!.state.players[1].board[0].currentHealth).toBe(4);
    expect(avant!.state.players[0].hero.hp).toBe(30);
    expect(st.players[0].hero.hp).toBe(28);
  });

  it("déterministe : deux clients obtiennent le même hash", () => {
    const build = () => {
      const s = mkState();
      s.players[1].board = [ecorchee(5), vengeresse(5)];
      const sort = sortDegats(2, true);
      s.players[0].hand = [sort];
      return { s, id: sort.instanceId };
    };
    const x = build();
    const a = lance(x.s, x.id);
    const b = lance(JSON.parse(JSON.stringify(x.s)), x.id);
    expect(syncHash(a)).toBe(syncHash(b));
  });
});
