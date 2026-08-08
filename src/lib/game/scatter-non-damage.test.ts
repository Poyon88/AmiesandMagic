// Répartition au hasard (`designation: "scatter"`) ÉTENDUE aux contenus autres
// que dégâts / soin.
//
// La règle est la même partout — N passes tirées AVEC REMISE sur le pool, donc
// un nombre de cibles DISTINCTES compris entre 1 et N — mais l'origine de N
// change, parce que `x` ne veut pas dire la même chose selon le contenu :
//   • deal_damage / heal : `x` EST le total de points, servis 1 par passe ;
//   • le reste : `x` est l'amplitude (buff +X/+Y) ou n'a pas de sens
//     (paralyze) ⇒ N vient de `count`, et chaque passe applique l'effet ENTIER.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, GameState, TargetSpec } from "./types";

function porteur(composed: ComposedEffect) {
  return mkInstance(mkCard({
    name: "Esprit", mana_cost: 3, attack: 2, health: 2,
    capabilities: [{
      uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate",
      abilityId: "_composed", composed,
    }] as unknown as Capability[],
  }));
}

const cibleEnnemie = (over: Partial<TargetSpec> = {}): TargetSpec => ({
  entity: "unit", side: "enemy", count: 2, location: "board",
  designation: "scatter", ...over,
});

/** Fin de tour de P0 : la capacité du porteur part. */
function finDeTour(composed: ComposedEffect, seed: number, pv = 5) {
  const s = mkState();
  s.rngState = seed;
  s.players[0].board.push(porteur(composed));
  s.players[1].board.push(
    mkInstance(mkCard({ name: "E1", attack: 1, health: pv })),
    mkInstance(mkCard({ name: "E2", attack: 1, health: pv })),
  );
  return applyAction(s, { type: "end_turn" });
}

describe("scatter — paralysie (contenu sans amplitude)", () => {
  it("2 passes ⇒ 1 OU 2 créatures paralysées selon le tirage, jamais plus", () => {
    const vus = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const next = finDeTour(
        { content: "paralyze", target: cibleEnnemie() }, seed,
      );
      const n = next.players[1].board.filter((c) => c.isParalyzed).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
      vus.add(n);
    }
    // Le doublon est la SOURCE du hasard : sur une douzaine de graines, les deux
    // issues doivent apparaître. Sans remise, on verrait toujours 2.
    expect([...vus].sort()).toEqual([1, 2]);
  });

  it("count = 1 ⇒ exactement une paralysée", () => {
    const next = finDeTour(
      { content: "paralyze", target: cibleEnnemie({ count: 1 }) }, 3,
    );
    expect(next.players[1].board.filter((c) => c.isParalyzed).length).toBe(1);
  });
});

describe("scatter — buff (l'amplitude n'est PAS le nombre de passes)", () => {
  it("chaque passe octroie le +X/+Y ENTIER ; un doublon cumule", () => {
    const composed: ComposedEffect = {
      content: "buff", magnitude: { x: 1, y: 1 },
      target: cibleEnnemie({ side: "ally", count: 2 }),
    };
    for (const seed of [1, 5, 7, 11]) {
      const s = mkState();
      s.rngState = seed;
      s.players[0].board.push(porteur(composed));
      s.players[0].board.push(
        mkInstance(mkCard({ name: "A1", attack: 1, health: 3 })),
        mkInstance(mkCard({ name: "A2", attack: 1, health: 3 })),
      );
      // ATK d'avant, par instance. Un buff composé est PERMANENT : il est cuit
      // dans `card.attack` aussi bien que dans `currentAttack` — comparer à
      // `card.attack` après coup rendrait donc toujours 0.
      const avant = new Map(s.players[0].board.map((c) => [c.instanceId, c.currentAttack]));

      const next = applyAction(s, { type: "end_turn" });

      // 2 passes × +1 ATK : le TOTAL est constant, sa distribution non. Le
      // porteur est allié, il peut donc être tiré lui aussi — d'où le total sur
      // tout le plateau plutôt que sur les seuls A1/A2.
      const totalAtk = next.players[0].board.reduce(
        (n, c) => n + (c.currentAttack - (avant.get(c.instanceId) ?? 0)), 0);
      expect(totalAtk).toBe(2);
      // Chaque passe applique le +1/+1 ENTIER : aucune cible ne prend un
      // demi-buff, et un doublon en cumule deux.
      const gains = next.players[0].board
        .map((c) => c.currentAttack - (avant.get(c.instanceId) ?? 0))
        .filter((g) => g > 0);
      expect(gains.every((g) => g === 1 || g === 2)).toBe(true);
      expect(gains.length).toBeGreaterThanOrEqual(1);
      expect(gains.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("scatter — dégâts : régime « point par point » inchangé", () => {
  it("X points servis 1 par passe, `count` ignoré", () => {
    // count: 5 est volontairement absurde — en régime point par point il ne doit
    // rien changer : c'est X qui commande.
    const next = finDeTour(
      { content: "deal_damage", magnitude: { x: 2 }, target: cibleEnnemie({ count: 5 }) },
      1,
    );
    const total = next.players[1].board.reduce((n, c) => n + (5 - c.currentHealth), 0);
    expect(total).toBe(2);
  });
});

describe("scatter — pool vide", () => {
  it("aucune cible ⇒ no-op, pas de boucle", () => {
    const s = mkState();
    s.players[0].board.push(porteur({ content: "paralyze", target: cibleEnnemie({ count: 4 }) }));
    let next!: GameState;
    expect(() => { next = applyAction(s, { type: "end_turn" }); }).not.toThrow();
    expect(next.players[1].board).toHaveLength(0);
  });
});

describe("scatter — texte de carte", () => {
  it("annonce la FOURCHETTE, pas un nombre ferme", () => {
    const cap: Capability = {
      uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "paralyze", target: cibleEnnemie({ count: 2 }) },
    };
    // « paralyse 2 unités » mentirait : le tirage avec remise peut n'en toucher
    // qu'une. Et la désignation doit se lire « au hasard », pas « au choix »
    // (le repli d'avant, faute de branche scatter).
    const txt = describeComposedCap(cap);
    expect(txt).toContain("au plus 2 unités");
    expect(txt).toContain("au hasard");
    expect(txt).not.toContain("au choix");
  });

  it("count = 1 : pas de fourchette (« une unité »)", () => {
    const cap: Capability = {
      uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "paralyze", target: cibleEnnemie({ count: 1 }) },
    };
    expect(describeComposedCap(cap)).toContain("une unité");
  });
});
