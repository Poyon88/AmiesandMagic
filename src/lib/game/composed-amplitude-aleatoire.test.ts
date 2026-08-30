// Amplitude ALÉATOIRE : le nombre saisi devient un plafond, la valeur est tirée
// entre 1 et lui.
//
// Deux propriétés portent tout le reste :
//   - le tirage passe par le RNG À GRAINE de l'état de partie, donc les deux
//     clients obtiennent la même valeur (un Math.random désynchroniserait) ;
//   - il a lieu UNE SEULE FOIS. Le pool d'une Exhumation dépend de X : deux
//     tirages donneraient un sélecteur et une résolution en désaccord, ce que
//     `getComposedGraveyardTargets` existe précisément pour empêcher.
import { describe, expect, it } from "vitest";
import { applyAction, getComposedGraveyardTargets } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameState, StackFrame } from "./types";

const CIBLE_ENNEMIE = { entity: "unit", count: 1, side: "enemy", location: "board", designation: "automatic" } as const;

function sortDegats(plafond: number, aleatoire: boolean): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: {
      content: "deal_damage",
      magnitude: { x: plafond, ...(aleatoire ? { randomX: true } : {}) },
      target: CIBLE_ENNEMIE,
    },
  }] as unknown as Capability[];
  return mkInstance(mkCard({ name: "Foudre", card_type: "spell", attack: null, health: null, capabilities: caps as never }));
}

/** Lance le sort et rend les dégâts réellement encaissés. */
function degatsInfliges(graine: number, plafond: number, aleatoire: boolean): number {
  const s0 = mkState();
  s0.players[1].board = [mkInstance(mkCard({ name: "Cible", attack: 0, health: 99 }))];
  // La graine se pose sur l'ÉTAT, pas via initRNG : `applyAction` recharge
  // `rngState` depuis la partie à chaque action (c'est ce qui rend le flux
  // aléatoire rejouable et identique sur les deux clients).
  s0.rngState = graine;
  const sort = sortDegats(plafond, aleatoire);
  s0.players[0].hand.push(sort);
  const s: GameState = applyAction(s0, { type: "play_card", cardInstanceId: sort.instanceId });
  return 99 - s.players[1].board[0].currentHealth;
}

describe("tirage", () => {
  it("reste dans [1, plafond]", () => {
    for (let graine = 1; graine <= 30; graine++) {
      const d = degatsInfliges(graine, 6, true);
      expect(d, `graine ${graine}`).toBeGreaterThanOrEqual(1);
      expect(d, `graine ${graine}`).toBeLessThanOrEqual(6);
    }
  });

  it("EXPLORE vraiment la plage — le test n'est pas à vide", () => {
    const vus = new Set<number>();
    for (let graine = 1; graine <= 60; graine++) vus.add(degatsInfliges(graine, 6, true));
    // Sans cette garde, un tirage cassé toujours à 1 passerait le test ci-dessus.
    expect(vus.size).toBeGreaterThan(2);
  });

  it("est DÉTERMINISTE à graine égale — c'est ce qui protège du désync", () => {
    // La propriété load-bearing : deux clients rejouant la même action depuis la
    // même graine doivent voir le même nombre.
    for (const graine of [7, 42, 1234]) {
      expect(degatsInfliges(graine, 8, true)).toBe(degatsInfliges(graine, 8, true));
    }
  });

  it("laisse une amplitude FIXE intacte", () => {
    for (const graine of [1, 2, 3]) expect(degatsInfliges(graine, 5, false)).toBe(5);
  });

  it("ne tire pas sous un plafond de 1 — « entre 1 et 1 » est une constante", () => {
    for (const graine of [1, 2, 3]) expect(degatsInfliges(graine, 1, true)).toBe(1);
  });
});

describe("un seul tirage — le sélecteur et le moteur voient le même nombre", () => {
  // Le pool d'Exhumation est filtré par X. Si le sélecteur relisait le PLAFOND
  // de la carte pendant que la résolution utilise la valeur tirée, il offrirait
  // des créatures que le moteur refuserait ensuite.
  const carte = mkCard({
    name: "Exhumeur", card_type: "spell", attack: null, health: null,
    capabilities: [{
      uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: {
        content: "exhumation", magnitude: { x: 9, randomX: true },
        target: { entity: "unit", count: 1, side: "ally", location: "graveyard", designation: "choice" },
      },
    }] as never,
  });

  function etatAvecCimetiere(): GameState {
    const s = mkState();
    s.players[0].graveyard = [2, 5, 9].map(c =>
      mkInstance(mkCard({ name: `Mort ${c}`, mana_cost: c, attack: 1, health: 1 })));
    return s;
  }

  it("le sélecteur suit la valeur TIRÉE, pas le plafond de la carte", () => {
    const s = etatAvecCimetiere();
    // Frame suspendue portant un X déjà figé à 3 : seule « Mort 2 » est éligible.
    s.effectStack = [{
      frameId: "f0", kind: "composed", ownerId: s.players[0].id, sourceInstanceId: null,
      trigger: "spell_resolution", capUid: "cx_0", awaitingChoice: true, depth: 0, originTag: "t",
      composed: { content: "exhumation", magnitude: { x: 3 }, target: carte.capabilities![0].composed!.target },
    } as StackFrame];

    const cibles = getComposedGraveyardTargets(s, carte, "cx_0");
    expect(cibles).toHaveLength(1);
    expect(s.players[0].graveyard.find(c => c.instanceId === cibles[0])!.card.mana_cost).toBe(2);
  });

  it("sans frame suspendue, retombe sur la carte", () => {
    // Chemins sans pile (ciblage pré-connu) : le comportement d'origine tient.
    const s = etatAvecCimetiere();
    expect(getComposedGraveyardTargets(s, carte, "cx_0")).toHaveLength(3);
  });
});

describe("texte de carte", () => {
  const cap = (m: Record<string, unknown>, content = "deal_damage") => ({
    uid: "u", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
    composed: { content, magnitude: m, target: CIBLE_ENNEMIE },
  } as unknown as Capability);

  it("annonce la PLAGE, pas le plafond", () => {
    // « Inflige 4 dégâts » aurait menti pour un effet qui peut n'en infliger
    // qu'un seul.
    expect(describeComposedCap(cap({ x: 4, randomX: true })))
      .toBe("Inflige 1 à 4 dégâts à une unité ennemie automatiquement.");
  });

  it("laisse une amplitude fixe intacte", () => {
    expect(describeComposedCap(cap({ x: 4 }))).toBe("Inflige 4 dégâts à une unité ennemie automatiquement.");
  });

  it("ne dit pas « 1 à 1 » sous un plafond de 1", () => {
    expect(describeComposedCap(cap({ x: 1, randomX: true })))
      .toBe("Inflige 1 dégât à une unité ennemie automatiquement.");
  });

  it("couvre les DEUX membres d'un couple X/Y", () => {
    expect(describeComposedCap(cap({ x: 3, y: 2, randomX: true, randomY: true }, "buff")))
      .toContain("+1 à 3/+1 à 2");
  });
});
