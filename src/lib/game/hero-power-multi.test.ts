// Pouvoirs de héros à PLUSIEURS effets : une liste dans `powerEffect`, résolue
// dans l'ordre, une réponse par effet (cible, Sélection, modale de deck).
import { describe, expect, it } from "vitest";
import { applyAction, canUseHeroPower, initRNG } from "./engine";
import { effetsDuPouvoir, MAX_EFFETS_POUVOIR } from "./hero-power";
import { decrirePouvoir } from "./hero-power-text";
import { candidateActions, seededRand } from "@/lib/sim/random-bot";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState, HeroPowerEffect } from "./types";

function setHero(s: GameState, powerEffect: HeroPowerEffect | HeroPowerEffect[], powerCost = 2) {
  s.players[0].hero.heroDefinition = {
    id: 1, name: "Héros test", race: "humans",
    powerName: "Pouvoir", powerCost, powerEffect, powerDescription: "",
  };
}

const IMPACT_2: HeroPowerEffect = { mode: "spell_trigger", keywordId: "impact", params: { amount: 2 } };
const BOUCLIER: HeroPowerEffect = { mode: "grant_keyword", keywordId: "divine_shield" };

describe("effetsDuPouvoir", () => {
  it("normalise l'objet historique en liste d'un effet", () => {
    expect(effetsDuPouvoir({ powerEffect: IMPACT_2 })).toEqual([IMPACT_2]);
  });
  it("garde l'ordre d'une liste et la plafonne", () => {
    const l = [IMPACT_2, BOUCLIER, IMPACT_2, BOUCLIER];
    expect(effetsDuPouvoir({ powerEffect: l })).toHaveLength(MAX_EFFETS_POUVOIR);
    expect(effetsDuPouvoir({ powerEffect: l })[1]).toBe(BOUCLIER);
  });
});

describe("pouvoir multi-effets — résolution", () => {
  it("Divination puis Inspiration 2 : le choix de deck est respecté, puis 2 cartes piochées", () => {
    const s = mkState();
    initRNG(7);
    const noms = ["A", "B", "C", "D", "E"];
    s.players[0].deck = noms.map((n) => mkInstance(mkCard({ name: n })));
    const main = s.players[0].hand.length;
    setHero(s, [
      { mode: "spell_trigger", keywordId: "divination" },
      { mode: "spell_trigger", keywordId: "inspiration", params: { amount: 2 } },
    ]);

    // Divination garde C (index 2) sur le dessus ; Inspiration la pioche.
    const next = applyAction(s, { type: "hero_power", choixDeckEffets: { 0: 2 } });

    const p = next.players[0];
    expect(p.hand.length).toBe(main + 2);
    expect(p.hand.map((c) => c.card.name)).toContain("C");
    expect(p.mana).toBe(8); // un seul coût pour les deux effets
    expect(p.hero.heroPowerUsedThisTurn).toBe(true);
  });

  it("Impact 2 sur un ennemi ET Bouclier sur un allié : deux cibles distinctes", () => {
    const s = mkState();
    initRNG(7);
    const ennemi = mkInstance(mkCard({ name: "Ennemi", attack: 1, health: 5 }));
    const allie = mkInstance(mkCard({ name: "Allié", attack: 1, health: 3 }));
    s.players[1].board.push(ennemi);
    s.players[0].board.push(allie);
    setHero(s, [IMPACT_2, BOUCLIER]);

    const next = applyAction(s, { type: "hero_power", ciblesEffets: { 0: ennemi.instanceId, 1: allie.instanceId } });

    expect(next.players[1].board.find((c) => c.instanceId === ennemi.instanceId)!.currentHealth).toBe(3);
    const a = next.players[0].board.find((c) => c.instanceId === allie.instanceId)!;
    expect(a.hasDivineShield).toBe(true);
  });

  it("règle les morts entre deux effets : le second voit le plateau du premier", () => {
    const s = mkState();
    initRNG(7);
    const fragile = mkInstance(mkCard({ name: "Fragile", attack: 1, health: 2 }));
    s.players[1].board.push(fragile);
    setHero(s, [IMPACT_2, { mode: "composed", keywordId: "_composed", composed: { content: "draw_cards", magnitude: { x: 1 } } }]);
    s.players[0].deck = [mkInstance(mkCard({ name: "Pioche" }))];

    const next = applyAction(s, { type: "hero_power", ciblesEffets: { 0: fragile.instanceId } });

    expect(next.players[1].board.some((c) => c.instanceId === fragile.instanceId)).toBe(false);
    expect(next.players[0].hand.some((c) => c.card.name === "Pioche")).toBe(true);
  });

  it("forme historique (objet seul, cible dans targetInstanceId) inchangée", () => {
    const s = mkState();
    initRNG(7);
    const ennemi = mkInstance(mkCard({ name: "Ennemi", attack: 1, health: 5 }));
    s.players[1].board.push(ennemi);
    setHero(s, IMPACT_2);

    const next = applyAction(s, { type: "hero_power", targetInstanceId: ennemi.instanceId });

    expect(next.players[1].board[0].currentHealth).toBe(3);
  });
});

describe("pouvoir multi-effets — activation", () => {
  it("bloqué si un effet ciblé n'a aucune cible (aucune créature pour Bouclier)", () => {
    const s = mkState();
    setHero(s, [{ mode: "spell_trigger", keywordId: "inspiration", params: { amount: 1 } }, BOUCLIER]);
    s.players[0].board = [];
    s.players[1].board = [];
    expect(canUseHeroPower(s)).toBe(false);
    s.players[1].board.push(mkInstance(mkCard({ name: "Une créature" })));
    expect(canUseHeroPower(s)).toBe(true);
  });
});

describe("texte généré", () => {
  it("une phrase par effet, dans l'ordre", () => {
    const txt = decrirePouvoir([
      { mode: "spell_trigger", keywordId: "inspiration", params: { amount: 2 } },
      BOUCLIER,
    ]);
    expect(txt).toMatch(/^Piochez 2 cartes\. Confère .+ à une créature\.$/);
  });
});

describe("bots", () => {
  it("préparent une réponse par effet et l'action passe au moteur", () => {
    const s = mkState();
    initRNG(7);
    const ennemi = mkInstance(mkCard({ name: "Ennemi", attack: 1, health: 5 }));
    s.players[1].board.push(ennemi);
    s.players[0].deck = ["A", "B", "C", "D"].map((n) => mkInstance(mkCard({ name: n })));
    setHero(s, [{ mode: "spell_trigger", keywordId: "divination" }, IMPACT_2]);

    const coup = candidateActions(s, seededRand(3)).find((a) => a.type === "hero_power");
    expect(coup).toBeDefined();
    if (coup?.type !== "hero_power") return;
    expect(coup.choixDeckEffets?.[0]).toBeTypeOf("number");
    // Impact vise n'importe quelle cible (créatures ET héros).
    expect([ennemi.instanceId, "enemy_hero", "friendly_hero"]).toContain(coup.ciblesEffets?.[1]);

    const next = applyAction(s, coup);
    expect(next.players[0].hero.heroPowerUsedThisTurn).toBe(true);
  });
});
