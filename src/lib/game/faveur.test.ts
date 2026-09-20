// FAVEUR X — une commune de coût X, tirée AU HASARD dans le vivier
// d'alignement (propre ou neutre), rejoint la main. C'est Sélection X privée de
// son choix : même vivier, même régime de coût, mais aucune fenêtre à ouvrir.
//
// Ce que ces tests protègent en priorité, parce que c'est ce qui casse en
// silence dans cette famille d'effets :
//  - le COÛT EXACT (une Faveur 3 ne doit jamais rendre une carte à 2) ;
//  - le drapeau « ? » qui doit tirer parmi les coûts RÉELLEMENT peuplés, et non
//    parmi 1..X à l'aveugle — sinon la Faveur fizzle sans rien dire ;
//  - la barrière d'ALIGNEMENT et de RARETÉ, les deux filtres qu'un pool mal
//    branché laisse tomber sans erreur ;
//  - le DÉTERMINISME du tirage, condition de la synchro des deux clients.
import { describe, expect, it } from "vitest";
import { applyAction, getFaveurCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameAction, GameState } from "./types";

/** Communes ELFES (alignement « bon »), le vivier propre de nos sources. */
const elfe = (name: string, mana: number, over: Partial<Card> = {}): Card =>
  mkCard({ name, faction: "Elfes", rarity: "Commune", mana_cost: mana, attack: 1, health: 1, ...over });
/** Commune HUMAINE — faction NEUTRE, donc atteignable depuis n'importe quel
 *  alignement tranché. C'est la moitié « ou d'alignement neutre » de la règle. */
const neutre = (name: string, mana: number, over: Partial<Card> = {}): Card =>
  mkCard({ name, faction: "Humains", rarity: "Commune", mana_cost: mana, attack: 1, health: 1, ...over });
/** Commune MORTE-VIVANTE — alignement « maléfique », donc HORS de portée d'une
 *  source bonne. La carte témoin de la barrière d'alignement. */
const malefique = (name: string, mana: number): Card =>
  mkCard({ name, faction: "Morts-Vivants", rarity: "Commune", mana_cost: mana, attack: 1, health: 1 });

/** Vivier de référence : des communes bonnes et neutres à plusieurs coûts. */
function table(pool: Card[] = [
  elfe("Éclaireur", 1), elfe("Archer", 3), elfe("Veilleur", 3),
  neutre("Milicien", 3), elfe("Champion", 5),
]): GameState {
  const s = mkState();
  s.rngState = 7;
  s.factionCardPool = pool;
  s.allSpellsPool = [];
  return s;
}

/** Créature elfe porteuse d'une Faveur, prête à être posée. */
function porteuse(x: number, opts: { randomX?: boolean } = {}) {
  return mkInstance(mkCard({
    name: "Doyenne", mana_cost: 0, attack: 1, health: 1, faction: "Elfes",
    keywords: ["faveur"] as never,
    keyword_instances: [{ id: "faveur", x, ...(opts.randomX ? { randomX: true } : {}) }] as never,
  }));
}

const poser = (s: GameState, inst: { instanceId: string }) =>
  applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId } as GameAction);

describe("Faveur X — créature à l'entrée en jeu", () => {
  it("une commune du vivier rejoint la main, au coût EXACT X", () => {
    const s = table();
    const c = porteuse(3);
    s.players[0].hand.push(c);

    const next = poser(s, c);

    expect(next.players[0].hand).toHaveLength(1);
    // Les trois cartes à 3 sont les seules éligibles — peu importe laquelle.
    expect(["Archer", "Veilleur", "Milicien"]).toContain(next.players[0].hand[0].card.name);
  });

  it("ne rend JAMAIS une carte d'un autre coût, même s'il est le seul peuplé", () => {
    // X = 4 : aucune carte à 4 dans le vivier. L'effet doit fizzler, et surtout
    // pas se rabattre sur le coût le plus proche — le repli « ≤ X » d'avant le
    // passage au coût exact aurait rendu Éclaireur, Archer ou Milicien.
    const s = table();
    const c = porteuse(4);
    s.players[0].hand.push(c);

    expect(poser(s, c).players[0].hand).toHaveLength(0);
  });

  it("n'atteint pas l'alignement opposé", () => {
    // Vivier où le SEUL candidat au coût 3 est maléfique : la source est bonne,
    // la Faveur doit rester muette plutôt que de franchir la barrière.
    const s = table([elfe("Éclaireur", 1), malefique("Goule", 3)]);
    const c = porteuse(3);
    s.players[0].hand.push(c);

    expect(poser(s, c).players[0].hand).toHaveLength(0);
  });

  it("atteint le NEUTRE depuis un alignement tranché", () => {
    const s = table([neutre("Milicien", 3), malefique("Goule", 3)]);
    const c = porteuse(3);
    s.players[0].hand.push(c);

    const main = poser(s, c).players[0].hand;
    expect(main).toHaveLength(1);
    expect(main[0].card.name).toBe("Milicien");
  });

  it("ignore tout ce qui n'est pas COMMUN", () => {
    const s = table([elfe("Archer", 3, { rarity: "Rare" }), elfe("Relique", 3, { rarity: "Épique" })]);
    const c = porteuse(3);
    s.players[0].hand.push(c);

    expect(poser(s, c).players[0].hand).toHaveLength(0);
  });

  it("main pleine : rien ne se passe, et rien n'est perdu", () => {
    const s = table();
    const c = porteuse(3);
    // Main volontairement au-delà de MAX_HAND_SIZE (8) : la porteuse la quitte
    // en se posant, et il doit rester exactement les bouche-trous.
    for (let i = 0; i < 10; i++) s.players[0].hand.push(mkInstance(mkCard({ name: `Bouche-trou${i}` })));
    s.players[0].hand.push(c);

    const main = poser(s, c).players[0].hand;
    expect(main).toHaveLength(10);
    expect(main.every(h => h.card.name.startsWith("Bouche-trou"))).toBe(true);
  });
});

describe("Faveur X — le « ? » (coût tiré entre 1 et X)", () => {
  it("le coût tiré appartient toujours à l'intervalle", () => {
    // Plusieurs graines : le tirage doit rester borné, quelle que soit la RNG.
    for (const graine of [1, 7, 42, 99, 12345]) {
      const s = table();
      s.rngState = graine;
      const c = porteuse(3, { randomX: true });
      s.players[0].hand.push(c);

      const main = poser(s, c).players[0].hand;
      expect(main, `graine ${graine}`).toHaveLength(1);
      expect(main[0].card.mana_cost, `graine ${graine}`).toBeLessThanOrEqual(3);
      expect(main[0].card.mana_cost, `graine ${graine}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("ne fizzle PAS quand des coûts de l'intervalle sont vides", () => {
    // LE défaut que `getFaveurCard` existe pour éviter. Vivier peuplé aux seuls
    // coûts 1 et 5 ; une Faveur « ? 5 » qui tirerait naïvement dans 1..5 rendrait
    // du vide trois fois sur cinq. En tirant parmi les coûts RÉELLEMENT présents,
    // elle offre toujours une carte.
    const s = table([elfe("Éclaireur", 1), elfe("Champion", 5)]);
    for (const graine of [1, 2, 3, 7, 13, 42, 500]) {
      const t = { ...s, rngState: graine, players: [{ ...s.players[0], hand: [] }, s.players[1]] } as GameState;
      const c = porteuse(5, { randomX: true });
      t.players[0].hand.push(c);

      const main = poser(t, c).players[0].hand;
      expect(main, `graine ${graine}`).toHaveLength(1);
      expect([1, 5]).toContain(main[0].card.mana_cost);
    }
  });
});

describe("Faveur X — sort", () => {
  it("un sort Faveur offre une carte à son lanceur", () => {
    const s = table();
    const sort = mkInstance(mkCard({
      name: "Faveur des Anciens", mana_cost: 0, card_type: "spell", attack: null, health: null,
      faction: "Elfes", spell_keywords: [{ id: "faveur", amount: 3 }] as never,
    }));
    s.players[0].hand.push(sort);

    const main = poser(s, sort).players[0].hand;
    expect(main).toHaveLength(1);
    expect(main[0].card.mana_cost).toBe(3);
  });
});

describe("Faveur X — déterminisme et révélation", () => {
  it("même graine, même état ⇒ même carte (les deux clients doivent s'accorder)", () => {
    const tirer = () => {
      const s = table();
      const c = porteuse(3);
      s.players[0].hand.push(c);
      return poser(s, c).players[0].hand[0].card.name;
    };
    expect(tirer()).toBe(tirer());
  });

  it("la carte offerte est publiée dans faveurEvents, pour que les DEUX joueurs la voient", () => {
    const s = table();
    const c = porteuse(3);
    s.players[0].hand.push(c);

    const next = poser(s, c);
    expect(next.faveurEvents).toHaveLength(1);
    expect(next.faveurEvents![0].ownerId).toBe(next.players[0].id);
    expect(next.faveurEvents![0].card.name).toBe(next.players[0].hand[0].card.name);
  });
});

describe("Faveur composée", () => {
  it("N occurrences offrent N cartes", () => {
    const s = table();
    const c = mkInstance(mkCard({
      name: "Corne d'abondance", mana_cost: 0, attack: 1, health: 1, faction: "Elfes",
      capabilities: [{
        uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "faveur", magnitude: { x: 3 }, occurrences: 3 },
      }] as never,
    }));
    s.players[0].hand.push(c);

    expect(poser(s, c).players[0].hand).toHaveLength(3);
  });

  it("le filtre de pool restreint le vivier", () => {
    // Seule la faction Humains est autorisée : la Faveur doit rendre le Milicien
    // et jamais l'Archer ni le Veilleur, pourtant au même coût.
    const s = table();
    const c = mkInstance(mkCard({
      name: "Pacte humain", mana_cost: 0, attack: 1, health: 1, faction: "Elfes",
      capabilities: [{
        uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "faveur", magnitude: { x: 3 }, pool: { faction: "Humains" } },
      }] as never,
    }));
    s.players[0].hand.push(c);

    const main = poser(s, c).players[0].hand;
    expect(main).toHaveLength(1);
    expect(main[0].card.name).toBe("Milicien");
  });
});

describe("getFaveurCard — le constructeur de vivier", () => {
  const etat = (pool: Card[]): GameState => {
    const s = mkState();
    s.factionCardPool = pool;
    return s;
  };

  it("rend null sur un vivier vide plutôt que de jeter", () => {
    expect(getFaveurCard(etat([]), 3, { faction: "Elfes" })).toBeNull();
  });

  it("X ≤ 0 : aucun filtre de coût (repli des cartes sans amplitude saisie)", () => {
    const carte = getFaveurCard(etat([elfe("Champion", 5)]), 0, { faction: "Elfes" });
    expect(carte?.name).toBe("Champion");
  });

  it("sans source, retombe sur les factions du deck", () => {
    // Aucun alignement déductible ⇒ le vivier se limite aux factions présentes
    // chez le joueur (plus Mercenaires). Deck vide ⇒ aucune faction ⇒ null,
    // même si le pool global déborde de cartes.
    expect(getFaveurCard(etat([elfe("Archer", 3)]), 3, null)).toBeNull();
  });
});
