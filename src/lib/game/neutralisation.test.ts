// NEUTRALISATION : tant que la porteuse est en jeu, une capacité choisie est
// muette chez l'ennemie ciblée, ou chez toutes les ennemies. Rendue à
// l'identique (capacité ET état armé) quand la porteuse quitte le plateau.
import { describe, expect, it } from "vitest";
import { applyAction, getCreatureTargets, initRNG, recalculateAuras } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { displayCardOf } from "./singulier";
import type { CardInstance, GameAction, Keyword, KeywordInstance, SpellKeywordInstance, TargetScope } from "./types";

type State = ReturnType<typeof mkState>;

const neutraliseur = (vise: string, scope?: TargetScope) => mkInstance(mkCard({
  name: "Neutraliseur", attack: 1, health: 3,
  keywords: ["neutralisation"] as unknown as Keyword[],
  keyword_instances: [{ id: "neutralisation" as Keyword, grantAbilityId: vise, ...(scope ? { targetScope: scope } : {}) }] as KeywordInstance[],
}));

const ennemie = (name: string, keywords: string[], insts: KeywordInstance[] = []) => {
  const u = mkInstance(mkCard({ name, attack: 2, health: 4, keywords: keywords as unknown as Keyword[], keyword_instances: insts.length ? insts : null }));
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
  it("ne propose que les ennemies qui portent la capacité visée", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["ranged"]), ennemie("B", ["ranged"]), ennemie("C", ["taunt"]));
    const carte = neutraliseur("vol");
    const cibles = getCreatureTargets(s, carte.card);
    expect(cibles.sort()).toEqual([nom(s, "A").instanceId, nom(s, "B").instanceId].sort());
  });

  it("neutralise la seule cible, puis rend la capacité quand la porteuse part", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["ranged"]), ennemie("B", ["ranged"]));
    const avant = structuredClone(s.players[1].board[0].card);
    let n = poser(s, neutraliseur("vol"), s.players[1].board[0].instanceId);
    expect(nom(n, "A").card.keywords).not.toContain("ranged");
    expect(nom(n, "B").card.keywords).toContain("ranged");
    // L'affichage montre toujours la capacité (barrée par le rendu).
    expect(displayCardOf(nom(n, "A")).keywords).toContain("ranged");
    n = structuredClone(n);
    retirerPorteuse(n);
    expect(nom(n, "A").card).toEqual(avant);
    expect(nom(n, "A").neutralisationStash).toBeUndefined();
  });
});

describe("Neutralisation — toutes les ennemies", () => {
  it("aura continue : une ennemie posée APRÈS est neutralisée aussi", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt"]));
    let n = poser(s, neutraliseur("taunt", "all_enemies"));
    expect(nom(n, "A").card.keywords).not.toContain("taunt");
    n.players[1].board.push(ennemie("Tardive", ["taunt"]));
    n = applyAction(n, { type: "end_turn" });
    expect(nom(n, "Tardive").card.keywords).not.toContain("taunt");
  });

  it("n'a besoin d'aucune cible", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt"]));
    expect(getCreatureTargets(s, neutraliseur("taunt", "all_enemies").card)).toEqual([]);
  });
});

describe("Neutralisation — déclencheurs et états", () => {
  it("un râle neutralisé ne part pas quand la victime meurt", () => {
    const s = mkState();
    const pioche = () => mkInstance(mkCard({ name: "Pioche" }));
    s.players[1].deck.push(pioche(), pioche(), pioche());
    s.players[1].board.push(ennemie("Sage", ["inspiration"], [{ id: "inspiration" as Keyword, mode: "death", x: 2 }]));
    let n = poser(s, neutraliseur("inspiration", "all_enemies"));
    const main = n.players[1].hand.length;
    const exec = mkInstance(mkCard({
      name: "Exécution", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "execution" }] as SpellKeywordInstance[],
    }));
    n = poser(n, exec, nom(n, "Sage").instanceId);
    expect(n.players[1].board.some(u => u.card.name === "Sage")).toBe(false);
    expect(n.players[1].hand.length).toBe(main);
  });

  it("Bouclier levé : suspendu, puis rendu levé", () => {
    const s = mkState();
    const a = ennemie("A", ["divine_shield"]);
    a.hasDivineShield = true;
    s.players[1].board.push(a);
    let n = poser(s, neutraliseur("divine_shield", "all_enemies"));
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
    let n = poser(s, neutraliseur("contresort", "all_enemies"));
    expect(nom(n, "A").contresortActive).toBe(false);
    n = structuredClone(n);
    retirerPorteuse(n);
    expect(nom(n, "A").contresortActive).toBe(true);
    expect(nom(n, "A").contresortCharges).toBe(2);
  });

  it("Traque neutralisée le tour d'arrivée : l'unité ne peut pas attaquer", () => {
    const s = mkState();
    // La porteuse est chez le joueur 1 ; la Traqueuse arrive au tour du joueur 2.
    s.players[0].board.push(neutraliseur("charge", "all_enemies"));
    initRNG(1);
    let n = applyAction(s, { type: "end_turn" });
    const traqueuse = mkInstance(mkCard({ name: "Traqueuse", attack: 2, health: 2, keywords: ["charge"] as unknown as Keyword[] }));
    n.players[1].hand.push(traqueuse);
    n = applyAction(n, { type: "play_card", cardInstanceId: traqueuse.instanceId });
    const t = n.players[1].board.find(u => u.card.name === "Traqueuse")!;
    expect(t.hasSummoningSickness).toBe(true);
  });
});

describe("Neutralisation — cumuls", () => {
  it("deux porteuses sur la même victime : elle reste neutralisée tant qu'il en reste une", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt"]));
    let n = poser(s, neutraliseur("taunt", "all_enemies"));
    n = poser(n, neutraliseur("taunt", "all_enemies"));
    n = structuredClone(n);
    const [premiere] = n.players[0].board.filter(u => u.card.name === "Neutraliseur");
    n.players[0].board = n.players[0].board.filter(u => u !== premiere);
    recalculateAuras(n.players[0], n.players[1]);
    expect(nom(n, "A").card.keywords).not.toContain("taunt");
  });

  it("Silence sur la victime : rien n'est rendu ensuite", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt", "ranged"]));
    let n = poser(s, neutraliseur("taunt", "all_enemies"));
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
  it("la forge persiste la capacité visée et la portée", async () => {
    const { buildKeywordInstances } = await import("@/lib/card-forge/keyword-instances");
    const insts = buildKeywordInstances({
      labels: ["Neutralisation"],
      targetScopes: { Neutralisation: "all_enemies" },
      extras: { neutraliseAbilityId: "ranged" },
    });
    expect(insts).toEqual([{ id: "neutralisation", grantAbilityId: "ranged", targetScope: "all_enemies" }]);
  });

  it("icône : la capacité visée, barrée ; barrée aussi chez la victime", async () => {
    const { keywordIconFor, KEYWORD_SYMBOLS } = await import("./keyword-labels");
    expect(keywordIconFor("neutralisation", { grantAbilityId: "taunt" })).toEqual({ symbol: KEYWORD_SYMBOLS.taunt, keyword: "taunt", barred: true });
    expect(keywordIconFor("taunt", null, new Set(["taunt"])).barred).toBe(true);
    expect(keywordIconFor("ranged", null, new Set(["taunt"])).barred).toBe(false);
  });

  it("aller-retour neutralisation / levée : état haché identique", async () => {
    const { syncHash } = await import("./stateHash");
    const s = mkState();
    s.players[1].board.push(ennemie("A", ["taunt", "ranged"], [{ id: "ranged" as Keyword, x: 1 }]));
    const porteuse = neutraliseur("taunt", "all_enemies");
    s.players[0].board.push(porteuse);
    recalculateAuras(s.players[0], s.players[1]);
    expect(nom(s, "A").card.keywords).toEqual(["ranged"]);
    s.players[0].board = [];
    recalculateAuras(s.players[0], s.players[1]);
    const h1 = syncHash(s);
    recalculateAuras(s.players[0], s.players[1]);
    expect(syncHash(s)).toBe(h1);
    expect(nom(s, "A").card.keywords).toEqual(["taunt", "ranged"]);
  });
});
