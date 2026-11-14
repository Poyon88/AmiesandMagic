// LIAISON DE VIE — « partage les dégâts subis avec le héros adverse ».
//
// Bug constaté en partie : la capacité ne comptait que lorsque la créature
// ÉTAIT ATTAQUÉE, avec l'ATK brute de l'attaquant. Elle ne faisait donc rien
// quand la porteuse attaquait elle-même (riposte encaissée) ou prenait des
// dégâts hors combat, et blessait le héros même si un Bouclier avait tout
// absorbé. Désormais : tout dégât RÉELLEMENT subi, d'où qu'il vienne.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameAction, GameState, Keyword } from "./types";

function unite(name: string, attack: number, health: number, keywords: Keyword[] = []): CardInstance {
  const c = mkInstance(mkCard({ name, attack, health, keywords }));
  c.hasSummoningSickness = false;
  return c;
}
const attaquer = (s: GameState, a: CardInstance, cible: CardInstance) =>
  applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: cible.instanceId } as GameAction);

describe("Liaison de vie", () => {
  it("attaquée : le héros de l'attaquant subit les dégâts qu'elle encaisse", () => {
    const s = mkState();
    const a = unite("Attaquant", 3, 10);
    const liee = unite("Liée", 0, 10, ["liaison_de_vie"]);
    s.players[0].board.push(a);
    s.players[1].board.push(liee);
    const pv = s.players[0].hero.hp;
    const st = attaquer(s, a, liee);
    expect(st.players[0].hero.hp).toBe(pv - 3);
    expect(st.players[1].hero.hp).toBe(s.players[1].hero.hp);
  });

  it("attaquante : la riposte qu'elle encaisse est partagée avec le héros adverse", () => {
    const s = mkState();
    const liee = unite("Liée", 1, 10, ["liaison_de_vie"]);
    const mur = unite("Mur", 4, 10);
    s.players[0].board.push(liee);
    s.players[1].board.push(mur);
    const pv = s.players[1].hero.hp;
    expect(attaquer(s, liee, mur).players[1].hero.hp).toBe(pv - 4);
  });

  it("dégâts NETS : l'Armure divise ce qui est partagé, un Bouclier qui absorbe tout ne partage rien", () => {
    const s = mkState();
    const a = unite("Attaquant", 4, 10);
    const armuree = unite("Armurée", 0, 10, ["liaison_de_vie", "armure"]);
    s.players[0].board.push(a);
    s.players[1].board.push(armuree);
    const pv = s.players[0].hero.hp;
    expect(attaquer(s, a, armuree).players[0].hero.hp).toBe(pv - 2);

    const s2 = mkState();
    const b = unite("Attaquant", 4, 10);
    const protegee = unite("Protégée", 0, 10, ["liaison_de_vie"]);
    protegee.hasDivineShield = true;
    s2.players[0].board.push(b);
    s2.players[1].board.push(protegee);
    const pv2 = s2.players[0].hero.hp;
    expect(attaquer(s2, b, protegee).players[0].hero.hp).toBe(pv2);
  });

  it("deux créatures liées qui s'affrontent : chaque héros prend ce que SA créature adverse encaisse", () => {
    const s = mkState();
    const x = unite("X", 2, 10, ["liaison_de_vie"]);
    const y = unite("Y", 3, 10, ["liaison_de_vie"]);
    s.players[0].board.push(x);
    s.players[1].board.push(y);
    const [pv0, pv1] = [s.players[0].hero.hp, s.players[1].hero.hp];
    const st = attaquer(s, x, y);
    expect(st.players[0].hero.hp).toBe(pv0 - 2); // Y encaisse 2 ⇒ héros de X
    expect(st.players[1].hero.hp).toBe(pv1 - 3); // X encaisse 3 ⇒ héros de Y
  });
});
