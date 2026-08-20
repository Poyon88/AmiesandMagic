// L'ORDRE à l'écran d'un RÂLE D'AGONIE.
//
// Inversion n°3 de l'audit du 2026-08-20 : les dégâts d'un râle étaient peints
// avec la salve qui avait tué son porteur, donc AVANT l'animation de mort qui
// les déclenche. Détail révélateur : le SON du râle, lui, était déjà joué à la
// phase de mort — le même effet sortait en deux moitiés inversées l'une de
// l'autre.
//
// Le moteur pose désormais une frontière « mort » au seuil des râles (les
// dépouilles ont quitté le plateau, aucun râle n'a encore résolu), et le store
// peint l'intervalle qui suit après l'animation de mort.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Capability, ComposedEffect, GameState } from "@/lib/game/types";

// Environnement `node` : on rend un document vide, `getElementCenter` retombe
// alors sur sa sentinelle. Cf. draw-wave-order.test.ts.
if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

function capMort(composed: ComposedEffect): Capability {
  return { uid: "cx_0", trigger: "on_death", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** P0 lance un sort qui tue la créature de P1 ; celle-ci râle 3 dégâts au héros
 *  de P0. Les deux camps sont donc touchés, à deux moments distincts. */
function partie(): GameState {
  const s = mkState();
  s.players[0].mana = 10;
  s.players[1].board = [mkInstance(mkCard({
    name: "Vengeur Mourant", mana_cost: 2, attack: 1, health: 1,
    capabilities: [capMort({
      target: { side: "enemy", count: 1, entity: "hero", location: "board", designation: "automatic" },
      content: "deal_damage",
      magnitude: { x: 3 },
    })] as Capability[],
  }))];
  s.players[0].hand = [mkInstance(mkCard({
    name: "Trait de Feu", card_type: "spell", attack: null, health: null, mana_cost: 1,
    keywords: ["impact"] as never,
    keyword_instances: [{ id: "impact", x: 5 } as never],
    spell_keywords: [{ id: "impact", amount: 5 }] as never,
  }))];
  return s;
}

/** Séquence des moments visibles, à leur PREMIÈRE apparition. */
function trace(s: GameState): string[] {
  const vu: string[] = [];
  const pousser = (m: string) => { if (!vu.includes(m)) vu.push(m); };
  const victime = s.players[1].board[0].instanceId;

  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id,
    isAnimating: false, pendingIncomingActions: [],
    damageEvents: [], deathEvents: [], spellCastEvent: null,
    targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
  });

  const desabonner = useGameStore.subscribe((st) => {
    const cibles = st.damageEvents.map(e => e.targetId);
    const board1 = st.gameState?.players[1].board ?? [];
    const pvHeros0 = st.gameState?.players[0].hero.hp ?? 30;

    if (cibles.includes(victime)) pousser("dégâts du sort");
    if (!board1.some(c => c.instanceId === victime)) pousser("mort de la victime");
    if (cibles.some(c => c === "friendly_hero" || c === "enemy_hero") || pvHeros0 < 30) pousser("dégâts du râle");
  });

  const carte = s.players[0].hand[0].instanceId;
  useGameStore.getState().dispatchAction({
    type: "play_card", cardInstanceId: carte, targetInstanceId: victime,
  });
  vi.runAllTimers();
  desabonner();
  return vu;
}

describe("râle d'agonie — ordre à l'écran", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("les dégâts du râle tombent APRÈS la mort qui les déclenche", () => {
    const vu = trace(partie());

    expect(vu).toEqual([
      "dégâts du sort",
      "mort de la victime",
      "dégâts du râle",
    ]);
  });

  it("l'assertion exacte du défaut signalé", () => {
    const vu = trace(partie());
    expect(vu.indexOf("dégâts du râle")).toBeGreaterThan(vu.indexOf("mort de la victime"));
  });

  it("l'état final engagé reste celui du moteur", () => {
    // La frontière ne sert qu'à la mise en scène.
    const s = partie();
    trace(s);
    const fin = useGameStore.getState().gameState!;

    expect(fin.players[1].board).toHaveLength(0);
    expect(fin.players[0].hero.hp).toBe(27); // 30 − 3 de râle
  });
});

describe("râle d'agonie — pas de temps mort inutile", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("une mort SANS râle ne fabrique aucune vague supplémentaire", () => {
    // La frontière est posée largement (toute créature à mot-clé ou capacité) :
    // le store doit écarter les intervalles qui n'ont rien à peindre, sinon
    // chaque mort introduirait une pause vide.
    const s = partie();
    s.players[1].board = [mkInstance(mkCard({
      name: "Muette", attack: 1, health: 1,
      keywords: ["provocation"] as never, // un mot-clé, mais aucun râle
    }))];

    const vu = trace(s);

    expect(vu).toEqual(["dégâts du sort", "mort de la victime"]);
    expect(useGameStore.getState().gameState!.players[0].hero.hp).toBe(30);
  });
});

describe("les DEUX frontières dans la même action", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("déroule les sept moments d'une fin de tour chargée, dans l'ordre du moteur", () => {
    // La preuve que le mécanisme marche à N intervalles et pas seulement à un :
    // P0 finit son tour, son Diablotin tue un allié de P1 qui râle sur le héros
    // de P0 (frontière « mort »), puis P1 pioche les Lances qui tuent le
    // Diablotin (frontière « pioche »). Trois intervalles, sept moments.
    const s = mkState();
    s.players[0].board = [mkInstance(mkCard({
      name: "Diablotin Ricanant", mana_cost: 1, attack: 2, health: 1,
      capabilities: [{
        uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed", targets: [],
        composed: {
          target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "random" },
          content: "deal_damage", magnitude: { x: 1 },
        },
      }] as Capability[],
    }))];
    s.players[1].board = [mkInstance(mkCard({
      name: "Vengeur Mourant", attack: 1, health: 1,
      capabilities: [capMort({
        target: { side: "enemy", count: 1, entity: "hero", location: "board", designation: "automatic" },
        content: "deal_damage", magnitude: { x: 3 },
      })] as Capability[],
    }))];
    s.players[1].deck = [mkInstance(mkCard({
      name: "Lances du Zénith", card_type: "spell", attack: null, health: null, mana_cost: 3,
      capabilities: [{
        uid: "cx_0", trigger: "on_draw", effectKind: "immediate", abilityId: "_composed", targets: [],
        composed: {
          target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "scatter" },
          content: "deal_damage", magnitude: { x: 2 },
        },
      }] as Capability[],
    }))];

    const vengeur = s.players[1].board[0].instanceId;
    const diablotin = s.players[0].board[0].instanceId;
    const vu: string[] = [];
    const pousser = (m: string) => { if (!vu.includes(m)) vu.push(m); };

    useGameStore.setState({
      gameState: s, localPlayerId: s.players[0].id,
      isAnimating: false, pendingIncomingActions: [],
      damageEvents: [], deathEvents: [], spellCastEvent: null,
    });

    const desabonner = useGameStore.subscribe((st) => {
      const cibles = st.damageEvents.map(e => e.targetId);
      const board0 = st.gameState?.players[0].board ?? [];
      const board1 = st.gameState?.players[1].board ?? [];
      const main1 = st.gameState?.players[1].hand ?? [];

      if (cibles.includes(vengeur)) pousser("dégâts de fin de tour");
      if (!board1.some(c => c.instanceId === vengeur)) pousser("mort du Vengeur");
      if ((st.gameState?.players[0].hero.hp ?? 30) < 30) pousser("dégâts du râle");
      if (main1.some(c => c.card.name === "Lances du Zénith")) pousser("carte en main");
      if (st.spellCastEvent?.card?.name === "Lances du Zénith") pousser("révélation");
      if (cibles.includes(diablotin)) pousser("dégâts de la pioche");
      if (!board0.some(c => c.instanceId === diablotin)) pousser("mort du Diablotin");
    });

    useGameStore.getState().dispatchAction({ type: "end_turn" });
    vi.runAllTimers();
    desabonner();

    expect(vu).toEqual([
      "dégâts de fin de tour",
      "mort du Vengeur",
      "dégâts du râle",
      "carte en main",
      "révélation",
      "dégâts de la pioche",
      "mort du Diablotin",
    ]);

    // Et l'état final reste celui du moteur.
    const fin = useGameStore.getState().gameState!;
    expect(fin.players[0].hero.hp).toBe(27);
    expect(fin.players[0].board).toHaveLength(0);
    expect(fin.players[1].board).toHaveLength(0);
  });
});
