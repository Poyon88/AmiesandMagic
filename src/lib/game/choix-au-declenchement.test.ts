// Choix au DÉCLENCHEMENT, quel que soit le tour.
//
// Signalé avec l'Acheteur des Étals Dorés (Sélection Royale 2 « à l'attaque ») :
// la carte arrivait directement en main, sans modale. Le moteur n'offrait un
// choix qu'au joueur ACTIF et jamais en mode attaque ou pioche ; partout
// ailleurs il tirait au hasard.
//
// Règle désormais : le PROPRIÉTAIRE de l'effet choisit.
//   - choix sans incidence sur l'action en cours (Sélection, cibles d'un râle
//     d'agonie, d'une Blessure…) → posé à la FIN de l'action, chez son
//     propriétaire, même au tour adverse ;
//   - cible d'un mot-clé ciblé « à l'attaque » → elle doit frapper AVANT les
//     dégâts : pré-désignée en déclarant l'attaque (AttackAction.targetMap) ;
//   - fenêtre expirée → tirage au hasard (rng semée), limité aux choix du
//     joueur en tête de file.
import { describe, expect, it } from "vitest";
import { applyAction, getOnAttackChoiceSlots, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, GameAction, Keyword } from "./types";

const atk = (attackerInstanceId: string, targetInstanceId: string, targetMap?: Record<string, string>): GameAction =>
  ({ type: "attack", attackerInstanceId, targetInstanceId, ...(targetMap ? { targetMap } : {}) } as GameAction);

function creature(name: string, attack: number, health: number, extra: Partial<Card> = {}): Card {
  return mkCard({ name, attack, health, mana_cost: 0, ...extra });
}

const commune = (id: number) =>
  mkCard({ id, name: `Commune-${id}`, faction: "Mercenaires", rarity: "Commune", card_type: "creature", attack: 1, health: 1 });

describe("Sélection à l'attaque (cas de l'Acheteur des Étals Dorés)", () => {
  it("la modale est posée au propriétaire à la fin de l'attaque", () => {
    const s = mkState();
    s.factionCardPool = [commune(911), commune(912)];
    const acheteur = mkInstance(creature("Acheteur", 4, 2, {
      faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "attack", x: 0 }],
    }));
    acheteur.hasSummoningSickness = false;
    s.players[0].board.push(acheteur);

    const next = applyAction(s, atk(acheteur.instanceId, "enemy_hero"));

    expect(next.players[1].hero.hp, "l'attaque a porté").toBe(s.players[1].hero.hp - 4);
    const t = (next.pendingTriggers ?? []).find(p => p.selectionType);
    expect(t?.controllerId).toBe(next.players[0].id);
    expect(next.players[0].hand, "aucune carte tirée d'office").toHaveLength(0);

    const choisie = t!.selectionOptionIds![t!.selectionOptionIds!.length - 1];
    const fin = applyAction(next, { type: "resolve_pending_trigger", triggerId: t!.id, selectionCardId: choisie });
    expect(fin.players[0].hand.map(c => c.card.id)).toEqual([choisie]);
  });
});

describe("mot-clé ciblé à l'attaque — cible pré-désignée", () => {
  function scene() {
    const s = mkState();
    const sorcier = mkInstance(creature("Sorcier", 2, 5, {
      keywords: ["affaiblissement"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "affaiblissement" as Keyword, mode: "attack", x: 2, y: 0 }],
    }));
    sorcier.hasSummoningSickness = false;
    const garde = mkInstance(creature("Garde", 3, 9));
    const autre = mkInstance(creature("Autre", 3, 9));
    s.players[0].board.push(sorcier);
    s.players[1].board.push(garde, autre);
    return { s, sorcier, garde, autre };
  }

  it("expose un slot `kw_0` avec les ennemis comme cibles", () => {
    const { s, sorcier, garde, autre } = scene();
    const slots = getOnAttackChoiceSlots(s, sorcier);
    expect(slots).toEqual([{ key: "kw_0", targets: [garde.instanceId, autre.instanceId], kw: "affaiblissement" }]);
  });

  it("la cible désignée est affaiblie AVANT les dégâts du combat", () => {
    const { s, sorcier, garde } = scene();
    const next = applyAction(s, atk(sorcier.instanceId, garde.instanceId, { kw_0: garde.instanceId }));
    // Garde -2 ATK avant la riposte : le Sorcier ne prend qu'1 dégât (5 → 4).
    expect(next.players[0].board.find(c => c.instanceId === sorcier.instanceId)!.currentHealth).toBe(4);
    expect(next.players[1].board.find(c => c.instanceId === garde.instanceId)!.currentAttack).toBe(1);
    expect(next.pendingTriggers ?? []).toHaveLength(0);
  });

  it("sans désignation (ancien client), tirage au hasard parmi les ennemis", () => {
    const { s, sorcier, garde, autre } = scene();
    initRNG(7);
    const next = applyAction(s, atk(sorcier.instanceId, garde.instanceId));
    const atks = [garde, autre].map(g => next.players[1].board.find(c => c.instanceId === g.instanceId)!.currentAttack);
    expect(atks.filter(a => a === 1)).toHaveLength(1);
    expect(next.pendingTriggers ?? []).toHaveLength(0);
  });
});

describe("effet composé « au choix » à la mort, au tour adverse", () => {
  const capMort: Capability = {
    uid: "m0", trigger: "on_death", effectKind: "immediate", abilityId: "_composed", targets: [],
    composed: { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" } },
  };

  it("pose la question au propriétaire de la victime, qui choisit sa cible", () => {
    const s = mkState();
    const brute = mkInstance(creature("Brute", 5, 9));
    brute.hasSummoningSickness = false;
    const ciblePreferee = mkInstance(creature("Préférée", 1, 9));
    s.players[0].board.push(mkInstance(creature("Première", 1, 9)), ciblePreferee, brute);
    const martyr = mkInstance(creature("Martyr", 1, 1, { capabilities: [capMort] }));
    s.players[1].board.push(martyr);

    const next = applyAction(s, atk(brute.instanceId, martyr.instanceId));
    const t = (next.pendingTriggers ?? []).find(p => p.frameId);
    expect(t?.controllerId, "le propriétaire du Martyr choisit").toBe(next.players[1].id);
    // Avant le correctif : repli déterministe sur la PREMIÈRE unité ennemie.
    expect(next.players[0].board.every(c => c.currentHealth === 9 || c.instanceId === brute.instanceId)).toBe(true);

    const fin = applyAction(next, { type: "resolve_pending_trigger", triggerId: t!.id, targetInstanceId: ciblePreferee.instanceId });
    expect(fin.players[0].board.find(c => c.instanceId === ciblePreferee.instanceId)!.currentHealth).toBe(7);
    expect(fin.players[0].board.find(c => c.card.name === "Première")!.currentHealth).toBe(9);
    expect(fin.effectStack ?? []).toEqual([]);
  });
});

describe("repli à l'expiration — un joueur à la fois", () => {
  function deuxChoix() {
    // File mixte fabriquée à la main : un choix de P1 (tour adverse) en tête,
    // puis un choix de P0.
    const s = mkState();
    s.factionCardPool = [commune(921), commune(922)];
    s.pendingTriggers = [
      { id: "a#selection", controllerId: s.players[1].id, sourceInstanceId: null, selectionType: "selection", selectionOptionIds: [921] },
      { id: "b#selection", controllerId: s.players[0].id, sourceInstanceId: null, selectionType: "selection", selectionOptionIds: [922] },
    ];
    return s;
  }

  it("ne tranche que les choix du joueur en tête de file", () => {
    const s = deuxChoix();
    const next = applyAction(s, { type: "auto_resolve_pending_triggers", headTriggerId: "a#selection" });
    expect(next.players[1].hand.map(c => c.card.id)).toEqual([921]);
    expect(next.pendingTriggers?.map(t => t.id), "P0 garde sa propre fenêtre").toEqual(["b#selection"]);
  });

  it("est sans effet si la tête a changé (repli déjà appliqué par l'autre client)", () => {
    const s = deuxChoix();
    const une = applyAction(s, { type: "auto_resolve_pending_triggers", headTriggerId: "a#selection" });
    const deux = applyAction(une, { type: "auto_resolve_pending_triggers", headTriggerId: "a#selection" });
    expect(deux).toBe(une);
  });
});
