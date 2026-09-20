// Exploration : compteur par joueur alimenté par la capacité (créature, sort,
// effet composé). Contrairement à la Conquête, le palier n'attend PAS le joueur :
// dès que le compteur atteint EXPLORATION_PALIER, le contrôleur PIOCHE (vraie
// pioche) et le palier est retranché — le RESTE est conservé, si bien qu'un gros
// gain peut faire piocher plusieurs cartes.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { EXPLORATION_PALIER } from "./constants";
import type { Capability, CardInstance, GameState } from "./types";

function creatureExploration(x: number, mode?: string): CardInstance {
  return mkInstance(mkCard({
    name: "Éclaireuse des confins", mana_cost: 2, attack: 2, health: 2,
    keywords: ["exploration"], keyword_instances: [{ id: "exploration", x, ...(mode ? { mode } : {}) }] as never,
    effect_text: `[Exploration ${x}]`,
  }));
}

function spellExploration(x: number): CardInstance {
  return mkInstance(mkCard({
    name: "Carte des confins", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "exploration", amount: x }] as never,
  }));
}

const carte = (id: number, name: string): CardInstance =>
  mkInstance(mkCard({ id, name, mana_cost: 1, attack: 1, health: 1 }));

/** État dont le deck du joueur 0 contient `n` cartes nommées Deck1..DeckN. */
function stateAvecDeck(n: number, niveau: number | null = null): GameState {
  const s = mkState();
  s.players[0].exploration = niveau;
  s.players[0].deck = Array.from({ length: n }, (_, i) => carte(500 + i, `Deck${i + 1}`));
  return s;
}

function play(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}

const compteur = (s: GameState) => s.players[0].exploration;
const main = (s: GameState) => s.players[0].hand.map((c) => c.card.name);

describe("Exploration — alimentation du compteur", () => {
  it("est MASQUÉE (null) tant que la capacité ne s'est jamais déclenchée", () => {
    expect(compteur(mkState())).toBeNull();
  });

  it("le palier vaut 3", () => {
    expect(EXPLORATION_PALIER).toBe(3);
  });

  it("monte sans piocher tant que le palier n'est pas atteint", () => {
    const s = play(stateAvecDeck(5), creatureExploration(2));
    expect(compteur(s)).toBe(2);
    expect(main(s)).toEqual([]);
    expect(s.players[0].deck).toHaveLength(5);
  });

  it("est alimentée par un SORT tout autant que par une créature", () => {
    expect(compteur(play(stateAvecDeck(5), spellExploration(2)))).toBe(2);
  });

  it("est alimentée par la forme COMPOSÉE", () => {
    const porteur = mkInstance(mkCard({
      name: "Récit de voyage", card_type: "spell", attack: null, health: null, mana_cost: 1,
      capabilities: [{
        uid: "cx_0", abilityId: "_composed", effectKind: "immediate",
        trigger: "spell_resolution",
        composed: { content: "exploration", magnitude: { x: 2 } },
      }] as unknown as Capability[],
    }));
    expect(compteur(play(stateAvecDeck(5), porteur))).toBe(2);
  });

  it("n'alimente QUE le joueur qui déclenche", () => {
    expect(play(stateAvecDeck(5), creatureExploration(2)).players[1].exploration).toBeNull();
  });

  it("est indépendante des trois autres compteurs", () => {
    const s = play(stateAvecDeck(5), creatureExploration(2));
    expect(s.players[0].epargne).toBeNull();
    expect(s.players[0].foi).toBeNull();
    expect(s.players[0].conquete).toBeNull();
  });
});

describe("Exploration — palier", () => {
  it("au palier : pioche la carte du DESSUS et le compteur repart à 0", () => {
    const s = play(stateAvecDeck(5, 2), creatureExploration(1));
    expect(compteur(s)).toBe(0);
    expect(main(s)).toEqual(["Deck1"]);
    expect(s.players[0].deck).toHaveLength(4);
  });

  it("CONSERVE le reste : 2 + 2 ⇒ une pioche, compteur à 1", () => {
    const s = play(stateAvecDeck(5, 2), spellExploration(2));
    expect(compteur(s)).toBe(1);
    expect(main(s)).toEqual(["Deck1"]);
  });

  it("un gros gain franchit PLUSIEURS paliers : 0 + 7 ⇒ deux pioches, compteur à 1", () => {
    const s = play(stateAvecDeck(5), spellExploration(7));
    expect(compteur(s)).toBe(1);
    expect(main(s)).toEqual(["Deck1", "Deck2"]);
  });

  it("ne fait piocher QUE le contrôleur", () => {
    const s0 = stateAvecDeck(5, 2);
    s0.players[1].deck = [carte(900, "Adverse")];
    const s = play(s0, creatureExploration(1));
    expect(s.players[1].hand).toEqual([]);
    expect(s.players[1].deck).toHaveLength(1);
  });

  it("est une VRAIE pioche : deck vide ⇒ fatigue, le palier est quand même consommé", () => {
    const s0 = stateAvecDeck(0, 2);
    const pvAvant = s0.players[0].hero.hp;
    const s = play(s0, creatureExploration(1));
    expect(compteur(s)).toBe(0);
    expect(s.players[0].fatigueDamage).toBe(1);
    expect(s.players[0].hero.hp).toBe(pvAvant - 1);
  });

  it("est une VRAIE pioche : l'effet « à la pioche » de la carte piochée se déclenche", () => {
    const s0 = stateAvecDeck(0, 2);
    const piegee = mkInstance(mkCard({
      id: 777, name: "Trouvaille", mana_cost: 1, attack: 1, health: 1,
      keywords: ["epargne"], keyword_instances: [{ id: "epargne", x: 2, mode: "draw" }] as never,
    }));
    s0.players[0].deck = [piegee];
    const s = play(s0, creatureExploration(1));
    expect(main(s)).toEqual(["Trouvaille"]);
    expect(s.players[0].epargne).toBe(2);
  });
});

describe("Exploration — déclencheurs", () => {
  it("à l'ATTAQUE : +X à chaque attaque, pioche à la troisième", () => {
    let s = stateAvecDeck(5);
    const eclaireuse = creatureExploration(1, "attack");
    eclaireuse.hasSummoningSickness = false;
    s.players[0].board = [eclaireuse];
    for (let n = 1; n <= 3; n++) {
      const inst = s.players[0].board[0];
      // Nouvelle attaque disponible : l'équivalent d'un tour qui recommence.
      inst.hasAttacked = false;
      inst.attacksRemaining = 1;
      inst.tapped = false;
      s = applyAction(s, { type: "attack", attackerInstanceId: inst.instanceId, targetInstanceId: "enemy_hero" });
      expect(compteur(s)).toBe(n % 3);
    }
    expect(main(s)).toEqual(["Deck1"]);
  });

  it("n'alimente PAS le compteur à l'entrée en jeu quand le déclencheur est l'attaque", () => {
    const s = play(stateAvecDeck(5), creatureExploration(1, "attack"));
    expect(compteur(s)).toBeNull();
  });

  it("en FIN DE TOUR comme les autres modes curés", () => {
    const s = stateAvecDeck(5, 1);
    s.players[0].board = [creatureExploration(2, "end_of_turn")];
    const next = applyAction(s, { type: "end_turn" });
    expect(next.players[0].exploration).toBe(0);
    expect(next.players[0].hand.map((c) => c.card.name)).toEqual(["Deck1"]);
  });

  it("une exploratrice VOLÉE profite à son contrôleur actuel", () => {
    const s = stateAvecDeck(5);
    s.players[1].deck = [carte(901, "Adverse1")];
    s.currentPlayerIndex = 1;
    const volee = creatureExploration(3, "attack");
    volee.hasSummoningSickness = false;
    volee.trueOwnerId = "P1";
    s.players[1].board = [volee];
    const next = applyAction(s, { type: "attack", attackerInstanceId: volee.instanceId, targetInstanceId: "enemy_hero" });
    expect(next.players[1].exploration).toBe(0);
    expect(next.players[1].hand.map((c) => c.card.name)).toEqual(["Adverse1"]);
    expect(next.players[0].exploration).toBeNull();
  });
});

describe("Exploration — indice d'animation", () => {
  it("publie le gain et le nombre de pioches, même quand le compteur BAISSE", () => {
    // 2 + 2 ⇒ compteur à 1 : un diff d'état verrait −1 et n'animerait rien.
    const s = play(stateAvecDeck(5, 2), spellExploration(2));
    expect(s.explorationEvents).toEqual([{ ownerId: "P1", amount: 2, draws: 1 }]);
  });
});
