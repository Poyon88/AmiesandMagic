// Contenu composé « Invocation » : une créature aléatoire de la collection au
// coût EXACT X (pas un plafond), mêmes règles que le mot-clé curé — alignement
// de la carte source, format du match, communes + limitées possédées.
//
// Comme les Sélections composées, il se restreint par `pool` : race, faction,
// clan ou mot-clé porté. Une restriction REMPLACE le filtre d'alignement, sans
// quoi « race Loups » sur une carte neutre ne trouverait jamais rien.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, ComposedPoolFilter, GameState } from "./types";

function invocationSpell(x: number, pool?: ComposedPoolFilter): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "invocation", magnitude: { x }, ...(pool ? { pool } : {}) },
  }];
  return mkInstance(mkCard({
    name: "Appel", card_type: "spell", attack: null, health: null, capabilities: caps as never,
  }));
}

function poolCard(name: string, mana: number, over: Partial<Card> = {}): Card {
  return mkCard({ name, faction: "Mercenaires", rarity: "Commune", mana_cost: mana, attack: 1, health: 1, ...over });
}

const summoned = (s: GameState) => s.players[0].board.map((c) => c.card.name).sort();

function cast(s: GameState, spell: CardInstance): GameState {
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId });
}

describe("Invocation composée", () => {
  it("invoque une créature au coût EXACT, pas « au plus »", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Pile", 3), poolCard("Trop bas", 2), poolCard("Trop haut", 4)];

    const next = cast(s, invocationSpell(3));

    expect(summoned(next)).toEqual(["Pile"]);
  });

  it("aucun candidat au coût demandé : rien n'est invoqué", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Recrue", 1)];

    const next = cast(s, invocationSpell(5));

    expect(summoned(next)).toEqual([]);
  });

  it("restreint par race, hors alignement de la carte", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Loup", 2, { race: "Loups", faction: "La Meute" }),
      poolCard("Nain", 2, { race: "Nains", faction: "Mercenaires" }),
    ];

    const next = cast(s, invocationSpell(2, { race: "Loups" }));

    expect(summoned(next)).toEqual(["Loup"]);
  });

  it("restreint par mot-clé porté", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Rapide", 2, { keywords: ["charge"] as never }),
      poolCard("Lente", 2, { keywords: [] as never }),
    ];

    const next = cast(s, invocationSpell(2, { keywordId: "charge" }));

    expect(summoned(next)).toEqual(["Rapide"]);
  });

  it("sans restriction : repli sur l'alignement de la carte source", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Merco", 2, { faction: "Mercenaires" }),
      poolCard("Meutard", 2, { faction: "La Meute" }),
    ];

    const next = cast(s, invocationSpell(2));

    expect(summoned(next)).toEqual(["Merco"]);
  });
});
