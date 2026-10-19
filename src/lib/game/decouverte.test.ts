// Variante « découverte un tour sur deux » : aux tours pairs du joueur, la
// pioche est remplacée par 1 carte à choisir parmi 3 Communes — 2 de son clan,
// 1 de sa faction mais d'un autre clan.
import { describe, expect, it } from "vitest";
import { applyAction, initializeGame } from "./engine";
import { identiteDuDeck } from "./decouverte";
import { mkCard } from "./test-harness";
import type { Card, GameState, PendingTrigger } from "./types";

const F = "Elfes", CLAN = "Les Sylvains", AUTRE = "Les Hauts-Elfes";
const commune = (clan: string | null, cout: number, extra: Partial<Card> = {}) =>
  mkCard({ faction: F, clan: clan ?? undefined, rarity: "Commune", mana_cost: cout, attack: 1, health: 1, ...extra } as Partial<Card>);

function vivier(): Card[] {
  const out: Card[] = [];
  for (let c = 1; c <= 6; c++) out.push(commune(CLAN, c), commune(CLAN, c), commune(AUTRE, c));
  out.push(commune(CLAN, 3, { rarity: "Rare" }), commune(AUTRE, 2, { rarity: "Légendaire" }));
  out.push(mkCard({ faction: "Nains", clan: "Autre faction", rarity: "Commune", mana_cost: 2 } as Partial<Card>));
  return out;
}

function partie(decouverte = true): GameState {
  const deck = [{ card: commune(CLAN, 1, { name: "Pioche" }), quantity: 30 }];
  let s = initializeGame("a", "b", deck, deck, 0, 7, null, null, vivier(), [], null, { decouverteAlternee: decouverte });
  s = applyAction(s, { type: "mulligan", playerId: "a", replacedInstanceIds: [] });
  s = applyAction(s, { type: "mulligan", playerId: "b", replacedInstanceIds: [] });
  return s;
}

/** Termine le tour ; tranche la découverte du joueur entrant si elle est posée. */
function finDeTour(s: GameState): { s: GameState; offre: PendingTrigger | null } {
  const n = applyAction(s, { type: "end_turn" });
  const t = n.pendingTriggers?.find(p => p.selectionType === "decouverte") ?? null;
  return { s: n, offre: t };
}

describe("découverte un tour sur deux", () => {
  it("identité du deck : faction puis clan majoritaires, Mercenaires exclus", () => {
    const deck = [
      { card: commune(CLAN, 1), quantity: 10 },
      { card: commune(AUTRE, 1), quantity: 4 },
      { card: mkCard({ faction: "Mercenaires", mana_cost: 1 } as Partial<Card>), quantity: 20 },
    ];
    expect(identiteDuDeck(deck)).toEqual({ faction: F, clan: CLAN });
  });

  it("1er tour : pioche ; 2e tour de chaque joueur : découverte, sans entamer le deck", () => {
    const s = partie();
    expect(s.turnNumber).toBe(1);
    expect(s.pendingTriggers ?? []).toHaveLength(0);

    const t2 = finDeTour(s); // tour 1 du 2e joueur : pioche
    expect(t2.offre).toBeNull();
    const t3 = finDeTour(t2.s); // tour 2 du 1er joueur : découverte
    expect(t3.offre?.controllerId).toBe("a");
    const deckAvant = t2.s.players[0].deck.length;
    expect(t3.s.players[0].deck.length, "pas de pioche").toBe(deckAvant);
  });

  it("l'offre : 3 Communes distinctes, 2 du clan et 1 d'un autre clan de la faction", () => {
    const { offre, s } = finDeTour(finDeTour(partie()).s);
    const parId = new Map((s.factionCardPool ?? []).map(c => [c.id, c]));
    const cartes = offre!.selectionOptionIds!.map(id => parId.get(id)!);
    expect(new Set(cartes.map(c => c.id)).size).toBe(3);
    expect(cartes.every(c => c.rarity === "Commune" && c.faction === F)).toBe(true);
    expect(cartes.filter(c => c.clan === CLAN)).toHaveLength(2);
    expect(cartes.filter(c => c.clan === AUTRE)).toHaveLength(1);
  });

  it("la carte choisie arrive en main ; une carte hors offre est refusée", () => {
    const { offre, s } = finDeTour(finDeTour(partie()).s);
    const main = s.players[0].hand.length;
    const intrus = (s.factionCardPool ?? []).find(c => !offre!.selectionOptionIds!.includes(c.id))!;
    expect(applyAction(s, { type: "resolve_pending_trigger", triggerId: offre!.id, selectionCardId: intrus.id })).toBe(s);
    const choisie = offre!.selectionOptionIds![2];
    const n = applyAction(s, { type: "resolve_pending_trigger", triggerId: offre!.id, selectionCardId: choisie });
    expect(n.players[0].hand).toHaveLength(main + 1);
    expect(n.players[0].hand.at(-1)!.card.id).toBe(choisie);
    expect(n.pendingTriggers ?? []).toHaveLength(0);
  });

  it("fenêtre expirée : une des cartes offertes, au hasard", () => {
    const { offre, s } = finDeTour(finDeTour(partie()).s);
    const n = applyAction(s, { type: "auto_resolve_pending_triggers", headTriggerId: offre!.id });
    expect(offre!.selectionOptionIds).toContain(n.players[0].hand.at(-1)!.card.id);
  });

  it("le 2e joueur découvre aussi à son 2e tour", () => {
    let { s, offre } = finDeTour(finDeTour(partie()).s);
    s = applyAction(s, { type: "resolve_pending_trigger", triggerId: offre!.id, selectionCardId: offre!.selectionOptionIds![0] });
    ({ s, offre } = finDeTour(s));
    expect(offre?.controllerId).toBe("b");
  });

  it("variante désactivée : pioche à chaque tour, état sans trace de la variante", () => {
    const s = partie(false);
    expect(s.regles).toBeUndefined();
    expect(s.players[0].identite).toBeUndefined();
    const { s: n, offre } = finDeTour(finDeTour(s).s);
    expect(offre).toBeNull();
    expect(n.players[0].deck.length).toBe(s.players[0].deck.length - 1);
  });
});
