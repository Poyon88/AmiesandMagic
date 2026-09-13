// Déclencheur composé « À la fin du tour, tant qu'elle est en main » : l'effet
// part depuis la MAIN du joueur sortant, sur l'instance en main. Usage : une
// créature qui se renforce à chaque fin de tour passée en main, et qui emporte
// ses gains en jeu.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { composedBadge, describeComposedCap } from "./composed-display";
import type { Capability, CardInstance } from "./types";

const capMain = (): Capability => ({
  uid: "cx_0", trigger: "on_end_of_turn_in_hand", effectKind: "immediate", abilityId: "_composed",
  composed: { content: "buff", magnitude: { x: 1, y: 1 }, target: { entity: "self", side: "ally", count: 1, location: "board", designation: "automatic" } },
});
function patiente(): CardInstance {
  return mkInstance(mkCard({ name: "Patiente", mana_cost: 0, attack: 1, health: 1, capabilities: [capMain()] }));
}

describe("fin de tour, en main", () => {
  it("la carte en main se renforce à CHAQUE fin de tour de son contrôleur, pas à celle de l'adversaire", () => {
    const s = mkState();
    const c = patiente();
    s.players[0].hand.push(c);

    let st = applyAction(s, { type: "end_turn" }); // fin du tour de P1 → +1/+1
    let enMain = st.players[0].hand.find((k) => k.instanceId === c.instanceId)!;
    expect([enMain.currentAttack, enMain.maxHealth]).toEqual([2, 2]);
    expect([enMain.card.attack, enMain.card.health]).toEqual([2, 2]);

    st = applyAction(st, { type: "end_turn" }); // fin du tour de P2 → rien pour P1
    enMain = st.players[0].hand.find((k) => k.instanceId === c.instanceId)!;
    expect([enMain.currentAttack, enMain.maxHealth]).toEqual([2, 2]);

    st = applyAction(st, { type: "end_turn" }); // fin du tour de P1 → +1/+1
    enMain = st.players[0].hand.find((k) => k.instanceId === c.instanceId)!;
    expect([enMain.currentAttack, enMain.maxHealth]).toEqual([3, 3]);
  });

  it("les gains accumulés en main sont emportés en jeu, et l'effet cesse une fois posée", () => {
    const s = mkState();
    const c = patiente();
    s.players[0].hand.push(c);
    let st = applyAction(s, { type: "end_turn" });
    st = applyAction(st, { type: "end_turn" }); // retour à P1
    st = applyAction(st, { type: "play_card", cardInstanceId: c.instanceId });
    const posee = st.players[0].board.find((k) => k.instanceId === c.instanceId)!;
    expect([posee.currentAttack, posee.currentHealth]).toEqual([2, 2]);

    st = applyAction(st, { type: "end_turn" }); // sur le plateau : le déclencheur « en main » ne part plus
    const apres = st.players[0].board.find((k) => k.instanceId === c.instanceId)!;
    expect([apres.currentAttack, apres.currentHealth]).toEqual([2, 2]);
  });

  it("s'annonce « Fin de tour · en main », couleur de la fin de tour ; le texte reste celui de l'effet", () => {
    // Les textes de carte n'annoncent plus le déclencheur (la couleur et le
    // badge le portent) : c'est donc le BADGE qui dit « en main ».
    const cap = capMain();
    expect(composedBadge(cap)?.label).toBe("Fin de tour · en main");
    expect(composedBadge(cap)?.color).toBe(composedBadge({ ...cap, trigger: "on_end_of_turn" })?.color);
    expect(describeComposedCap(cap)).toBe("S'octroie +1/+1.");
  });
});
