// Régression : le picker in-game d'un effet composé « au choix » à l'entrée
// (entity "both" = unité OU héros) doit respecter le CAMP de la cible.
//
// Bug d'origine : composedSlotType mappait TOUTE entité "both" vers le slot
// "any" en ignorant t.side. Résultat : un effet OFFENSIF (side "enemy", ex.
// « inflige X à une cible ») surlignait aussi les propres unités du lanceur ET
// son propre héros — un clic sur son héros infligeait des auto-dégâts.
// Fix : composedSlotType est side-aware ("both"+enemy → "enemy_any",
// "both"+ally → "friendly_any", sans side → "any").
import { describe, expect, it } from "vitest";
import { getCreatureComposedChoice, getSpellTargets } from "./engine";
import type { Capability, ComposedEffect, TargetSpec } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function composedCap(composed: ComposedEffect): Capability {
  return { uid: "cap_test", trigger: "on_play", effectKind: "immediate", abilityId: "_composed", composed };
}

function cardWithComposedTarget(target: TargetSpec) {
  return mkCard({
    name: "Testeur",
    card_type: "creature",
    capabilities: [composedCap({ content: "deal_damage", magnitude: { x: 1 }, target })],
  });
}

/** État : P0 (lanceur, courant) a une unité alliée ; P1 a une unité ennemie. */
function stateWithBoards() {
  const s = mkState();
  const ally = mkInstance(mkCard({ name: "Allié" }));
  const enemy = mkInstance(mkCard({ name: "Ennemi" }));
  s.players[0].board.push(ally);
  s.players[1].board.push(enemy);
  return { s, allyId: ally.instanceId, enemyId: enemy.instanceId };
}

describe("picker composé « both » — respect du camp", () => {
  it("side \"enemy\" → slot enemy_any : uniquement cibles ennemies (pas d'auto-dégâts)", () => {
    const card = cardWithComposedTarget({ entity: "both", side: "enemy", count: 1, location: "board", designation: "choice" });
    const choice = getCreatureComposedChoice(card);
    expect(choice?.type).toBe("enemy_any");

    const { s, allyId, enemyId } = stateWithBoards();
    const ids = getSpellTargets(s, card, choice!.type);

    // Propose la cible ennemie + le héros ennemi…
    expect(ids).toContain(enemyId);
    expect(ids).toContain("enemy_hero");
    // …et JAMAIS son propre camp (le foot-gun d'origine).
    expect(ids).not.toContain(allyId);
    expect(ids).not.toContain("friendly_hero");
  });

  it("side \"ally\" → slot friendly_any : uniquement cibles alliées", () => {
    const card = cardWithComposedTarget({ entity: "both", side: "ally", count: 1, location: "board", designation: "choice" });
    const choice = getCreatureComposedChoice(card);
    expect(choice?.type).toBe("friendly_any");

    const { s, allyId, enemyId } = stateWithBoards();
    const ids = getSpellTargets(s, card, choice!.type);

    expect(ids).toContain(allyId);
    expect(ids).toContain("friendly_hero");
    expect(ids).not.toContain(enemyId);
    expect(ids).not.toContain("enemy_hero");
  });

  it("side \"any\" → slot any inchangé : les deux camps + les deux héros", () => {
    const card = cardWithComposedTarget({ entity: "both", side: "any", count: 1, location: "board", designation: "choice" });
    const choice = getCreatureComposedChoice(card);
    expect(choice?.type).toBe("any");

    const { s, allyId, enemyId } = stateWithBoards();
    const ids = getSpellTargets(s, card, choice!.type);

    expect(ids).toEqual(expect.arrayContaining([allyId, enemyId, "enemy_hero", "friendly_hero"]));
  });
});
