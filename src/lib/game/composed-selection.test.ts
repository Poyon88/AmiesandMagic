// Sélection / Sélection Royale en effet COMPOSÉ : mêmes règles de pool que les
// mots-clés curés homonymes, PLUS un filtre paramétrable (race / faction / clan /
// mot-clé porté) cumulatif avec les règles de base (Commune, coût ≤ X,
// alignement de la carte source).
//
// Passe par applyAction (et non playCard) : le contexte interactif dépend des
// variables de module posées là (currentPlayerId, currentCardPools).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedPoolFilter, CapabilityTrigger, Card, GameState } from "./types";

function selectionCreature(
  pool: ComposedPoolFilter | undefined,
  x = 2,
  trigger: CapabilityTrigger = "on_play",
  content: "selection" | "renfort_royal" = "selection",
) {
  const caps: Capability[] = [{
    uid: "cx_0", trigger, effectKind: "immediate", abilityId: "_composed",
    composed: { content, magnitude: { x }, ...(pool ? { pool } : {}) },
  }];
  return mkInstance(mkCard({
    name: "Héraut", mana_cost: 1, attack: 1, health: 1,
    capabilities: caps as never,
  }));
}

function poolCard(name: string, over: Partial<Card> = {}): Card {
  return mkCard({
    name, faction: "Mercenaires", rarity: "Commune", mana_cost: 1,
    attack: 1, health: 1, ...over,
  });
}

/** Options proposées par le déclencheur de sélection produit par l'action. */
function offeredNames(next: GameState): string[] {
  const trig = (next.pendingTriggers ?? []).find((t) => t.selectionType);
  const byId = new Map((next.factionCardPool ?? []).map((c) => [c.id, c.name] as const));
  return (trig?.selectionOptionIds ?? []).map((id) => byId.get(id) ?? String(id)).sort();
}

function playHeraut(s: GameState, heraut: ReturnType<typeof selectionCreature>): GameState {
  s.players[0].hand.push(heraut);
  return applyAction(s, { type: "play_card", cardInstanceId: heraut.instanceId });
}

describe("Sélection composée — filtre de pool", () => {
  it("filtre par race", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Loup", { race: "Hommes-Bêtes" }),
      poolCard("Chat", { race: "Hommes-Bêtes" }),
      poolCard("Nain", { race: "Nains" }),
    ];
    const next = playHeraut(s, selectionCreature({ race: "Hommes-Bêtes" }));
    expect(offeredNames(next)).toEqual(["Chat", "Loup"]);
  });

  it("filtre par clan et par faction", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Fauve", { clan: "Les Seigneurs Fauves" }),
      poolCard("Autre", { clan: "Un Autre Clan" }),
    ];
    const next = playHeraut(s, selectionCreature({ clan: "Les Seigneurs Fauves" }));
    expect(offeredNames(next)).toEqual(["Fauve"]);
  });

  it("filtre par mot-clé porté", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Rapide", { keywords: ["charge"] as never }),
      poolCard("Lente", { keywords: [] as never }),
    ];
    const next = playHeraut(s, selectionCreature({ keywordId: "charge" }));
    expect(offeredNames(next)).toEqual(["Rapide"]);
  });

  it("s'ajoute aux règles de base : le coût > X reste exclu", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Abordable", { race: "Hommes-Bêtes", mana_cost: 2 }),
      poolCard("Trop chère", { race: "Hommes-Bêtes", mana_cost: 5 }),
      poolCard("Rare", { race: "Hommes-Bêtes", mana_cost: 1, rarity: "Rare" }),
    ];
    const next = playHeraut(s, selectionCreature({ race: "Hommes-Bêtes" }, 2));
    expect(offeredNames(next)).toEqual(["Abordable"]);
  });

  it("pool vide après filtrage : aucun déclencheur, aucune carte en main", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Nain", { race: "Nains" })];
    const next = playHeraut(s, selectionCreature({ race: "Hommes-Bêtes" }));
    expect(next.pendingTriggers ?? []).toHaveLength(0);
    expect(next.players[0].hand).toHaveLength(0);
  });
});

describe("Sélection composée — suspension du choix", () => {
  it("sur le tour du contrôleur : déclencheur interactif SANS capUid", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Loup"), poolCard("Chat")];
    const next = playHeraut(s, selectionCreature(undefined));

    const trig = (next.pendingTriggers ?? [])[0];
    expect(trig?.selectionType).toBe("selection");
    expect(trig?.selectionOptionIds?.length).toBeGreaterThan(0);
    // Garde anti-boucle : applyOnePendingTrigger teste capUid AVANT
    // selectionType — un capUid relancerait l'effet composé, qui repousserait
    // un déclencheur, indéfiniment.
    expect(trig?.capUid).toBeUndefined();
    // Rien en main tant que le joueur n'a pas choisi.
    expect(next.players[0].hand).toHaveLength(0);
  });

  it("déclencheur « à l'attaque » : tirage immédiat, pas de modale", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Loup"), poolCard("Chat")];
    const attacker = selectionCreature(undefined, 2, "on_attack");
    attacker.hasSummoningSickness = false;
    s.players[0].board.push(attacker);

    const next = applyAction(s, {
      type: "attack", attackerInstanceId: attacker.instanceId, targetInstanceId: "enemy_hero",
    });

    expect((next.pendingTriggers ?? []).filter((t) => t.selectionType)).toHaveLength(0);
    expect(next.players[0].hand).toHaveLength(1);
  });
});

describe("Sélection Royale composée", () => {
  it("retombe sur le pool des communes sous le seuil de possession", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Loup", { race: "Hommes-Bêtes" }),
      poolCard("Nain", { race: "Nains" }),
    ];
    const next = playHeraut(s, selectionCreature({ race: "Hommes-Bêtes" }, 2, "on_play", "renfort_royal"));
    const trig = (next.pendingTriggers ?? [])[0];
    expect(trig?.selectionType).toBe("renfort_royal");
    expect(offeredNames(next)).toEqual(["Loup"]);
  });
});
