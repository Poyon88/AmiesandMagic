// Singulier : condition de déclenchement qui récompense les decks sans doublon.
// L'état `singleton` est figé à l'initialisation ; les capacités marquées
// `singulier` sont RETIRÉES de la vue des cartes d'un joueur non singleton et
// remises si la carte passe à un joueur singleton (cf. lib/game/singulier.ts).
import { describe, expect, it } from "vitest";
import { applyAction, getConqueteOffer, initializeGame } from "./engine";
import {
  cardHasSingulier, displayCardOf, isSingletonDeck, restoreSingulier, stripSingulier, syncSingulier,
} from "./singulier";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_CONQUETE } from "./constants";
import type { Capability, Card, CardInstance, GameState } from "./types";

const filler = (n: number): CardInstance[] =>
  Array.from({ length: n }, (_, i) => mkInstance(mkCard({ name: `Remplissage ${i}` })));

/** Créature « Conquête 1 (Singulier) » + « Foi 2 » ordinaire, mode au choix. */
function porteur(mode?: string): CardInstance {
  return mkInstance(mkCard({
    name: "Jarl Singulier", mana_cost: 1, attack: 1, health: 1,
    keywords: ["conquete", "foi"],
    keyword_instances: [
      { id: "conquete", x: 1, singulier: true, ...(mode ? { mode } : {}) },
      { id: "foi", x: 2, ...(mode ? { mode } : {}) },
    ] as never,
  }));
}

/** État où `singleton` est posé, puis aligné comme le moteur le fait après
 *  chaque action (les cartes poussées à la main par le test ne l'ont jamais été). */
function etat(singleton: boolean): GameState {
  const s = mkState();
  s.players[0].singleton = singleton;
  s.players[0].deck = filler(5);
  s.players[1].deck = filler(5);
  return s;
}

function jouer(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  syncSingulier(s);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}

describe("Singulier — deck singleton", () => {
  const unique = (n: number) => Array.from({ length: n }, (_, i) => ({ card: mkCard({ id: 1000 + i }), quantity: 1 }));

  it("50 cartes uniques ⇒ singleton", () => {
    expect(isSingletonDeck(unique(50))).toBe(true);
  });

  it("une carte en 2 exemplaires ⇒ pas singleton", () => {
    const d = unique(49); d[3].quantity = 2;
    expect(isSingletonDeck(d)).toBe(false);
  });

  it("le même id sur deux lignes ⇒ pas singleton", () => {
    const d = unique(49); d.push({ card: mkCard({ id: 1000 }), quantity: 1 });
    expect(isSingletonDeck(d)).toBe(false);
  });

  it("initializeGame fige l'état par joueur et aligne main + deck", () => {
    const singulierCard = mkCard({
      id: 7, name: "Éclaireur", keywords: ["inspiration"],
      keyword_instances: [{ id: "inspiration", x: 1, singulier: true }] as never,
    });
    const d1 = unique(49); d1.push({ card: singulierCard, quantity: 1 });
    const d2 = unique(48); d2.push({ card: singulierCard, quantity: 1 }); d2[0].quantity = 2;
    const g = initializeGame("A", "B", d1, d2, 0, 42);
    expect(g.players[0].singleton).toBe(true);
    expect(g.players[1].singleton).toBe(false);
    const chez = (i: number) => [...g.players[i].hand, ...g.players[i].deck].find((c) => c.card.id === 7)!;
    expect(chez(0).card.keywords).toContain("inspiration");
    expect(chez(0).singulierStash).toBeUndefined();
    expect(chez(1).card.keywords).not.toContain("inspiration");
    expect(chez(1).singulierStash?.keyword_instances).toHaveLength(1);
  });
});

describe("Singulier — retrait / restauration", () => {
  const carte = (): Card => mkCard({
    keywords: ["raid", "inspiration", "taunt"],
    keyword_instances: [{ id: "inspiration", x: 1, singulier: true }] as never,
  });

  it("retire l'élément et le remet au même rang", () => {
    const split = stripSingulier(carte())!;
    expect(split.card.keywords).toEqual(["raid", "taunt"]);
    expect(split.card.keyword_instances).toEqual([]);
    const back = restoreSingulier(split.card, split.stash);
    expect(back.keywords).toEqual(["raid", "inspiration", "taunt"]);
    expect(back.keyword_instances).toHaveLength(1);
  });

  it("garde l'id dans keywords[] si une instance ORDINAIRE du même mot-clé reste", () => {
    const c = mkCard({
      keywords: ["inspiration"],
      keyword_instances: [{ id: "inspiration", x: 1, mode: "death", singulier: true }, { id: "inspiration", x: 1 }] as never,
    });
    const split = stripSingulier(c)!;
    expect(split.card.keywords).toEqual(["inspiration"]);
    expect(split.card.keyword_instances).toHaveLength(1);
  });

  it("rien à retirer ⇒ null (idempotence)", () => {
    expect(stripSingulier(mkCard({ keywords: ["raid"] }))).toBeNull();
    const split = stripSingulier(carte())!;
    expect(stripSingulier(split.card)).toBeNull();
  });

  it("la vue d'AFFICHAGE montre toujours la capacité, active ou non", () => {
    const inst = mkInstance(carte());
    const s = etat(false); s.players[0].hand.push(inst); syncSingulier(s);
    expect(inst.card.keywords).not.toContain("inspiration");
    expect(displayCardOf(inst).keywords).toContain("inspiration");
    expect(cardHasSingulier(displayCardOf(inst))).toBe(true);
  });
});

describe("Singulier — résolution", () => {
  it("joueur singleton : l'effet Singulier se résout (Entrée)", () => {
    const next = jouer(etat(true), porteur());
    expect(next.players[0].conquete).toBe(1);
    expect(next.players[0].foi).toBe(2);
  });

  it("joueur NON singleton : l'effet Singulier est inerte, les autres capacités intactes", () => {
    const next = jouer(etat(false), porteur());
    expect(next.players[0].conquete).toBeNull();
    expect(next.players[0].foi).toBe(2);
  });

  it("Fin de tour : même règle", () => {
    for (const singleton of [true, false]) {
      const s = etat(singleton);
      s.players[0].board = [porteur("end_of_turn")];
      syncSingulier(s);
      const next = applyAction(s, { type: "end_turn" });
      expect(next.players[0].conquete).toBe(singleton ? 1 : null);
      expect(next.players[0].foi).toBe(2);
    }
  });

  it("Mort : une carte « X (Singulier · Mort) » d'un joueur non singleton qui meurt ne résout rien", () => {
    for (const singleton of [true, false]) {
      const s = etat(singleton);
      const att = porteur("death");
      const mur = mkInstance(mkCard({ name: "Mur", attack: 3, health: 3 }));
      s.players[0].board = [att];
      s.players[1].board = [mur];
      syncSingulier(s);
      const next = applyAction(s, { type: "attack", attackerInstanceId: att.instanceId, targetInstanceId: mur.instanceId });
      expect(next.players[0].board).toHaveLength(0); // l'attaquant 1/1 est mort
      expect(next.players[0].conquete).toBe(singleton ? 1 : null);
      expect(next.players[0].foi).toBe(2);
    }
  });

  it("SORT : effet de sort Singulier conditionné, l'autre effet passe", () => {
    const sort = () => mkInstance(mkCard({
      name: "Serment", card_type: "spell", attack: null, health: null, mana_cost: 1,
      spell_keywords: [{ id: "conquete", amount: 2, singulier: true }, { id: "foi", amount: 1 }] as never,
    }));
    const oui = jouer(etat(true), sort());
    expect(oui.players[0].conquete).toBe(2);
    expect(oui.players[0].foi).toBe(1);
    const non = jouer(etat(false), sort());
    expect(non.players[0].conquete).toBeNull();
    expect(non.players[0].foi).toBe(1);
  });

  it("COMPOSÉ : capacité composée Singulier conditionnée", () => {
    const sort = () => mkInstance(mkCard({
      name: "Litanie", card_type: "spell", attack: null, health: null, mana_cost: 1,
      capabilities: [
        { uid: "cx_0", abilityId: "_composed", effectKind: "immediate", trigger: "spell_resolution", composed: { content: "conquete", magnitude: { x: 3 } }, singulier: true },
        { uid: "cx_1", abilityId: "_composed", effectKind: "immediate", trigger: "spell_resolution", composed: { content: "foi", magnitude: { x: 4 } } },
      ] as unknown as Capability[],
    }));
    const oui = jouer(etat(true), sort());
    expect(oui.players[0].conquete).toBe(3);
    expect(oui.players[0].foi).toBe(4);
    const non = jouer(etat(false), sort());
    expect(non.players[0].conquete).toBeNull();
    expect(non.players[0].foi).toBe(4);
  });

  it("PERSISTANT : « Provocation (Singulier) » n'existe que chez un joueur singleton", () => {
    const prov = () => mkInstance(mkCard({
      name: "Garde", attack: 1, health: 3,
      keywords: ["taunt"], keyword_instances: [{ id: "taunt", singulier: true }] as never,
    }));
    const oui = jouer(etat(true), prov());
    expect(oui.players[0].board[0].card.keywords).toContain("taunt");
    const non = jouer(etat(false), prov());
    expect(non.players[0].board[0].card.keywords).not.toContain("taunt");
  });
});

describe("Singulier — provenance de la carte et copies", () => {
  /** p0 (courant) conquiert une carte Singulier dans le deck de p1. */
  function conquerir(p0Singleton: boolean, p1Singleton: boolean): { s: GameState; inst: CardInstance } {
    const s = etat(p0Singleton);
    s.players[1].singleton = p1Singleton;
    s.players[0].conquete = MAX_CONQUETE;
    const cible = porteur();
    s.players[1].deck = [cible];
    syncSingulier(s);
    const offre = getConqueteOffer(s);
    expect(offre.map((c) => c.instanceId)).toContain(cible.instanceId);
    const next = applyAction(s, { type: "spend_conquete", cardInstanceId: cible.instanceId });
    const inst = next.players[0].hand.find((c) => c.instanceId === cible.instanceId)!;
    return { s: next, inst };
  }

  it("carte conquise à un joueur non singleton, jouée par un singleton : effet déclenché", () => {
    const { s, inst } = conquerir(true, false);
    expect(inst.singulierStash).toBeUndefined();     // restaurée au changement de contrôle
    expect(inst.card.keywords).toContain("conquete");
    const next = applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
    expect(next.players[0].conquete).toBe(1);        // 0 après la dépense, +1 par l'effet
    expect(next.players[0].foi).toBe(2);
  });

  it("carte conquise à un singleton, jouée par un NON singleton : effet inerte", () => {
    const { s, inst } = conquerir(false, true);
    expect(inst.singulierStash?.keyword_instances).toHaveLength(1);
    expect(inst.card.keywords).not.toContain("conquete");
    const next = applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
    expect(next.players[0].conquete).toBe(0);
    expect(next.players[0].foi).toBe(2);
  });

  it("rien en cours de partie ne change l'état singleton", () => {
    const { s } = conquerir(false, true);
    expect(s.players[0].singleton).toBe(false);
    expect(s.players[1].singleton).toBe(true);
    const apres = jouer(s, porteur());
    expect(apres.players[0].singleton).toBe(false);
  });
});

describe("Singulier — révélation", () => {
  it("un joueur singleton est révélé dès qu'une capacité Singulier active est visible", () => {
    const s = etat(true);
    expect(s.players[0].singletonRevealed).toBeUndefined();
    const next = jouer(s, porteur());
    expect(next.players[0].singletonRevealed).toBe(true);
  });

  it("un joueur non singleton n'est jamais révélé, même carte en jeu", () => {
    const next = jouer(etat(false), porteur());
    expect(next.players[0].singletonRevealed).toBeUndefined();
  });

  it("une carte Singulier en MAIN ne révèle rien", () => {
    const s = etat(true);
    s.players[0].hand.push(porteur());
    syncSingulier(s);
    const next = applyAction(s, { type: "end_turn" });
    expect(next.players[0].singletonRevealed).toBeUndefined();
  });
});
