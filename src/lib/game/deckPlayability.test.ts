// Jouabilité d'un deck après reprise d'une faction.
//
// Ce n'est pas une règle de construction — le constructeur, lui, refuse déjà
// les cartes non possédées. C'est une règle d'APRÈS : le deck était valide, un
// remboursement a repris la faction, et il faut le dire au joueur sans détruire
// son travail.
import { describe, expect, it } from "vitest";
import { deckPlayability } from "./deckPlayability";
import { NEUTRAL_FACTION, type OwnershipContext } from "./collection";

type CarteTest = Parameters<typeof deckPlayability>[0][number];

const carte = (id: number, faction: string | null, rarity = "Commune"): CarteTest =>
  ({ id, faction, rarity, set_id: 1 }) as CarteTest;

const droits = (factions: string[], collectees: number[] = []): OwnershipContext => ({
  ownsEverything: false,
  collectedCardIds: new Set(collectees),
  legacyFullAccess: false,
  starterFaction: null,
  unlockedFactions: new Set(factions),
  allCommonsUnlocked: false,
});

describe("deckPlayability", () => {
  it("un deck entièrement possédé est jouable", () => {
    const r = deckPlayability([carte(1, "Nains"), carte(2, "Nains")], droits(["Nains"]));
    expect(r).toEqual({ playable: true, missingCount: 0, missingFactions: [] });
  });

  it("une faction reprise rend le deck injouable et se signale au rachat", () => {
    const r = deckPlayability(
      [carte(1, "Nains"), carte(2, "Elfes"), carte(3, "Elfes")],
      droits(["Nains"]), // Elfes a été repris
    );
    expect(r.playable).toBe(false);
    expect(r.missingCount).toBe(2);
    expect(r.missingFactions).toEqual(["Elfes"]);
  });

  it("plusieurs factions manquantes ressortent triées et sans doublon", () => {
    const r = deckPlayability(
      [carte(1, "Orcs"), carte(2, "Elfes"), carte(3, "Elfes"), carte(4, "Nains")],
      droits(["Nains"]),
    );
    expect(r.missingFactions).toEqual(["Elfes", "Orcs"]);
    expect(r.missingCount).toBe(3);
  });

  it("une carte RÉELLEMENT possédée reste jouable même sans sa faction", () => {
    // Une rare gagnée aux enchères n'appartient à aucun déblocage de faction :
    // reprendre la faction ne doit pas la retirer du deck.
    const r = deckPlayability(
      [carte(1, "Elfes", "Rare")],
      droits([], [1]), // détenue en propre
    );
    expect(r.playable).toBe(true);
  });

  it("les cartes neutres survivent à toute reprise", () => {
    const r = deckPlayability([carte(1, NEUTRAL_FACTION)], droits([]));
    expect(r.playable).toBe(true);
  });

  it("le forfait rend tout jouable", () => {
    const r = deckPlayability(
      [carte(1, "Elfes"), carte(2, "Orcs")],
      { ...droits([]), allCommonsUnlocked: true },
    );
    expect(r.playable).toBe(true);
  });

  it("une carte manquante SANS faction est comptée, mais ne promet aucun rachat", () => {
    // Rien en boutique ne la rendrait : annoncer une faction à racheter serait
    // envoyer le joueur dépenser de l'or pour rien.
    const r = deckPlayability([carte(1, null)], droits(["Nains"]));
    expect(r.playable).toBe(false);
    expect(r.missingCount).toBe(1);
    expect(r.missingFactions).toEqual([]);
  });

  it("un deck vide est jouable — il n'y a rien à reprendre", () => {
    expect(deckPlayability([], droits([]))).toEqual({
      playable: true, missingCount: 0, missingFactions: [],
    });
  });
});
