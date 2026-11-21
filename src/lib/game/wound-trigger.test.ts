// Déclencheur « BLESSURE » (mode "wound" / trigger on_wound).
//
// Règle arbitrée par l'auteur : la capacité part quand CETTE créature subit des
// dégâts et y SURVIT, À CHAQUE blessure — plus de limite par source ni par tour
// (levée le 2026-11-21, pour en faire un contre de Tempête). Seul garde-fou :
// les dégâts infligés par une réponse Blessure ne déclenchent rien.
//
// Ce qui est verrouillé ici, point par point :
//   1. blessure RÉELLE seulement (un Bouclier qui absorbe tout ne compte pas) ;
//   2. chaque paquet de dégâts encaissé compte : un sort qui frappe trois
//      fois = 3, une même créature qui frappe deux fois = 2 ;
//   3. « sans mourir » se juge à la GOUTTE pour Tempête et la répartition au
//      hasard (le pouvoir interrompt les gouttes suivantes), à la frontière
//      d'effet pour le reste ;
//   4. la réponse d'une Blessure ne déclenche aucune Blessure (anti-boucle) ;
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

  it("une créature sans le pouvoir ne déclenche rien", () => {
    const s = mkState();
    s.players[1].board = [attaquant(1, 5)];
    const sort = sortDegats(1);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[0].hero.hp).toBe(30);
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
  });
});

describe("blessure — à CHAQUE blessure", () => {
  it("un même sort qui frappe trois fois déclenche trois fois", () => {
    const s = mkState();
    s.players[1].board = [ecorchee(5)];
    const sort = sortDegats(3, true);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(2);
    expect(declenchements(st)).toBe(3);
  });

  it("« sans mourir » se juge à la GOUTTE : 3×1 sur une 2 PV répond à la 1re, puis meurt à la 2e", () => {
    const s = mkState();
    s.players[1].board = [ecorchee(2)];
    const sort = sortDegats(3, true);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].board).toHaveLength(0);
    expect(declenchements(st)).toBe(1);
  });

  it("deux exemplaires de la même carte déclenchent chacun", () => {
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

  it("une même créature qui frappe deux fois dans le tour déclenche deux fois ; une autre aussi", () => {
    const s = mkState();
    const e = ecorchee(10);
    s.players[1].board = [e];
    const a = attaquant(1), b = attaquant(1);
    a.attacksRemaining = 2;
    s.players[0].board = [a, b];

    let st = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: e.instanceId });
    expect(declenchements(st)).toBe(1);

    // 2ᵉ assaut du MÊME attaquant : nouvelle blessure, nouveau déclenchement.
    const a2 = st.players[0].board.find(c => c.instanceId === a.instanceId)!;
    a2.hasAttacked = false; a2.attacksRemaining = 1; a2.tapped = false; a2.targetsAttackedThisTurn = [];
    st = applyAction(st, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: e.instanceId });
    expect(st.players[1].board[0].currentHealth).toBe(8);
    expect(declenchements(st)).toBe(2);

    st = applyAction(st, { type: "attack", attackerInstanceId: b.instanceId, targetInstanceId: e.instanceId });
    expect(declenchements(st)).toBe(3);
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

describe("blessure — d'un tour à l'autre", () => {
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

  it("deux Vengeresses face à face ne bouclent pas : une réponse ne déclenche pas l'autre", () => {
    const s = mkState();
    const a = vengeresse(20, 1), b = vengeresse(20, 1);
    s.players[0].board = [a];
    s.players[1].board = [b];

    const st = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: b.instanceId });

    // Combat 1/1, puis chacune rend 2 à l'autre UNE fois : les dégâts d'une
    // réponse Blessure ne sont pas une blessure au sens du déclencheur.
    expect(st.players[0].board[0].currentHealth).toBe(20 - 1 - 2);
    expect(st.players[1].board[0].currentHealth).toBe(20 - 1 - 2);
    expect(st.effectStack ?? []).toEqual([]);
  });
});

describe("blessure — garde anti-boucle", () => {
  it("la réponse d'une Blessure ne déclenche pas la Blessure d'une AUTRE porteuse", () => {
    // P2 : une Vengeresse (2 au coupable) ; P1 : un attaquant qui porte lui
    // aussi une Blessure (2 au héros ennemi). L'attaquant est blessé deux fois :
    // par la riposte (il répond), puis par la Vengeresse (il ne répond pas).
    const s = mkState();
    const a = ecorchee(20, 1);
    const v = vengeresse(20, 1);
    s.players[0].board = [a];
    s.players[1].board = [v];

    const st = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: v.instanceId });

    expect(st.players[0].board[0].currentHealth).toBe(20 - 1 - 2);
    expect(st.players[1].hero.hp).toBe(28); // UNE réponse de l'attaquant, pas deux
    expect(st.effectStack ?? []).toEqual([]);
  });

  it("une réponse qui blesse sa propre porteuse ne se relance pas", () => {
    const s = mkState();
    const TOUTES: TargetSpec = { entity: "unit", count: "all", side: "any", location: "board", designation: "automatic" };
    const epineuse = mkInstance(mkCard({
      name: "Épineuse", mana_cost: 3, attack: 0, health: 10,
      capabilities: [capWound({ content: "deal_damage", magnitude: { x: 1 }, target: TOUTES })],
    }));
    s.players[1].board = [epineuse];
    const sort = sortDegats(1);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(10 - 1 - 1);
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

    // La frontière qui précède la réponse (une autre suit la résolution de la
    // frame, depuis que la pile pose une frontière par effet).
    const avant = (st.animationCheckpoints ?? []).find(c => c.state.players[1].board[0]?.currentHealth === 4);
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

// ── Interruption goutte par goutte (Tempête, répartition au hasard) ─────────
//
// La blessée répond AVANT la goutte suivante. Preuve par la survie : une
// créature à 2 PV qui se donne +0/+5 en réponse encaisse les gouttes restantes
// au lieu de mourir à la 2e.
const SOI: TargetSpec = { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" };

function coriace(pv = 2) {
  return mkInstance(mkCard({
    name: "Coriace", mana_cost: 3, attack: 0, health: pv,
    capabilities: [capWound({ content: "buff", magnitude: { x: 0, y: 5 }, target: SOI })],
  }));
}

function sortTempete(x: number) {
  return mkInstance(mkCard({
    name: "Orage", card_type: "spell", mana_cost: 0, attack: null, health: null,
    spell_keywords: [{ id: "tempete", amount: x }] as never,
  }));
}

describe("blessure — interrompt Tempête et la répartition au hasard", () => {
  it("répartition au hasard : la réponse passe entre deux gouttes", () => {
    const s = mkState();
    s.players[1].board = [coriace(2)];
    const sort = sortDegats(3, true);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    // Chaque goutte blesse, chaque blessure répond : 2 − 1 + 5 − 1 + 5 − 1 + 5 = 14.
    // Sans interruption : morte à la 2e goutte.
    expect(st.players[1].board).toHaveLength(1);
    expect(st.players[1].board[0].currentHealth).toBe(14);
    expect(st.effectStack ?? []).toEqual([]);
  });

  it("Tempête d'un sort : même interruption", () => {
    const s = mkState();
    s.players[1].board = [coriace(2)];
    const sort = sortTempete(3);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].board).toHaveLength(1);
    expect(st.players[1].board[0].currentHealth).toBe(14);
  });

  it("Tempête à l'entrée en jeu d'une créature : même interruption", () => {
    const s = mkState();
    s.players[1].board = [coriace(2)];
    const orageuse = mkInstance(mkCard({
      name: "Orageuse", mana_cost: 0, attack: 1, health: 1,
      keywords: ["tempete"] as never,
      keyword_instances: [{ id: "tempete", x: 3 }] as never,
    }));
    s.players[0].hand = [orageuse];

    const st = lance(s, orageuse.instanceId);

    expect(st.players[1].board).toHaveLength(1);
    expect(st.players[1].board[0].currentHealth).toBe(14);
  });

  it("la riposte qui tue la source en pleine Tempête ne l'empêche pas de finir", () => {
    // Vengeresse : 2 dégâts au coupable. Le coupable d'une Tempête de sort est
    // le héros lanceur — il perd 2 PV par goutte, et les gouttes partent toutes.
    const s = mkState();
    s.players[1].board = [vengeresse(5)];
    const sort = sortTempete(3);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(2);
    expect(st.players[0].hero.hp).toBe(24);
  });

  it("un pouvoir « au choix » en pleine Tempête se résout au hasard, sans question", () => {
    const s = mkState();
    const choisie = mkInstance(mkCard({
      name: "Choisie", mana_cost: 3, attack: 0, health: 5,
      capabilities: [capWound({
        content: "deal_damage", magnitude: { x: 1 },
        target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
      })],
    }));
    s.players[1].board = [choisie];
    const cible = attaquant(1, 5);
    s.players[0].board = [cible];
    const sort = sortTempete(2);
    s.players[0].hand = [sort];

    const st = lance(s, sort.instanceId);

    expect(st.pendingTriggers ?? []).toEqual([]);
    expect(st.effectStack ?? []).toEqual([]);
    // Deux gouttes, deux réponses : 5 − 1 − 1.
    expect(st.players[0].board[0].currentHealth).toBe(3);
  });
});
