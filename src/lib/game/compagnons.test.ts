// Compagnons : au déclenchement, mélange dans le deck du CONTRÔLEUR une copie
// de chaque carte LIÉE (linkedCardIds, choisies à la création — doublons
// permis), puis remélange tout le deck. Une seule fois par instance
// (compagnonsFired). Utilisable par unités (tous déclencheurs) et par sorts
// (une fois à la résolution). Les cartes liées sont résolues par id dans les
// pools du match (factionCardPool + allSpellsPool).
import { describe, expect, it } from "vitest";
import { playCard, applyAction } from "./engine";
import type { Card } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function creature(name: string, attack = 2, health = 2, extra: Partial<Card> = {}): Card {
  return mkCard({ name, attack, health, mana_cost: 0, ...extra });
}

function spellCard(name: string, extra: Partial<Card> = {}): Card {
  return mkCard({ name, card_type: "spell", attack: null, health: null, mana_cost: 0, ...extra });
}

/** Source Compagnons avec ses cartes liées, mode optionnel. */
function meneur(linkedCardIds: number[], mode?: "death" | "end_of_turn") {
  return mkInstance(creature("Meneur", 2, 2, {
    keywords: ["compagnons"] as never,
    keyword_instances: [{ id: "compagnons", linkedCardIds, ...(mode ? { mode } : {}) } as never],
  }));
}

const nomsDuDeck = (deck: { card: Card }[]) => deck.map((d) => d.card.name).sort();

describe("Compagnons — invocation (on_play)", () => {
  it("mélange une copie de chaque carte liée dans le deck (doublons permis)", () => {
    const s = mkState();
    const loup = creature("Loup", 2, 1);
    const sortilege = spellCard("Sortilège");
    s.factionCardPool = [loup];
    s.allSpellsPool = [sortilege];
    s.players[0].deck = [mkInstance(creature("Fond de deck", 1, 1))];

    const src = meneur([loup.id, sortilege.id, loup.id]);
    s.players[0].hand.push(src);
    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    expect(next.players[0].board.some((c) => c.card.name === "Meneur")).toBe(true);
    expect(next.players[0].deck).toHaveLength(4); // 1 + 2 Loups + 1 Sortilège
    expect(nomsDuDeck(next.players[0].deck)).toEqual(["Fond de deck", "Loup", "Loup", "Sortilège"]);
    // Chaque copie est une instance INDÉPENDANTE.
    const ids = next.players[0].deck.map((d) => d.instanceId);
    expect(new Set(ids).size).toBe(4);
    // Une seule fois par instance.
    expect(next.players[0].board.find((c) => c.card.name === "Meneur")!.compagnonsFired).toBe(true);
  });

  it("un id introuvable dans les pools est sauté sans bloquer les autres", () => {
    const s = mkState();
    const loup = creature("Loup", 2, 1);
    s.factionCardPool = [loup];
    s.players[0].deck = [];

    const src = meneur([9999, loup.id]);
    s.players[0].hand.push(src);
    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    expect(nomsDuDeck(next.players[0].deck)).toEqual(["Loup"]);
  });

  it("sans carte liée configurée : no-op (deck intact)", () => {
    const s = mkState();
    s.factionCardPool = [];
    s.players[0].deck = [mkInstance(creature("Seul", 1, 1))];
    const src = meneur([]);
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    expect(next.players[0].deck).toHaveLength(1);
  });
});

describe("Compagnons — autres déclencheurs", () => {
  it("mode death : mélange dans le deck du CONTRÔLEUR de la créature qui meurt", () => {
    const s = mkState();
    const loup = creature("Loup", 2, 1);
    s.factionCardPool = [loup];
    const attaquant = mkInstance(creature("Attaquant", 5, 5));
    attaquant.hasSummoningSickness = false;
    s.players[0].board.push(attaquant);

    const defenseur = meneur([loup.id, loup.id], "death");
    s.players[1].board.push(defenseur);
    s.players[1].deck = [mkInstance(creature("Héritière", 2, 2))];

    const next = applyAction(s, { type: "attack", attackerInstanceId: attaquant.instanceId, targetInstanceId: defenseur.instanceId });

    expect(next.players[1].board.find((c) => c.card.name === "Meneur")).toBeUndefined(); // mort
    expect(nomsDuDeck(next.players[1].deck)).toEqual(["Héritière", "Loup", "Loup"]);
    expect(next.players[0].deck).toHaveLength(0); // le deck de l'attaquant est intact
  });

  it("mode end_of_turn : UNE SEULE fois par instance, même sur plusieurs tours", () => {
    const s = mkState();
    const loup = creature("Loup", 2, 1);
    s.factionCardPool = [loup];
    s.players[0].board.push(meneur([loup.id], "end_of_turn"));
    s.players[0].deck = [];
    s.players[1].deck = [];

    let next = applyAction(s, { type: "end_turn" });
    expect(nomsDuDeck(next.players[0].deck)).toEqual(["Loup"]);

    // Tour adverse puis nouveau tour de P1 : plus aucun déclenchement. Le Loup
    // unique a pu être PIOCHÉ entre-temps — on compte donc deck + main.
    next = applyAction(next, { type: "end_turn" });
    next = applyAction(next, { type: "end_turn" });
    const loups = [...next.players[0].deck, ...next.players[0].hand]
      .filter((c) => c.card.name === "Loup");
    expect(loups).toHaveLength(1);
  });
});

describe("Compagnons — sort (spell_resolution)", () => {
  it("mélange les cartes liées dans le deck du LANCEUR, sans cible", () => {
    const s = mkState();
    const loup = creature("Loup", 2, 1);
    s.factionCardPool = [loup];
    s.players[0].deck = [mkInstance(creature("Fond de deck", 1, 1))];
    const sort = mkInstance(spellCard("Appel des compagnons", {
      spell_keywords: [{ id: "compagnons", linkedCardIds: [loup.id, loup.id] }] as never,
    }));
    s.players[0].hand.push(sort);

    const next = playCard(s, { type: "play_card", cardInstanceId: sort.instanceId });

    expect(nomsDuDeck(next.players[0].deck)).toEqual(["Fond de deck", "Loup", "Loup"]);
    // Le sort finit au cimetière, pas dans le deck.
    expect(next.players[0].graveyard.some((c) => c.card.name === "Appel des compagnons")).toBe(true);
  });
});
