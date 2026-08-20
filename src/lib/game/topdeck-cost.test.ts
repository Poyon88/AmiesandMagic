// COÛT ADDITIONNEL DE REPLI : replacer N cartes de sa MAIN sur le dessus de son
// propre deck pour jouer une carte.
//
// Cinquième membre de la famille des coûts additionnels (PV, défausse,
// sacrifice, exil) : cumulatif avec le mana, et non réductible — Canalisation et
// Entraide ne touchent que `mana_cost`.
//
// Ce qui le distingue de la défausse : rien n'est perdu. La carte revient sur le
// deck et sera repiochée. Ce qui est payé, c'est du TEMPO — la main rétrécit
// tout de suite, et la prochaine pioche est dépensée d'avance. C'est aussi le
// seul coût que le joueur puisse tourner à son profit, en y replaçant une carte
// qu'il veut justement revoir.
import { describe, expect, it } from "vitest";
import { applyAction, canPlayCard, playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState } from "./types";

/** Une main de `mains` cartes nommées, plus la carte à jouer, et un deck nommé. */
function etat(mains: string[], topdeckCost: number, deck: string[] = ["D1", "D2"], manaCost = 1) {
  const s = mkState();
  s.players[0].hand = mains.map(n => mkInstance(mkCard({ name: n })));
  s.players[0].deck = deck.map(n => mkInstance(mkCard({ name: n })));
  const carte = mkInstance(mkCard({
    name: "Pacte", mana_cost: manaCost, attack: 2, health: 2, topdeck_cost: topdeckCost,
  }));
  s.players[0].hand.push(carte);
  return { s, carte };
}

const idDe = (s: GameState, nom: string) =>
  s.players[0].hand.find(c => c.card.name === nom)!.instanceId;
const nomsDeck = (s: GameState) => s.players[0].deck.map(c => c.card.name).join(",");
const nomsMain = (s: GameState) => s.players[0].hand.map(c => c.card.name).join(",");

describe("coût de repli — paiement", () => {
  it("la carte désignée quitte la main pour le DESSUS du deck", () => {
    const { s, carte } = etat(["A", "B"], 1);
    const a = idDe(s, "A");

    const st = playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [a],
    });

    expect(nomsDeck(st)).toBe("A,D1,D2");
    expect(nomsMain(st)).toBe("B");
    expect(st.players[0].board.some(c => c.card.name === "Pacte")).toBe(true);
  });

  it("la carte repliée ne passe PAS par le cimetière", () => {
    // Toute la différence avec la défausse : rien n'est perdu, donc rien à
    // exhumer non plus.
    const { s, carte } = etat(["A"], 1);
    const a = idDe(s, "A");

    const st = playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [a],
    });

    expect(st.players[0].graveyard.map(c => c.card.name)).not.toContain("A");
  });

  it("la carte repliée est la PROCHAINE PIOCHE", () => {
    // C'est ce qui fait du repli un coût de tempo et non de ressource : la
    // carte revient, mais elle occupe la pioche suivante.
    const { s, carte } = etat(["A", "B"], 1);
    const a = idDe(s, "A");

    let st = playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [a],
    });
    st = applyAction(st, { type: "end_turn" }); // tour de P1
    st = applyAction(st, { type: "end_turn" }); // retour à P0 → il pioche

    expect(st.players[0].hand.some(c => c.card.name === "A")).toBe(true);
  });

  it("l'ORDRE des désignations décide du dessus : la PREMIÈRE finit au sommet", () => {
    // C'est l'ordre que la modale montre au joueur (elle numérote ses clics) :
    // le moteur doit le respecter, sinon le rang affiché ment.
    const { s, carte } = etat(["A", "B", "C"], 2);
    const a = idDe(s, "A"), b = idDe(s, "B");

    const st = playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [a, b],
    });

    expect(nomsDeck(st)).toBe("A,B,D1,D2");
  });

  it("s'ajoute au coût en mana au lieu de le remplacer", () => {
    const { s, carte } = etat(["A"], 1, ["D1"], 3);
    const a = idDe(s, "A");
    const manaAvant = s.players[0].mana;

    const st = playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [a],
    });

    expect(st.players[0].mana).toBe(manaAvant - 3);
    expect(nomsDeck(st)).toBe("A,D1");
  });

  it("un coût nul ne touche à rien", () => {
    const { s, carte } = etat(["A"], 0);
    const st = playCard(s, { type: "play_card", cardInstanceId: carte.instanceId });
    expect(nomsDeck(st)).toBe("D1,D2");
    expect(nomsMain(st)).toBe("A");
  });
});

describe("coût de repli — désignations invalides", () => {
  it("aucune désignation alors que le coût l'exige : REFUSÉE", () => {
    const { s, carte } = etat(["A"], 1);
    expect(playCard(s, { type: "play_card", cardInstanceId: carte.instanceId })).toBe(s);
  });

  it("trop de désignations : REFUSÉE (on ne paie pas plus que demandé)", () => {
    const { s, carte } = etat(["A", "B"], 1);
    const a = idDe(s, "A"), b = idDe(s, "B");
    expect(playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [a, b],
    })).toBe(s);
  });

  it("la carte JOUÉE ne peut pas se replier elle-même", () => {
    // Sinon jouer la carte reviendrait à… ne pas la jouer.
    const { s, carte } = etat(["A"], 1);
    expect(playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [carte.instanceId],
    })).toBe(s);
  });

  it("deux fois la MÊME carte : REFUSÉE", () => {
    // Sans cette garde, le second `findIndex` retomberait sur une autre carte,
    // choisie par le moteur et jamais par le joueur.
    const { s, carte } = etat(["A", "B"], 2);
    const a = idDe(s, "A");
    expect(playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [a, a],
    })).toBe(s);
  });

  it("une carte qui n'est pas en main : REFUSÉE", () => {
    const { s, carte } = etat(["A"], 1);
    expect(playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: ["fantome"],
    })).toBe(s);
  });

  it("la même carte ne peut pas payer la défausse ET le repli", () => {
    // Les deux coûts puisent dans la même main : un exemplaire, un coût.
    const s = mkState();
    s.players[0].hand = [mkInstance(mkCard({ name: "A" })), mkInstance(mkCard({ name: "B" }))];
    const carte = mkInstance(mkCard({
      name: "Pacte", mana_cost: 1, attack: 1, health: 1, discard_cost: 1, topdeck_cost: 1,
    }));
    s.players[0].hand.push(carte);
    const a = idDe(s, "A");

    expect(playCard(s, {
      type: "play_card", cardInstanceId: carte.instanceId,
      discardInstanceIds: [a], topdeckInstanceIds: [a],
    })).toBe(s);
  });
});

describe("coût de repli — l'interface grise la carte avant le clic", () => {
  it("main trop petite : injouable", () => {
    // La carte jouée ne peut pas financer son propre repli, donc il faut une
    // AUTRE carte en main.
    const { s, carte } = etat([], 1);
    expect(canPlayCard(s, carte.instanceId)).toBe(false);

    const { s: s2, carte: c2 } = etat(["A"], 1);
    expect(canPlayCard(s2, c2.instanceId)).toBe(true);
  });

  it("défausse ET repli : c'est leur SOMME qui décide", () => {
    // Testés séparément, une carte « défausser 1 + replier 1 » passait le
    // filtre avec deux cartes en main, puis le moteur la refusait en silence.
    const s = mkState();
    s.players[0].hand = [mkInstance(mkCard({ name: "A" }))];
    const carte = mkInstance(mkCard({
      name: "Pacte", mana_cost: 0, attack: 1, health: 1, discard_cost: 1, topdeck_cost: 1,
    }));
    s.players[0].hand.push(carte);

    expect(canPlayCard(s, carte.instanceId)).toBe(false);

    s.players[0].hand.unshift(mkInstance(mkCard({ name: "B" })));
    expect(canPlayCard(s, carte.instanceId)).toBe(true);
  });
});

describe("coût de repli — sorts", () => {
  it("s'applique aussi à un SORT", () => {
    const s = mkState();
    s.players[0].hand = [mkInstance(mkCard({ name: "A" }))];
    s.players[0].deck = [mkInstance(mkCard({ name: "D1" }))];
    const sort = mkInstance(mkCard({
      name: "Rituel", card_type: "spell", attack: null, health: null,
      mana_cost: 0, topdeck_cost: 1,
    }));
    s.players[0].hand.push(sort);
    const a = idDe(s, "A");

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId, topdeckInstanceIds: [a],
    });

    expect(nomsDeck(st)).toBe("A,D1");
    expect(st.players[0].graveyard.some(c => c.card.name === "Rituel")).toBe(true);
  });
});

describe("coût de repli — signalé pour l'ANIMATION", () => {
  // Même angle mort que l'exil : la main rétrécit et la pile grossit au même
  // instant, sans que rien ne relie les deux à la carte jouée.
  it("l'évènement porte le nombre exact et le propriétaire du deck", () => {
    const { s, carte } = etat(["A", "B"], 2);
    s.players[0].id = "MOI";
    const a = idDe(s, "A"), b = idDe(s, "B");

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [a, b],
    });

    expect(st.topdeckCostEvents).toEqual([{ ownerId: "MOI", count: 2 }]);
  });

  it("l'évènement ne dit JAMAIS quelle carte — elle serait la prochaine pioche", () => {
    const { s, carte } = etat(["A"], 1);
    const a = idDe(s, "A");

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: carte.instanceId, topdeckInstanceIds: [a],
    });

    expect(JSON.stringify(st.topdeckCostEvents)).not.toContain("A");
  });

  it("une carte sans coût de repli ne signale rien", () => {
    const { s, carte } = etat(["A"], 0);
    const st = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId });
    expect(st.topdeckCostEvents).toBeUndefined();
  });

  it("un coût REFUSÉ ne signale rien non plus", () => {
    const { s, carte } = etat(["A"], 1);
    const st = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId });
    expect(st.topdeckCostEvents).toBeUndefined();
  });

  it("exclu du hash de synchro — indice d'animation, pas vérité de jeu", async () => {
    const { syncHash } = await import("./stateHash");
    const { s } = etat(["A"], 0);
    const b: GameState = { ...s, topdeckCostEvents: [{ ownerId: s.players[0].id, count: 1 }] };
    expect(syncHash(s)).toBe(syncHash(b));
  });
});
