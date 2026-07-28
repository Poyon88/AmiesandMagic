// Remontée en mode MORT = « à ma mort, je renvoie une créature CIBLÉE en main ».
//
// Régression (Ronin Dévoué, carte 308) : la créature se remontait elle-même à
// chaque fois. Le mot-clé curé en mode mort et le bounce composé self/on_death
// partageaient le même test d'auto-renvoi, lequel passe AVANT la boucle des
// déclencheurs — la dépouille quittait le cimetière avant que le sélecteur ne
// soit proposé.
//
// Les deux intentions sont désormais distinctes :
//  - mot-clé `remontee` mode death  → renvoi CIBLÉ (sélecteur, ou tirage) ;
//  - composé bounce/self/on_death   → auto-renvoi (Lame Revenante, Ombre
//    Insaisissable).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameState } from "./types";

/** Porteur du mot-clé curé, mode mort — comme « Ronin Dévoué » en base. */
function ronin(): CardInstance {
  const c = mkInstance(mkCard({
    name: "Ronin Dévoué", attack: 1, health: 1,
    keywords: ["remontee"] as never,
    keyword_instances: [{ id: "remontee", mode: "death" }] as never,
    capabilities: [{ uid: "cw_0", targets: [], trigger: "on_death", abilityId: "remontee", effectKind: "immediate" }] as never,
  }));
  c.hasSummoningSickness = false;
  return c;
}

/** Porteur de l'auto-renvoi composé — comme « Ombre Insaisissable ». */
function ombre(): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "on_death", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "bounce", target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" } },
  }];
  const c = mkInstance(mkCard({ name: "Ombre Insaisissable", attack: 1, health: 1, capabilities: caps as never }));
  c.hasSummoningSickness = false;
  return c;
}

const handNames = (s: GameState, side: 0 | 1) => s.players[side].hand.map((c) => c.card.name);

/** Tue la créature de J1 avec un gros attaquant de J0. */
function killWithAttacker(s: GameState, victim: CardInstance): GameState {
  const killer = mkInstance(mkCard({ name: "Tueur", attack: 9, health: 9 }));
  killer.hasSummoningSickness = false;
  s.players[0].board.push(killer);
  return applyAction(s, { type: "attack", attackerInstanceId: killer.instanceId, targetInstanceId: victim.instanceId });
}

describe("Remontée mode mort — renvoi ciblé, pas auto-renvoi", () => {
  it("ne se remonte PAS elle-même quand elle meurt", () => {
    const s = mkState();
    const r = ronin();
    s.players[1].board.push(r, mkInstance(mkCard({ name: "Alliée", attack: 1, health: 4 })));

    const next = killWithAttacker(s, r);

    expect(handNames(next, 1)).not.toContain("Ronin Dévoué");
  });

  it("renvoie bien une AUTRE créature (tirage quand la modale ne peut pas s'ouvrir)", () => {
    const s = mkState();
    const r = ronin();
    // Le Ronin meurt pendant le tour ADVERSE : pas de sélecteur possible, le
    // moteur tire une cible — mais l'effet doit avoir lieu.
    s.players[1].board.push(r, mkInstance(mkCard({ name: "Alliée", attack: 1, health: 4 })));

    const next = killWithAttacker(s, r);

    const bounced = [...handNames(next, 0), ...handNames(next, 1)];
    expect(bounced.length).toBeGreaterThan(0);
    expect(bounced).not.toContain("Ronin Dévoué");
  });

  it("l'auto-renvoi composé (self) continue de fonctionner", () => {
    const s = mkState();
    const o = ombre();
    s.players[1].board.push(o);

    const next = killWithAttacker(s, o);

    expect(handNames(next, 1)).toContain("Ombre Insaisissable");
  });
});
