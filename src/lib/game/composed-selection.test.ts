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
  // Coût EXACT : le X par défaut vaut le coût par défaut de `poolCard` (1),
  // sans quoi aucune carte du vivier ne serait offerte.
  x = 1,
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

  it("filtre par type de carte : objets seulement", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Épée", { card_type: "item" }),
      poolCard("Bouclier", { card_type: "item" }),
      poolCard("Soldat", { card_type: "creature" }),
      poolCard("Éclair", { card_type: "spell" }),
    ];
    const next = playHeraut(s, selectionCreature({ cardType: "item" }));
    expect(offeredNames(next)).toEqual(["Bouclier", "Épée"]);

    // L'objet choisi arrive en main comme n'importe quelle carte sélectionnée.
    const trig = next.pendingTriggers![0];
    const epee = s.factionCardPool.find((c) => c.name === "Épée")!;
    const after = applyAction(next, {
      type: "resolve_pending_trigger", triggerId: trig.id, selectionCardId: epee.id,
    });
    expect(after.players[0].hand.map((c) => c.card.name)).toEqual(["Épée"]);
    expect(after.players[0].hand[0].card.card_type).toBe("item");
  });

  it("type de carte cumulé avec les autres filtres (ET logique)", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Épée naine", { card_type: "item", race: "Nains" }),
      poolCard("Épée elfe", { card_type: "item", race: "Elfes" }),
      poolCard("Guerrier nain", { card_type: "creature", race: "Nains" }),
    ];
    const next = playHeraut(s, selectionCreature({ cardType: "item", race: "Nains" }));
    expect(offeredNames(next)).toEqual(["Épée naine"]);
  });

  it("s'ajoute aux règles de base : seul le coût EXACTEMENT X est offert", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Au bon prix", { race: "Hommes-Bêtes", mana_cost: 2 }),
      poolCard("Trop chère", { race: "Hommes-Bêtes", mana_cost: 5 }),
      // Moins chère : ÉCARTÉE elle aussi depuis que X désigne un coût exact.
      poolCard("Trop bon marché", { race: "Hommes-Bêtes", mana_cost: 1 }),
      poolCard("Rare", { race: "Hommes-Bêtes", mana_cost: 2, rarity: "Rare" }),
    ];
    const next = playHeraut(s, selectionCreature({ race: "Hommes-Bêtes" }, 2));
    expect(offeredNames(next)).toEqual(["Au bon prix"]);
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
    const attacker = selectionCreature(undefined, 1, "on_attack");
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
    const next = playHeraut(s, selectionCreature({ race: "Hommes-Bêtes" }, 1, "on_play", "renfort_royal"));
    const trig = (next.pendingTriggers ?? [])[0];
    expect(trig?.selectionType).toBe("renfort_royal");
    expect(offeredNames(next)).toEqual(["Loup"]);
  });
});

describe("Sélection composée portée par un SORT", () => {
  it("ouvre le sélecteur (un sort n'a pas d'instance source)", () => {
    // Deux régressions successives sur le même point aveugle — un SORT est
    // résolu avec `source: null` :
    //   1. le contenu exigeait une instance source pour lire l'alignement du
    //      pool ⇒ la Sélection d'un sort ne faisait rien du tout ;
    //   2. le chemin INTERACTIF l'exigeait aussi ⇒ la modale ne s'ouvrait
    //      jamais et la carte tirée au hasard atterrissait direct en main.
    // Le sort doit désormais suspendre sur un déclencheur de sélection, comme
    // une créature (cf. composed-selection-spell.test.ts pour le cas à deux
    // effets d'« Héritage des Ancêtres »).
    const s = mkState();
    s.factionCardPool = [poolCard("Loup"), poolCard("Chat")];
    const spell = mkInstance(mkCard({
      name: "Appel des Ombres", card_type: "spell", attack: null, health: null,
      capabilities: [{
        uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "selection", magnitude: { x: 1 } },
      }] as never,
    }));
    s.players[0].hand.push(spell);

    const next = applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId });

    const trig = (next.pendingTriggers ?? []).find((t) => t.selectionType === "selection");
    expect(trig).toBeDefined();
    expect(offeredNames(next)).toEqual(["Chat", "Loup"]);
    // Rien en main tant que le joueur n'a pas choisi — et surtout pas le sort
    // lui-même, qui part au cimetière.
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.players[0].graveyard.map((c) => c.card.name)).toContain("Appel des Ombres");
  });
});
