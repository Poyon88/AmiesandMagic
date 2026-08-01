// ORDRE DE RÉSOLUTION des effets d'une même carte.
//
// Vu avec « Détonateur Instable » (Tempête 3 puis Déchainement 2/1) : les deux
// effets s'enchaînaient sans frontière, si bien que Déchainement travaillait sur
// un plateau jonché de cadavres à 0 PV dont les râles d'agonie n'étaient pas
// encore partis. La boucle de `resolveSpellKeywords` ne réglait les morts qu'UNE
// fois, après son dernier mot-clé.
//
// Chaque test est construit pour que l'assertion distingue BINAIREMENT les deux
// ordres — pas de dépendance à un tirage aléatoire.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, SpellKeywordInstance } from "./types";

/** Créature dont la mort invoque un jeton dans le camp de son contrôleur. */
function rattleSummoner(name: string, health: number): CardInstance {
  return mkInstance(mkCard({
    name, mana_cost: 3, attack: 1, health,
    capabilities: [{
      uid: "cx_rattle", trigger: "on_death", effectKind: "immediate", abilityId: "_composed",
      composed: {
        content: "summon_token", magnitude: { x: 1 },
        target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" },
      },
    }] as unknown as Capability[],
  }));
}

function spell(keywords: SpellKeywordInstance[], extra: Partial<Card> = {}): CardInstance {
  return mkInstance(mkCard({
    name: "Sort testé", card_type: "spell", attack: null, health: null, mana_cost: 3,
    spell_keywords: keywords, ...extra,
  }));
}

/** Joue le sort depuis la main du joueur 0. */
function cast(s: ReturnType<typeof mkState>, card: CardInstance, targetMap?: Record<string, string>) {
  s.players[0].hand.push(card);
  return applyAction(s, { type: "play_card", cardInstanceId: card.instanceId, targetMap });
}

const enemyCreatures = (s: ReturnType<typeof mkState>) =>
  s.players[1].board.map(c => c.card.name);

describe("Frontière d'effet entre deux mots-clés d'un même sort", () => {
  it("le râle d'agonie part AVANT l'effet suivant — le jeton invoqué est touché", () => {
    const s = mkState();
    // 3 PV : le Déferlement 3 la tue. Son râle invoque un jeton 1/1 côté ennemi.
    s.players[1].board = [rattleSummoner("Porteur", 3)];

    // Déferlement 3 (tue) PUIS Déferlement 1 (doit frapper le jeton fraîchement né).
    const next = cast(s, spell([
      { id: "deferlement", amount: 3 } as SpellKeywordInstance,
      { id: "deferlement", amount: 1 } as SpellKeywordInstance,
    ]));

    // Le porteur est mort, son jeton est né PUIS a pris le second Déferlement.
    // Avant le correctif : le jeton naissait après les deux effets et survivait.
    expect(enemyCreatures(next)).not.toContain("Porteur");
    expect(next.players[1].board.length).toBe(0); // jeton 1 PV né puis tué
    expect(next.players[1].graveyard.map(c => c.card.name)).toContain("Porteur");
  });

  it("un effet de zone ne frappe plus les cadavres laissés par l'effet précédent", () => {
    const s = mkState();
    const victime = mkInstance(mkCard({ name: "Victime", mana_cost: 1, attack: 1, health: 2 }));
    const survivant = mkInstance(mkCard({ name: "Survivant", mana_cost: 5, attack: 1, health: 9 }));
    s.players[1].board = [victime, survivant];

    // Déferlement 2 tue Victime ; le Déferlement 3 suivant ne doit frapper que Survivant.
    const next = cast(s, spell([
      { id: "deferlement", amount: 2 } as SpellKeywordInstance,
      { id: "deferlement", amount: 3 } as SpellKeywordInstance,
    ]));

    expect(enemyCreatures(next)).toEqual(["Survivant"]);
    // 9 - 2 - 3 : le survivant encaisse les deux vagues.
    expect(next.players[1].board[0].currentHealth).toBe(4);
    // Victime n'a encaissé QUE la première : elle était déjà au cimetière.
    const morte = next.players[1].graveyard.find(c => c.card.name === "Victime")!;
    expect(morte.currentHealth).toBe(0);
  });

  it("un cadavre ne prend pas de dégâts supplémentaires après sa mort", () => {
    const s = mkState();
    s.players[1].board = [
      mkInstance(mkCard({ name: "A", mana_cost: 1, attack: 1, health: 1 })),
      mkInstance(mkCard({ name: "B", mana_cost: 1, attack: 1, health: 8 })),
    ];

    const next = cast(s, spell([
      { id: "deferlement", amount: 1 } as SpellKeywordInstance,
      { id: "deferlement", amount: 1 } as SpellKeywordInstance,
    ]));

    expect(next.players[1].board.map(c => c.card.name)).toEqual(["B"]);
    expect(next.players[1].board[0].currentHealth).toBe(6); // 8 - 1 - 1
    // A meurt sur la PREMIÈRE vague et sort du plateau : son total doit être
    // exactement 0, pas -1. C'est ce point qui distingue les deux ordres —
    // sans frontière, le second Déferlement frappe encore le cadavre.
    const morteA = next.players[1].graveyard.find(c => c.card.name === "A")!;
    expect(morteA.currentHealth).toBe(0);
  });
});

describe("Marquage target_destroyed après déplacement du balayage", () => {
  it("reste posé alors que la mort est réglée par la frontière d'effet", () => {
    const s = mkState();
    const cible = mkInstance(mkCard({ name: "Cible", mana_cost: 1, attack: 1, health: 2 }));
    s.players[1].board = [cible];
    // `mkState` livre un deck VIDE : sans réserve, la pioche conditionnelle ne
    // produirait rien et le test passerait pour la mauvaise raison.
    s.players[0].deck = [
      mkInstance(mkCard({ name: "Réserve 1", mana_cost: 1, attack: 1, health: 1 })),
      mkInstance(mkCard({ name: "Réserve 2", mana_cost: 1, attack: 1, health: 1 })),
    ];

    // Impact 5 sur la cible (slot kw_0) : elle meurt DANS la boucle, donc le
    // balayage post-boucle ne la verra plus passer. Le drapeau doit malgré tout
    // être posé — on l'exerce pour de vrai via un effet composable conditionnel
    // « si la cible est détruite → pioche 2 ». Une simple vérification du
    // cimetière ne dirait rien du drapeau.
    const next = cast(
      s,
      spell([{ id: "impact", amount: 5 } as SpellKeywordInstance], {
        spell_effects: {
          targets: [],
          effects: [{
            condition: { type: "target_destroyed" },
            then: [{ type: "draw_cards", amount: 2 }],
          }],
        },
      } as unknown as Partial<Card>),
      { kw_0: cible.instanceId },
    );

    expect(next.players[1].board.length).toBe(0);
    expect(next.players[1].graveyard.map(c => c.card.name)).toContain("Cible");
    // Le conditionnel a bien vu la cible détruite.
    expect(next.players[0].hand.length).toBe(2);
  });
});

// ─── Le cas réel : « Détonateur Instable » (id 621) ─────────────────────────
// spell_keywords: [{tempete, amount:3}, {dechainement, amount:2, health:1}]
describe("Détonateur Instable — Tempête 3 puis Déchainement 2/1", () => {
  it("les victimes de Tempête sont au cimetière AVANT que Déchainement ne frappe", () => {
    const s = mkState();
    // Sort du pool tiré par Déchainement : Déferlement 5 (frappe tout le camp
    // ennemi). S'il voyait les cadavres de la Tempête, il les frapperait.
    s.allSpellsPool = [mkCard({
      name: "Vague", mana_cost: 1, card_type: "spell", attack: null, health: null,
      faction: "Elfes", rarity: "Commune",
      spell_keywords: [{ id: "deferlement", amount: 5 }],
    }) as Card];

    // 3 créatures à 1 PV : la Tempête 3 les tue toutes les trois.
    s.players[1].board = [
      mkInstance(mkCard({ name: "P1", mana_cost: 1, attack: 1, health: 1 })),
      mkInstance(mkCard({ name: "P2", mana_cost: 1, attack: 1, health: 1 })),
      mkInstance(mkCard({ name: "P3", mana_cost: 1, attack: 1, health: 1 })),
    ];

    const detonateur = mkInstance(mkCard({
      name: "Détonateur Instable", card_type: "spell", attack: null, health: null,
      mana_cost: 3, faction: "Elfes",
      spell_keywords: [
        { id: "tempete", amount: 3 },
        { id: "dechainement", amount: 2, health: 1 },
      ],
    }));
    const next = cast(s, detonateur);

    // Le plateau adverse est vide et les 3 corps sont au cimetière avec 0 PV :
    // ils y sont arrivés AVANT les deux Déferlements, qui n'ont donc rien pu
    // leur infliger de plus.
    expect(next.players[1].board.length).toBe(0);
    const morts = next.players[1].graveyard.filter(c => c.card.card_type === "creature");
    expect(morts.map(c => c.card.name).sort()).toEqual(["P1", "P2", "P3"]);
    for (const m of morts) expect(m.currentHealth).toBe(0);
  });
});
