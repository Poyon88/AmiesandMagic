// Sélection X : le pool proposé doit couvrir TOUTES les factions du même
// alignement que la carte source (bon/neutre/maléfique), pas seulement la
// faction de la source. Le moteur (getSelectionCards + selectionFactionBuckets)
// gère déjà ça ; le vrai bug était le chargement trop étroit du factionCardPool
// (page.tsx, limité aux factions du deck) — corrigé pour couvrir l'alignement.
//
// MISE À JOUR : les alignements TRANCHÉS (bon, maléfique) reçoivent en renfort
// le pool neutre, en tirage pondéré — au plus 1 neutre sur 3. La règle
// historique « jamais une carte neutre » ne tient donc plus ; le détail du
// dosage est verrouillé par selection-alignment-neutre.test.ts.
import { describe, expect, it } from "vitest";
import { getSelectionCards } from "./engine";
import { mkCard, mkState } from "./test-harness";

function commonCard(id: number, faction: string) {
  return mkCard({ id, name: `${faction}${id}`, faction, rarity: "Commune", mana_cost: 1 } as never);
}

describe("Sélection X — pool par ALIGNEMENT, pas par faction", () => {
  it("source Nains (alignement 'bon') : s'étend aux autres factions bonnes, jamais aux maléfiques", () => {
    const s = mkState();
    // Pool mêlant deux factions BONNES (Elfes, Nains) et une MALÉFIQUE.
    s.factionCardPool = [
      commonCard(1, "Elfes"),
      commonCard(2, "Elfes"),
      commonCard(3, "Nains"),
      commonCard(4, "Morts-Vivants"), // alignement opposé → jamais proposé
    ];

    const offered = getSelectionCards(s, 0, { faction: "Nains", card_alignment: "bon" });
    const factions = new Set(offered.map((c) => c.faction));

    // L'ouverture au neutre ne franchit PAS la frontière du camp adverse.
    expect(factions.has("Morts-Vivants")).toBe(false);
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
