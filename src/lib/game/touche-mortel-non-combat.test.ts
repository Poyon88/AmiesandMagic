// TOUCHÉ MORTEL sur des dégâts qui ne viennent pas du combat.
//
// « Toute créature blessée par cette unité meurt, quels que soient ses PV » —
// le libellé ne parle pas de combat. Vu en partie sur « Maître-Archer de la
// Canopée » (Touché mortel + Tempête 1) : sa Tempête blessait sans tuer.
//
// CAUSE : à l'ENTRÉE EN JEU, Tempête et Cataclysme attribuaient leurs dégâts au
// HÉROS (`player.hero`) et non à la créature qui les porte. Or la garde de
// Touché mortel exige une instance (`"instanceId" in source`), qu'un héros ne
// franchit jamais. Le chemin de REJEU (mort / activation / retour) passait déjà
// la créature : l'entrée en jeu était l'exception.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

/** Créature porteuse, avec Tempête X à l'entrée et, au choix, Touché mortel. */
function porteuse(kws: string[], x: number): CardInstance {
  return mkInstance(mkCard({
    name: "Maître-Archer", mana_cost: 5, attack: 1, health: 1,
    keywords: kws as never,
    keyword_instances: [{ id: "tempete", x }] as never,
  }));
}

function jouer(p: CardInstance, pvCible: number): GameState {
  const s = mkState();
  s.players[1].board = [mkInstance(mkCard({ name: "Traqueur", attack: 2, health: pvCible }))];
  s.players[0].hand.push(p);
  return applyAction(s, { type: "play_card", cardInstanceId: p.instanceId });
}

describe("Tempête à l'entrée", () => {
  it("TUE une cible bien plus résistante quand la source a Touché mortel", () => {
    // 1 dégât sur une créature à 5 PV : sans Touché mortel elle survit.
    const s = jouer(porteuse(["tempete", "touche_mortel"], 1), 5);
    expect(s.players[1].board).toHaveLength(0);
    expect(s.players[1].graveyard).toHaveLength(1);
  });

  it("blesse seulement, sans Touché mortel", () => {
    const s = jouer(porteuse(["tempete"], 1), 5);
    expect(s.players[1].board).toHaveLength(1);
    expect(s.players[1].board[0].currentHealth).toBe(4);
  });
});

describe("Cataclysme à l'entrée", () => {
  it("tue aussi par Touché mortel", () => {
    const src = mkInstance(mkCard({
      name: "Foudroyeur", mana_cost: 5, attack: 1, health: 9,
      keywords: ["cataclysme", "touche_mortel"] as never,
      keyword_instances: [{ id: "cataclysme", x: 1 }] as never,
    }));
    const s = jouer(src, 8);
    expect(s.players[1].board).toHaveLength(0);
  });
});
