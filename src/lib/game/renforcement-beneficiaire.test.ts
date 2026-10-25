// RENFORCEMENT / DISCIPLINE d'une créature : à qui va le bonus.
//   • absent (défaut, comme la forme sort) : une AUTRE unité alliée désignée ;
//   • recipient "self" (marqueur « S ») : la créature elle-même — réglage des
//     cartes antérieures au 2026-10-25, migrées en base ;
//   • portée « toutes » : toutes les AUTRES unités alliées.
import { describe, expect, it } from "vitest";
import { applyAction, creatureNeedsTarget, getCreatureTargets, getTapActivateTargets, tapKeywordNeedsTarget } from "./engine";
import { describeKeyword } from "./keyword-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, GameState, Keyword, KeywordInstance, KeywordMode } from "./types";

const porteuse = (kw: Keyword, extra: Partial<KeywordInstance> = {}, mode?: KeywordMode) => mkInstance(mkCard({
  name: "Héraut", attack: 1, health: 1, mana_cost: 0, keywords: [kw],
  keyword_instances: [{ id: kw, x: 2, y: 3, ...(mode ? { mode } : {}), ...extra } as KeywordInstance],
}));

/** Deux alliées et une ennemie, toutes de coût 0 : le plateau est discipliné
 *  pour une porteuse de coût pair. */
function plateau(): { s: GameState; a: ReturnType<typeof mkInstance>; b: ReturnType<typeof mkInstance> } {
  const s = mkState();
  const a = mkInstance(mkCard({ name: "Allié A", attack: 1, health: 1, mana_cost: 0 }));
  const b = mkInstance(mkCard({ name: "Allié B", attack: 1, health: 1, mana_cost: 0 }));
  s.players[0].board.push(a, b);
  s.players[1].board.push(mkInstance(mkCard({ name: "Ennemi", attack: 1, health: 1 })));
  return { s, a, b };
}
const stats = (st: GameState, nom: string) => {
  const c = [...st.players[0].board, ...st.players[1].board].find(x => x.card.name === nom)!;
  return [c.currentAttack, c.currentHealth];
};

describe.each(["renforcement", "discipline"] as Keyword[])("%s — bénéficiaire, à l'entrée en jeu", (kw) => {
  it("défaut : une autre unité désignée, seule elle reçoit le bonus", () => {
    const { s, b } = plateau();
    const h = porteuse(kw);
    s.players[0].hand.push(h);
    expect(creatureNeedsTarget(h.card)).toBe(true);
    expect(getCreatureTargets(s, h.card)).toEqual(s.players[0].board.map(c => c.instanceId));
    const st = applyAction(s, { type: "play_card", cardInstanceId: h.instanceId, targetInstanceId: b.instanceId } as GameAction);
    expect(stats(st, "Allié B")).toEqual([3, 4]);
    expect(stats(st, "Allié A")).toEqual([1, 1]);
    expect(stats(st, "Héraut")).toEqual([1, 1]);
  });

  it("« S » elle-même : sans ciblage, la créature se renforce", () => {
    const { s } = plateau();
    const h = porteuse(kw, { recipient: "self" });
    s.players[0].hand.push(h);
    expect(creatureNeedsTarget(h.card)).toBe(false);
    const st = applyAction(s, { type: "play_card", cardInstanceId: h.instanceId } as GameAction);
    expect(stats(st, "Héraut")).toEqual([3, 4]);
    expect(stats(st, "Allié A")).toEqual([1, 1]);
  });

  it("portée « toutes » : toutes les autres unités alliées, ni elle ni l'ennemie", () => {
    const { s } = plateau();
    const h = porteuse(kw, { targetScope: "all_allies" });
    s.players[0].hand.push(h);
    expect(creatureNeedsTarget(h.card)).toBe(false);
    const st = applyAction(s, { type: "play_card", cardInstanceId: h.instanceId } as GameAction);
    expect(stats(st, "Allié A")).toEqual([3, 4]);
    expect(stats(st, "Allié B")).toEqual([3, 4]);
    expect(stats(st, "Héraut")).toEqual([1, 1]);
    expect(stats(st, "Ennemi")).toEqual([1, 1]);
  });
});

describe("Discipline — la condition de parité reste la porte d'entrée", () => {
  it("plateau indiscipliné : aucune unité ne reçoit rien", () => {
    const { s, b } = plateau();
    s.players[0].board.push(mkInstance(mkCard({ name: "Impaire", attack: 1, health: 1, mana_cost: 3 })));
    const h = porteuse("discipline");
    s.players[0].hand.push(h);
    const st = applyAction(s, { type: "play_card", cardInstanceId: h.instanceId, targetInstanceId: b.instanceId } as GameAction);
    expect(stats(st, "Allié B")).toEqual([1, 1]);
  });
});

describe("Renforcement — bénéficiaire, à l'activation", () => {
  const enJeu = (extra: Partial<KeywordInstance>) => {
    const { s, a, b } = plateau();
    const h = porteuse("renforcement", extra, "tap");
    h.hasSummoningSickness = false;
    s.players[0].board.push(h);
    return { s, a, b, h };
  };

  it("défaut : les alliées hors source, et le bonus va à la cible", () => {
    const { s, a, h } = enJeu({});
    const inst = h.card.keyword_instances![0];
    expect(tapKeywordNeedsTarget("renforcement", inst)).toBe(true);
    expect(getTapActivateTargets(s, "renforcement", h.instanceId, inst)).not.toContain(h.instanceId);
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: h.instanceId, instanceIdx: 0, targetInstanceId: a.instanceId });
    expect(stats(st, "Allié A")).toEqual([3, 4]);
    expect(stats(st, "Héraut")).toEqual([1, 1]);
  });

  it("« S » : pas de ciblage, la créature se renforce", () => {
    const { s, h } = enJeu({ recipient: "self" });
    const inst = h.card.keyword_instances![0];
    expect(tapKeywordNeedsTarget("renforcement", inst)).toBe(false);
    expect(getTapActivateTargets(s, "renforcement", h.instanceId, inst)).toBeNull();
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: h.instanceId, instanceIdx: 0 });
    expect(stats(st, "Héraut")).toEqual([3, 4]);
  });

  it("portée « toutes » : chaque autre alliée", () => {
    const { s, h } = enJeu({ targetScope: "all_allies" });
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: h.instanceId, instanceIdx: 0 });
    expect(stats(st, "Allié A")).toEqual([3, 4]);
    expect(stats(st, "Allié B")).toEqual([3, 4]);
    expect(stats(st, "Héraut")).toEqual([1, 1]);
  });
});

describe.each(["renforcement", "discipline"] as Keyword[])("%s — en fin de tour (choix différé)", (kw) => {
  it("défaut : le joueur désigne l'alliée, le bonus garde X/Y", () => {
    const { s, b } = plateau();
    s.players[0].board.push(porteuse(kw, {}, "end_of_turn"));
    const next = applyAction(s, { type: "end_turn" });
    const t = next.pendingTriggers?.[0];
    expect(t?.kw).toBe(kw);
    const st = applyAction(next, { type: "resolve_pending_trigger", triggerId: t!.id, targetInstanceId: b.instanceId });
    expect(stats(st, "Allié B")).toEqual([3, 4]);
    expect(stats(st, "Héraut")).toEqual([1, 1]);
  });

  it("« S » : aucune pause, la créature se renforce", () => {
    const { s } = plateau();
    s.players[0].board.push(porteuse(kw, { recipient: "self" }, "end_of_turn"));
    const next = applyAction(s, { type: "end_turn" });
    expect(next.pendingTriggers ?? []).toHaveLength(0);
    expect(stats(next, "Héraut")).toEqual([3, 4]);
  });
});

describe("Textes", () => {
  const desc = (kw: Keyword, instance: Partial<KeywordInstance>) =>
    describeKeyword(kw, { x: 2, y: 3, instance: { y: 3, ...instance } as KeywordInstance });
  it("Renforcement : trois formulations", () => {
    expect(desc("renforcement", {})).toBe("Donne +2 ATK et +3 PV de façon permanente à une autre unité alliée ciblée.");
    expect(desc("renforcement", { recipient: "self" })).toBe("Gagne +2 ATK et +3 PV de façon permanente.");
    expect(desc("renforcement", { targetScope: "all_allies" })).toBe("Donne +2 ATK et +3 PV de façon permanente à toutes les autres unités alliées.");
  });
  it("Discipline : trois formulations", () => {
    const cond = "Si tous les coûts de votre plateau ont la parité du sien, ";
    expect(desc("discipline", {})).toBe(`${cond}donne +2/+3 permanent à une autre unité alliée ciblée.`);
    expect(desc("discipline", { recipient: "self" }))
      .toBe("Si toutes vos créatures en jeu ont un coût de même parité que le sien, gagne +2 ATK et +3 PV de façon permanente.");
    expect(desc("discipline", { targetScope: "all_allies" })).toBe(`${cond}donne +2/+3 permanent à toutes les autres unités alliées.`);
  });
});

describe("Sauvegarde depuis la forge", () => {
  it("recipient « self » écrit seulement sur une unité, et la portée « toutes » prime", async () => {
    const { buildKeywordInstances, FORGE_TO_GAME_KEYWORD } = await import("@/lib/card-forge/keyword-instances");
    for (const kw of ["renforcement", "discipline"]) {
      const label = Object.keys(FORGE_TO_GAME_KEYWORD).find(l => FORGE_TO_GAME_KEYWORD[l] === kw)!;
      const base = { labels: [label], xValues: { [label]: 2 }, extras: { rfY: 3, dscY: 3 } };
      expect(buildKeywordInstances({ ...base, recipients: { [label]: "self" } })[0].recipient).toBe("self");
      expect(buildKeywordInstances(base)[0]?.recipient).toBeUndefined();
      const toutes = buildKeywordInstances({ ...base, recipients: { [label]: "self" }, targetScopes: { [label]: "all_allies" } })[0];
      expect(toutes.targetScope).toBe("all_allies");
      expect(toutes.recipient).toBeUndefined();
      expect(buildKeywordInstances({ ...base, isSpellCard: true, recipients: { [label]: "self" } })[0]?.recipient).toBeUndefined();
    }
  });
});
