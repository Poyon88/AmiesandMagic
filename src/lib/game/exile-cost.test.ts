// COÛT ADDITIONNEL D'EXIL : retirer N cartes du dessus de son PROPRE deck pour
// jouer une carte.
//
// Quatrième membre de la famille des coûts additionnels (PV, défausse,
// sacrifice) : cumulatif avec le mana, et non réductible — Canalisation et
// Entraide ne touchent que `mana_cost`.
//
// Ce qui le distingue d'une défausse : les cartes sont EXILÉES. Elles ne
// rejoignent aucune zone, donc ni Exhumation, ni Résurrection, ni Rappel ne
// peuvent les récupérer. Sa vraie contrepartie est la fatigue, qu'il rapproche.
import { describe, expect, it } from "vitest";
import { applyAction, canPlayCard, playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState } from "./types";

function etat(deck: string[], exileCost: number, manaCost = 1) {
  const s = mkState();
  s.players[0].deck = deck.map(n => mkInstance(mkCard({ name: n })));
  const carte = mkInstance(mkCard({
    name: "Pacte", mana_cost: manaCost, attack: 2, health: 2, exile_cost: exileCost,
  }));
  s.players[0].hand.push(carte);
  return { s, carte };
}

const noms = (s: GameState) => s.players[0].deck.map(c => c.card.name).join(",");

describe("coût d'exil — paiement", () => {
  it("retire les cartes du DESSUS du deck, dans l'ordre", () => {
    const { s, carte } = etat(["A", "B", "C", "D"], 2);

    const st = playCard(s, { type: "play_card", cardInstanceId: carte.instanceId });

    expect(noms(st)).toBe("C,D");
    expect(st.players[0].board.some(c => c.card.name === "Pacte")).toBe(true);
  });

  it("les cartes exilées ne rejoignent PAS le cimetière", () => {
    // C'est toute la différence avec une défausse : elles sortent du jeu et
    // deviennent irrécupérables (Exhumation, Résurrection, Rappel).
    const { s, carte } = etat(["A", "B", "C"], 2);

    const st = playCard(s, { type: "play_card", cardInstanceId: carte.instanceId });

    expect(st.players[0].graveyard.map(c => c.card.name)).not.toContain("A");
    expect(st.players[0].graveyard.map(c => c.card.name)).not.toContain("B");
  });

  it("s'ajoute au coût en mana au lieu de le remplacer", () => {
    const { s, carte } = etat(["A", "B", "C"], 1, 3);
    const manaAvant = s.players[0].mana;

    const st = playCard(s, { type: "play_card", cardInstanceId: carte.instanceId });

    expect(st.players[0].mana).toBe(manaAvant - 3);
    expect(st.players[0].deck.length).toBe(2);
  });

  it("un coût nul ne touche pas au deck", () => {
    const { s, carte } = etat(["A", "B"], 0);
    const st = playCard(s, { type: "play_card", cardInstanceId: carte.instanceId });
    expect(noms(st)).toBe("A,B");
  });
});

describe("coût d'exil — un coût qu'on ne peut pas payer interdit la carte", () => {
  it("deck trop court : la carte est REFUSÉE, rien n'est exilé", () => {
    // Même règle que le coût en PV, qu'on ne paie pas « autant que possible ».
    const { s, carte } = etat(["A"], 2);

    const st = playCard(s, { type: "play_card", cardInstanceId: carte.instanceId });

    expect(st).toBe(s); // action rejetée, état inchangé
    expect(s.players[0].deck.length).toBe(1);
    expect(s.players[0].hand.some(c => c.instanceId === carte.instanceId)).toBe(true);
  });

  it("deck vide : refusée aussi", () => {
    const { s, carte } = etat([], 1);
    expect(playCard(s, { type: "play_card", cardInstanceId: carte.instanceId })).toBe(s);
  });

  it("exactement assez de cartes : la carte passe et vide le deck", () => {
    // Borne exacte — c'est là qu'un `<` de travers se verrait.
    const { s, carte } = etat(["A", "B"], 2);
    const st = playCard(s, { type: "play_card", cardInstanceId: carte.instanceId });
    expect(st).not.toBe(s);
    expect(st.players[0].deck.length).toBe(0);
  });

  it("l'interface grise la carte avant même le clic", () => {
    // canPlayCard doit appliquer la MÊME règle que playCard : sans ça la carte
    // resterait cliquable et l'action serait rejetée en silence.
    const { s, carte } = etat(["A"], 2);
    expect(canPlayCard(s, carte.instanceId)).toBe(false);

    const { s: s2, carte: c2 } = etat(["A", "B"], 2);
    expect(canPlayCard(s2, c2.instanceId)).toBe(true);
  });
});

describe("coût d'exil — sorts et fatigue", () => {
  it("s'applique aussi à un SORT", () => {
    const s = mkState();
    s.players[0].deck = ["A", "B", "C"].map(n => mkInstance(mkCard({ name: n })));
    const sort = mkInstance(mkCard({
      name: "Rituel", card_type: "spell", attack: null, health: null,
      mana_cost: 0, exile_cost: 2,
    }));
    s.players[0].hand.push(sort);

    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });

    expect(noms(st)).toBe("C");
    expect(st.players[0].graveyard.some(c => c.card.name === "Rituel")).toBe(true);
  });

  it("rapproche la fatigue : le deck vidé, la pioche suivante mord", () => {
    // La vraie contrepartie du coût — il n'enlève pas des ressources visibles,
    // il avance l'échéance.
    const { s, carte } = etat(["A", "B"], 2);
    s.players[1].deck = [mkInstance(mkCard({ name: "Z" }))];
    let st = playCard(s, { type: "play_card", cardInstanceId: carte.instanceId });
    expect(st.players[0].deck.length).toBe(0);

    const pvAvant = st.players[0].hero.hp;
    st = applyAction(st, { type: "end_turn" }); // tour de P1
    st = applyAction(st, { type: "end_turn" }); // retour à P0 → il pioche à vide

    expect(st.players[0].hero.hp).toBeLessThan(pvAvant);
  });
});
