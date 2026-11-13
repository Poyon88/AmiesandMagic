// COMBAT — croisements de mots-clés qui n'avaient aucun test de comportement.
//
// Chaque cas a d'abord été un bug constaté : Première frappe qui annulait
// Double attaque, Fureur muette pendant le tour de son porteur, Héritage qui ne
// donnait que les PV, Lycanthropie qui perdait ses PV d'aura.
import { describe, expect, it } from "vitest";
import { applyAction, recalculateAuras } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameAction, GameState, Keyword } from "./types";

function unite(name: string, attack: number, health: number, keywords: Keyword[] = []): CardInstance {
  const c = mkInstance(mkCard({ name, attack, health, keywords }));
  c.hasSummoningSickness = false;
  return c;
}

const trouver = (s: GameState, c: CardInstance) =>
  [...s.players[0].board, ...s.players[1].board].find((u) => u.instanceId === c.instanceId);

const attaquer = (s: GameState, a: CardInstance, cible: CardInstance) =>
  applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: cible.instanceId } as GameAction);

describe("Première frappe × Double attaque", () => {
  it("Double attaque seule double les dégâts", () => {
    const s = mkState();
    const a = unite("A", 3, 10, ["double_attaque"]);
    const cible = unite("Cible", 0, 10);
    s.players[0].board.push(a);
    s.players[1].board.push(cible);
    expect(trouver(attaquer(s, a, cible), cible)!.currentHealth).toBe(4);
  });

  it("Première frappe ne retire pas le doublement", () => {
    const s = mkState();
    const a = unite("A", 3, 10, ["double_attaque", "premiere_frappe"]);
    const cible = unite("Cible", 0, 10);
    s.players[0].board.push(a);
    s.players[1].board.push(cible);
    expect(trouver(attaquer(s, a, cible), cible)!.currentHealth).toBe(4);
  });

  it("Première frappe : une cible abattue ne riposte pas", () => {
    const s = mkState();
    const a = unite("A", 3, 5, ["premiere_frappe"]);
    const cible = unite("Cible", 4, 3);
    s.players[0].board.push(a);
    s.players[1].board.push(cible);
    const apres = attaquer(s, a, cible);
    expect(trouver(apres, cible)).toBeUndefined();
    expect(trouver(apres, a)!.currentHealth).toBe(5);
  });
});

describe("Fureur — une fois par tour, pour chaque tour", () => {
  it("déclenchée en défense, elle se redéclenche au tour de son porteur", () => {
    const s = mkState();
    // Tour de P1 : son unité attaque le porteur de Fureur de P2, qui survit.
    const agresseur = unite("Agresseur", 1, 30);
    const furieux = unite("Furieux", 1, 30, ["fureur"]);
    s.players[0].board.push(agresseur);
    s.players[1].board.push(furieux);
    for (const p of s.players) p.deck = [mkInstance(mkCard({})), mkInstance(mkCard({}))];

    const apresAttaque = attaquer(s, agresseur, furieux);
    expect(apresAttaque.fureurStrikes?.length ?? 0).toBeGreaterThan(0);
    expect(trouver(apresAttaque, furieux)!.fureurActive).toBe(true);

    // Fin du tour de P1 : la garde tombe aussi chez P2, qui n'est pas le sortant.
    const tourP2 = applyAction(apresAttaque, { type: "end_turn" });
    expect(tourP2.currentPlayerIndex).toBe(1);
    expect(trouver(tourP2, furieux)!.fureurActive).toBe(false);
  });
});

describe("Héritage X", () => {
  it("donne +X/+X DURABLE aux alliés à la mort du porteur", () => {
    const s = mkState();
    const tueur = unite("Tueur", 5, 30);
    const aieul = unite("Aïeul", 0, 1, ["heritage"]);
    aieul.heritageX = 2;
    const heritier = unite("Héritier", 1, 1);
    s.players[0].board.push(tueur);
    s.players[1].board.push(aieul, heritier);

    const apres = attaquer(s, tueur, aieul);
    expect(trouver(apres, aieul)).toBeUndefined();
    const h = trouver(apres, heritier)!;
    expect(h.currentAttack).toBe(3);
    expect(h.currentHealth).toBe(3);
    expect(h.maxHealth).toBe(3);
  });
});

describe("Lycanthropie sous une aura de PV", () => {
  it("la forme transformée reçoit les PV de Commandement", () => {
    const s = mkState();
    s.currentPlayerIndex = 1; // P2 finit son tour ⇒ début de tour de P1, qui transforme.
    const capitaine = unite("Capitaine", 2, 3, ["commandement"]);
    capitaine.card.faction = "Humains";
    const garou = unite("Garou", 1, 1, ["lycanthropie"]);
    garou.card.faction = "Humains";
    garou.card.mana_cost = 4; // X = 2
    garou.currentAttack = 2; garou.currentHealth = 2; garou.maxHealth = 2; garou.auraHealthBonus = 1;
    s.players[0].board.push(capitaine, garou);
    for (const p of s.players) p.deck = [mkInstance(mkCard({})), mkInstance(mkCard({}))];

    const apres = applyAction(s, { type: "end_turn" });
    const forme = trouver(apres, garou)!;
    expect(forme.hasTransformedLycanthropie).toBe(true);
    // 2/2 de la forme + 1/+1 de Commandement.
    expect(forme.currentAttack).toBe(3);
    expect(forme.maxHealth).toBe(3);
    expect(forme.currentHealth).toBe(3);
    expect(forme.auraHealthBonus).toBe(1);
  });
});

describe("Totem", () => {
  it("copie les mots-clés des alliés de même race, et les rend quand ils partent", () => {
    const s = mkState();
    const tueur = unite("Tueur", 9, 30);
    const totem = unite("Totem", 0, 10, ["totem"]);
    totem.card.race = "Ours";
    const gardien = unite("Gardien", 0, 1, ["taunt"]);
    gardien.card.race = "Ours";
    s.players[0].board.push(tueur);
    s.players[1].board.push(totem, gardien);
    recalculateAuras(s.players[1], s.players[0]);
    expect(totem.card.keywords).toContain("taunt");

    const apres = attaquer(s, tueur, gardien);
    expect(trouver(apres, gardien)).toBeUndefined();
    expect(trouver(apres, totem)!.card.keywords).toEqual(["totem"]);
  });

  it("deux Totems de même race ne s'entretiennent pas l'un l'autre", () => {
    const s = mkState();
    const a = unite("A", 0, 10, ["totem"]);
    const b = unite("B", 0, 10, ["totem"]);
    const gardien = unite("Gardien", 0, 1, ["taunt"]);
    for (const u of [a, b, gardien]) u.card.race = "Ours";
    s.players[1].board.push(a, b, gardien);
    recalculateAuras(s.players[1], s.players[0]);
    recalculateAuras(s.players[1], s.players[0]);
    expect(a.card.keywords).toContain("taunt");
    expect(b.card.keywords).toContain("taunt");

    s.players[1].board = [a, b];
    recalculateAuras(s.players[1], s.players[0]);
    expect(a.card.keywords).toEqual(["totem"]);
    expect(b.card.keywords).toEqual(["totem"]);
  });
});

describe("Fin de tour — un pas curé ne survit pas à un Silence posé à sa gauche", () => {
  it("l'unité réduite au silence par sa voisine de gauche ne déclenche plus sa capacité", () => {
    const s = mkState();
    const muselière = mkInstance(mkCard({
      name: "Muselière", attack: 0, health: 5,
      capabilities: [{
        uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed",
        composed: {
          content: "silence",
          target: { entity: "unit", side: "ally", count: "all", location: "board", designation: "automatic" },
        },
      }] as never,
    }));
    const bavarde = mkInstance(mkCard({
      name: "Bavarde", attack: 1, health: 5,
      keywords: ["tempete"] as never,
      keyword_instances: [{ id: "tempete", x: 3, mode: "end_of_turn" }] as never,
    }));
    const cible = unite("Cible", 0, 10);
    s.players[0].board.push(muselière, bavarde);
    s.players[1].board.push(cible);
    for (const p of s.players) p.deck = [mkInstance(mkCard({})), mkInstance(mkCard({}))];

    const apres = applyAction(s, { type: "end_turn" });
    expect(apres.currentPlayerIndex).toBe(1);
    expect(trouver(apres, cible)!.currentHealth).toBe(10);
    expect(apres.players[1].hero.hp).toBe(s.players[1].hero.hp);
  });
});
