// Contenu composé « Invocation » : une créature aléatoire de la collection au
// coût EXACT X (pas un plafond), mêmes règles que le mot-clé curé — alignement
// de la carte source, format du match, communes + limitées possédées.
//
// Comme les Sélections composées, il se restreint par `pool` : race, faction,
// clan ou mot-clé porté. Une restriction REMPLACE le filtre d'alignement, sans
// quoi « race Loups » sur une carte neutre ne trouverait jamais rien.
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, ComposedPoolFilter, GameState } from "./types";

function invocationSpell(x: number, pool?: ComposedPoolFilter, randomX = false): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "invocation", magnitude: { x, ...(randomX ? { randomX: true } : {}) }, ...(pool ? { pool } : {}) },
  }];
  return mkInstance(mkCard({
    name: "Appel", card_type: "spell", attack: null, health: null, capabilities: caps as never,
  }));
}

function poolCard(name: string, mana: number, over: Partial<Card> = {}): Card {
  return mkCard({ name, faction: "Mercenaires", rarity: "Commune", mana_cost: mana, attack: 1, health: 1, ...over });
}

const summoned = (s: GameState) => s.players[0].board.map((c) => c.card.name).sort();

function cast(s: GameState, spell: CardInstance): GameState {
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId });
}

afterEach(() => vi.restoreAllMocks());

describe("Invocation composée", () => {
  it("invoque une créature au coût EXACT, pas « au plus »", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Pile", 3), poolCard("Trop bas", 2), poolCard("Trop haut", 4)];

    const next = cast(s, invocationSpell(3));

    expect(summoned(next)).toEqual(["Pile"]);
  });

  it("aucun candidat au coût demandé : rien n'est invoqué", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Recrue", 1)];

    const next = cast(s, invocationSpell(5));

    expect(summoned(next)).toEqual([]);
  });

  it("restreint par race, hors alignement de la carte", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Loup", 2, { race: "Loups", faction: "La Meute" }),
      poolCard("Nain", 2, { race: "Nains", faction: "Mercenaires" }),
    ];

    const next = cast(s, invocationSpell(2, { race: "Loups" }));

    expect(summoned(next)).toEqual(["Loup"]);
  });

  it("restreint par mot-clé porté", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Rapide", 2, { keywords: ["charge"] as never }),
      poolCard("Lente", 2, { keywords: [] as never }),
    ];

    const next = cast(s, invocationSpell(2, { keywordId: "charge" }));

    expect(summoned(next)).toEqual(["Rapide"]);
  });

  it("tirage vide : un warn console, pour que le silence se voie", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = mkState();
    s.factionCardPool = [poolCard("Elfe", 6, { race: "Elfes" })];

    cast(s, invocationSpell(6, { race: "Phoenix" }));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("aucune créature au coût 6"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Phoenix"));
  });

  // « X au hasard » sur une Invocation : X est un PLAFOND de coût, pas un
  // tirage de coût suivi d'un coût exact — sinon l'Aspirant Prince-Dragon
  // (dragons à 4 seulement, X tiré entre 1 et 4) restait muet 3 fois sur 4.
  describe("X au hasard = plafond de coût", () => {
    it("invoque toujours quand un seul palier est peuplé", () => {
      for (let seed = 0; seed < 12; seed++) {
        const s = mkState();
        s.rngState = 1000 + seed;
        s.factionCardPool = [
          poolCard("Jeune Dragon", 4, { race: "Dragons" }),
          poolCard("Nain", 2, { race: "Nains" }),
        ];

        const next = cast(s, invocationSpell(4, { race: "Dragons" }, true));

        expect(summoned(next)).toEqual(["Jeune Dragon"]);
      }
    });

    it("le plafond exclut les coûts supérieurs à X et le hasard porte sur la créature", () => {
      const vus = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const s = mkState();
        s.rngState = 2000 + seed;
        s.factionCardPool = [
          poolCard("Dragonnet", 2, { race: "Dragons" }),
          poolCard("Jeune Dragon", 4, { race: "Dragons" }),
          poolCard("Grand Dragon", 9, { race: "Dragons" }),
        ];

        const next = cast(s, invocationSpell(4, { race: "Dragons" }, true));

        expect(summoned(next)).toHaveLength(1);
        expect(summoned(next)[0]).not.toBe("Grand Dragon");
        vus.add(summoned(next)[0]);
      }
      expect(vus).toEqual(new Set(["Dragonnet", "Jeune Dragon"]));
    });
  });

  it("sans restriction : repli sur l'alignement de la carte source", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCard("Merco", 2, { faction: "Mercenaires" }),
      poolCard("Meutard", 2, { faction: "La Meute" }),
    ];

    const next = cast(s, invocationSpell(2));

    expect(summoned(next)).toEqual(["Merco"]);
  });
});

// INVOCATION DÉSIGNÉE : `composed.cardId` remplace le tirage. La carte est
// résolue par id dans les pools du match (complétés au chargement, comme pour
// Compagnons) ; X, filtre et alignement ne comptent plus.
function designatedSpell(cardId: number, x = 1): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "invocation", magnitude: { x }, cardId },
  }];
  return mkInstance(mkCard({
    name: "Appel nommé", card_type: "spell", attack: null, health: null, capabilities: caps as never,
  }));
}

describe("Invocation composée — carte DÉSIGNÉE", () => {
  it("invoque la carte désignée, quel que soit son coût ou X", () => {
    const s = mkState();
    const elue = poolCard("Élue", 7, { id: 9001, rarity: "Rare" });
    s.factionCardPool = [poolCard("Autre", 1), elue];
    const next = cast(s, designatedSpell(9001, 1));
    expect(summoned(next)).toEqual(["Élue"]);
    expect(next.players[0].board[0].hasSummoningSickness).toBe(true);
  });

  it("la trouve aussi dans le pool des sorts, mais n'invoque pas un sort", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Autre", 1)];
    s.allSpellsPool = [
      poolCard("Créature égarée", 2, { id: 9002 }),
      mkCard({ id: 9003, name: "Sortilège", card_type: "spell", attack: null, health: null }),
    ];
    expect(summoned(cast(s, designatedSpell(9002)))).toEqual(["Créature égarée"]);
    const t = mkState();
    t.factionCardPool = [poolCard("Autre", 1)];
    t.allSpellsPool = [mkCard({ id: 9003, name: "Sortilège", card_type: "spell", attack: null, health: null })];
    expect(summoned(cast(t, designatedSpell(9003)))).toEqual([]);
  });

  it("id introuvable : rien n'est invoqué, et surtout pas un tirage aléatoire de repli", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Tentante", 1)];
    expect(summoned(cast(s, designatedSpell(4242, 1)))).toEqual([]);
  });

  it("plateau plein : no-op", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Élue", 3, { id: 9004 })];
    for (let i = 0; i < 8; i++) s.players[0].board.push(mkInstance(poolCard(`Occupant${i}`, 1)));
    expect(cast(s, designatedSpell(9004)).players[0].board).toHaveLength(8);
  });
});
