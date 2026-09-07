// Foi : compteur par joueur alimenté par la capacité (créature, sort, effet
// composé), dépensé en découvrant 1 carte parmi 3 de son DECK de coût ≤ Foi.
// Seul le coût de la carte choisie est défalqué — le reste est conservé.
import { describe, expect, it } from "vitest";
import { applyAction, getFoiOffer, spendFoi } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_FOI } from "./constants";
import type { Capability, CardInstance, GameState } from "./types";

function creatureFoi(x: number, mode?: string): CardInstance {
  return mkInstance(mkCard({
    name: "Dévote de l'Aube", mana_cost: 2, attack: 1, health: 2,
    keywords: ["foi"], keyword_instances: [{ id: "foi", x, ...(mode ? { mode } : {}) }] as never,
    effect_text: `[Foi ${x}]`,
  }));
}

function spellFoi(x: number): CardInstance {
  return mkInstance(mkCard({
    name: "Prière", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "foi", amount: x }] as never,
  }));
}

function play(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}

const compteur = (s: GameState) => s.players[0].foi;

describe("Foi — alimentation du compteur", () => {
  it("est MASQUÉE tant que la capacité ne s'est jamais déclenchée", () => {
    expect(compteur(mkState())).toBeNull();
  });

  it("apparaît au premier déclenchement d'une créature", () => {
    expect(compteur(play(mkState(), creatureFoi(3)))).toBe(3);
  });

  it("est alimentée par un SORT tout autant que par une créature", () => {
    expect(compteur(play(mkState(), spellFoi(2)))).toBe(2);
  });

  it("cumule les déclenchements successifs", () => {
    let s = play(mkState(), creatureFoi(3));
    s = play(s, spellFoi(2));
    expect(compteur(s)).toBe(5);
  });

  it("est écrêtée à MAX_FOI (10), sans jamais le dépasser", () => {
    let s = mkState();
    for (let i = 0; i < 5; i++) s = play(s, creatureFoi(3));
    expect(compteur(s)).toBe(MAX_FOI);
    expect(MAX_FOI).toBe(10);
  });

  it("n'alimente QUE le joueur qui déclenche", () => {
    expect(play(mkState(), creatureFoi(3)).players[1].foi).toBeNull();
  });

  it("est indépendante de l'Épargne", () => {
    const s = play(mkState(), creatureFoi(3));
    expect(s.players[0].epargne).toBeNull();
  });

  it("se déclenche en FIN DE TOUR comme les autres modes curés", () => {
    const s = mkState();
    s.players[0].board = [creatureFoi(2, "end_of_turn")];
    const next = applyAction(s, { type: "end_turn" });
    expect(next.players[0].foi).toBe(2);
  });

  it("est alimentée par la forme COMPOSÉE", () => {
    const porteur = mkInstance(mkCard({
      name: "Litanie", card_type: "spell", attack: null, health: null, mana_cost: 1,
      capabilities: [{
        uid: "cx_0", abilityId: "_composed", effectKind: "immediate",
        trigger: "spell_resolution",
        composed: { content: "foi", magnitude: { x: 4 } },
      }] as unknown as Capability[],
    }));
    expect(compteur(play(mkState(), porteur))).toBe(4);
  });
});

// ── Dépense ────────────────────────────────────────────────────────────────

const carte = (id: number, cost: number, name: string): CardInstance =>
  mkInstance(mkCard({ id, name, mana_cost: cost, attack: 1, health: 1 }));

/** État avec un compteur chargé et un deck aux coûts étagés. */
function stateAvecFoi(niveau: number | null): GameState {
  const s = mkState();
  s.players[0].foi = niveau;
  s.players[0].deck = [
    carte(101, 1, "Cierge"), carte(102, 3, "Psaume"), carte(103, 3, "Vitrail"),
    carte(104, 3, "Reliquaire"), carte(105, 5, "Cathédrale"), carte(106, 8, "Archange"),
  ];
  return s;
}

describe("Foi — construction de l'offre", () => {
  it("ne propose QUE des cartes de coût ≤ Foi", () => {
    const offre = getFoiOffer(stateAvecFoi(3));
    expect(offre.length).toBeGreaterThan(0);
    expect(offre.every((c) => c.card.mana_cost <= 3)).toBe(true);
  });

  it("plafonne l'offre à 3 cartes", () => {
    expect(getFoiOffer(stateAvecFoi(3))).toHaveLength(3);
  });

  it("propose moins de 3 cartes si le deck n'en a pas assez d'abordables", () => {
    expect(getFoiOffer(stateAvecFoi(1)).map((c) => c.card.name)).toEqual(["Cierge"]);
  });

  it("renvoie une offre VIDE si rien n'est abordable", () => {
    const s = stateAvecFoi(3);
    s.players[0].deck = [carte(201, 4, "Trop cher")];
    expect(getFoiOffer(s)).toEqual([]);
  });

  it("renvoie une offre VIDE à compteur nul, même face à des cartes gratuites", () => {
    const s = stateAvecFoi(0);
    s.players[0].deck = [carte(201, 0, "Offrande")];
    expect(getFoiOffer(s)).toEqual([]);
    expect(getFoiOffer(stateAvecFoi(null))).toEqual([]);
  });

  it("ne consomme pas le flux RNG partagé et est stable sur un même état", () => {
    const s = stateAvecFoi(3);
    const avant = s.rngState;
    const a = getFoiOffer(s);
    const b = getFoiOffer(s);
    expect(s.rngState).toBe(avant);
    expect(a.map((c) => c.instanceId)).toEqual(b.map((c) => c.instanceId));
  });
});

describe("Foi — dépense", () => {
  it("met la carte choisie en main, la retire du deck, et ne défalque QUE son coût", () => {
    const s = stateAvecFoi(5);
    const choisie = getFoiOffer(s).find((c) => c.card.mana_cost === 3)
      ?? getFoiOffer(s)[0];
    const next = applyAction(s, { type: "spend_foi", cardInstanceId: choisie.instanceId });

    expect(next.players[0].hand.map((c) => c.instanceId)).toContain(choisie.instanceId);
    expect(next.players[0].deck.map((c) => c.instanceId)).not.toContain(choisie.instanceId);
    expect(next.players[0].deck).toHaveLength(5);
    expect(next.players[0].foi).toBe(5 - choisie.card.mana_cost);
  });

  it("peut être dépensée PLUSIEURS fois tant qu'il reste de la Foi", () => {
    let s = stateAvecFoi(4);
    const premiere = getFoiOffer(s)[0];
    s = applyAction(s, { type: "spend_foi", cardInstanceId: premiere.instanceId });
    const reste = 4 - premiere.card.mana_cost;
    expect(s.players[0].foi).toBe(reste);
    if (reste >= 1) {
      const seconde = getFoiOffer(s)[0];
      expect(seconde.card.mana_cost).toBeLessThanOrEqual(reste);
      s = applyAction(s, { type: "spend_foi", cardInstanceId: seconde.instanceId });
      expect(s.players[0].foi).toBe(reste - seconde.card.mana_cost);
      expect(s.players[0].hand).toHaveLength(2);
    }
  });

  it("laisse le compteur VISIBLE à zéro, jamais masqué à nouveau", () => {
    const s = stateAvecFoi(1);
    const next = applyAction(s, { type: "spend_foi", cardInstanceId: getFoiOffer(s)[0].instanceId });
    expect(next.players[0].foi).toBe(0);
  });

  it("ne passe PAS par la pioche : l'ordre du reste du deck est intact", () => {
    const s = stateAvecFoi(3);
    const choisie = getFoiOffer(s)[0];
    const attendu = s.players[0].deck.filter((c) => c.instanceId !== choisie.instanceId).map((c) => c.instanceId);
    const next = applyAction(s, { type: "spend_foi", cardInstanceId: choisie.instanceId });
    expect(next.players[0].deck.map((c) => c.instanceId)).toEqual(attendu);
  });
});

describe("Foi — gardes anti-triche (le moteur rejoue chez l'adversaire)", () => {
  const rejete = (s: GameState, instanceId: string) => {
    const next = spendFoi(s, { type: "spend_foi", cardInstanceId: instanceId });
    expect(next).toBe(s);
    expect(next.players[0].foi).toBe(s.players[0].foi);
  };

  it("refuse une carte du deck trop chère (hors de l'offre)", () => {
    const s = stateAvecFoi(3);
    rejete(s, s.players[0].deck.find((c) => c.card.name === "Archange")!.instanceId);
  });

  it("refuse une carte abordable mais NON révélée (hors de l'offre)", () => {
    const s = stateAvecFoi(3);
    const offerts = new Set(getFoiOffer(s).map((c) => c.instanceId));
    const cachee = s.players[0].deck.find((c) => c.card.mana_cost <= 3 && !offerts.has(c.instanceId));
    expect(cachee).toBeDefined(); // 4 abordables pour 3 révélées
    rejete(s, cachee!.instanceId);
  });

  it("refuse une instance inconnue", () => {
    rejete(stateAvecFoi(3), "nope");
  });

  it("refuse une carte de la MAIN (elle n'est pas dans le deck)", () => {
    const s = stateAvecFoi(3);
    const enMain = carte(300, 1, "Déjà là");
    s.players[0].hand.push(enMain);
    rejete(s, enMain.instanceId);
  });

  it("refuse quand le compteur est à zéro ou jamais déclenché", () => {
    const s0 = stateAvecFoi(0);
    rejete(s0, s0.players[0].deck[0].instanceId);
    const sn = stateAvecFoi(null);
    rejete(sn, sn.players[0].deck[0].instanceId);
  });

  it("refuse main pleine SANS consommer la Foi", () => {
    const s = stateAvecFoi(3);
    const cible = getFoiOffer(s)[0].instanceId;
    for (let i = 0; i < 8; i++) s.players[0].hand.push(mkInstance(mkCard({ name: `Carte${i}` })));
    rejete(s, cible);
  });
});
