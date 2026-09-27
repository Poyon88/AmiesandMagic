// PORTÉE « TOUTES » : une capacité qui cible une créature peut frapper toutes
// les créatures d'un camp. Chaque créature reçoit l'effet entier, sans héros ni
// objet ; la capacité ne réclame plus de cible.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG, needsTarget } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, Keyword, KeywordInstance, SpellKeywordInstance, TargetScope } from "./types";
import { creatureScopes, spellScopes } from "./target-scope";

type State = ReturnType<typeof mkState>;

const unite = (name: string, attack: number, health: number) => {
  const u = mkInstance(mkCard({ name, attack, health }));
  u.hasSummoningSickness = false;
  return u;
};

function plateau() {
  const s = mkState();
  s.players[0].board.push(unite("Alliée", 2, 6));
  s.players[1].board.push(unite("E1", 3, 5), unite("E2", 1, 2));
  initRNG(7);
  return s;
}

const sort = (sk: SpellKeywordInstance) => mkInstance(mkCard({
  name: "Sort", card_type: "spell", attack: null, health: null, spell_keywords: [sk],
}));

function jouer(s: State, carte: ReturnType<typeof mkInstance>, cible?: string): State {
  s.players[0].hand.push(carte);
  const action: GameAction = { type: "play_card", cardInstanceId: carte.instanceId, targetInstanceId: cible };
  return applyAction(s, action);
}

const nom = (s: State, i: 0 | 1, n: string) => s.players[i].board.find(u => u.card.name === n);

describe("portée « toutes » — capacités d'action", () => {
  it("Entrave toutes les ennemies : pas de cible demandée, toutes paralysées", () => {
    const s = plateau();
    const c = sort({ id: "entrave", amount: 2, targetScope: "all_enemies" });
    expect(needsTarget(c.card)).toBe(false);
    const n = jouer(s, c);
    expect(n.players[1].board.every(u => u.isParalyzed && u.paralysisTurnsLeft === 2)).toBe(true);
    expect(nom(n, 0, "Alliée")!.isParalyzed).toBe(false);
  });

  it("Siphon toutes les ennemies : le héros récupère X par créature touchée", () => {
    const s = plateau();
    const pv = s.players[0].hero.hp;
    const n = jouer(s, sort({ id: "siphon", amount: 1, targetScope: "all_enemies" }));
    expect(n.players[0].hero.hp).toBe(pv + 2);
    expect(nom(n, 1, "E1")!.currentHealth).toBe(4);
  });

  it("Impact toutes (deux camps) : créatures seulement, jamais les héros", () => {
    const s = plateau();
    const heros = [s.players[0].hero.hp, s.players[1].hero.hp];
    const n = jouer(s, sort({ id: "impact", amount: 2, targetScope: "all" }));
    expect(nom(n, 0, "Alliée")!.currentHealth).toBe(4);
    expect(nom(n, 1, "E1")!.currentHealth).toBe(3);
    expect(nom(n, 1, "E2")).toBeUndefined(); // 2 PV → morte
    expect([n.players[0].hero.hp, n.players[1].hero.hp]).toEqual(heros);
  });

  it("une portée que la capacité n'accepte pas est ignorée (retour au ciblage)", () => {
    const s = plateau();
    // Renforcement ne vise que des alliées : « toutes les ennemies » n'a pas de sens.
    const c = sort({ id: "renforcement", attack: 1, health: 1, targetScope: "all_enemies" });
    expect(needsTarget(c.card)).toBe(true);
    const allie = s.players[0].board[0];
    const n = jouer(s, c, allie.instanceId);
    expect(nom(n, 0, "Alliée")!.currentAttack).toBe(3);
    expect(nom(n, 1, "E1")!.currentAttack).toBe(3);
  });

  it("Corruption toutes : vole toutes les ennemies dans la limite des places", () => {
    const s = plateau();
    const n = jouer(s, sort({ id: "corruption", targetScope: "all_enemies" }));
    expect(n.players[1].board).toHaveLength(0);
    expect(n.players[0].board.map(u => u.card.name).sort()).toEqual(["Alliée", "E1", "E2"]);
  });
});

describe("portée « toutes » — capacités de créature", () => {
  const creature = (id: string, scope: TargetScope, extra: Partial<KeywordInstance> = {}) =>
    mkInstance(mkCard({
      name: "Source", attack: 1, health: 1,
      keywords: [id] as unknown as Keyword[],
      keyword_instances: [{ id: id as Keyword, targetScope: scope, ...extra }] as KeywordInstance[],
    }));

  it("Affaiblissement à l'entrée, toutes les ennemies, sans picker", () => {
    const s = plateau();
    const src = creature("affaiblissement", "all_enemies", { x: 1, y: 1 });
    expect(needsTarget(src.card)).toBe(false);
    const n = jouer(s, src);
    expect(nom(n, 1, "E1")!.currentAttack).toBe(2);
    expect(nom(n, 1, "E1")!.currentHealth).toBe(4);
    expect(nom(n, 0, "Alliée")!.currentAttack).toBe(2);
  });

  it("Bénédiction toutes les alliées : la source n'est pas comptée", () => {
    const s = plateau();
    s.players[0].board[0].currentHealth = 1;
    const n = jouer(s, creature("benediction", "all_allies"));
    expect(nom(n, 0, "Alliée")!.currentHealth).toBe(6);
  });

  it("Malédiction toutes : chaque ennemie est exilée au tour suivant du lanceur", () => {
    const s = plateau();
    let n = jouer(s, creature("malediction", "all_enemies"));
    n = applyAction(applyAction(n, { type: "end_turn" }), { type: "end_turn" });
    expect(n.players[1].board).toHaveLength(0);
    expect(n.players[1].graveyard).toHaveLength(0);
  });

  it("Impact en fin de tour, toutes les ennemies (résolveur des déclencheurs)", () => {
    const s = plateau();
    const src = creature("impact", "all_enemies", { x: 1, mode: "end_of_turn" });
    src.hasSummoningSickness = false;
    s.players[0].board.push(src);
    const n = applyAction(s, { type: "end_turn" });
    expect(nom(n, 1, "E1")!.currentHealth).toBe(4);
    expect(nom(n, 1, "E2")!.currentHealth).toBe(1);
    expect(nom(n, 0, "Alliée")!.currentHealth).toBe(6);
  });

  it("Domination toutes : prend toutes les ennemies", () => {
    const s = plateau();
    const n = jouer(s, creature("domination", "all_enemies"));
    expect(n.players[1].board).toHaveLength(0);
  });
});

describe("camps ouverts", () => {
  it("déduits du type de cible pour les actions, cimetières exclus", () => {
    expect(spellScopes("entrave")).toEqual(["all_enemies"]);
    expect(spellScopes("renforcement")).toEqual(["all_allies"]);
    expect(spellScopes("impact")).toEqual(["all_enemies", "all_allies", "all"]);
    expect(spellScopes("exhumation")).toEqual([]);
    expect(spellScopes("deferlement")).toEqual([]);
  });
  it("capacités de créature à cible unique exclues", () => {
    for (const id of ["sacrifice", "permutation", "mimique", "metamorphose", "incineration"]) {
      expect(creatureScopes(id)).toEqual([]);
    }
  });
});

describe("chaîne forge → carte → moteur", () => {
  it("la portée d'une unité est persistée puis portée par la capacité dérivée", async () => {
    const { buildKeywordInstances } = await import("@/lib/card-forge/keyword-instances");
    const { deriveCapabilities } = await import("./capability-adapter");
    const insts = buildKeywordInstances({
      labels: ["Impact X", "Affaiblissement -X/-Y"],
      xValues: { "Impact X": 2 },
      targetScopes: { "Impact X": "all_enemies", "Affaiblissement -X/-Y": "all_allies" },
    });
    // Impact accepte « toutes les ennemies » ; Affaiblissement refuse les alliées.
    expect(insts.find(i => i.id === "impact")?.targetScope).toBe("all_enemies");
    expect(insts.find(i => i.id === "affaiblissement")?.targetScope).toBeUndefined();
    const caps = deriveCapabilities(mkCard({ name: "U", keywords: ["impact"] as unknown as Keyword[], keyword_instances: insts }));
    expect(caps.find(c => c.abilityId === "impact")?.targetScope).toBe("all_enemies");
  });

  it("sur un SORT, la portée est ignorée par le constructeur (don, pas cible)", async () => {
    const { buildKeywordInstances } = await import("@/lib/card-forge/keyword-instances");
    const insts = buildKeywordInstances({ labels: ["Impact X"], isSpellCard: true, targetScopes: { "Impact X": "all" } });
    expect(insts.some(i => i.targetScope)).toBe(false);
  });

  it("« A » d'un effet composé : toutes les unités d'un plateau seulement", async () => {
    const { composedScope } = await import("./target-scope");
    const cap = (count: number | "all", side: "enemy" | "ally" | "any") => ({
      composed: { content: "paralyze" as const, target: { entity: "unit" as const, count, side, location: "board" as const, designation: "automatic" as const } },
    });
    expect(composedScope(cap("all", "enemy"))).toBe("all_enemies");
    expect(composedScope(cap("all", "any"))).toBe("all");
    expect(composedScope(cap(2, "enemy"))).toBeUndefined();
  });
});
