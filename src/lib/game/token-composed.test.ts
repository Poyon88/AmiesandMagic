// Tokens : effets COMPOSÉS, comme sur une carte classique.
//
// Un template ne pouvait porter que des mots-clés du registre. Tout ce que
// l'éditeur composé sait exprimer — infliger X dégâts à toutes les créatures
// adverses, conférer une capacité, renvoyer en main — lui était fermé : un
// jeton ne pouvait jamais faire autre chose que ce qu'un mot-clé nommait déjà.
//
// Ces tests verrouillent la chaîne complète : template → applyTokenTemplate →
// carte de l'instance → getCapabilities → résolution en jeu.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { getCapabilities, isTokenFiringTrigger } from "./capability-adapter";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CapabilityTrigger, ComposedEffect, GameState, TokenTemplate } from "./types";

function composedCap(trigger: CapabilityTrigger, composed: ComposedEffect, uid = "cx_0"): Capability {
  return { uid, trigger, effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

const invocateur = (tokenId: number) => mkCard({
  name: "Invocateur", faction: "Mercenaires",
  capabilities: [composedCap("on_play", { content: "summon_token", magnitude: { x: 1 }, tokenId }, "c0")],
});

const BASE_TMPL: TokenTemplate = {
  id: 77, race: "Fauves", faction: "Hommes-Bêtes", clan: null,
  name: "Tigre", attack: 2, health: 3, image_url: null, keywords: [],
};

function play(state: GameState, ci: ReturnType<typeof mkInstance>): GameState {
  state.players[0].hand.push(ci);
  return applyAction(state, { type: "play_card", cardInstanceId: ci.instanceId });
}

describe("le template transporte ses effets composés", () => {
  it("le jeton invoqué les porte, et getCapabilities les lit", () => {
    const s0 = mkState();
    initRNG(1);
    s0.tokenTemplates = [{
      ...BASE_TMPL,
      capabilities: [composedCap("on_death", { content: "deal_damage", magnitude: { x: 2 },
        target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" } })],
    }];

    const s = play(s0, mkInstance(invocateur(77)));
    const jeton = s.players[0].board.find(c => c.card.name === "Tigre")!;

    expect(jeton).toBeDefined();
    const caps = getCapabilities(jeton.card).filter(c => !!c.composed);
    expect(caps).toHaveLength(1);
    expect(caps[0].trigger).toBe("on_death");
    expect(caps[0].composed!.content).toBe("deal_damage");
  });

  it("un effet composé de jeton se RÉSOUT vraiment — ici à sa mort", () => {
    const s0 = mkState();
    initRNG(1);
    s0.tokenTemplates = [{
      ...BASE_TMPL,
      capabilities: [composedCap("on_death", { content: "deal_damage", magnitude: { x: 3 },
        target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" } })],
    }];
    s0.players[1].board = [mkInstance(mkCard({ name: "Cible", attack: 0, health: 9 }))];

    let s = play(s0, mkInstance(invocateur(77)));
    const jeton = s.players[0].board.find(c => c.card.name === "Tigre")!;
    const pvAvant = s.players[1].board[0].currentHealth;

    // On tue le jeton avec un sort de destruction ciblé : son râle composé doit
    // partir comme celui de n'importe quelle créature.
    const couperet = mkInstance(mkCard({
      name: "Couperet", card_type: "spell", attack: null, health: null,
      capabilities: [composedCap("spell_resolution", { content: "destroy",
        target: { entity: "unit", count: 1, side: "ally", location: "board", designation: "choice" } })],
    }));
    s.players[0].hand.push(couperet);
    s = applyAction(s, {
      type: "play_card", cardInstanceId: couperet.instanceId,
      targetMap: { cx_0: jeton.instanceId },
    });

    expect(s.players[0].board.some(c => c.card.name === "Tigre")).toBe(false);
    expect(s.players[1].board[0].currentHealth).toBe(pvAvant - 3);
  });

  it("garde les mots-clés du registre EN PLUS des effets composés", () => {
    // `getCapabilities` privilégie `capabilities` mais fusionne les `keywords`
    // absents de la liste : un token qui porte les deux ne doit rien perdre.
    const s0 = mkState();
    initRNG(1);
    s0.tokenTemplates = [{
      ...BASE_TMPL,
      keywords: ["taunt"] as never,
      capabilities: [composedCap("on_death", { content: "heal", magnitude: { x: 1 },
        target: { entity: "hero", count: 1, side: "ally", location: "board", designation: "automatic" } })],
    }];

    const s = play(s0, mkInstance(invocateur(77)));
    const jeton = s.players[0].board.find(c => c.card.name === "Tigre")!;
    const caps = getCapabilities(jeton.card);

    expect(caps.some(c => c.abilityId === "taunt")).toBe(true);
    expect(caps.some(c => !!c.composed)).toBe(true);
  });

  it("un template SANS effet composé se comporte exactement comme avant", () => {
    const s0 = mkState();
    initRNG(1);
    s0.tokenTemplates = [{ ...BASE_TMPL, keywords: ["taunt"] as never }];

    const s = play(s0, mkInstance(invocateur(77)));
    const jeton = s.players[0].board.find(c => c.card.name === "Tigre")!;

    expect(getCapabilities(jeton.card).some(c => !!c.composed)).toBe(false);
    expect(jeton.card.capabilities ?? null).toBeNull();
  });
});

describe("déclencheurs viables sur un jeton", () => {
  it("accepte ceux qui partent réellement", () => {
    for (const t of ["on_death", "on_activation", "on_return", "on_end_of_turn", "on_attack", "on_low_hp"] as CapabilityTrigger[]) {
      expect(isTokenFiringTrigger(t), t).toBe(true);
    }
  });

  it("REFUSE « à l'entrée » — un jeton ne passe pas par une pose", () => {
    // C'est le mur du modèle : `playCard` n'est jamais appelé pour un jeton, donc
    // une capacité on-play y serait définitivement muette.
    expect(isTokenFiringTrigger("on_play")).toBe(false);
  });

  it("REFUSE aussi ce qui n'est pas un déclencheur de créature", () => {
    expect(isTokenFiringTrigger("automatic")).toBe(false);
    expect(isTokenFiringTrigger("spell_resolution")).toBe(false);
    // La pioche non plus : un jeton n'est jamais dans un deck.
    expect(isTokenFiringTrigger("on_draw")).toBe(false);
  });
});
