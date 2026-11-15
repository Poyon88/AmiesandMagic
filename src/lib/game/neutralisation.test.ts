// NEUTRALISATION (refonte du 2026-11-15) : tant que la porteuse est en jeu,
// l'unité ennemie ciblée — ou toutes les unités ennemies — est PARALYSÉE (ni
// attaque ni activation) et TOUTES ses capacités sont sans effet. Tout lui est
// rendu à l'identique (capacités ET états armés) quand la porteuse quitte le
// plateau. Avant la refonte, une seule capacité choisie était rendue muette.
import { describe, expect, it } from "vitest";
import { applyAction, canAttack, getCreatureTargets, initRNG, peutActiverPouvoir, recalculateAuras } from "./engine";
import { estNeutralisee, neutralisedIds } from "./neutralisation";
import { describeKeyword } from "./keyword-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { displayCardOf } from "./singulier";
import type { Capability, CardInstance, GameAction, Keyword, KeywordInstance, SpellKeywordInstance, TargetScope } from "./types";

type State = ReturnType<typeof mkState>;

const neutraliseur = (scope?: TargetScope) => mkInstance(mkCard({
  name: "Neutraliseur", attack: 1, health: 3,
  keywords: ["neutralisation"] as unknown as Keyword[],
  keyword_instances: [{ id: "neutralisation" as Keyword, ...(scope ? { targetScope: scope } : {}) }] as KeywordInstance[],
}));

const ennemie = (name: string, keywords: string[], insts: KeywordInstance[] = [], caps?: Capability[]) => {
  const u = mkInstance(mkCard({
    name, attack: 2, health: 4, keywords: keywords as unknown as Keyword[],
    keyword_instances: insts.length ? insts : null, capabilities: caps ?? null,
  }));
  u.hasSummoningSickness = false;
  return u;
};

function poser(s: State, carte: CardInstance, cible?: string): State {
  s.players[0].hand.push(carte);
  const action: GameAction = { type: "play_card", cardInstanceId: carte.instanceId, targetInstanceId: cible };
  return applyAction(s, action);
}

const nom = (s: State, n: string) => s.players[1].board.find(u => u.card.name === n)!;
const retirerPorteuse = (s: State) => {
  s.players[0].board = s.players[0].board.filter(u => u.card.name !== "Neutraliseur");
  recalculateAuras(s.players[0], s.players[1]);
};

describe("Neutralisation — ciblée", () => {
  it("propose toute unité ennemie, avec ou sans capacité", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["ranged"]), ennemie("Nue", []));
    expect(getCreatureTargets(s, neutraliseur().card).sort())
      .toEqual([nom(s, "A").instanceId, nom(s, "Nue").instanceId].sort());
  });

  it("retire TOUTES les capacités de la seule cible, puis les rend quand la porteuse part", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["ranged", "taunt"]), ennemie("B", ["ranged"]));
    const avant = structuredClone(s.players[1].board[0].card);
    let n = poser(s, neutraliseur(), s.players[1].board[0].instanceId);
    expect(nom(n, "A").card.keywords).toEqual([]);
    expect(estNeutralisee(nom(n, "A"))).toBe(true);
    expect(nom(n, "B").card.keywords).toContain("ranged");
    expect(estNeutralisee(nom(n, "B"))).toBe(false);
    // L'affichage montre toujours les capacités (barrées par le rendu).
    expect(displayCardOf(nom(n, "A")).keywords).toEqual(["ranged", "taunt"]);
    expect([...neutralisedIds(nom(n, "A"))].sort()).toEqual(["ranged", "taunt"]);
    n = structuredClone(n);
    retirerPorteuse(n);
    expect(nom(n, "A").card).toEqual(avant);
    expect(estNeutralisee(nom(n, "A"))).toBe(false);
  });

  it("une unité sans capacité est neutralisée quand même : elle est paralysée", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("Nue", []));
    const n = poser(s, neutraliseur(), s.players[1].board[0].instanceId);
    expect(estNeutralisee(nom(n, "Nue"))).toBe(true);
  });
});

describe("Neutralisation — paralysie", () => {
  /** La porteuse de P0 neutralise l'unité de P1, puis c'est le tour de P1. */
  function tourDeLaVictime(victime: CardInstance): State {
    const s = mkState();
    for (const p of s.players) for (let i = 0; i < 5; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}` })));
    s.players[1].board.push(victime);
    initRNG(1);
    const n = poser(s, neutraliseur(), victime.instanceId);
    return applyAction(n, { type: "end_turn" });
  }

  it("ne peut ni attaquer ni activer un pouvoir ; l'attaque forcée est refusée", () => {
    const n = tourDeLaVictime(ennemie("A", []));
    const a = nom(n, "A");
    expect(canAttack(n, a.instanceId)).toBe(false);
    expect(peutActiverPouvoir(a)).toBe(false);
    const pv = n.players[0].hero.hp;
    const force = applyAction(n, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: "enemy_hero" } as GameAction);
    expect(force.players[0].hero.hp).toBe(pv);
  });

  it("retrouve son attaque dès que la porteuse quitte le plateau, le tour même", () => {
    const n = structuredClone(tourDeLaVictime(ennemie("A", [])));
    expect(canAttack(n, nom(n, "A").instanceId)).toBe(false);
    retirerPorteuse(n);
    expect(canAttack(n, nom(n, "A").instanceId)).toBe(true);
  });
});

describe("Neutralisation — toutes les ennemies", () => {
  it("aura continue : une ennemie posée APRÈS est neutralisée aussi", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt"]));
    let n = poser(s, neutraliseur("all_enemies"));
    expect(nom(n, "A").card.keywords).toEqual([]);
    n.players[1].board.push(ennemie("Tardive", ["taunt", "ranged"]));
    n = applyAction(n, { type: "end_turn" });
    expect(nom(n, "Tardive").card.keywords).toEqual([]);
    expect(estNeutralisee(nom(n, "Tardive"))).toBe(true);
  });

  it("n'a besoin d'aucune cible", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt"]));
    expect(getCreatureTargets(s, neutraliseur("all_enemies").card)).toEqual([]);
  });
});

describe("Neutralisation — capacités sans effet", () => {
  const executer = (n: State, cible: string) => poser(n, mkInstance(mkCard({
    name: "Exécution", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "execution" }] as SpellKeywordInstance[],
  })), cible);

  it("un râle (mot-clé déclenché à la mort) ne part pas", () => {
    const s = mkState();
    const pioche = () => mkInstance(mkCard({ name: "Pioche" }));
    s.players[1].deck.push(pioche(), pioche(), pioche());
    s.players[1].board.push(ennemie("Sage", ["inspiration"], [{ id: "inspiration" as Keyword, mode: "death", x: 2 }]));
    let n = poser(s, neutraliseur("all_enemies"));
    const main = n.players[1].hand.length;
    n = executer(n, nom(n, "Sage").instanceId);
    expect(n.players[1].board.some(u => u.card.name === "Sage")).toBe(false);
    expect(n.players[1].hand.length).toBe(main);
  });

  it("un effet COMPOSÉ à la mort ne part pas non plus", () => {
    const s = mkState();
    const rale: Capability = {
      uid: "cx_0", trigger: "on_death", effectKind: "immediate", abilityId: "_composed", targets: [],
      composed: { content: "deal_damage", magnitude: { x: 3 }, target: { entity: "hero", side: "enemy", count: 1, location: "board", designation: "automatic" } },
    };
    s.players[1].board.push(ennemie("Vengeur", [], [], [rale]));
    let n = poser(s, neutraliseur(), s.players[1].board[0].instanceId);
    const pv = n.players[0].hero.hp;
    n = executer(n, nom(n, "Vengeur").instanceId);
    expect(n.players[1].board.some(u => u.card.name === "Vengeur")).toBe(false);
    expect(n.players[0].hero.hp).toBe(pv);
  });

  it("Bouclier levé : suspendu, puis rendu levé", () => {
    const s = mkState();
    const a = ennemie("A", ["divine_shield"]);
    a.hasDivineShield = true;
    s.players[1].board.push(a);
    let n = poser(s, neutraliseur("all_enemies"));
    expect(nom(n, "A").hasDivineShield).toBe(false);
    n = structuredClone(n);
    retirerPorteuse(n);
    expect(nom(n, "A").hasDivineShield).toBe(true);
  });

  it("Contresort chargé : suspendu, puis rendu avec ses charges", () => {
    const s = mkState();
    const a = ennemie("A", ["contresort"]);
    a.contresortActive = true;
    a.contresortCharges = 2;
    s.players[1].board.push(a);
    let n = poser(s, neutraliseur("all_enemies"));
    expect(nom(n, "A").contresortActive).toBe(false);
    n = structuredClone(n);
    retirerPorteuse(n);
    expect(nom(n, "A").contresortActive).toBe(true);
    expect(nom(n, "A").contresortCharges).toBe(2);
  });

  it("Traque : l'unité arrivée face à une porteuse ne peut pas attaquer", () => {
    const s = mkState();
    s.players[0].board.push(neutraliseur("all_enemies"));
    initRNG(1);
    let n = applyAction(s, { type: "end_turn" });
    const traqueuse = mkInstance(mkCard({ name: "Traqueuse", attack: 2, health: 2, keywords: ["charge"] as unknown as Keyword[] }));
    n.players[1].hand.push(traqueuse);
    n = applyAction(n, { type: "play_card", cardInstanceId: traqueuse.instanceId });
    const t = n.players[1].board.find(u => u.card.name === "Traqueuse")!;
    expect(t.hasSummoningSickness).toBe(true);
    expect(canAttack(n, t.instanceId)).toBe(false);
  });
});

describe("Neutralisation — cumuls", () => {
  it("deux porteuses sur la même victime : elle reste neutralisée tant qu'il en reste une", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt"]));
    let n = poser(s, neutraliseur("all_enemies"));
    n = poser(n, neutraliseur("all_enemies"));
    n = structuredClone(n);
    const [premiere] = n.players[0].board.filter(u => u.card.name === "Neutraliseur");
    n.players[0].board = n.players[0].board.filter(u => u !== premiere);
    recalculateAuras(n.players[0], n.players[1]);
    expect(nom(n, "A").card.keywords).toEqual([]);
  });

  it("deux porteuses face à face : chacune est paralysée et muette, mais continue de neutraliser", () => {
    const s = mkState();
    const adverse = mkInstance(mkCard({
      name: "Rivale", attack: 1, health: 3,
      keywords: ["neutralisation", "taunt"] as unknown as Keyword[],
      keyword_instances: [{ id: "neutralisation" as Keyword, targetScope: "all_enemies" }] as KeywordInstance[],
    }));
    s.players[1].board.push(adverse);
    const mienne = neutraliseur("all_enemies");
    s.players[0].board.push(mienne);
    recalculateAuras(s.players[0], s.players[1]);
    expect(estNeutralisee(s.players[0].board[0])).toBe(true);
    expect(estNeutralisee(s.players[1].board[0])).toBe(true);
    // La Rivale perd Provocation mais garde Neutralisation.
    expect(s.players[1].board[0].card.keywords).toEqual(["neutralisation"]);
  });

  it("Silence sur la victime : rien n'est rendu ensuite", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt", "ranged"]));
    let n = poser(s, neutraliseur("all_enemies"));
    const silence = mkInstance(mkCard({
      name: "Silence", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "silence" }] as SpellKeywordInstance[],
    }));
    n = poser(n, silence, nom(n, "A").instanceId);
    n = structuredClone(n);
    retirerPorteuse(n);
    expect(nom(n, "A").card.keywords).toEqual([]);
  });
});

describe("Neutralisation — forge et affichage", () => {
  it("la forge persiste la portée ; plus aucune capacité à choisir", async () => {
    const { buildKeywordInstances } = await import("@/lib/card-forge/keyword-instances");
    const insts = buildKeywordInstances({ labels: ["Neutralisation"], targetScopes: { Neutralisation: "all_enemies" } });
    expect(insts).toEqual([{ id: "neutralisation", targetScope: "all_enemies" }]);
  });

  it("icône propre à Neutralisation ; les capacités de la victime sont barrées", async () => {
    const { keywordIconFor, KEYWORD_SYMBOLS } = await import("./keyword-labels");
    expect(keywordIconFor("neutralisation", { grantAbilityId: "taunt" }))
      .toEqual({ symbol: KEYWORD_SYMBOLS.neutralisation, keyword: "neutralisation", barred: false });
    expect(keywordIconFor("taunt", null, new Set(["taunt"])).barred).toBe(true);
  });

  it("texte : cible unique, puis variante « toutes »", () => {
    expect(describeKeyword("neutralisation", {})).toBe("Tant qu'elle est en jeu, l'unité ennemie ciblée est paralysée et ses capacités sont sans effet.");
    const toutes = describeKeyword("neutralisation", { instance: { id: "neutralisation", targetScope: "all_enemies" } as KeywordInstance });
    expect(toutes).toContain("sont paralysées");
    expect(toutes).not.toContain("{");
  });

  it("aller-retour neutralisation / levée : état haché identique", async () => {
    const { syncHash } = await import("./stateHash");
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt", "ranged"], [{ id: "ranged" as Keyword, x: 1 }]));
    s.players[0].board.push(neutraliseur("all_enemies"));
    recalculateAuras(s.players[0], s.players[1]);
    expect(nom(s, "A").card.keywords).toEqual([]);
    s.players[0].board = [];
    recalculateAuras(s.players[0], s.players[1]);
    const h1 = syncHash(s);
    recalculateAuras(s.players[0], s.players[1]);
    expect(syncHash(s)).toBe(h1);
    expect(nom(s, "A").card.keywords).toEqual(["taunt", "ranged"]);
  });
});
