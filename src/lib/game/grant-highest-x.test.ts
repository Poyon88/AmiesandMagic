// DON D'UNE CAPACITÉ DÉJÀ PORTÉE — on retient le PLUS ÉLEVÉ des deux X.
//
// Jusqu'ici la valeur écrite sur la carte était souveraine : conférer
// Régénération 3 à une créature Régénération 2 ne changeait rien, et rien ne le
// signalait. Règles arbitrées par l'auteur le 2026-09-20 :
//
//   1. à déclencheur IDENTIQUE, le X le plus élevé l'emporte (jamais de cumul,
//      jamais de baisse) ;
//   2. couples +X/+Y : le maximum de CHAQUE composante ;
//   3. déclencheurs DIFFÉRENTS : deux capacités distinctes, qui coexistent ;
//   4. don TEMPORAIRE (emblème, objet) : la créature retrouve sa valeur propre
//      quand la source disparaît ; un don ponctuel, lui, est définitif.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG, recalculateAuras, startTurn } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CapabilityTrigger, CardInstance, ComposedEffect, GameState, KeywordInstance, TargetSpec } from "./types";

const ALLIE_AU_CHOIX: TargetSpec = { entity: "unit", count: 1, side: "ally", location: "board", designation: "choice" };

function don(abilityId: string, x?: number, y?: number, grantTrigger?: CapabilityTrigger): CardInstance {
  const composed: ComposedEffect = {
    content: "grant_keyword", grantAbilityId: abilityId, grantTrigger,
    ...(x != null ? { magnitude: { x, ...(y != null ? { y } : {}) } } : {}),
    target: ALLIE_AU_CHOIX,
  };
  const caps: Capability[] = [{ uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed }];
  return mkInstance(mkCard({ name: "Le Don", card_type: "spell", attack: null, health: null, mana_cost: 0, capabilities: caps as never }));
}

function lancer(s: GameState, sort: CardInstance, cible: CardInstance): GameState {
  initRNG(42);
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId, targetMap: { cx_0: cible.instanceId } });
}

/** État avec `c` seule sur le plateau du joueur courant. */
function avec(c: CardInstance): GameState {
  const s = mkState();
  s.players[0].board = [c];
  return s;
}

const porteuse = (s: GameState) => s.players[0].board[0];
const instancesDe = (c: CardInstance): KeywordInstance[] => c.card.keyword_instances ?? [];

/** PV rendus par la Régénération au prochain début de tour du joueur 0. */
function soinDeRegeneration(s: GameState): number {
  const c = porteuse(s);
  c.maxHealth = 20;
  c.currentHealth = 1;
  return startTurn(s).players[0].board[0].currentHealth - 1;
}

/** Troll Régénération X, le X posé dans le canal demandé. */
function troll(x: number, canal: "capabilities" | "sidecar" | "texte"): CardInstance {
  return mkInstance(mkCard({
    name: "Troll", attack: 2, health: 20, keywords: ["regeneration"] as never,
    ...(canal === "capabilities"
      ? { capabilities: [{ abilityId: "regeneration", trigger: "automatic", params: { x } }] as never }
      : canal === "sidecar"
        ? { keyword_instances: [{ id: "regeneration", x }] as never }
        : { effect_text: `[Régénération ${x}]` }),
  }));
}

describe("don d'une capacité déjà portée — le plus élevé des deux X", () => {
  for (const canal of ["capabilities", "sidecar", "texte"] as const) {
    it(`Régénération 2 (${canal}) + don de Régénération 3 ⇒ Régénération 3`, () => {
      const t = troll(2, canal);
      expect(soinDeRegeneration(lancer(avec(t), don("regeneration", 3), t))).toBe(3);
    });
  }

  it("un don INFÉRIEUR ne fait jamais baisser : Régénération 3 + don de 2 ⇒ 3", () => {
    const t = troll(3, "sidecar");
    expect(soinDeRegeneration(lancer(avec(t), don("regeneration", 2), t))).toBe(3);
  });

  it("ne CUMULE pas : 2 + 3 ⇒ 3, pas 5", () => {
    const t = troll(2, "capabilities");
    expect(soinDeRegeneration(lancer(avec(t), don("regeneration", 3), t))).not.toBe(5);
  });

  it("don après don, sans valeur propre : 2 puis 3 ⇒ 3, puis 1 ⇒ toujours 3", () => {
    const nue = mkInstance(mkCard({ name: "Recrue", attack: 1, health: 20 }));
    let s = lancer(avec(nue), don("regeneration", 2), nue);
    s = lancer(s, don("regeneration", 3), porteuse(s));
    expect(porteuse(s).grantedKeywordX.regeneration).toBe(3);
    s = lancer(s, don("regeneration", 1), porteuse(s));
    expect(soinDeRegeneration(s)).toBe(3);
  });

  it("lit aussi le canal TEXTE des résolveurs : Résistance 1 + don de 3 ⇒ 3 dégâts absorbés", () => {
    const mur = mkInstance(mkCard({ name: "Mur", attack: 0, health: 20, keywords: ["resistance"] as never, effect_text: "[Résistance 1]" }));
    const s0 = lancer(avec(mur), don("resistance", 3), mur);
    const frappe = mkInstance(mkCard({
      name: "Frappe", card_type: "spell", attack: null, health: null, mana_cost: 0,
      capabilities: [{
        uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "deal_damage", magnitude: { x: 5 }, target: ALLIE_AU_CHOIX },
      }] as never,
    }));
    const s = lancer(s0, frappe, porteuse(s0));
    expect(porteuse(s).currentHealth).toBe(20 - (5 - 3));
  });

  it("X FIGÉ sur l'instance : Riposte 1 + don de Riposte 3 ⇒ riposteX = 3", () => {
    const garde = mkInstance(mkCard({ name: "Garde", attack: 1, health: 5, keywords: ["riposte"] as never, keyword_instances: [{ id: "riposte", x: 1 }] as never }));
    expect(porteuse(lancer(avec(garde), don("riposte", 3), garde)).riposteX).toBe(3);
  });
});

describe("X figé porté par le seul effect_text", () => {
  const garde = (x: number) => mkInstance(mkCard({ name: "Garde", attack: 1, health: 5, keywords: ["riposte"] as never, effect_text: `[Riposte ${x}]` }));

  it("un don inférieur ne le fait pas baisser : [Riposte 3] + don de 1 ⇒ 3", () => {
    const g = garde(3);
    expect(porteuse(lancer(avec(g), don("riposte", 1), g)).riposteX).toBe(3);
  });

  it("un don supérieur le relève : [Riposte 1] + don de 3 ⇒ 3", () => {
    const g = garde(1);
    expect(porteuse(lancer(avec(g), don("riposte", 3), g)).riposteX).toBe(3);
  });
});

describe("couples +X/+Y — le maximum de CHAQUE composante", () => {
  it("Gloire +1/+3 + don de Gloire +2/+1 ⇒ Gloire +2/+3", () => {
    const heros = mkInstance(mkCard({ name: "Héros", attack: 2, health: 5, keywords: ["gloire"] as never, keyword_instances: [{ id: "gloire", x: 1, y: 3 }] as never }));
    const s = lancer(avec(heros), don("gloire", 2, 1), heros);
    expect(instancesDe(porteuse(s)).find((k) => (k.id as unknown as string) === "gloire")).toMatchObject({ x: 2, y: 3 });
  });
});

describe("capacités à déclencheur", () => {
  const epargnante = () => mkInstance(mkCard({
    name: "Usurière", attack: 1, health: 5, keywords: ["epargne"] as never,
    keyword_instances: [{ id: "epargne", mode: "attack", x: 2 }] as never,
  }));
  const epargnes = (s: GameState) => instancesDe(porteuse(s)).filter((k) => (k.id as unknown as string) === "epargne");

  it("déclencheurs DIFFÉRENTS : les deux capacités coexistent, chacune avec son X", () => {
    const u = epargnante();
    const s = lancer(avec(u), don("epargne", 3, undefined, "on_death"), u);
    expect(epargnes(s)).toHaveLength(2);
    expect(epargnes(s)).toContainEqual(expect.objectContaining({ mode: "attack", x: 2 }));
    expect(epargnes(s)).toContainEqual(expect.objectContaining({ mode: "death", x: 3 }));
  });

  it("déclencheur IDENTIQUE : une seule capacité, au X le plus élevé", () => {
    const u = epargnante();
    const s = lancer(avec(u), don("epargne", 3, undefined, "on_attack"), u);
    expect(epargnes(s)).toEqual([expect.objectContaining({ mode: "attack", x: 3 })]);
  });

  it("déclencheur IDENTIQUE et don inférieur : rien ne bouge", () => {
    const u = epargnante();
    const s = lancer(avec(u), don("epargne", 1, undefined, "on_attack"), u);
    expect(epargnes(s)).toEqual([expect.objectContaining({ mode: "attack", x: 2 })]);
  });
});

describe("don TEMPORAIRE — retour à la valeur propre", () => {
  const emblemeRegen = (amount: number) => [{ abilityId: "regeneration", params: { amount }, stacks: 1 }] as never;

  it("un emblème de Régénération 3 porte une Régénération 2 à 3, puis elle RETOMBE à 2", () => {
    const t = troll(2, "sidecar");
    const s = avec(t);
    s.players[0].emblems = emblemeRegen(3);
    recalculateAuras(s.players[0], s.players[1]);
    expect(soinDeRegeneration(s)).toBe(3);

    s.players[0].emblems = [];
    recalculateAuras(s.players[0], s.players[1]);
    expect(soinDeRegeneration(s)).toBe(2);
  });

  it("reste stable quand l'aura est reposée à chaque recalcul", () => {
    const t = troll(2, "capabilities");
    const s = avec(t);
    s.players[0].emblems = emblemeRegen(3);
    for (let i = 0; i < 3; i++) recalculateAuras(s.players[0], s.players[1]);
    expect(soinDeRegeneration(s)).toBe(3);
    s.players[0].emblems = [];
    recalculateAuras(s.players[0], s.players[1]);
    expect(soinDeRegeneration(s)).toBe(2);
  });

  it("un don PONCTUEL reçu sous l'aura survit à sa disparition : 2, aura 5, sort 3 ⇒ 3", () => {
    const t = troll(2, "sidecar");
    let s = avec(t);
    s.players[0].emblems = emblemeRegen(5);
    recalculateAuras(s.players[0], s.players[1]);
    s = lancer(s, don("regeneration", 3), porteuse(s));
    expect(soinDeRegeneration(s)).toBe(5);

    s.players[0].emblems = [];
    recalculateAuras(s.players[0], s.players[1]);
    expect(soinDeRegeneration(s)).toBe(3);
  });

  it("une créature SANS la capacité la perd entièrement avec l'emblème", () => {
    const nue = mkInstance(mkCard({ name: "Recrue", attack: 1, health: 20 }));
    const s = avec(nue);
    s.players[0].emblems = emblemeRegen(3);
    recalculateAuras(s.players[0], s.players[1]);
    expect(soinDeRegeneration(s)).toBe(3);
    s.players[0].emblems = [];
    recalculateAuras(s.players[0], s.players[1]);
    expect(soinDeRegeneration(s)).toBe(0);
  });
});

describe("don TEMPORAIRE — objet équipé", () => {
  it("un Anneau de Régénération 3 porte un Troll 2 à 3 ; déplacé ailleurs, le Troll RETOMBE à 2", () => {
    const t = troll(2, "sidecar");
    const autre = mkInstance(mkCard({ name: "Écuyer", attack: 1, health: 20 }));
    const anneau = mkInstance(mkCard({
      name: "Anneau", card_type: "item", mana_cost: 0, attack: 0, health: 0, equip_cost: 0,
      keywords: ["regeneration"] as never, keyword_instances: [{ id: "regeneration", x: 3 }] as never,
    }));
    const s = mkState();
    s.players[0].board = [t, autre];
    s.players[0].items = [anneau];

    anneau.equippedToInstanceId = t.instanceId;
    recalculateAuras(s.players[0], s.players[1]);
    expect(soinDeRegeneration(s)).toBe(3);

    anneau.equippedToInstanceId = autre.instanceId;
    recalculateAuras(s.players[0], s.players[1]);
    expect(soinDeRegeneration(s)).toBe(2);
    // …et l'Écuyer, qui n'avait rien, reçoit bien le 3 de l'anneau.
    expect(s.players[0].board[1].grantedKeywordX.regeneration).toBe(3);
  });
});
