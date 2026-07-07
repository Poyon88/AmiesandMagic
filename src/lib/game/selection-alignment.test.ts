// Sélection X : le pool proposé doit couvrir TOUTES les factions du même
// alignement que la carte source (bon/neutre/maléfique), pas seulement la
// faction de la source. Le moteur (getSelectionCards + factionsForSelectionAlignment)
// gère déjà ça ; le vrai bug était le chargement trop étroit du factionCardPool
// (page.tsx, limité aux factions du deck) — corrigé pour couvrir l'alignement.
import { describe, expect, it } from "vitest";
import { getSelectionCards } from "./engine";
import { mkCard, mkState } from "./test-harness";

function commonCard(id: number, faction: string) {
  return mkCard({ id, name: `${faction}${id}`, faction, rarity: "Commune", mana_cost: 1 } as never);
}

describe("Sélection X — pool par ALIGNEMENT, pas par faction", () => {
  it("source Nains (alignement 'bon') : propose d'AUTRES factions bonnes, jamais une neutre", () => {
    const s = mkState();
    // Pool mêlant deux factions BONNES (Elfes, Nains) et une NEUTRE (Humains).
    s.factionCardPool = [
      commonCard(1, "Elfes"),
      commonCard(2, "Elfes"),
      commonCard(3, "Nains"),
      commonCard(4, "Humains"), // neutre → ne doit jamais sortir
    ];

    const offered = getSelectionCards(s, 0, { faction: "Nains", card_alignment: "bon" });
    const factions = new Set(offered.map((c) => c.faction));

    // Aucune faction d'un autre alignement (Humains = neutre).
    expect(factions.has("Humains")).toBe(false);
    // Le pool s'étend au-delà de la seule faction source : Elfes (bon) est proposé.
    expect(factions.has("Elfes")).toBe(true);
  });

  it("ne propose que des communes", () => {
    const s = mkState();
    s.factionCardPool = [
      commonCard(1, "Elfes"),
      mkCard({ id: 2, name: "ElfeRare", faction: "Elfes", rarity: "Rare", mana_cost: 1 } as never),
    ];
    const offered = getSelectionCards(s, 0, { faction: "Nains", card_alignment: "bon" });
    expect(offered.every((c) => c.rarity === "Commune")).toBe(true);
  });
});
