// Épargne : compteur par joueur alimenté par la capacité (créature, sort,
// effet composé), dépensé en révélant 3 cartes de son alignement au coût
// EXACTEMENT égal au niveau atteint.
import { describe, expect, it } from "vitest";
import { applyAction, getSelectionCards, spendEpargne } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_EPARGNE } from "./constants";
import type { Capability, Card, CardInstance, GameState } from "./types";

/** Créature dont l'arrivée en jeu alimente le compteur. */
function creatureEpargne(x: number): CardInstance {
  return mkInstance(mkCard({
    name: "Thésauriseur", mana_cost: 2, attack: 1, health: 2,
    keywords: ["epargne"], keyword_instances: [{ id: "epargne", x }] as never,
    effect_text: `[Épargne ${x}]`,
  }));
}

/** Sort qui alimente le compteur. */
function spellEpargne(x: number): CardInstance {
  return mkInstance(mkCard({
    name: "Mise de côté", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "epargne", amount: x }] as never,
  }));
}

function play(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}

const compteur = (s: GameState) => s.players[0].epargne;

describe("Épargne — alimentation du compteur", () => {
  it("est MASQUÉE tant que la capacité ne s'est jamais déclenchée", () => {
    expect(compteur(mkState())).toBeNull();
  });

  it("apparaît au premier déclenchement d'une créature", () => {
    const next = play(mkState(), creatureEpargne(3));
    expect(compteur(next)).toBe(3);
  });

  it("est alimentée par un SORT tout autant que par une créature", () => {
    const next = play(mkState(), spellEpargne(2));
    expect(compteur(next)).toBe(2);
  });

  it("cumule les déclenchements successifs", () => {
    let s = play(mkState(), creatureEpargne(3));
    s = play(s, spellEpargne(2));
    expect(compteur(s)).toBe(5);
  });

  it("est écrêtée au plafond, sans jamais le dépasser", () => {
    let s = mkState();
    for (let i = 0; i < 5; i++) s = play(s, creatureEpargne(3));
    expect(compteur(s)).toBe(MAX_EPARGNE);
  });

  it("n'alimente QUE le joueur qui déclenche", () => {
    const next = play(mkState(), creatureEpargne(3));
    expect(next.players[1].epargne).toBeNull();
  });

  it("est alimentée par la forme COMPOSÉE", () => {
    const porteur = mkInstance(mkCard({
      name: "Coffre", card_type: "spell", attack: null, health: null, mana_cost: 1,
      capabilities: [{
        uid: "cx_0", abilityId: "_composed", effectKind: "immediate",
        trigger: "spell_resolution",
        composed: { content: "epargne", magnitude: { x: 4 } },
      }] as unknown as Capability[],
    }));
    expect(compteur(play(mkState(), porteur))).toBe(4);
  });
});

// ── Dépense ────────────────────────────────────────────────────────────────

const commune = (id: number, cost: number, name: string): Card => mkCard({
  id, name, mana_cost: cost, attack: 1, health: 1,
  rarity: "Commune", faction: "Nains", card_alignment: "bon",
});

/** État avec un compteur chargé et un pool de collection exploitable.
 *
 *  Le héros de test n'a pas de définition, donc pas de faction : l'alignement
 *  retombe sur les factions présentes dans les zones du joueur (comportement
 *  historique de factionsForSelectionAlignment). D'où la carte naine glissée
 *  dans le deck — sans elle, seuls les Mercenaires seraient éligibles. */
function stateAvecEpargne(niveau: number): GameState {
  const s = mkState();
  s.players[0].epargne = niveau;
  s.players[0].deck.push(mkInstance(commune(999, 1, "Graine naine")));
  s.factionCardPool = [
    commune(101, 1, "Bricole"), commune(102, 3, "Hache naine"),
    commune(103, 3, "Marteau"), commune(104, 3, "Enclume"),
    commune(105, 3, "Soufflet"), commune(106, 7, "Colosse"),
  ];
  return s;
}

describe("Épargne — construction de l'offre", () => {
  it("ne propose QUE des cartes au coût exact, jamais en dessous", () => {
    const s = stateAvecEpargne(3);
    const offre = getSelectionCards(s, 3, { faction: "Nains" }, undefined, true);
    expect(offre.length).toBeGreaterThan(0);
    expect(offre.every((c) => c.mana_cost === 3)).toBe(true);
  });

  it("plafonne l'offre à 3 cartes", () => {
    const offre = getSelectionCards(stateAvecEpargne(3), 3, { faction: "Nains" }, undefined, true);
    expect(offre).toHaveLength(3);
  });

  it("renvoie une offre VIDE si aucune carte n'a ce coût exact", () => {
    const offre = getSelectionCards(stateAvecEpargne(5), 5, { faction: "Nains" }, undefined, true);
    expect(offre).toEqual([]);
  });

  it("ne consomme pas le flux RNG partagé (déterminisme réseau)", () => {
    const s = stateAvecEpargne(3);
    const avant = s.rngState;
    const a = getSelectionCards(s, 3, { faction: "Nains" }, undefined, true);
    const b = getSelectionCards(s, 3, { faction: "Nains" }, undefined, true);
    expect(s.rngState).toBe(avant);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id)); // même état ⇒ même offre
  });

  it("laisse les Sélections en mode PLAFOND (non-régression)", () => {
    // Pool ne contenant AUCUNE carte au coût 3 : le mode plafond doit tout de
    // même proposer les cartes moins chères, là où le mode exact ne rend rien.
    const s = stateAvecEpargne(3);
    s.factionCardPool = [commune(201, 1, "Clou"), commune(202, 2, "Vis")];
    expect(getSelectionCards(s, 3, { faction: "Nains" }).length).toBe(2);
    expect(getSelectionCards(s, 3, { faction: "Nains" }, undefined, true)).toEqual([]);
  });
});

describe("Épargne — dépense", () => {
  it("met la carte choisie en main et remet le compteur à zéro", () => {
    const s = stateAvecEpargne(3);
    const next = applyAction(s, { type: "spend_epargne", selectionCardId: 102 });

    expect(next.players[0].hand.map((c) => c.card.name)).toContain("Hache naine");
    expect(next.players[0].epargne).toBe(0);
  });

  it("laisse le compteur VISIBLE à zéro, jamais masqué à nouveau", () => {
    const next = applyAction(stateAvecEpargne(3), { type: "spend_epargne", selectionCardId: 102 });
    expect(next.players[0].epargne).not.toBeNull();
  });
});

describe("Épargne — gardes anti-triche (le moteur rejoue chez l'adversaire)", () => {
  const rejete = (s: GameState, cardId: number) => {
    const next = spendEpargne(s, { type: "spend_epargne", selectionCardId: cardId });
    expect(next).toBe(s);                       // état STRICTEMENT inchangé
    expect(next.players[0].epargne).toBe(s.players[0].epargne); // épargne préservée
  };

  it("refuse une carte au mauvais coût", () => {
    rejete(stateAvecEpargne(3), 101); // coût 1 alors que le compteur vaut 3
  });

  it("refuse une carte hors du pool", () => {
    rejete(stateAvecEpargne(3), 9999);
  });

  it("refuse une carte non Commune", () => {
    const s = stateAvecEpargne(3);
    s.factionCardPool = [...s.factionCardPool!, mkCard({
      id: 200, name: "Relique", mana_cost: 3, rarity: "Légendaire",
      faction: "Nains", card_alignment: "bon",
    })];
    rejete(s, 200);
  });

  it("refuse quand le compteur est à zéro", () => {
    rejete(stateAvecEpargne(0), 102);
  });

  it("refuse quand la capacité ne s'est jamais déclenchée", () => {
    const s = stateAvecEpargne(3);
    s.players[0].epargne = null;
    rejete(s, 102);
  });

  it("refuse main pleine SANS consommer l'épargne", () => {
    const s = stateAvecEpargne(3);
    for (let i = 0; i < 8; i++) s.players[0].hand.push(mkInstance(mkCard({ name: `Carte${i}` })));
    rejete(s, 102);
  });
});
