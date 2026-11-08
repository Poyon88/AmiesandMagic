// MUTATION X — carte en main réécrite en mutante de deux créatures communes de
// coût X découvertes, avec une capacité choisie sur chacune.
import { describe, expect, it } from "vitest";
import { applyAction, canMutate } from "./engine";
import { getCapabilities } from "./capability-adapter";
import { mutationCapacites, mutationOffer, mutationX } from "./mutation";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, GameAction, GameState, KeywordInstance } from "./types";

let nextId = 1000;
/** Créature commune de coût `cout` du vivier, avec ses capacités. */
function commune(cout: number, atk: number, pv: number, extra: Partial<Card> = {}): Card {
  return mkCard({
    id: nextId++, name: `Commune ${nextId}`, mana_cost: cout, attack: atk, health: pv,
    rarity: "Commune", card_type: "creature", faction: "Elfes Noirs",
    keywords: ["ranged"] as never,
    ...extra,
  } as Partial<Card>);
}

function mutante(x = 7, extra: Partial<Card> = {}) {
  return mkInstance(mkCard({
    name: "Larve", mana_cost: 3, attack: 1, health: 1, clan: "Les Cohortes Sanglantes", race: "Gobelins" as never,
    keywords: ["mutation", "taunt"] as never,
    keyword_instances: [{ id: "mutation", x }] as KeywordInstance[],
    effect_text: `[Mutation ${x}]`,
    ...extra,
  } as Partial<Card>));
}

/** Vivier : 5 communes de coût 7 aux stats variées, + du bruit à d'autres coûts. */
function vivier(): Card[] {
  return [
    commune(7, 6, 2, { keywords: ["ranged", "divine_shield"] as never }),
    commune(7, 2, 8, { keywords: ["taunt"] as never }),
    commune(7, 5, 5, {
      keywords: ["vampirisme"] as never,
      capabilities: [{ uid: "cw_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "vampirisme", params: { x: 3 }, targets: [] }] as never,
    }),
    commune(7, 4, 4, { keywords: ["charge"] as never }),
    commune(7, 3, 6, { keywords: ["ranged"] as never }),
    commune(6, 9, 9),
    commune(8, 9, 9),
    commune(7, 9, 9, { keywords: [] as never }), // sans capacité : jamais proposée
  ];
}

function etat(inst = mutante(), pool = vivier()): GameState {
  const s = mkState();
  s.mutationPool = pool;
  s.players[0].hand.push(inst);
  return s;
}

/** Le choix « naturel » : 1re carte de chaque offre, 1re capacité de chacune. */
function choixParDefaut(s: GameState, instId: string) {
  const inst = s.players[0].hand.find((c) => c.instanceId === instId)!;
  const x = mutationX(inst.card);
  const a = mutationOffer(s.mutationPool, x, instId, 1)[0];
  const b = mutationOffer(s.mutationPool, x, instId, 2, a.id)[0];
  return {
    a, b,
    action: {
      type: "mutate_card", cardInstanceId: instId,
      creatureIds: [a.id, b.id], capUids: [mutationCapacites(a)[0].uid, mutationCapacites(b)[0].uid],
    } as GameAction,
  };
}

describe("les offres", () => {
  it("3 créatures communes de coût EXACT X, toutes avec une capacité à léguer", () => {
    const s = etat();
    const offre = mutationOffer(s.mutationPool, 7, "abc", 1);
    expect(offre).toHaveLength(3);
    for (const c of offre) {
      expect(c.mana_cost).toBe(7);
      expect(mutationCapacites(c).length).toBeGreaterThan(0);
    }
  });

  it("la 2e offre écarte la créature prise à la 1re", () => {
    const s = etat();
    for (const id of ["a", "b", "c", "d", "e"]) {
      const a = mutationOffer(s.mutationPool, 7, id, 1)[0];
      expect(mutationOffer(s.mutationPool, 7, id, 2, a.id).some((c) => c.id === a.id)).toBe(false);
    }
  });

  it("stables pour une même carte : annuler ne relance pas le tirage", () => {
    const s = etat();
    const avant = mutationOffer(s.mutationPool, 7, "inst-1", 1).map((c) => c.id);
    const apres = mutationOffer([...s.mutationPool!].reverse(), 7, "inst-1", 1).map((c) => c.id);
    expect(apres).toEqual(avant);
  });

  it("vivier absent ou trop maigre : offre vide ou courte, sans erreur", () => {
    expect(mutationOffer(undefined, 7, "x", 1)).toEqual([]);
    expect(mutationOffer([commune(7, 1, 1)], 7, "x", 1)).toHaveLength(1);
  });
});

describe("la mutation", () => {
  it("identité gardée, stats max/max, capacités d'origine + 2 léguées, Mutation retirée", () => {
    const inst = mutante();
    const s = etat(inst);
    const { a, b, action } = choixParDefaut(s, inst.instanceId);
    const st = applyAction(s, action);
    const m = st.players[0].hand[0];
    expect(m.instanceId).toBe(inst.instanceId);
    expect([m.card.name, m.card.mana_cost, m.card.clan, m.card.race]).toEqual(["Larve", 3, "Les Cohortes Sanglantes", "Gobelins"]);
    expect(m.card.attack).toBe(Math.max(a.attack!, b.attack!));
    expect(m.card.health).toBe(Math.max(a.health!, b.health!));
    expect([m.currentAttack, m.currentHealth, m.maxHealth, m.baseAttack, m.baseHealth])
      .toEqual([m.card.attack, m.card.health, m.card.health, m.card.attack, m.card.health]);
    const ids = getCapabilities(m.card).map((c) => c.abilityId);
    expect(ids).not.toContain("mutation");
    expect(m.card.keywords).not.toContain("mutation");
    expect(ids).toContain("taunt");
    expect(ids).toContain(mutationCapacites(a)[0].abilityId);
    expect(ids).toContain(mutationCapacites(b)[0].abilityId);
    expect(m.card.effect_text).not.toMatch(/Mutation/);
    expect(canMutate(st, inst.instanceId)).toBe(false); // une seule fois
  });

  it("la capacité léguée garde son X et son déclencheur", () => {
    const vamp = () => commune(7, 2, 2, {
      keywords: ["vampirisme"] as never,
      capabilities: [{ uid: "cw_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "vampirisme", params: { x: 3 }, targets: [] }] as never,
    });
    const inst = mutante();
    const s = etat(inst, [vamp(), vamp()]);
    const st = applyAction(s, choixParDefaut(s, inst.instanceId).action);
    const caps = getCapabilities(st.players[0].hand[0].card).filter((c: Capability) => c.abilityId === "vampirisme");
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every((c) => c.trigger === "on_end_of_turn" && c.params?.x === 3)).toBe(true);
    const inst2 = st.players[0].hand[0].card.keyword_instances!.find((k) => k.id === "vampirisme")!;
    expect([inst2.mode, inst2.x]).toEqual(["end_of_turn", 3]);
  });

  it("Bouclier divin légué : la mutante l'a bien en jeu", () => {
    const pool = [commune(7, 1, 1, { keywords: ["divine_shield"] as never }), commune(7, 1, 1, { keywords: ["divine_shield"] as never })];
    const inst = mutante();
    const s = etat(inst, pool);
    const st = applyAction(s, choixParDefaut(s, inst.instanceId).action);
    expect(st.players[0].hand[0].hasDivineShield).toBe(true);
  });

  it("la mutante jouée garde ses stats et ses capacités", () => {
    const inst = mutante();
    const s = etat(inst);
    const st = applyAction(s, choixParDefaut(s, inst.instanceId).action);
    const m = st.players[0].hand[0];
    st.players[0].mana = 10; st.players[0].maxMana = 10;
    const joue = applyAction(st, { type: "play_card", cardInstanceId: m.instanceId } as GameAction);
    const surPlateau = joue.players[0].board.find((c) => c.instanceId === m.instanceId)!;
    expect(surPlateau.card.attack).toBe(m.card.attack);
    expect(surPlateau.maxHealth).toBe(m.card.health);
  });
});

describe("les refus (état inchangé)", () => {
  it("créature hors offre", () => {
    const inst = mutante();
    const s = etat(inst);
    const { action } = choixParDefaut(s, inst.instanceId);
    const horsOffre = s.mutationPool!.find((c) => c.mana_cost === 8)!;
    const faux = { ...action, creatureIds: [horsOffre.id, (action as { creatureIds: number[] }).creatureIds[1]] } as GameAction;
    expect(applyAction(s, faux)).toBe(s);
  });

  it("même créature aux deux étapes", () => {
    const inst = mutante();
    const s = etat(inst);
    const { a, action } = choixParDefaut(s, inst.instanceId);
    const faux = { ...action, creatureIds: [a.id, a.id] } as GameAction;
    expect(applyAction(s, faux)).toBe(s);
  });

  it("capacité inconnue", () => {
    const inst = mutante();
    const s = etat(inst);
    const { action } = choixParDefaut(s, inst.instanceId);
    const faux = { ...action, capUids: ["nope", "nope"] } as GameAction;
    expect(applyAction(s, faux)).toBe(s);
  });

  it("pas son tour, carte hors de la main, ou sans Mutation", () => {
    const inst = mutante();
    const s = etat(inst);
    const { action } = choixParDefaut(s, inst.instanceId);
    const tourAdverse = { ...s, currentPlayerIndex: 1 as const };
    expect(applyAction(tourAdverse, action)).toBe(tourAdverse);
    const sans = etat(mkInstance(mkCard({ name: "Banale", keywords: ["taunt"] as never })));
    expect(canMutate(sans, sans.players[0].hand[0].instanceId)).toBe(false);
  });
});

describe("synchro", () => {
  it("même entrée ⇒ même état sur deux clients, vivier hors empreinte", () => {
    const inst = mutante();
    const s1 = etat(inst);
    const s2 = structuredClone(s1);
    const st1 = applyAction(s1, choixParDefaut(s1, inst.instanceId).action);
    const st2 = applyAction(s2, choixParDefaut(s2, inst.instanceId).action);
    expect(syncHash(st1)).toBe(syncHash(st2));
    expect(syncHash(st1)).toBe(syncHash({ ...st1, mutationPool: undefined }));
  });
});
