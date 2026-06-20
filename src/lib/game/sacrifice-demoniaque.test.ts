// Sacrifice démoniaque X : à la mort de la créature qui le porte (quelle que
// soit sa race), répartit X réductions de -1 mana parmi les Démons de la main
// de SON contrôleur. Re-tirage parmi les réductibles (coût > 1), surplus perdu,
// jamais sous 1 mana, réduction permanente.
import { describe, expect, it } from "vitest";
import { attack } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

const demon = (mana: number, name: string) =>
  mkInstance(mkCard({ name, mana_cost: mana, race: "Démons" }));

/** Place une créature « sacrifice démoniaque X » prête à attaquer chez le
 *  joueur 0, et un gros défenseur chez le joueur 1 qui la tuera par riposte.
 *  Renvoie l'état et l'action d'attaque. */
function lethalSetup(state: ReturnType<typeof mkState>, x: number) {
  const sac = mkInstance(mkCard({ attack: 1, health: 1, keywords: ["sacrifice_demoniaque"] }));
  sac.sacrificeDemoniaqueX = x; // ce que la mise en cache à l'invocation aurait fait
  state.players[0].board.push(sac);
  const blocker = mkInstance(mkCard({ attack: 5, health: 5 })); // survit (5-1) et riposte 5 → tue sac
  state.players[1].board.push(blocker);
  return { type: "attack" as const, attackerInstanceId: sac.instanceId, targetInstanceId: blocker.instanceId };
}

const reduc = (state: ReturnType<typeof mkState>, p: number, id: string) =>
  state.players[p].hand.find((c) => c.instanceId === id)!.manaCostReduction ?? 0;

describe("Sacrifice démoniaque X", () => {
  it("répartit X réductions parmi les Démons en main du contrôleur", () => {
    const s = mkState();
    const d1 = demon(5, "D1"), d2 = demon(4, "D2");
    const human = mkInstance(mkCard({ name: "H", mana_cost: 5, race: "Humains" }));
    s.players[0].hand.push(d1, d2, human);
    const action = lethalSetup(s, 3);

    const next = attack(s, action);

    // 3 points placés au total sur les deux Démons (capacité 4+3 ≥ 3).
    expect(reduc(next, 0, d1.instanceId) + reduc(next, 0, d2.instanceId)).toBe(3);
    // Le non-Démon n'est jamais touché.
    expect(reduc(next, 0, human.instanceId)).toBe(0);
    // Aucun Démon sous 1 mana.
    expect(5 - reduc(next, 0, d1.instanceId)).toBeGreaterThanOrEqual(1);
    expect(4 - reduc(next, 0, d2.instanceId)).toBeGreaterThanOrEqual(1);
  });

  it("ne fait jamais passer un Démon sous 1 mana (surplus perdu)", () => {
    const s = mkState();
    const d = demon(2, "D"); // réductible d'au plus 1 (2 → 1)
    s.players[0].hand.push(d);
    const action = lethalSetup(s, 5); // 5 points, mais un seul applicable

    const next = attack(s, action);

    expect(reduc(next, 0, d.instanceId)).toBe(1);
  });

  it("ne fait rien sans Démon en main", () => {
    const s = mkState();
    const h1 = mkInstance(mkCard({ name: "H1", mana_cost: 4, race: "Humains" }));
    s.players[0].hand.push(h1);
    const action = lethalSetup(s, 3);

    const next = attack(s, action);

    expect(reduc(next, 0, h1.instanceId)).toBe(0);
  });

  it("ne réduit que la main du contrôleur, pas celle de l'adversaire", () => {
    const s = mkState();
    const mine = demon(5, "mine");
    const theirs = demon(5, "theirs");
    s.players[0].hand.push(mine);
    s.players[1].hand.push(theirs);
    const action = lethalSetup(s, 2);

    const next = attack(s, action);

    expect(reduc(next, 0, mine.instanceId)).toBe(2);
    expect(reduc(next, 1, theirs.instanceId)).toBe(0);
  });
});
