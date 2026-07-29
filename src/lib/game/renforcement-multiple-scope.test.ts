// Renforcement multiple SANS race ni clan : le bonus s'applique à TOUTES les
// créatures alliées.
//
// Le repli du filtre était `false` — c'est-à-dire « personne » : une carte sans
// cible désignée ne buffait rien. C'est ce trou que masquait la validation
// serveur, qui exigeait une race ou un clan à l'enregistrement.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeKeyword } from "./keyword-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

/** Porteur du mot-clé à l'entrée en jeu, avec ou sans restriction. */
function booster(over: { race?: string; clan?: string } = {}): CardInstance {
  return mkInstance(mkCard({
    name: "Porte-Étendard", mana_cost: 3, attack: 1, health: 1,
    keywords: ["renforcement_multiple"] as never,
    keyword_instances: [{ id: "renforcement_multiple", x: 2, y: 1, ...over }] as never,
  }));
}

const statsOf = (s: GameState, name: string) => {
  const c = s.players[0].board.find((x) => x.card.name === name)!;
  return [c.currentAttack, c.currentHealth];
};

function play(s: GameState, ci: CardInstance): GameState {
  s.players[0].hand.push(ci);
  return applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId });
}

describe("Renforcement multiple sans restriction", () => {
  it("buffe TOUTES les créatures alliées", () => {
    const s = mkState();
    s.players[0].board.push(
      mkInstance(mkCard({ name: "Nain", race: "Nains", attack: 1, health: 1 })),
      mkInstance(mkCard({ name: "Elfe", race: "Elfes", attack: 1, health: 1 })),
    );

    const next = play(s, booster());

    expect(statsOf(next, "Nain")).toEqual([3, 2]);
    expect(statsOf(next, "Elfe")).toEqual([3, 2]);
  });

  it("ne touche pas le camp adverse", () => {
    const s = mkState();
    s.players[1].board.push(mkInstance(mkCard({ name: "Ennemie", attack: 1, health: 1 })));

    const next = play(s, booster());

    const enemy = next.players[1].board[0];
    expect([enemy.currentAttack, enemy.currentHealth]).toEqual([1, 1]);
  });

  it("ne se buffe pas elle-même", () => {
    const s = mkState();
    const next = play(s, booster());
    expect(statsOf(next, "Porte-Étendard")).toEqual([1, 1]);
  });

  it("une race renseignée reste restrictive", () => {
    const s = mkState();
    s.players[0].board.push(
      mkInstance(mkCard({ name: "Nain", race: "Nains", attack: 1, health: 1 })),
      mkInstance(mkCard({ name: "Elfe", race: "Elfes", attack: 1, health: 1 })),
    );

    const next = play(s, booster({ race: "Nains" }));

    expect(statsOf(next, "Nain")).toEqual([3, 2]);
    expect(statsOf(next, "Elfe")).toEqual([1, 1]);
  });

  it("le texte de carte reflète la portée réelle", () => {
    const K = "renforcement_multiple" as never;
    expect(describeKeyword(K, { instance: { id: K } as never, x: 2, y: 1 }))
      .toBe("+2/+1 à vos créatures.");
    expect(describeKeyword(K, { instance: { id: K, race: "Nains" } as never, x: 2, y: 1 }))
      .toBe("+2/+1 à vos créatures de race Nains.");
  });
});
