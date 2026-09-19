// Régénération X — le soin de début de tour devient RÉGLABLE.
//
// La capacité était forfaitaire (2 PV). Deux points valent d'être verrouillés :
//
//   1. le X saisi est bien celui qu'on rend, et jamais au-delà des PV max ;
//   2. les cartes d'AVANT le passage à X, qui ne portent aucune valeur,
//      continuent de se soigner de 2 — le repli du moteur. Sans lui, tout un
//      pan de la base (Trolls, Dryades…) perdait un point de soin en silence
//      le jour du déploiement.
import { describe, expect, it } from "vitest";
import { startTurn } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState } from "./types";

/** Créature blessée portant Régénération, avec ou sans X explicite. */
function blesse(x: number | null, pv = 2, pvMax = 10) {
  const capabilities: Capability[] | null = x == null ? null : [
    // `automatic` : le déclencheur que l'adaptateur donne aux passifs, et celui
    // que `getKwX` doit savoir lire (cf. son repli).
    { abilityId: "regeneration", trigger: "automatic", params: { x } } as unknown as Capability,
  ];
  const inst = mkInstance(mkCard({
    name: "Troll", attack: 2, health: pvMax,
    keywords: ["regeneration"] as never,
    capabilities,
  }));
  inst.currentHealth = pv;
  inst.maxHealth = pvMax;
  return inst;
}

/** Plateau du joueur courant, puis un début de tour. */
function unTour(inst: ReturnType<typeof blesse>): GameState {
  const s = mkState();
  s.players[0].board.push(inst);
  return startTurn(s);
}

const pv = (st: GameState) => st.players[0].board[0].currentHealth;

describe("Régénération X", () => {
  it("rend exactement X PV au début du tour", () => {
    expect(pv(unTour(blesse(4)))).toBe(6); // 2 + 4
    expect(pv(unTour(blesse(1)))).toBe(3); // 2 + 1
  });

  it("ne dépasse jamais les PV maximum", () => {
    expect(pv(unTour(blesse(9, 8, 10)))).toBe(10);
  });

  it("sans X déclaré (cartes d'avant la bascule), le repli reste 2 PV", () => {
    expect(pv(unTour(blesse(null)))).toBe(4); // 2 + 2
  });

  it("le X saisi dans la FORGE (keyword_instances) est lu comme tel", () => {
    // Chemin réel d'une carte enregistrée : pas de `capabilities`, mais une
    // instance de mot-clé — c'est l'adaptateur qui en fait un params.x.
    const inst = mkInstance(mkCard({
      name: "Troll des cavernes", attack: 2, health: 10,
      keywords: ["regeneration"] as never,
      keyword_instances: [{ id: "regeneration", x: 3 }] as never,
    }));
    inst.currentHealth = 2;
    inst.maxHealth = 10;
    expect(pv(unTour(inst))).toBe(5); // 2 + 3
  });

  it("une Régénération CONFÉRÉE rend le X du don", () => {
    // Une passive conférée ne pose pas d'instance de mot-clé : son amplitude
    // n'existe que dans `grantedKeywordX`. Sans cette lecture, un don de
    // Régénération 4 soignait de 2.
    const inst = mkInstance(mkCard({ name: "Bénéficiaire", attack: 2, health: 10 }));
    inst.currentHealth = 2;
    inst.maxHealth = 10;
    inst.card = { ...inst.card, keywords: ["regeneration"] as never };
    inst.grantedKeywordX = { regeneration: 4 };
    expect(pv(unTour(inst))).toBe(6); // 2 + 4
  });

  it("le X de la carte l'emporte sur celui d'un don", () => {
    const inst = blesse(3);
    inst.grantedKeywordX = { regeneration: 1 };
    expect(pv(unTour(inst))).toBe(5); // 2 + 3
  });

  it("le X vient aussi du repli [Régénération N] de effect_text", () => {
    const inst = mkInstance(mkCard({
      name: "Troll légendaire", attack: 2, health: 10,
      keywords: ["regeneration"] as never,
      effect_text: "[Régénération 5]",
    }));
    inst.currentHealth = 2;
    inst.maxHealth = 10;
    expect(pv(unTour(inst))).toBe(7); // 2 + 5
  });
});
