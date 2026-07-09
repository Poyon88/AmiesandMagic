// Relancer X : le moteur enregistre chaque sort relancé dans state.recastEvents
// {card, targetIds} pour que le store l'anime comme un sort joué depuis la main
// (overlay + flèches vers ses cibles aléatoires). Indice d'animation transitoire
// → exclu du hash de synchro.
import { describe, expect, it } from "vitest";
import { playCard } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";

function impactSpellCard() {
  return mkCard({
    name: "Impact", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "impact", amount: 2 }] as never,
  });
}

function relancerSpell(x = 1) {
  return mkInstance(mkCard({
    name: "Écho", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "relancer", amount: x }] as never,
  }));
}

describe("Relancer — enregistrement des sorts relancés pour l'animation", () => {
  it("recastEvents contient la carte relancée + sa cible (choisie aléatoirement)", () => {
    const s = mkState();
    s.rngState = 5;
    // Une cible ennemie pour que le sort ciblé "any" ait un candidat créature.
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 0, health: 5 })));
    // Historique : un sort Impact (ciblé) précédemment lancé.
    s.players[0].spellHistory = [{ card: impactSpellCard(), targetMap: {} }];

    const relancer = relancerSpell(1);
    s.players[0].hand.push(relancer);
    const next = playCard(s, { type: "play_card", cardInstanceId: relancer.instanceId });

    expect(next.recastEvents?.length).toBe(1);
    expect(next.recastEvents![0].card.name).toBe("Impact");
    // Une vraie cible enregistrée (instanceId de créature OU sentinelle héros).
    expect(next.recastEvents![0].targetIds.length).toBe(1);
    const tid = next.recastEvents![0].targetIds[0];
    expect(typeof tid).toBe("string");
    expect(tid.length).toBeGreaterThan(0);
  });

  it("Relancer 2 : deux entrées, dans l'ordre de relance (plus récent d'abord)", () => {
    const s = mkState();
    s.rngState = 9;
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 0, health: 9 })));
    const a = mkCard({ name: "SortA", card_type: "spell", attack: null, health: null, spell_keywords: [{ id: "impact", amount: 1 }] as never });
    const b = mkCard({ name: "SortB", card_type: "spell", attack: null, health: null, spell_keywords: [{ id: "impact", amount: 1 }] as never });
    s.players[0].spellHistory = [{ card: a, targetMap: {} }, { card: b, targetMap: {} }]; // B est le plus récent

    const relancer = relancerSpell(2);
    s.players[0].hand.push(relancer);
    const next = playCard(s, { type: "play_card", cardInstanceId: relancer.instanceId });

    expect(next.recastEvents?.map((r) => r.card.name)).toEqual(["SortB", "SortA"]);
  });

  it("recastEvents est exclu du hash de synchro (indice d'animation)", () => {
    const a = mkState();
    const b = mkState();
    b.recastEvents = [{ card: impactSpellCard(), targetIds: ["__hero_1__"] }];
    expect(syncHash(a)).toBe(syncHash(b));
  });
});
