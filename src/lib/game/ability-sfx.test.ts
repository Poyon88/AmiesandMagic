// Bruitage par CAPACITÉ : le moteur signale quelles capacités NOMMÉES ont
// réellement résolu, et sous quel déclencheur.
//
// Le déclencheur est load-bearing : c'est lui qui décide de la phase où le son
// s'enchaîne côté store — après le son de mort pour un râle d'agonie, après le
// son de pose pour une entrée en jeu. Les sons ne doivent jamais se superposer.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState, SpellKeywordInstance } from "./types";

const sfx = (s: GameState) => s.abilitySfxEvents ?? [];
const ids = (s: GameState) => sfx(s).map((e) => e.abilityId).sort();

describe("capacité CURÉE — le déclencheur voyage avec l'id", () => {
  it("entrée en jeu", () => {
    const s = mkState();
    const c = mkInstance(mkCard({
      name: "Coffre", mana_cost: 2, attack: 1, health: 1,
      keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 2 }] as never,
    }));
    s.players[0].hand.push(c);

    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId });

    expect(sfx(st)).toContainEqual({ abilityId: "epargne", trigger: "on_play" });
  });

  it("râle d'agonie — trigger on_death, pour que le son suive celui de la mort", () => {
    const s = mkState();
    const bombe = mkInstance(mkCard({
      name: "Bombe", attack: 1, health: 1,
      keywords: ["impact"] as never,
      keyword_instances: [{ id: "impact", x: 2, mode: "death" }] as never,
    }));
    s.players[1].board.push(bombe);
    const tueur = mkInstance(mkCard({ name: "Tueur", attack: 5, health: 5 }));
    tueur.hasSummoningSickness = false;
    s.players[0].board.push(tueur);

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: tueur.instanceId, targetInstanceId: bombe.instanceId,
    });

    expect(sfx(st)).toContainEqual({ abilityId: "impact", trigger: "on_death" });
  });

  it("fin de tour", () => {
    const s = mkState();
    s.players[0].board.push(mkInstance(mkCard({
      name: "Veilleuse", attack: 1, health: 3,
      keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 1, mode: "end_of_turn" }] as never,
    })));

    const st = applyAction(s, { type: "end_turn" });

    expect(sfx(st)).toContainEqual({ abilityId: "epargne", trigger: "on_end_of_turn" });
  });
});

describe("capacité de SORT", () => {
  it("chaque mot-clé du sort est signalé", () => {
    const s = mkState();
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));
    const sort = mkInstance(mkCard({
      name: "Trait", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "impact", amount: 3 }] as SpellKeywordInstance[],
    }));
    s.players[0].hand.push(sort);

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId,
      targetInstanceId: s.players[1].board[0].instanceId,
    });

    expect(sfx(st)).toContainEqual({ abilityId: "impact", trigger: "spell_resolution" });
  });
});

describe("ce qui NE sonne PAS", () => {
  it("un effet composé sur mesure n'a pas d'ability nommée, donc pas de son", () => {
    const s = mkState();
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));
    const c = mkInstance(mkCard({
      name: "Sur mesure", mana_cost: 2, attack: 1, health: 1,
      capabilities: [{
        uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
        composed: {
          content: "deal_damage", magnitude: { x: 2 },
          target: { entity: "unit", side: "enemy", count: "all", location: "board", designation: "automatic" },
        },
      }] as unknown as Capability[],
    }));
    s.players[0].hand.push(c);

    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId });

    // L'effet a bien eu lieu…
    expect(st.players[1].board[0].currentHealth).toBe(7);
    // …mais lui donner le son de « deal_damage » ferait sonner deux mécaniques
    // différentes à l'identique.
    expect(ids(st)).not.toContain("_composed");
    expect(ids(st)).not.toContain("deal_damage");
  });

  it("une carte sans capacité ne signale rien", () => {
    const s = mkState();
    const c = mkInstance(mkCard({ name: "Banale", mana_cost: 1, attack: 1, health: 1 }));
    s.players[0].hand.push(c);

    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId });

    expect(sfx(st)).toEqual([]);
  });
});

describe("dédoublonnage", () => {
  it("deux capacités identiques dans la même action ne sonnent qu'une fois", () => {
    const s = mkState();
    // Deux porteuses de Tempête en fin de tour : un seul son, pas deux.
    for (const n of ["A", "B"]) {
      s.players[0].board.push(mkInstance(mkCard({
        name: n, attack: 1, health: 3,
        keywords: ["tempete"] as never,
        keyword_instances: [{ id: "tempete", x: 1, mode: "end_of_turn" }] as never,
      })));
    }
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));

    const st = applyAction(s, { type: "end_turn" });

    expect(sfx(st).filter((e) => e.abilityId === "tempete")).toHaveLength(1);
  });
});

describe("exclu du hash de synchro", () => {
  it("deux états ne différant que par abilitySfxEvents hashent identique", () => {
    const a = mkState();
    const b: GameState = { ...a, abilitySfxEvents: [{ abilityId: "tempete", trigger: "on_play" }] };
    expect(syncHash(a)).toBe(syncHash(b));
  });
});
