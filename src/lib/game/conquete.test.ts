// Conquête : compteur par joueur alimenté par la capacité (créature, sort,
// effet composé), plafonné au palier MAX_CONQUETE. Au palier seulement, le
// joueur découvre 1 carte parmi 3 du deck ADVERSE et la prend en main pour le
// reste de la partie ; le compteur repart à 0.
import { describe, expect, it } from "vitest";
import { applyAction, getConqueteOffer, spendConquete } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_CONQUETE } from "./constants";
import type { Capability, CardInstance, GameState } from "./types";

function creatureConquete(x: number, mode?: string): CardInstance {
  return mkInstance(mkCard({
    name: "Jarl du Nord", mana_cost: 2, attack: 2, health: 2,
    keywords: ["conquete"], keyword_instances: [{ id: "conquete", x, ...(mode ? { mode } : {}) }] as never,
    effect_text: `[Conquête ${x}]`,
  }));
}

function spellConquete(x: number): CardInstance {
  return mkInstance(mkCard({
    name: "Raid nordique", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "conquete", amount: x }] as never,
  }));
}

function play(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}

const compteur = (s: GameState) => s.players[0].conquete;

describe("Conquête — alimentation du compteur", () => {
  it("est MASQUÉE (null) tant que la capacité ne s'est jamais déclenchée", () => {
    expect(compteur(mkState())).toBeNull();
  });

  it("apparaît au premier déclenchement d'une créature", () => {
    expect(compteur(play(mkState(), creatureConquete(1)))).toBe(1);
  });

  it("est alimentée par un SORT tout autant que par une créature", () => {
    expect(compteur(play(mkState(), spellConquete(2)))).toBe(2);
  });

  it("cumule les déclenchements successifs", () => {
    let s = play(mkState(), creatureConquete(1));
    s = play(s, spellConquete(1));
    expect(compteur(s)).toBe(2);
  });

  it("est écrêtée au palier MAX_CONQUETE (3), sans jamais le dépasser", () => {
    let s = mkState();
    for (let i = 0; i < 4; i++) s = play(s, creatureConquete(2));
    expect(compteur(s)).toBe(MAX_CONQUETE);
    expect(MAX_CONQUETE).toBe(3);
  });

  it("n'alimente QUE le joueur qui déclenche", () => {
    expect(play(mkState(), creatureConquete(2)).players[1].conquete).toBeNull();
  });

  it("est indépendante de l'Épargne et de la Foi", () => {
    const s = play(mkState(), creatureConquete(2));
    expect(s.players[0].epargne).toBeNull();
    expect(s.players[0].foi).toBeNull();
  });

  it("se déclenche en FIN DE TOUR comme les autres modes curés", () => {
    const s = mkState();
    s.players[0].board = [creatureConquete(2, "end_of_turn")];
    const next = applyAction(s, { type: "end_turn" });
    expect(next.players[0].conquete).toBe(2);
  });

  it("est alimentée par la forme COMPOSÉE", () => {
    const porteur = mkInstance(mkCard({
      name: "Serment du Nord", card_type: "spell", attack: null, health: null, mana_cost: 1,
      capabilities: [{
        uid: "cx_0", abilityId: "_composed", effectKind: "immediate",
        trigger: "spell_resolution",
        composed: { content: "conquete", magnitude: { x: 3 } },
      }] as unknown as Capability[],
    }));
    expect(compteur(play(mkState(), porteur))).toBe(3);
  });
});

// ── Découverte ─────────────────────────────────────────────────────────────

const carte = (id: number, cost: number, name: string): CardInstance =>
  mkInstance(mkCard({ id, name, mana_cost: cost, attack: 1, health: 1, faction: "Elfes" }));

/** État avec un compteur donné et un deck ADVERSE de 6 cartes. */
function stateAvecConquete(niveau: number | null): GameState {
  const s = mkState();
  s.players[0].conquete = niveau;
  s.players[1].deck = [
    carte(101, 1, "Éclaireur"), carte(102, 3, "Archer"), carte(103, 3, "Druide"),
    carte(104, 5, "Ent"), carte(105, 7, "Dragon"), carte(106, 9, "Titan"),
  ];
  return s;
}

describe("Conquête — construction de l'offre", () => {
  it("révèle 3 cartes du deck ADVERSE, sans condition de coût", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    const offre = getConqueteOffer(s);
    expect(offre).toHaveLength(3);
    const deckAdverse = new Set(s.players[1].deck.map((c) => c.instanceId));
    expect(offre.every((c) => deckAdverse.has(c.instanceId))).toBe(true);
  });

  it("propose moins de 3 cartes si le deck adverse en a moins", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    s.players[1].deck = [carte(201, 2, "Seule")];
    expect(getConqueteOffer(s).map((c) => c.card.name)).toEqual(["Seule"]);
  });

  it("renvoie une offre VIDE sur un deck adverse vide", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    s.players[1].deck = [];
    expect(getConqueteOffer(s)).toEqual([]);
  });

  it("renvoie une offre VIDE sous le palier, même à 2", () => {
    expect(getConqueteOffer(stateAvecConquete(2))).toEqual([]);
    expect(getConqueteOffer(stateAvecConquete(0))).toEqual([]);
    expect(getConqueteOffer(stateAvecConquete(null))).toEqual([]);
  });

  it("ne consomme pas le flux RNG partagé et est stable sur un même état", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    const avant = s.rngState;
    const a = getConqueteOffer(s);
    const b = getConqueteOffer(s);
    expect(s.rngState).toBe(avant);
    expect(a.map((c) => c.instanceId)).toEqual(b.map((c) => c.instanceId));
  });
});

describe("Conquête — découverte", () => {
  it("met la carte choisie dans MA main, la retire du deck ADVERSE, et remet le compteur à 0", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    const choisie = getConqueteOffer(s)[1];
    const next = applyAction(s, { type: "spend_conquete", cardInstanceId: choisie.instanceId });

    expect(next.players[0].hand.map((c) => c.instanceId)).toContain(choisie.instanceId);
    expect(next.players[1].deck.map((c) => c.instanceId)).not.toContain(choisie.instanceId);
    expect(next.players[1].deck).toHaveLength(5);
    expect(next.players[1].hand).toHaveLength(0);
    expect(next.players[0].conquete).toBe(0);
  });

  it("marque la carte comme conquise à l'adversaire, sans lui laisser de propriétaire d'origine", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    const choisie = getConqueteOffer(s)[0];
    const next = applyAction(s, { type: "spend_conquete", cardInstanceId: choisie.instanceId });
    const enMain = next.players[0].hand.find((c) => c.instanceId === choisie.instanceId)!;
    expect(enMain.conqueredFromId).toBe(s.players[1].id);
    expect(enMain.trueOwnerId).toBeNull();
    expect(enMain.originalOwnerId).toBeNull();
  });

  it("laisse les 2 autres cartes à leur place : l'ordre du deck adverse est intact", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    const choisie = getConqueteOffer(s)[0];
    const attendu = s.players[1].deck.filter((c) => c.instanceId !== choisie.instanceId).map((c) => c.instanceId);
    const next = applyAction(s, { type: "spend_conquete", cardInstanceId: choisie.instanceId });
    expect(next.players[1].deck.map((c) => c.instanceId)).toEqual(attendu);
  });

  it("la carte conquise est JOUABLE par le conquérant, quelle que soit sa faction", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    s.players[0].mana = 10;
    const choisie = getConqueteOffer(s).find((c) => c.card.mana_cost <= 5)!;
    let next = applyAction(s, { type: "spend_conquete", cardInstanceId: choisie.instanceId });
    next = applyAction(next, { type: "play_card", cardInstanceId: choisie.instanceId });
    const posee = next.players[0].board.find((c) => c.instanceId === choisie.instanceId);
    expect(posee).toBeDefined();
    expect(posee!.conqueredFromId).toBe(s.players[1].id);
  });

  it("le cycle peut se répéter : re-alimenter jusqu'au palier rouvre une découverte", () => {
    let s = stateAvecConquete(MAX_CONQUETE);
    s = applyAction(s, { type: "spend_conquete", cardInstanceId: getConqueteOffer(s)[0].instanceId });
    expect(getConqueteOffer(s)).toEqual([]);
    for (let i = 0; i < 3; i++) s = play(s, spellConquete(1));
    expect(s.players[0].conquete).toBe(MAX_CONQUETE);
    expect(getConqueteOffer(s).length).toBeGreaterThan(0);
  });
});

describe("Conquête — gardes anti-triche (le moteur rejoue chez l'adversaire)", () => {
  const rejete = (s: GameState, instanceId: string) => {
    const next = spendConquete(s, { type: "spend_conquete", cardInstanceId: instanceId });
    expect(next).toBe(s);
    expect(next.players[0].conquete).toBe(s.players[0].conquete);
  };

  it("refuse une carte du deck adverse NON révélée (hors de l'offre)", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    const offerts = new Set(getConqueteOffer(s).map((c) => c.instanceId));
    const cachee = s.players[1].deck.find((c) => !offerts.has(c.instanceId));
    expect(cachee).toBeDefined(); // 6 cartes pour 3 révélées
    rejete(s, cachee!.instanceId);
  });

  it("refuse une instance inconnue", () => {
    rejete(stateAvecConquete(MAX_CONQUETE), "nope");
  });

  it("refuse une carte de MON deck (l'offre vient du deck adverse)", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    const mienne = carte(300, 1, "À moi");
    s.players[0].deck.push(mienne);
    rejete(s, mienne.instanceId);
  });

  it("refuse sous le palier, même avec une instance réelle du deck adverse", () => {
    for (const niveau of [null, 0, 1, 2]) {
      const s = stateAvecConquete(niveau);
      rejete(s, s.players[1].deck[0].instanceId);
    }
  });

  it("refuse main pleine SANS consommer la Conquête", () => {
    const s = stateAvecConquete(MAX_CONQUETE);
    const cible = getConqueteOffer(s)[0].instanceId;
    for (let i = 0; i < 8; i++) s.players[0].hand.push(mkInstance(mkCard({ name: `Carte${i}` })));
    rejete(s, cible);
  });
});
