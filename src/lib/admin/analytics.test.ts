// Winrate par capacité : les mots-clés de SORT doivent compter comme ceux des
// créatures.
//
// Régression : la colonne `spell_keywords` contient des SpellKeywordInstance,
// dont la clé est `id`. Le code lisait `sk.keyword`, un champ qui n'existe sur
// aucune entrée (vérifié en base : 0 sur 134 cartes). La statistique était donc
// silencieusement vide côté sorts — aucune erreur, juste des lignes manquantes.
import { describe, expect, it } from "vitest";
import { aggregateByAbility } from "./analytics";
import type { CardRow, DeckSnapshot } from "./analytics";

function card(id: number, over: Partial<CardRow> = {}): CardRow {
  return {
    id, name: `Carte ${id}`, faction: null, race: null, clan: null,
    keywords: null, spell_keywords: null, image_url: null, ...over,
  };
}

function snapshot(id: number, isWinner: boolean, cards: Array<{ card_id: number; copies: number }>): DeckSnapshot {
  return {
    id, match_id: `m${id}`, player_id: `p${id}`, deck_id: null, hero_id: null,
    is_winner: isWinner, cards, primary_faction: null, created_at: "2026-07-28T00:00:00Z",
  };
}

const byKey = (stats: ReturnType<typeof aggregateByAbility>, key: string) => stats.find((s) => s.key === key);

describe("aggregateByAbility", () => {
  it("compte les mots-clés de SORT (spell_keywords[].id)", () => {
    const cards = new Map<number, CardRow>([
      [1, card(1, { spell_keywords: [{ id: "impact" }, { id: "precision" }] })],
    ]);
    const snaps = [
      snapshot(1, true, [{ card_id: 1, copies: 2 }]),
      snapshot(2, false, [{ card_id: 1, copies: 1 }]),
    ];

    const stats = aggregateByAbility(snaps, cards, 1);

    const impact = byKey(stats, "impact");
    expect(impact).toBeDefined();
    expect(impact!.wins).toBe(2);
    expect(impact!.losses).toBe(1);
    expect(impact!.games_count).toBe(2);
    expect(byKey(stats, "precision")).toBeDefined();
  });

  it("compte toujours les mots-clés de créature", () => {
    const cards = new Map<number, CardRow>([[1, card(1, { keywords: ["charge", "taunt"] })]]);
    const stats = aggregateByAbility([snapshot(1, true, [{ card_id: 1, copies: 1 }])], cards, 1);

    expect(byKey(stats, "charge")).toBeDefined();
    expect(byKey(stats, "taunt")).toBeDefined();
  });

  it("une capacité polymorphe fusionne ses deux formes sous une seule ligne", () => {
    // `poison` existe côté créature ET côté sort, sous le même id.
    const cards = new Map<number, CardRow>([
      [1, card(1, { keywords: ["poison"] })],
      [2, card(2, { spell_keywords: [{ id: "poison" }] })],
    ]);
    const snaps = [snapshot(1, true, [{ card_id: 1, copies: 1 }, { card_id: 2, copies: 1 }])];

    const stats = aggregateByAbility(snaps, cards, 1);

    const poison = byKey(stats, "poison");
    expect(poison!.copies_total).toBe(2);
    // Une seule partie, même si la capacité vient de deux cartes.
    expect(poison!.games_count).toBe(1);
  });

  it("le seuil minGames écarte les capacités trop rares", () => {
    const cards = new Map<number, CardRow>([[1, card(1, { spell_keywords: [{ id: "afflux" }] })]]);
    const stats = aggregateByAbility([snapshot(1, true, [{ card_id: 1, copies: 1 }])], cards, 5);

    expect(byKey(stats, "afflux")).toBeUndefined();
  });
});
