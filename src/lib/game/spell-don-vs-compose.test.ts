// ORDRE D'AUTEUR sur un sort : effets COMPOSÉS face aux DONS de mot-clé.
//
// Vu en partie sur « Nuit de la Chasse féerique » (Invocation ×2 en premier,
// puis Raid à tous les alliés). La carte affichait bien l'Invocation d'abord,
// mais le Raid partait AVANT — si bien que les créatures invoquées, arrivées
// après le don, n'avaient pas Raid. Exactement l'inverse de ce que la carte
// promettait, et l'auteur n'avait aucun moyen de s'en apercevoir autrement
// qu'en jouant.
//
// La cause : `creneauCompose` bornait la position au nombre de MÉCANIQUES
// (`spell_keywords`). Un sort sans mécanique — c'était le cas — donnait donc le
// créneau 0 à un composé positionné 0, mais ce créneau valait aussi
// « en queue », et la queue passe après les dons.
//
// L'AFFICHAGE, lui, range les dons APRÈS les mécaniques
// (`grantedKeywordDisplayOrder`) : la liste d'auteur d'un sort est
// `[…mécaniques, …dons]`. Le moteur doit compter pareil, sinon la carte ment.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameAction, GameState, Keyword, SpellKeywordInstance } from "./types";

/** Le sort du rapport, réduit à l'os : invoque UNE créature (composé placé en
 *  tête) et confère Raid à tous les alliés. */
function nuitDeLaChasse(position: number | undefined) {
  return mkInstance(mkCard({
    name: "Nuit de la Chasse", mana_cost: 0, card_type: "spell", attack: null, health: null,
    faction: "Elfes",
    keywords: ["raid"] as unknown as Keyword[],
    keyword_instances: [{ id: "raid" as Keyword, grantScope: "all_allies" }],
    capabilities: [
      {
        uid: "grant_0", targets: [], trigger: "spell_resolution",
        abilityId: "raid", effectKind: "grant", grantScope: "all_allies",
      },
      {
        uid: "cx_0", trigger: "spell_resolution", abilityId: "_composed", effectKind: "immediate",
        ...(position != null ? { position } : {}),
        // `occurrences: 2` comme la vraie carte : les DEUX invoquées doivent
        // recevoir le don, pas seulement la première.
        composed: { content: "invocation", magnitude: { x: 1 }, occurrences: 2 },
      },
    ] as unknown as Capability[],
  }));
}

/** Vivier d'invocation : une seule créature possible, à coût 1. */
function table(): GameState {
  const s = mkState();
  s.rngState = 7;
  s.factionCardPool = [
    mkCard({ name: "Lutin", faction: "Elfes", rarity: "Commune", mana_cost: 1, attack: 1, health: 1 }),
  ];
  s.allSpellsPool = [];
  return s;
}

const lancer = (s: GameState, sort: { instanceId: string }) => {
  s.players[0].hand.push(sort as never);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
};

const aRaid = (c: { card: { keywords: Keyword[] } }) =>
  (c.card.keywords as unknown as string[]).includes("raid");

describe("Composé placé AVANT un don", () => {
  it("la créature invoquée reçoit le don — c'est ce que la carte promet", () => {
    // LE test du rapport. Assertion BINAIRE : si le don part en premier, la
    // créature n'existe pas encore et repart sans Raid.
    const s = table();
    const sort = nuitDeLaChasse(0);

    const next = lancer(s, sort);
    const invoquees = next.players[0].board.filter(c => c.card.name === "Lutin");

    expect(invoquees.length, "les deux invocations ont eu lieu").toBe(2);
    expect(invoquees.every(aRaid), "chaque invoquée doit porter Raid").toBe(true);
  });

  it("les alliés DÉJÀ en jeu le reçoivent aussi", () => {
    // Le don ne doit pas se restreindre à l'invoquée en changeant d'ordre.
    const s = table();
    s.players[0].board.push(mkInstance(mkCard({ name: "Vétéran", mana_cost: 0, attack: 2, health: 2, faction: "Elfes" })));

    const next = lancer(s, nuitDeLaChasse(0));
    expect(aRaid(next.players[0].board.find(c => c.card.name === "Vétéran")!)).toBe(true);
  });
});

describe("Composé SANS position", () => {
  it("reste en queue : l'invoquée n'a pas le don", () => {
    // Le comportement historique, et il doit être préservé — c'est lui qui
    // garantit qu'aucune carte existante ne bouge.
    const s = table();

    const next = lancer(s, nuitDeLaChasse(undefined));
    const invoquees = next.players[0].board.filter(c => c.card.name === "Lutin");

    expect(invoquees.length).toBeGreaterThan(0);
    expect(invoquees.some(aRaid), "sans position, le composé passe APRÈS le don").toBe(false);
  });
});

describe("L'affichage et le moteur comptent pareil", () => {
  it("un don occupe un créneau d'ordre, comme une mécanique", async () => {
    // `grantedKeywordDisplayOrder` range les dons après les mécaniques : la
    // liste d'auteur d'un sort est `[…mécaniques, …dons]`. Si le moteur ne
    // comptait que les mécaniques, une carte pourrait afficher un ordre et en
    // jouer un autre — le défaut d'origine.
    const { grantedKeywordDisplayOrder, composedDisplayOrder } =
      await import("./composed-position");
    const carte = {
      keywords: ["raid"] as unknown as Keyword[],
      spell_keywords: null as SpellKeywordInstance[] | null,
    };
    const rangDuDon = grantedKeywordDisplayOrder(carte, "raid");
    const rangDuCompose = composedDisplayOrder({ position: 0 } as Capability);

    expect(rangDuCompose, "le composé placé en 0 s'affiche AVANT le don").toBeLessThan(rangDuDon);
  });
});
