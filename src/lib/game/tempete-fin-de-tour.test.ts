// Tempête X en mode « fin de tour », sur une créature RANIMÉE le tour même.
//
// Signalé le 2026-08-28 : « Javelinière des Clairières » (Tempête 2 fin de tour
// + Soleil 1) ranimée par « Hiérophante des Sabots Éternels » (Exhumation 4)
// n'aurait pas infligé ses dégâts ce tour-là, mais bien au tour suivant.
//
// Ces tests ont été écrits pour reproduire ce défaut. Ils NE LE REPRODUISENT
// PAS : l'exhumation met bien la créature en jeu avec ses `keyword_instances`,
// et `buildEndOfTurnQueue` la prend — avec ou sans choix au cimetière.
//
// Ce qu'ils verrouillent à la place, et qui explique le symptôme : Tempête ne
// frappe QUE des créatures ennemies, jamais le héros. Plateau adverse vide =
// aucun effet, en silence. Le tour suivant, l'adversaire avait posé une
// créature — d'où l'impression d'un déclencheur capricieux.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

const javeliniere = () => mkInstance(mkCard({
  name: "Javelinière des Clairières", mana_cost: 3, attack: 2, health: 3,
  keywords: ["tempete", "soleil"],
  keyword_instances: [{ x: 2, id: "tempete", mode: "end_of_turn" }, { x: 1, id: "soleil" }],
} as never));

const hierophante = () => mkInstance(mkCard({
  name: "Hiérophante des Sabots Éternels", mana_cost: 6, attack: 3, health: 2,
  keywords: ["exhumation"], keyword_instances: [{ x: 4, id: "exhumation" }],
  capabilities: [{ uid: "cw_1", params: { x: 4 }, targets: [], trigger: "on_play", abilityId: "exhumation", effectKind: "immediate" }],
} as never));

const gardien = () => mkInstance(mkCard({ name: "Gardien des Forges", attack: 5, health: 6 }));

/** Deck adverse non vide : sans lui, la pioche de début de tour inflige de la
 *  FATIGUE au héros et l'on croirait que Tempête l'a frappé. */
function etat() {
  const s = mkState();
  s.players[1].deck.push(mkInstance(mkCard({ name: "Pioche" })));
  return s;
}

describe("Tempête fin de tour sur une créature ranimée", () => {
  it("se déclenche le tour même de l'exhumation", () => {
    const s = etat();
    const jav = javeliniere();
    s.players[0].graveyard.push(jav);
    const h = hierophante();
    s.players[0].hand.push(h);
    const cible = gardien();
    s.players[1].board.push(cible);

    const pose = applyAction(s, { type: "play_card", cardInstanceId: h.instanceId } as never);
    expect(pose.players[0].board.some((c) => c.card.name === jav.card.name)).toBe(true);

    const fin = applyAction(pose, { type: "end_turn" });
    expect(fin.players[1].board.find((c) => c.instanceId === cible.instanceId)!.currentHealth).toBe(4);
  });

  it("se déclenche aussi quand le cimetière offrait un CHOIX", () => {
    const s = etat();
    const jav = javeliniere();
    s.players[0].graveyard.push(mkInstance(mkCard({ name: "Autre", mana_cost: 2 })), jav);
    const h = hierophante();
    s.players[0].hand.push(h);
    const cible = gardien();
    s.players[1].board.push(cible);

    const pose = applyAction(s, {
      type: "play_card", cardInstanceId: h.instanceId, graveyardTargetInstanceId: jav.instanceId,
    } as never);
    const fin = applyAction(pose, { type: "end_turn" });
    expect(fin.players[1].board.find((c) => c.instanceId === cible.instanceId)!.currentHealth).toBe(4);
  });

  it("ne fait RIEN, et n'atteint jamais le héros, si le plateau adverse est vide", () => {
    // L'explication du symptôme rapporté : l'absence de dégâts n'est pas un
    // déclencheur manqué, c'est une absence de cible.
    const s = etat();
    s.players[0].graveyard.push(javeliniere());
    const h = hierophante();
    s.players[0].hand.push(h);

    const pose = applyAction(s, { type: "play_card", cardInstanceId: h.instanceId } as never);
    const pvAvant = pose.players[1].hero.hp;
    const fin = applyAction(pose, { type: "end_turn" });

    expect(fin.players[1].hero.hp).toBe(pvAvant);
    expect(fin.players[1].board).toHaveLength(0);
  });

  it("Soleil 1 majore Tempête quand la créature est la PREMIÈRE carte du tour", () => {
    // Vérifié en passant : posée en tête de tour, elle inflige 3 et non 2 —
    // comportement voulu de l'amplificateur de tempo, à ne pas confondre avec
    // un dérèglement de Tempête.
    const s = etat();
    const jav = javeliniere();
    s.players[0].hand.push(jav);
    const cible = gardien();
    s.players[1].board.push(cible);

    const pose = applyAction(s, { type: "play_card", cardInstanceId: jav.instanceId } as never);
    const fin = applyAction(pose, { type: "end_turn" });
    expect(fin.players[1].board.find((c) => c.instanceId === cible.instanceId)!.currentHealth).toBe(3);
  });
});
