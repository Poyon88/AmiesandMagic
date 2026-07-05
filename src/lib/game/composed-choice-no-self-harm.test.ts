// Régression : un effet composé OFFENSIF « au choix » résolu SANS cible
// désignée (repli auto) ne doit jamais frapper le camp de son lanceur.
//
// Bug d'origine (Jeune Archère Sylvain) : son on_play « inflige 1 dégât à une
// unité (side any, choix) » SUSPEND la pile en attendant une cible. Si le tour
// du propriétaire se termine sans que le choix soit résolu (ex. timeout), la
// frame suspendue FUITE au tour adverse ; quand l'adversaire joue une carte,
// drainStack la résout, mais comme ce n'est plus le tour du propriétaire le
// repli déterministe visait `owner.board[0]` = la source elle-même → la 1/1
// se suicidait au cimetière.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import type { Capability, ComposedEffect } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function composedCap(trigger: Capability["trigger"], composed: ComposedEffect): Capability {
  return { uid: `cap_${Math.random().toString(36).slice(2, 8)}`, trigger, effectKind: "immediate", abilityId: "_composed", composed };
}

const ARCHERE_ONPLAY: ComposedEffect = {
  content: "deal_damage", magnitude: { x: 1 },
  target: { entity: "unit", side: "any", count: 1, location: "board", designation: "choice" },
};

describe("effet « au choix » offensif — repli sans auto-suicide", () => {
  it("Option B : un choix non résolu FIZZLE à la fin du tour et ne fuite pas", () => {
    const s = mkState();
    s.players[0].deck.push(mkInstance(mkCard({}))); // évite la fatigue
    s.players[1].deck.push(mkInstance(mkCard({})));

    const archere = mkInstance(mkCard({ name: "Jeune Archère", attack: 1, health: 1, capabilities: [composedCap("on_play", ARCHERE_ONPLAY)] }));
    archere.hasSummoningSickness = true;
    s.players[0].hand.push(archere);

    // P0 joue l'Archère SANS cible → le choix suspend (seule cible = elle-même).
    const afterPlay = applyAction(s, { type: "play_card", cardInstanceId: archere.instanceId });
    expect(afterPlay.players[0].board.find((c) => c.instanceId === archere.instanceId)).toBeTruthy();
    expect(afterPlay.effectStack?.length ?? 0).toBe(1); // frame suspendue

    // P0 finit son tour → Option B : la frame suspendue FIZZLE (ne fuite pas).
    const afterEnd = applyAction(afterPlay, { type: "end_turn" });
    expect(afterEnd.currentPlayerIndex).toBe(1);
    expect(afterEnd.effectStack?.length ?? 0).toBe(0); // pile vidée : plus de frame fantôme

    // P1 joue une carte → aucune frame fuitée à drainer : rien ne se passe.
    const filler = mkInstance(mkCard({ name: "Filler", attack: 1, health: 1 }));
    filler.hasSummoningSickness = true;
    afterEnd.players[1].hand.push(filler);
    const afterP1 = applyAction(afterEnd, { type: "play_card", cardInstanceId: filler.instanceId });

    // L'Archère (lanceur) survit intacte, et la créature de P1 n'est pas touchée
    // (l'effet a fizzlé, il n'a été ni redirigé ni retardé au tour adverse).
    expect(afterP1.players[0].graveyard.find((c) => c.instanceId === archere.instanceId)).toBeFalsy();
    expect(afterP1.players[0].board.find((c) => c.instanceId === archere.instanceId)?.currentHealth).toBe(1);
    expect(afterP1.players[1].board.find((c) => c.instanceId === filler.instanceId)?.currentHealth).toBe(1);
  });
});
