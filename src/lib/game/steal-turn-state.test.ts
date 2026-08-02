// Prise de contrôle (Corruption, Domination) : la créature volée doit pouvoir
// AGIR immédiatement — c'est le sens de la Traque que ces effets lui posent.
//
// Régression vue en partie : un « Intendant Suprême du Royaume » volé par la
// Corruption du héros Velkyn affichait bien Traque et restait incapable
// d'attaquer. Cause : le vol levait le mal d'invocation mais laissait les
// COMPTEURS DE TOUR de l'ancien contrôleur. Une créature adverse a presque
// toujours déjà attaqué pendant SON tour, donc elle arrivait avec
// `attacksRemaining = 0` — et `canAttack` refuse là-dessus bien avant de
// regarder le mot-clé.
import { describe, expect, it } from "vitest";
import { applyAction, canAttack, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState, HeroDefinition } from "./types";

/** Velkyn : pouvoir « Corruption » en mode spell_trigger (tel qu'en base). */
const velkyn = {
  id: 34, name: "Velkyn", race: "dark_elves",
  powerName: "Corruption", powerCost: 0,
  powerEffect: { mode: "spell_trigger", keywordId: "corruption" },
  powerDescription: "",
} as unknown as HeroDefinition;

/** Créature adverse dans son état normal au début de NOTRE tour : elle a déjà
 *  agi pendant le tour de son propriétaire. */
function creatureAdverseAyantDejaAgi(s: GameState) {
  const c = mkInstance(mkCard({
    name: "Intendant", mana_cost: 6, attack: 8, health: 7,
    keywords: ["taunt"] as never,
  }));
  c.attacksRemaining = 0;
  c.hasAttacked = true;
  c.targetsAttackedThisTurn = ["quelqu-un"];
  s.players[1].board.push(c);
  return c;
}

describe("créature volée — état de tour", () => {
  it("Corruption héroïque : la volée qui avait déjà attaqué peut attaquer", () => {
    const s = mkState();
    initRNG(7);
    s.players[0].hero.heroDefinition = velkyn;
    const cible = creatureAdverseAyantDejaAgi(s);

    const st = applyAction(s, { type: "hero_power", targetInstanceId: cible.instanceId });
    const vole = st.players[0].board.find(c => c.card.name === "Intendant")!;

    expect(vole.card.keywords as unknown as string[]).toContain("charge");
    expect(vole.hasSummoningSickness).toBe(false);
    expect(vole.attacksRemaining).toBe(1);
    expect(vole.hasAttacked).toBe(false);
    expect(vole.targetsAttackedThisTurn).toEqual([]);
    expect(canAttack(st, vole.instanceId)).toBe(true);
  });

  it("une volée TAPÉE par son ancien contrôleur est déverrouillée elle aussi", () => {
    // `canAttack` refuse une créature tapée : sans reset, taper l'unité chez
    // soi suffisait à la rendre inerte une fois volée.
    const s = mkState();
    initRNG(7);
    s.players[0].hero.heroDefinition = velkyn;
    const cible = creatureAdverseAyantDejaAgi(s);
    cible.tapped = true;

    const st = applyAction(s, { type: "hero_power", targetInstanceId: cible.instanceId });
    const vole = st.players[0].board.find(c => c.card.name === "Intendant")!;

    expect(vole.tapped).toBe(false);
    expect(canAttack(st, vole.instanceId)).toBe(true);
  });

  it("la paralysie, elle, SURVIT au changement de camp", () => {
    // Un malus n'est pas une permission d'agir : voler une unité paralysée ne
    // doit pas la soigner de sa paralysie.
    const s = mkState();
    initRNG(7);
    s.players[0].hero.heroDefinition = velkyn;
    const cible = creatureAdverseAyantDejaAgi(s);
    cible.isParalyzed = true;

    const st = applyAction(s, { type: "hero_power", targetInstanceId: cible.instanceId });
    const vole = st.players[0].board.find(c => c.card.name === "Intendant")!;

    expect(vole.isParalyzed).toBe(true);
  });

  it("Corruption portée par une CRÉATURE : même déverrouillage", () => {
    // Second chemin de vol (mot-clé d'unité, pas pouvoir de héros) : il ne doit
    // pas diverger du premier.
    const s = mkState();
    initRNG(7);
    const cible = creatureAdverseAyantDejaAgi(s);
    const voleur = mkInstance(mkCard({
      name: "Corrupteur", mana_cost: 4, attack: 2, health: 2,
      keywords: ["corruption"] as never,
    }));
    s.players[0].hand.push(voleur);

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: voleur.instanceId, targetInstanceId: cible.instanceId,
    });
    const vole = st.players[0].board.find(c => c.card.name === "Intendant")!;

    expect(vole.attacksRemaining).toBe(1);
    expect(canAttack(st, vole.instanceId)).toBe(true);
  });
});
