// Sets « spéciaux » : leurs cartes sont écartées des tirages aléatoires et
// semi-aléatoires de la COLLECTION.
//
// Le filtre est appliqué à la CONSTRUCTION des pools (`factionCardPool` /
// `allSpellsPool`, au chargement du match) plutôt qu'aux résolveurs qui y
// puisent — ils sont huit (Sélection ×3, Invocation X, Invocations multiples,
// Déchainement, Concentration, Épargne) et un neuvième ajouté demain hériterait
// sinon d'un oubli silencieux. C'est exactement le motif d'inventaire dupliqué
// qui a déjà dérivé plusieurs fois dans ce projet.
//
// Ce que le filtre ne fait PAS : empêcher de collectionner, de mettre en deck,
// de piocher ou de jouer une carte de set spécial. Seules les offres que le
// joueur n'a pas construites lui-même l'ignorent.
import { describe, expect, it } from "vitest";
import { applyAction, getSelectionCards } from "./engine";
import { excludeSpecialSets } from "./deck-rules";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, SpellKeywordInstance } from "./types";

const commune = (name: string, setId: number | null) =>
  mkCard({
    name, card_type: "creature", mana_cost: 1, attack: 1, health: 1,
    faction: "Mercenaires", rarity: "Commune", set_id: setId,
  } as Partial<Card>);

describe("excludeSpecialSets", () => {
  it("retire les cartes des sets spéciaux, garde les autres", () => {
    const cartes = [commune("Base", 1), commune("Spéciale", 2), commune("SansSet", null)];
    const gardees = excludeSpecialSets(cartes, new Set([2])).map((c) => c.name);
    expect(gardees).toEqual(["Base", "SansSet"]);
  });

  it("une carte SANS set (édition limitée) n'est jamais écartée", () => {
    const cartes = [commune("Limitée", null)];
    expect(excludeSpecialSets(cartes, new Set([2]))).toHaveLength(1);
  });

  it("aucun set spécial ⇒ le pool est rendu tel quel, sans copie inutile", () => {
    const cartes = [commune("A", 1)];
    expect(excludeSpecialSets(cartes, new Set())).toBe(cartes);
    expect(excludeSpecialSets(cartes, undefined)).toBe(cartes);
  });
});

describe("effet sur les tirages", () => {
  it("une Sélection ne propose que ce qui reste dans le pool filtré", () => {
    const s = mkState();
    // Le pool est déjà filtré à la construction — on reproduit ici son état.
    s.factionCardPool = excludeSpecialSets(
      [commune("Base1", 1), commune("Base2", 1), commune("Spé1", 2), commune("Spé2", 2)],
      new Set([2]),
    );
    const offre = getSelectionCards(s, 5).map((c) => c.name).sort();
    expect(offre).toEqual(["Base1", "Base2"]);
  });

  it("pool entièrement spécial ⇒ offre vide, pas de repli élargi", () => {
    const s = mkState();
    s.factionCardPool = excludeSpecialSets([commune("Spé1", 2)], new Set([2]));
    expect(getSelectionCards(s, 5)).toEqual([]);
  });
});

describe("ce que le filtre NE restreint PAS", () => {
  it("une carte de set spécial se joue normalement depuis la main", () => {
    const s = mkState();
    const carte = mkInstance(commune("Spéciale", 2));
    s.players[0].hand.push(carte);

    const st = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId });

    expect(st.players[0].board.map((c) => c.card.name)).toContain("Spéciale");
  });

  it("un SORT de set spécial se résout normalement", () => {
    const s = mkState();
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));
    const sort = mkInstance(mkCard({
      name: "Sort spécial", card_type: "spell", attack: null, health: null, set_id: 2,
      spell_keywords: [{ id: "impact", amount: 3 }] as SpellKeywordInstance[],
    } as Partial<Card>));
    s.players[0].hand.push(sort);

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId,
      targetInstanceId: s.players[1].board[0].instanceId,
    });

    expect(st.players[1].board[0].currentHealth).toBe(6);
  });
});
