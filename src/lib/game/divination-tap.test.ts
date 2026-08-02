// Divination en POUVOIR ACTIVÉ (mode tap).
//
// Signalé en partie : « ça ne fait rien ». Le pouvoir se résolvait en réalité,
// mais en gardant une carte AU HASARD et sans la moindre modale — le résolveur
// curé applique la règle « pas de modale hors invocation ». Indiscernable d'un
// pouvoir inerte, et contraire au texte du mot-clé, qui promet « replacez-en 1
// dessus et 2 dessous, dans l'ordre choisi ».
//
// Le choix voyage désormais DANS l'action (`divinationChoiceIndex`), comme à
// l'invocation : les deux clients d'une partie en ligne rejouent le même ordre
// de deck, là où un tirage aléatoire les aurait fait diverger si l'un des deux
// avait consommé la RNG à un autre moment.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState } from "./types";

function tisseuse() {
  const c = mkInstance(mkCard({
    name: "Tisseuse", attack: 1, health: 1,
    keywords: ["divination"] as never,
    keyword_instances: [{ id: "divination", mode: "tap" } as never],
  }));
  c.hasSummoningSickness = false;
  return c;
}

function etat(deck: string[]): { s: GameState; src: ReturnType<typeof mkInstance> } {
  const s = mkState();
  const src = tisseuse();
  s.players[0].board.push(src);
  s.players[0].deck = deck.map(n => mkInstance(mkCard({ name: n })));
  return { s, src };
}

const noms = (s: GameState) => s.players[0].deck.map(c => c.card.name).join(",");

describe("Divination au tap — le choix du joueur est respecté", () => {
  it("garde sur le dessus la carte choisie, les autres passent dessous", () => {
    const { s, src } = etat(["A", "B", "C", "D", "E"]);

    const st = applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
      divinationChoiceIndex: 2, // on garde C
    });

    expect(noms(st)).toBe("C,D,E,A,B");
    expect(st.players[0].board[0].tapped).toBe(true);
  });

  it("chaque index donne un ordre DIFFÉRENT et prévisible", () => {
    // La preuve que le choix pilote vraiment le résultat : trois index, trois
    // dessus de deck distincts.
    const dessus = [0, 1, 2].map(i => {
      const { s, src } = etat(["A", "B", "C", "D"]);
      const st = applyAction(s, {
        type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
        divinationChoiceIndex: i,
      });
      return st.players[0].deck[0].card.name;
    });
    expect(dessus).toEqual(["A", "B", "C"]);
  });

  it("est DÉTERMINISTE : deux résolutions du même choix donnent le même deck", () => {
    const rejouer = () => {
      const { s, src } = etat(["A", "B", "C", "D", "E"]);
      return noms(applyAction(s, {
        type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
        divinationChoiceIndex: 1,
      }));
    };
    expect(rejouer()).toBe(rejouer());
  });

  it("index absent → garde la première carte (repli déterministe)", () => {
    // Un client sans modale ne doit pas produire un ordre différent du pair.
    // A reste sur le dessus ; B et C, non choisies, passent SOUS le reste du
    // deck — D remonte donc en deuxième position.
    const { s, src } = etat(["A", "B", "C", "D"]);
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0 });
    expect(noms(st)).toBe("A,D,B,C");
  });

  it("index hors bornes → écrêté, jamais de carte perdue", () => {
    const { s, src } = etat(["A", "B"]);
    const st = applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
      divinationChoiceIndex: 9,
    });
    expect(noms(st)).toBe("B,A");
    expect(st.players[0].deck.length).toBe(2);
  });

  it("deck vide → la créature s'engage quand même, sans planter", () => {
    const { s, src } = etat([]);
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0 });
    expect(st.players[0].board[0].tapped).toBe(true);
    expect(st.players[0].deck.length).toBe(0);
  });

  it("moins de 3 cartes : aucune n'est perdue", () => {
    const { s, src } = etat(["A", "B"]);
    const st = applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
      divinationChoiceIndex: 1,
    });
    expect(noms(st)).toBe("B,A");
  });
});

// ─── Règlement des morts après un pouvoir activé ────────────────────────────
// Signalé en partie : une « Baliste à Répétition » (Impact 3 au tap) abattait un
// Esprit 2/2 qui restait affiché sur le plateau à 0 PV. La branche COMPOSÉE de
// tapActivate réglait ses morts ; la branche CURÉE, non.
describe("pouvoir activé — les morts sont réglées", () => {
  function baliste() {
    const b = mkInstance(mkCard({
      name: "Baliste", attack: 0, health: 5,
      keywords: ["impact"] as never,
      keyword_instances: [{ id: "impact", x: 3, mode: "tap" } as never],
    }));
    b.hasSummoningSickness = false;
    return b;
  }

  it("la cible abattue par un pouvoir CURÉ part au cimetière", () => {
    const s = mkState();
    const src = baliste();
    s.players[0].board.push(src);
    const victime = mkInstance(mkCard({ name: "Esprit", attack: 2, health: 2 }));
    s.players[1].board.push(victime);

    const st = applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
      targetInstanceId: victime.instanceId,
    });

    expect(st.players[1].board.some(c => c.card.name === "Esprit")).toBe(false);
    expect(st.players[1].graveyard.some(c => c.card.name === "Esprit")).toBe(true);
  });

  it("une cible qui SURVIT reste en jeu, avec ses dégâts", () => {
    // Contre-épreuve : le balayage ne doit pas emporter les blessés.
    const s = mkState();
    const src = baliste();
    s.players[0].board.push(src);
    const costaud = mkInstance(mkCard({ name: "Costaud", attack: 2, health: 6 }));
    s.players[1].board.push(costaud);

    const st = applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
      targetInstanceId: costaud.instanceId,
    });

    expect(st.players[1].board.find(c => c.card.name === "Costaud")!.currentHealth).toBe(3);
  });

  it("le râle d'agonie de la victime se déclenche", () => {
    const s = mkState();
    const src = baliste();
    s.players[0].board.push(src);
    const victime = mkInstance(mkCard({
      name: "Vengeur", attack: 2, health: 2,
      keywords: ["carnage"] as never,
      keyword_instances: [{ id: "carnage", x: 2 } as never],
    }));
    victime.carnageX = 2; // mkInstance ne passe pas par createCardInstance
    const temoin = mkInstance(mkCard({ name: "Témoin", attack: 1, health: 5 }));
    s.players[1].board.push(victime, temoin);

    const st = applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
      targetInstanceId: victime.instanceId,
    });

    expect(st.players[1].board.some(c => c.card.name === "Vengeur")).toBe(false);
    expect(st.players[1].board.find(c => c.card.name === "Témoin")!.currentHealth).toBe(3);
  });
});
