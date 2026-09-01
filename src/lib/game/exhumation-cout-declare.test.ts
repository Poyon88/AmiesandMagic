// Exhumation X — le plafond de coût doit venir du X DÉCLARÉ, pas du coût de la
// source.
//
// Signalé le 2026-09-01 : « Javelinière des Clairières » (coût 3) ranimée alors
// que l'Exhumation en jeu était une Exhumation 2.
//
// Cause : deux des quatre sites qui calculent le plafond ignoraient purement et
// simplement le X de la carte et le dérivaient de `mana_cost - 1` — le chemin
// d'ENTRÉE EN JEU (résolution) et son fournisseur de cibles
// (`getGraveyardTargets`). Sur une source à 6 mana, une « Exhumation 2 »
// ranimait donc jusqu'à 5. La dérivation reste un REPLI légitime pour les
// cartes anciennes qui ne déclarent aucune valeur, d'où les deux familles de
// tests ci-dessous.
import { describe, expect, it } from "vitest";
import { applyAction, getGraveyardTargets } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

const JAV = "Javelinière des Clairières";

const javeliniere = () => mkInstance(mkCard({
  name: JAV, mana_cost: 3, attack: 2, health: 3,
} as never));

/** Source COÛTEUSE (6) qui ne déclare qu'« Exhumation 2 » : c'est l'écart entre
 *  les deux nombres qui rend le défaut visible. */
const exhumateurDeclare = () => mkInstance(mkCard({
  name: "Exhumateur déclaré", mana_cost: 6, attack: 1, health: 1,
  keywords: ["exhumation"], keyword_instances: [{ x: 2, id: "exhumation" }],
  capabilities: [{
    uid: "cw_1", params: { x: 2 }, targets: [],
    trigger: "on_play", abilityId: "exhumation", effectKind: "immediate",
  }],
} as never));

/** Source LEGACY : aucune valeur déclarée nulle part. Le repli `coût - 1`
 *  s'applique — 4 pour une carte à 5 mana. */
const exhumateurLegacy = () => mkInstance(mkCard({
  name: "Exhumateur legacy", mana_cost: 5, attack: 1, health: 1,
  keywords: ["exhumation"],
} as never));

function avecJaveliniereAuCimetiere(source: ReturnType<typeof javeliniere>) {
  const s = mkState();
  const jav = javeliniere();
  s.players[0].graveyard.push(jav);
  s.players[0].hand.push(source);
  return { s, jav };
}

describe("Exhumation X à l'entrée en jeu : plafond = X déclaré", () => {
  it("le picker ne propose pas une créature de coût 3 pour une Exhumation 2", () => {
    const src = exhumateurDeclare();
    const { s, jav } = avecJaveliniereAuCimetiere(src);
    expect(getGraveyardTargets(s, src.card)).not.toContain(jav.instanceId);
  });

  it("la résolution refuse une créature de coût 3 pour une Exhumation 2", () => {
    const src = exhumateurDeclare();
    const { s, jav } = avecJaveliniereAuCimetiere(src);
    const apres = applyAction(s, {
      type: "play_card", cardInstanceId: src.instanceId,
      graveyardTargetInstanceId: jav.instanceId,
    } as never);
    expect(apres.players[0].board.some(c => c.card.name === JAV)).toBe(false);
    // Et elle reste au cimetière : refus, pas disparition.
    expect(apres.players[0].graveyard.some(c => c.card.name === JAV)).toBe(true);
  });

  it("accepte ce qui tient sous le X déclaré", () => {
    const src = exhumateurDeclare();
    const s = mkState();
    const petit = mkInstance(mkCard({ name: "Éclaireur", mana_cost: 2, attack: 1, health: 1 } as never));
    s.players[0].graveyard.push(petit);
    s.players[0].hand.push(src);
    expect(getGraveyardTargets(s, src.card)).toContain(petit.instanceId);
    const apres = applyAction(s, {
      type: "play_card", cardInstanceId: src.instanceId,
      graveyardTargetInstanceId: petit.instanceId,
    } as never);
    expect(apres.players[0].board.some(c => c.card.name === "Éclaireur")).toBe(true);
  });
});

describe("Exhumation sans X déclaré : repli `coût - 1` conservé", () => {
  it("une source legacy à 5 mana ranime encore jusqu'à 4", () => {
    const src = exhumateurLegacy();
    const { s, jav } = avecJaveliniereAuCimetiere(src);
    expect(getGraveyardTargets(s, src.card)).toContain(jav.instanceId);
    const apres = applyAction(s, {
      type: "play_card", cardInstanceId: src.instanceId,
      graveyardTargetInstanceId: jav.instanceId,
    } as never);
    expect(apres.players[0].board.some(c => c.card.name === JAV)).toBe(true);
  });
});
