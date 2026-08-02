// Renfort NEUTRE des alignements tranchés.
//
// Bon et maléfique ne comptent que 2 factions chacun quand le neutre en compte
// 5 : en communes, 169 et 115 contre 306. Les camps tranchés étaient donc les
// plus pauvres, au point qu'une Invocation X pouvait ne rien trouver au coût
// demandé. Ils reçoivent désormais le pool neutre EN RENFORT.
//
// Mais en tirage PONDÉRÉ : une carte de l'alignement propre pèse deux fois une
// neutre. Fondus à égalité, une Découverte maléfique afficherait ~73 % de
// neutre et cesserait de « sentir » la faction.
//
// Le neutre, lui, ne gagne rien — c'est le terrain commun, pas un camp.
// L'asymétrie qui en résulte est un choix, et ce fichier la verrouille.
import { describe, expect, it } from "vitest";
import { getSelectionCards, initRNG, playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameState } from "./types";

let seq = 1;
function commune(faction: string, mana = 1): Card {
  return mkCard({ id: 9000 + seq++, name: `${faction}-${seq}`, faction, rarity: "Commune", mana_cost: mana });
}

/** Alignements réels du registre : bon = Elfes/Nains, neutre = 5 factions,
 *  maléfique = Morts-Vivants/Elfes Noirs. */
const BON = "Nains";
const AUTRE_BON = "Elfes";
const NEUTRE = "Humains";
const MALEFIQUE = "Morts-Vivants";

function etatAvecPool(cards: Card[]): GameState {
  const s = mkState();
  s.factionCardPool = cards;
  return s;
}

const factionsDe = (offre: Card[]) => offre.map(c => c.faction);
const compteNeutre = (offre: Card[]) => offre.filter(c => c.faction === NEUTRE).length;

describe("Découverte — le neutre renforce les alignements tranchés", () => {
  it("une source BONNE se voit proposer du neutre, mais au plus 1 sur 3", () => {
    const s = etatAvecPool([
      ...Array.from({ length: 10 }, () => commune(BON)),
      ...Array.from({ length: 10 }, () => commune(AUTRE_BON)),
      ...Array.from({ length: 40 }, () => commune(NEUTRE)),
    ]);
    const offre = getSelectionCards(s, 0, { faction: BON, card_alignment: "bon" });

    expect(offre.length).toBe(3);
    expect(compteNeutre(offre), `offre : ${factionsDe(offre).join(", ")}`).toBeLessThanOrEqual(1);
    // …et au moins 2 de l'alignement propre, malgré un pool neutre 2× plus gros.
    expect(offre.filter(c => c.faction === BON || c.faction === AUTRE_BON).length).toBeGreaterThanOrEqual(2);
  });

  it("idem pour une source MALÉFIQUE", () => {
    const s = etatAvecPool([
      ...Array.from({ length: 10 }, () => commune(MALEFIQUE)),
      ...Array.from({ length: 40 }, () => commune(NEUTRE)),
    ]);
    const offre = getSelectionCards(s, 0, { faction: MALEFIQUE, card_alignment: "maléfique" });

    expect(offre.length).toBe(3);
    expect(compteNeutre(offre)).toBeLessThanOrEqual(1);
    expect(offre.filter(c => c.faction === MALEFIQUE).length).toBeGreaterThanOrEqual(2);
  });

  it("l'ouverture ne franchit JAMAIS la frontière du camp adverse", () => {
    const s = etatAvecPool([
      ...Array.from({ length: 5 }, () => commune(BON)),
      ...Array.from({ length: 5 }, () => commune(NEUTRE)),
      ...Array.from({ length: 20 }, () => commune(MALEFIQUE)),
    ]);
    const offre = getSelectionCards(s, 0, { faction: BON, card_alignment: "bon" });
    expect(factionsDe(offre)).not.toContain(MALEFIQUE);
  });

  it("alignement propre PAUVRE : le neutre comble, l'offre reste à 3", () => {
    // Une seule carte bonne disponible : sans le repli, l'offre tomberait à 1.
    const s = etatAvecPool([
      commune(BON),
      ...Array.from({ length: 20 }, () => commune(NEUTRE)),
    ]);
    const offre = getSelectionCards(s, 0, { faction: BON, card_alignment: "bon" });

    expect(offre.length).toBe(3);
    expect(compteNeutre(offre)).toBe(2); // le quota est dépassé faute de mieux
  });

  it("une source NEUTRE garde exactement son pool d'avant", () => {
    // La décision d'asymétrie : le neutre ne reçoit aucun renfort, et n'accède
    // ni au bon ni au maléfique.
    const s = etatAvecPool([
      ...Array.from({ length: 10 }, () => commune(NEUTRE)),
      ...Array.from({ length: 10 }, () => commune(BON)),
      ...Array.from({ length: 10 }, () => commune(MALEFIQUE)),
    ]);
    const offre = getSelectionCards(s, 0, { faction: NEUTRE, card_alignment: "neutre" });

    expect(offre.length).toBe(3);
    expect(offre.every(c => c.faction === NEUTRE), `offre : ${factionsDe(offre).join(", ")}`).toBe(true);
  });

  it("même germe ⇒ même offre (les deux clients voient la même chose)", () => {
    const construire = () => etatAvecPool([
      ...Array.from({ length: 10 }, (_, i) => mkCard({ id: 100 + i, name: `B${i}`, faction: BON, rarity: "Commune", mana_cost: 1 })),
      ...Array.from({ length: 20 }, (_, i) => mkCard({ id: 200 + i, name: `N${i}`, faction: NEUTRE, rarity: "Commune", mana_cost: 1 })),
    ]);
    const src = { faction: BON, card_alignment: "bon" };
    expect(getSelectionCards(construire(), 0, src).map(c => c.id))
      .toEqual(getSelectionCards(construire(), 0, src).map(c => c.id));
  });
});

describe("Invocation X — tirage pondéré 2:1", () => {
  /** Sort « Invocation X » de la faction/alignement donnés. */
  function sortInvocation(x: number, faction: string) {
    return mkInstance(mkCard({
      mana_cost: 0, card_type: "spell", attack: null as unknown as number, health: null as unknown as number,
      faction, spell_keywords: [{ id: "invocation", amount: x }],
    }));
  }

  function creaturePool(faction: string, race: string, n: number, mana = 2): Card[] {
    return Array.from({ length: n }, () => mkCard({
      id: 3000 + seq++, name: `${faction}-c`, faction, race,
      rarity: "Commune", mana_cost: mana, card_type: "creature", attack: 2, health: 2,
    }));
  }

  it("environ deux tiers des invocations viennent de l'alignement propre", () => {
    // Pools de taille ÉGALE (10 contre 10) : sans pondération on attendrait 50 %.
    initRNG(4242);
    let propre = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const s = etatAvecPool([
        ...creaturePool(BON, "Nains", 10),
        ...creaturePool(NEUTRE, "Humains", 10),
      ]);
      const sort = sortInvocation(2, BON);
      s.players[0].hand.push(sort);
      const next = playCard(s, { type: "play_card", cardInstanceId: sort.instanceId });
      if (next.players[0].board[0]?.card.faction === BON) propre++;
    }
    const part = propre / n;
    expect(part, `part de l'alignement propre : ${(part * 100).toFixed(1)} %`).toBeGreaterThan(0.58);
    expect(part).toBeLessThan(0.75);
  });

  it("alignement propre vide : le neutre prend le relais au lieu de fizzler", () => {
    // Le gain concret de l'ouverture : avant, l'invocation ne trouvait rien au
    // coût demandé et ne faisait rien.
    initRNG(9);
    const s = etatAvecPool(creaturePool(NEUTRE, "Humains", 5, 4));
    const sort = sortInvocation(4, BON);
    s.players[0].hand.push(sort);

    const next = playCard(s, { type: "play_card", cardInstanceId: sort.instanceId });

    expect(next.players[0].board.length).toBe(1);
    expect(next.players[0].board[0].card.faction).toBe(NEUTRE);
  });

  it("l'alignement OPPOSÉ reste hors de portée", () => {
    initRNG(3);
    const s = etatAvecPool(creaturePool(MALEFIQUE, "Squelettes", 5, 4));
    const sort = sortInvocation(4, BON);
    s.players[0].hand.push(sort);

    const next = playCard(s, { type: "play_card", cardInstanceId: sort.instanceId });

    expect(next.players[0].board.length).toBe(0);
  });
});
