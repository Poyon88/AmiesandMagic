// Invention : compteur par joueur alimenté par la capacité (créature, sort,
// effet composé), dépensé en révélant 3 MACHINES communes de coût ≤ compteur,
// quelle que soit leur faction. Le compteur est vidé à la dépense.
import { describe, expect, it } from "vitest";
import { applyAction, getInventionOffer, spendInvention } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_INVENTION } from "./constants";
import type { Capability, Card, CardInstance, GameState } from "./types";

function creatureInvention(x: number, trigger?: string): CardInstance {
  return mkInstance(mkCard({
    name: "Inventeur gnome", mana_cost: 2, attack: 1, health: 2,
    keywords: ["invention"], keyword_instances: [{ id: "invention", x, ...(trigger ? { trigger } : {}) }] as never,
    effect_text: `[Invention ${x}]`,
  }));
}

function spellInvention(x: number): CardInstance {
  return mkInstance(mkCard({
    name: "Plan d'atelier", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "invention", amount: x }] as never,
  }));
}

function play(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}

const compteur = (s: GameState) => s.players[0].invention ?? null;

const machine = (id: number, cost: number, extra: Partial<Card> = {}): Card => mkCard({
  id, name: `Machine ${id}`, mana_cost: cost, attack: 2, health: 2,
  race: "Machines", rarity: "Commune", faction: "Nains", card_alignment: "bon", ...extra,
} as Partial<Card>);

/** Compteur chargé, pool mêlant Machines et intrus (autre race, rareté). */
function stateAvecInvention(niveau: number | null): GameState {
  const s = mkState();
  s.players[0].invention = niveau;
  s.factionCardPool = [
    machine(101, 1), machine(102, 2), machine(103, 3), machine(104, 3), machine(105, 6),
    // Hors vivier : mauvaise race, mauvaise rareté.
    mkCard({ id: 201, name: "Golem", mana_cost: 2, race: "Golems", rarity: "Commune", faction: "Nains" } as Partial<Card>),
    machine(202, 2, { rarity: "Rare" }),
    // Machine d'une faction maléfique : la race suffit, l'alignement n'est pas filtré.
    machine(203, 1, { faction: "Morts-Vivants", card_alignment: "maléfique" }),
  ];
  return s;
}

describe("Invention — alimentation du compteur", () => {
  it("est MASQUÉE tant que la capacité ne s'est jamais déclenchée", () => {
    expect(compteur(mkState())).toBeNull();
  });

  it("apparaît à l'entrée en jeu d'une créature", () => {
    expect(compteur(play(mkState(), creatureInvention(3)))).toBe(3);
  });

  it("est alimentée par un SORT", () => {
    expect(compteur(play(mkState(), spellInvention(2)))).toBe(2);
  });

  it("cumule puis s'écrête au plafond", () => {
    let s = mkState();
    for (let i = 0; i < 5; i++) s = play(s, creatureInvention(3));
    expect(compteur(s)).toBe(MAX_INVENTION);
  });

  it("n'alimente QUE le joueur qui déclenche, et pas l'Épargne", () => {
    const next = play(mkState(), creatureInvention(3));
    expect(next.players[1].invention ?? null).toBeNull();
    expect(next.players[0].epargne).toBeNull();
  });

  it("est alimentée par la forme COMPOSÉE", () => {
    const porteur = mkInstance(mkCard({
      name: "Brevet", card_type: "spell", attack: null, health: null, mana_cost: 1,
      capabilities: [{
        uid: "cx_0", abilityId: "_composed", effectKind: "immediate",
        trigger: "spell_resolution",
        composed: { content: "invention", magnitude: { x: 4 } },
      }] as unknown as Capability[],
    }));
    expect(compteur(play(mkState(), porteur))).toBe(4);
  });
});

describe("Invention — offre", () => {
  it("ne propose que des Machines communes de coût ≤ compteur, toutes factions", () => {
    const offre = getInventionOffer(stateAvecInvention(3));
    expect(offre).toHaveLength(3);
    for (const c of offre) {
      expect(c.race).toBe("Machines");
      expect(c.rarity).toBe("Commune");
      expect(c.mana_cost).toBeLessThanOrEqual(3);
    }
  });

  it("couvre exactement le vivier attendu sur plusieurs états", () => {
    const vus = new Set<number>();
    for (let main = 0; main < 30; main++) {
      const s = stateAvecInvention(3);
      for (let i = 0; i < main % 7; i++) s.players[0].hand.push(mkInstance(mkCard({})));
      s.turnNumber = main;
      for (const c of getInventionOffer(s)) vus.add(c.id);
    }
    expect([...vus].sort((a, b) => a - b)).toEqual([101, 102, 103, 104, 203]);
  });

  it("est vide à 0, à null, ou sans Machine abordable", () => {
    expect(getInventionOffer(stateAvecInvention(0))).toEqual([]);
    expect(getInventionOffer(stateAvecInvention(null))).toEqual([]);
    const s = stateAvecInvention(3);
    s.factionCardPool = [machine(301, 5)];
    expect(getInventionOffer(s)).toEqual([]);
  });

  it("est déterministe et ne consomme pas la RNG partagée", () => {
    const s = stateAvecInvention(6);
    const avant = s.rngState;
    const a = getInventionOffer(s).map((c) => c.id);
    const b = getInventionOffer(s).map((c) => c.id);
    expect(a).toEqual(b);
    expect(s.rngState).toBe(avant);
  });

  it("ne compte pas deux fois une carte présente en double dans le pool", () => {
    const s = stateAvecInvention(1);
    s.factionCardPool = [machine(401, 1), machine(401, 1)];
    expect(getInventionOffer(s).map((c) => c.id)).toEqual([401]);
  });
});

describe("Invention — dépense", () => {
  it("met la Machine choisie en main et VIDE le compteur (visible à 0)", () => {
    const s = stateAvecInvention(3);
    const choisie = getInventionOffer(s)[0];
    const next = applyAction(s, { type: "spend_invention", selectionCardId: choisie.id });
    expect(next.players[0].hand.map((c) => c.card.id)).toContain(choisie.id);
    expect(next.players[0].invention).toBe(0);
  });

  describe("gardes (le moteur rejoue chez l'adversaire)", () => {
    const rejete = (s: GameState, cardId: number) => {
      const next = spendInvention(s, { type: "spend_invention", selectionCardId: cardId });
      expect(next).toBe(s);
    };

    it("refuse une carte hors de l'offre", () => {
      const s = stateAvecInvention(3);
      const offre = new Set(getInventionOffer(s).map((c) => c.id));
      const horsOffre = [101, 102, 103, 104, 203].find((id) => !offre.has(id))!;
      rejete(s, horsOffre);
    });

    it("refuse une Machine trop chère, une autre race ou une non Commune", () => {
      const s = stateAvecInvention(3);
      rejete(s, 105);
      rejete(s, 201);
      rejete(s, 202);
    });

    it("refuse à zéro ou jamais déclenchée", () => {
      rejete(stateAvecInvention(0), 101);
      rejete(stateAvecInvention(null), 101);
    });

    it("refuse main pleine SANS consommer le compteur", () => {
      const s = stateAvecInvention(3);
      const id = getInventionOffer(s)[0].id;
      for (let i = 0; i < 8; i++) s.players[0].hand.push(mkInstance(mkCard({ name: `Carte${i}` })));
      rejete(s, id);
    });
  });
});
