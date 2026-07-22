// Appel du clan X — déclencheurs multi-mode. L'effet (mettre en jeu gratuitement
// la 1re unité de même clan de coût ≤ X du deck) est désormais authorable en
// mort / attaque / retour / fin de tour / activation, en plus de l'invocation.
// Miroir du câblage Dédoublement/Entrainement : la version on-play reste gatée
// sur hasKwOnPlay, les autres modes passent par resolveCuratedKeywordEffect.
import { describe, expect, it } from "vitest";
import { playCard, applyAction } from "./engine";
import type { Card } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

const CLAN = "Cohortes Sanglantes";

function creature(name: string, extra: Partial<Card> = {}): Card {
  return mkCard({ name, faction: "Orcs", clan: CLAN, attack: 3, health: 4, mana_cost: 0, ...extra });
}

/** Un renfort de même clan (coût 2) posé au sommet du deck du joueur 0. */
function seedReinforcement(name = "Renfort") {
  return mkInstance(creature(name, { mana_cost: 2, attack: 2, health: 2, keywords: [], clan: CLAN }));
}

describe("Appel du clan X — invocation (on_play, régression)", () => {
  it("met en jeu le 1er allié de même clan (coût ≤ X) à l'invocation", () => {
    const s = mkState();
    const src = mkInstance(creature("Héraut", { mana_cost: 5, keywords: ["appel_du_clan"], effect_text: "Appel du clan 3" }));
    s.players[0].hand.push(src);
    s.players[0].deck.push(seedReinforcement());

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });
    expect(next.players[0].board.some((c) => c.card.name === "Renfort")).toBe(true);
    expect(next.players[0].deck.some((c) => c.card.name === "Renfort")).toBe(false);
  });
});

describe("Appel du clan X — modes non-play (multi-mode curé)", () => {
  it("se déclenche À L'ATTAQUE (mode attack) et NON à l'invocation", () => {
    const s = mkState();
    const src = mkInstance(creature("Cornemuseur", {
      keywords: ["appel_du_clan"],
      keyword_instances: [{ id: "appel_du_clan", mode: "attack", x: 3 }],
    }));
    s.players[0].board.push(src);
    s.players[0].deck.push(seedReinforcement());

    const next = applyAction(s, { type: "attack", attackerInstanceId: src.instanceId, targetInstanceId: "enemy_hero" });
    expect(next.players[0].board.some((c) => c.card.name === "Renfort")).toBe(true);
    expect(next.players[0].deck.some((c) => c.card.name === "Renfort")).toBe(false);
  });

  it("se déclenche À LA MORT (mode death)", () => {
    const s = mkState();
    const attacker = mkInstance(creature("Bourreau", { faction: "Humains", clan: "Autre Clan", attack: 5, health: 5 }));
    s.players[0].board.push(attacker);

    // Défenseur de P1 qui meurt au combat → Appel du clan à la mort.
    const defender = mkInstance(creature("Sentinelle", {
      attack: 1, health: 2,
      keywords: ["appel_du_clan"],
      keyword_instances: [{ id: "appel_du_clan", mode: "death", x: 3 }],
    }));
    s.players[1].board.push(defender);
    s.players[1].deck.push(seedReinforcement());

    const next = applyAction(s, { type: "attack", attackerInstanceId: attacker.instanceId, targetInstanceId: defender.instanceId });
    expect(next.players[1].board.some((c) => c.card.name === "Sentinelle")).toBe(false); // morte
    expect(next.players[1].board.some((c) => c.card.name === "Renfort")).toBe(true);
  });

  it("se déclenche EN FIN DE TOUR (mode end_of_turn)", () => {
    const s = mkState();
    const src = mkInstance(creature("Tambour", {
      keywords: ["appel_du_clan"],
      keyword_instances: [{ id: "appel_du_clan", mode: "end_of_turn", x: 3 }],
    }));
    s.players[0].board.push(src);
    s.players[0].deck.push(seedReinforcement());

    const next = applyAction(s, { type: "end_turn" });
    expect(next.players[0].board.some((c) => c.card.name === "Renfort")).toBe(true);
  });

  it("une instance en mode mort NE se déclenche PAS à l'invocation", () => {
    const s = mkState();
    const src = mkInstance(creature("Éclaireur", {
      mana_cost: 5,
      keywords: ["appel_du_clan"],
      keyword_instances: [{ id: "appel_du_clan", mode: "death", x: 3 }],
    }));
    s.players[0].hand.push(src);
    s.players[0].deck.push(seedReinforcement());

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });
    // Le renfort reste dans le deck : rien à l'invocation (attend la mort).
    expect(next.players[0].board.some((c) => c.card.name === "Renfort")).toBe(false);
    expect(next.players[0].deck.some((c) => c.card.name === "Renfort")).toBe(true);
  });

  it("respecte le seuil de coût X : un allié trop cher n'est pas appelé", () => {
    const s = mkState();
    const src = mkInstance(creature("Veilleur", {
      keywords: ["appel_du_clan"],
      keyword_instances: [{ id: "appel_du_clan", mode: "end_of_turn", x: 2 }],
    }));
    s.players[0].board.push(src);
    // Renfort de coût 5 > X=2 → ignoré.
    s.players[0].deck.push(mkInstance(creature("Colosse", { mana_cost: 5, clan: CLAN })));

    const next = applyAction(s, { type: "end_turn" });
    expect(next.players[0].board.some((c) => c.card.name === "Colosse")).toBe(false);
    expect(next.players[0].deck.some((c) => c.card.name === "Colosse")).toBe(true);
  });
});
