// COMMANDEMENT X — l'aura de faction, jusqu'ici forfaitaire à +1/+1, devient
// scalable. X est un SEUL nombre, ajouté à la fois à l'attaque et à la défense
// des alliés de même faction.
//
// Le risque propre à ce genre de conversion est la RÉTROCOMPATIBILITÉ : les 50
// cartes déjà en base ne déclarent aucun X. Elles doivent continuer à donner
// +1/+1 exactement, et à l'ÉCRIRE — le piège vécu sur Régénération X était
// d'afficher la lettre « X » au lieu du chiffre appliqué.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeKeyword } from "./keyword-display";
import { applyKeywordValueToLabel, KEYWORD_LABELS } from "./keyword-labels";
import { KEYWORD_DEFAULT_X } from "./abilities";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, CardInstance, GameAction, GameState } from "./types";

/** Capitaine porteur de Commandement, avec ou sans X déclaré. */
function capitaine(x?: number, over: Partial<Card> = {}): CardInstance {
  return mkInstance(mkCard({
    name: "Capitaine", mana_cost: 0, attack: 2, health: 3, faction: "Humains",
    keywords: ["commandement"] as never,
    ...(x != null
      ? { capabilities: [{ uid: "cw_0", targets: [], trigger: "automatic", effectKind: "immediate", abilityId: "commandement", params: { x } }] as never }
      : {}),
    ...over,
  }));
}

const soldat = (faction = "Humains") =>
  mkInstance(mkCard({ name: `Soldat-${faction}`, mana_cost: 0, attack: 1, health: 1, faction }));

/** Pose le capitaine depuis la main : c'est `playCard` qui déclenche le
 *  recalcul d'auras, pas une écriture directe sur le plateau. */
function poser(s: GameState, cap: CardInstance): GameState {
  s.players[0].hand.push(cap);
  return applyAction(s, { type: "play_card", cardInstanceId: cap.instanceId } as GameAction);
}

describe("Commandement X — l'aura suit le X déclaré", () => {
  it("X = 3 donne +3/+3 aux alliés de même faction", () => {
    const s = mkState();
    s.players[0].board.push(soldat());

    const allie = poser(s, capitaine(3)).players[0].board.find(c => c.card.name === "Soldat-Humains")!;
    expect(allie.currentAttack).toBe(1 + 3);
    expect(allie.maxHealth).toBe(1 + 3);
  });

  it("le porteur ne se buffe pas lui-même", () => {
    const s = mkState();
    const cap = capitaine(3);
    const apres = poser(s, cap).players[0].board.find(c => c.instanceId === cap.instanceId)!;
    expect(apres.currentAttack).toBe(2);
  });

  it("n'atteint pas une autre faction", () => {
    const s = mkState();
    s.players[0].board.push(soldat("Elfes"));

    const elfe = poser(s, capitaine(3)).players[0].board.find(c => c.card.name === "Soldat-Elfes")!;
    expect(elfe.currentAttack).toBe(1);
    expect(elfe.maxHealth).toBe(1);
  });

  it("deux porteurs d'amplitudes DIFFÉRENTES s'additionnent", () => {
    // Le X se lit sur CHAQUE porteur : 1 + 3 = +4/+4, et non deux fois le X du
    // premier trouvé. C'est le défaut qu'une lecture unique par plateau
    // produirait, et il serait invisible tant que les deux X sont égaux.
    const s = mkState();
    s.players[0].board.push(soldat(), capitaine(1));

    const allie = poser(s, capitaine(3)).players[0].board.find(c => c.card.name === "Soldat-Humains")!;
    expect(allie.currentAttack).toBe(1 + 4);
    expect(allie.maxHealth).toBe(1 + 4);
  });

  it("l'aura est RÉVERSIBLE : la mort du porteur reprend le bonus", () => {
    const s = mkState();
    s.players[0].board.push(soldat());
    const cap = capitaine(3);
    const apres = poser(s, cap);

    // On retire le capitaine et on force un recalcul par une action neutre.
    apres.players[0].board = apres.players[0].board.filter(c => c.instanceId !== cap.instanceId);
    const fin = applyAction(apres, { type: "end_turn" } as GameAction);

    const allie = fin.players[0].board.find(c => c.card.name === "Soldat-Humains")!;
    expect(allie.currentAttack).toBe(1);
    expect(allie.maxHealth).toBe(1);
  });
});

describe("Commandement X — les cartes d'AVANT la conversion", () => {
  it("sans X déclaré, l'aura vaut +1/+1 — l'ancien forfait, au point près", () => {
    // Les 50 cartes en base sont exactement dans ce cas : une capability
    // `automatic` sans `params`. Aucune migration ne doit être nécessaire.
    const s = mkState();
    s.players[0].board.push(soldat());

    const allie = poser(s, capitaine()).players[0].board.find(c => c.card.name === "Soldat-Humains")!;
    expect(allie.currentAttack).toBe(2);
    expect(allie.maxHealth).toBe(2);
  });

  it("le X implicite est déclaré, pas codé en dur dans le résolveur", () => {
    expect(KEYWORD_DEFAULT_X.commandement).toBe(1);
  });

  it("le LIBELLÉ affiche « Commandement 1 », jamais la lettre X", () => {
    // Le piège de Régénération X : `applyKeywordValueToLabel` peignait le
    // libellé brut quand aucun X n'était saisi.
    expect(applyKeywordValueToLabel("commandement", KEYWORD_LABELS.commandement, undefined))
      .toBe("Commandement 1");
    expect(applyKeywordValueToLabel("commandement", KEYWORD_LABELS.commandement, 4))
      .toBe("Commandement 4");
  });

  it("la DESCRIPTION affiche « +1/+1 », jamais « +X/+X »", () => {
    const carte = mkCard({ faction: "Humains" });
    expect(describeKeyword("commandement", { card: carte })).toContain("+1/+1");
    expect(describeKeyword("commandement", { card: carte })).not.toContain("+X/+X");
    expect(describeKeyword("commandement", { card: carte, x: 3 })).toContain("+3/+3");
  });
});

describe("Commandement X — barème de la forge", () => {
  it("X = 1 coûte exactement l'ancien forfait (13 points)", async () => {
    const { KEYWORDS } = await import("@/lib/card-engine/constants");
    const def = KEYWORDS["Commandement X"];
    expect(def, "le libellé de la forge doit avoir suivi le renommage").toBeDefined();
    // Formule de la forge : cost + costPerX * (X - 1).
    expect(def.cost + def.costPerX * 0).toBe(13);
    expect(def.scalable).toBe(true);
  });
});
