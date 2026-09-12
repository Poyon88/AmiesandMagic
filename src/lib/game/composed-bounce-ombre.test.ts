// Ombre (et Invisible) sont des protections de CIBLAGE, pas des immunités.
//
// Vu en partie sur « Les Vents Renversent la Bataille » (renvoie en main
// 3 unités ennemies AU HASARD) : les trois unités adverses étaient dans l'ombre,
// aucune n'est partie. Le tirage composé ne filtre pas le pool (juste), mais le
// résolveur par unité (resolveRemontee → canBeRemonteed) ré-appliquait les
// règles du ciblage à un effet qui n'avait désigné personne.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, TargetSpec } from "./types";

const cible = (over: Partial<TargetSpec> = {}): TargetSpec => ({
  entity: "unit", side: "enemy", count: 3, location: "board", designation: "random", ...over,
});

function sort(content: ComposedEffect["content"], target: TargetSpec): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content, target, magnitude: { x: 0 } },
  }];
  return mkInstance(mkCard({ name: "Les Vents", card_type: "spell", attack: null, health: null, capabilities: caps as never }));
}

const tapie = (name: string, kws: string[] = ["ombre"]) =>
  mkInstance(mkCard({ name, attack: 2, health: 2, keywords: kws as never }));

function lancer(s: ReturnType<typeof mkState>, spell: CardInstance, targetMap?: Record<string, string>) {
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId, ...(targetMap ? { targetMap } : {}) });
}
const nomsEnMain = (s: ReturnType<typeof mkState>) => s.players[1].hand.map(c => c.card.name).sort();
const nomsAuPlateau = (s: ReturnType<typeof mkState>) => s.players[1].board.map(c => c.card.name).sort();

describe("renvoi composé « au hasard » / « toutes » contre l'Ombre", () => {
  it("au hasard : trois unités dans l'ombre repartent toutes en main", () => {
    const s = mkState();
    s.players[1].board.push(tapie("Œil"), tapie("Lethariel"), tapie("Dame"));

    const apres = lancer(s, sort("bounce", cible()));

    expect(nomsAuPlateau(apres)).toEqual([]);
    expect(nomsEnMain(apres)).toEqual(["Dame", "Lethariel", "Œil"]);
  });

  it("toutes : même chose, Invisible compris — seul Ancré tient", () => {
    const s = mkState();
    s.players[1].board.push(tapie("Ombre"), tapie("Spectre", ["invisible"]), tapie("Ancrée", ["ancre"]));

    const apres = lancer(s, sort("bounce", cible({ count: "all", designation: "automatic" })));

    expect(nomsAuPlateau(apres)).toEqual(["Ancrée"]);
    expect(nomsEnMain(apres)).toEqual(["Ombre", "Spectre"]);
  });

  it("au choix : une unité dans l'ombre reste inciblable, le clic ne fait rien", () => {
    const s = mkState();
    const ombre = tapie("Tapie");
    s.players[1].board.push(ombre);

    const apres = lancer(s, sort("bounce", cible({ count: 1, designation: "choice" })), { cx_0: ombre.instanceId });

    expect(nomsAuPlateau(apres)).toEqual(["Tapie"]);
  });

  it("retour différé au hasard : l'unité dans l'ombre part sous le deck", () => {
    const s = mkState();
    s.players[1].board.push(tapie("Tapie"));
    const tailleDeck = s.players[1].deck.length;

    const apres = lancer(s, sort("retour_differe", cible({ count: 1 })));

    expect(nomsAuPlateau(apres)).toEqual([]);
    expect(apres.players[1].deck.length).toBe(tailleDeck + 1);
    expect(apres.players[1].deck[apres.players[1].deck.length - 1].card.name).toBe("Tapie");
  });
});
