// EXÉCUTION, SILENCE et GUÉRISON X deviennent des capacités de CRÉATURE
// (2026-10-27), en plus de leur forme action. Arbitrages de l'auteur :
//   • Exécution : une unité ennemie désignée ; « A » = toutes les unités ET
//     tous les objets ennemis ;
//   • Silence : une autre unité de n'importe quel camp ; « S » = elle-même ;
//     « A » = toutes les unités ET tous les objets du camp choisi ;
//   • Guérison : camp ALLIÉ seulement, action comme créature — une unité alliée
//     ou le héros allié ; « A » = toutes les unités alliées ET le héros ;
//   • capacités d'unité : Transcendance ne protège ni d'Exécution ni de Silence.
import { describe, expect, it } from "vitest";
import {
  applyAction, creatureNeedsTarget, getCreatureTargets, getSpellTargets, getTapActivateTargets, needsTarget,
} from "./engine";
import { describeKeyword } from "./keyword-display";
import { getBareme } from "@/lib/card-engine/bareme";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameAction, GameState, Keyword, KeywordInstance, KeywordMode, SpellKeywordInstance } from "./types";

const porteuse = (kw: Keyword, extra: Partial<KeywordInstance> = {}, mode?: KeywordMode) => mkInstance(mkCard({
  name: "Porteuse", attack: 1, health: 5, mana_cost: 0, keywords: [kw],
  keyword_instances: [{ id: kw, x: 3, ...(mode ? { mode } : {}), ...extra } as KeywordInstance],
}));

const objet = (name: string): ReturnType<typeof mkInstance> => mkInstance(mkCard({
  name, card_type: "item", attack: 1, health: 0, keywords: ["vol"],
} as Partial<Card>));

/** Deux alliées blessées (dont une Transcendante côté ennemi), deux ennemies,
 *  un objet de chaque côté, héros allié blessé. */
function plateau(): GameState {
  const s = mkState();
  const allie = (name: string) => {
    const c = mkInstance(mkCard({ name, attack: 2, health: 6, keywords: ["taunt"] }));
    c.currentHealth = 2;
    return c;
  };
  s.players[0].board.push(allie("Allié A"), allie("Allié B"));
  s.players[1].board.push(
    mkInstance(mkCard({ name: "Ennemi", attack: 2, health: 6, keywords: ["vol"] })),
    mkInstance(mkCard({ name: "Transcendant", attack: 2, health: 6, keywords: ["transcendance"] })),
  );
  s.players[0].items = [objet("Objet allié")];
  s.players[1].items = [objet("Objet ennemi")];
  s.players[0].hero.hp = 10;
  return s;
}
const unite = (s: GameState, name: string) => [...s.players[0].board, ...s.players[1].board].find(c => c.card.name === name);
const id = (s: GameState, name: string) => unite(s, name)!.instanceId;
const jouer = (s: GameState, h: ReturnType<typeof mkInstance>, targetInstanceId?: string) => {
  s.players[0].hand.push(h);
  return applyAction(s, { type: "play_card", cardInstanceId: h.instanceId, targetInstanceId } as GameAction);
};

describe("Exécution (créature)", () => {
  it("vise une unité ennemie, et Transcendance ne la protège pas", () => {
    const s = plateau();
    const h = porteuse("execution");
    expect(creatureNeedsTarget(h.card)).toBe(true);
    expect(getCreatureTargets(s, h.card).sort()).toEqual([id(s, "Ennemi"), id(s, "Transcendant")].sort());
    const st = jouer(s, h, id(s, "Transcendant"));
    expect(unite(st, "Transcendant")).toBeUndefined();
    expect(unite(st, "Ennemi")).toBeDefined();
  });

  it("« A » : toutes les unités ET tous les objets ennemis, rien du camp allié", () => {
    const s = plateau();
    const h = porteuse("execution", { targetScope: "all_enemies" });
    expect(creatureNeedsTarget(h.card)).toBe(false);
    const st = jouer(s, h);
    expect(st.players[1].board).toHaveLength(0);
    expect(st.players[1].items ?? []).toHaveLength(0);
    expect(st.players[0].board).toHaveLength(3);
    expect(st.players[0].items).toHaveLength(1);
  });

  it("à la mort : le choix est différé au propriétaire, puis détruit la cible", () => {
    const s = plateau();
    const h = porteuse("execution", {}, "death");
    h.currentHealth = 1;
    s.players[0].board.push(h);
    const cible = s.players[1].board[0];
    cible.currentAttack = 5;
    // L'ennemie attaque et tue la porteuse.
    s.currentPlayerIndex = 1;
    let st = applyAction(s, { type: "attack", attackerInstanceId: cible.instanceId, targetInstanceId: h.instanceId } as GameAction);
    const t = st.pendingTriggers?.[0];
    expect(t?.kw).toBe("execution");
    st = applyAction(st, { type: "resolve_pending_trigger", triggerId: t!.id, targetInstanceId: id(st, "Transcendant") } as GameAction);
    expect(unite(st, "Transcendant")).toBeUndefined();
  });
});

describe("Silence (créature)", () => {
  it("vise une autre unité, des deux camps, et retire ses mots-clés", () => {
    const s = plateau();
    const h = porteuse("silence");
    expect(getCreatureTargets(s, h.card).sort()).toEqual(
      [id(s, "Allié A"), id(s, "Allié B"), id(s, "Ennemi"), id(s, "Transcendant")].sort());
    const st = jouer(s, h, id(s, "Transcendant"));
    expect(unite(st, "Transcendant")!.card.keywords).toEqual([]);
    expect(unite(st, "Ennemi")!.card.keywords).toEqual(["vol"]);
  });

  it("« S » à l'activation : se réduit elle-même au silence, sans cible", () => {
    const s = plateau();
    const h = porteuse("silence", { recipient: "self" }, "tap");
    h.card = { ...h.card, keywords: ["silence", "taunt"] };
    s.players[0].board.push(h);
    const inst = h.card.keyword_instances![0];
    expect(getTapActivateTargets(s, "silence", h.instanceId, inst)).toBeNull();
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: h.instanceId, instanceIdx: 0 } as GameAction);
    expect(unite(st, "Porteuse")!.card.keywords).toEqual([]);
    expect(unite(st, "Allié A")!.card.keywords).toEqual(["taunt"]);
  });

  it("« A » toutes : toutes les autres unités et tous les objets, des deux camps", () => {
    const s = plateau();
    const h = porteuse("silence", { targetScope: "all" });
    const st = jouer(s, h);
    for (const n of ["Allié A", "Allié B", "Ennemi", "Transcendant"]) expect(unite(st, n)!.card.keywords).toEqual([]);
    expect(unite(st, "Porteuse")!.card.keywords).toEqual(["silence"]);
    expect(st.players[0].items![0].card.keywords).toEqual([]);
    expect(st.players[1].items![0].card.keywords).toEqual([]);
  });
});

describe("Guérison X (créature)", () => {
  it("vise une autre unité alliée ou le héros allié — jamais l'adversaire", () => {
    const s = plateau();
    const h = porteuse("guerison");
    expect(getCreatureTargets(s, h.card)).toEqual([id(s, "Allié A"), id(s, "Allié B"), "friendly_hero"]);
    const st = jouer(s, h, "friendly_hero");
    expect(st.players[0].hero.hp).toBe(13);
  });

  it("« A » : toutes les autres unités alliées ET le héros allié", () => {
    const s = plateau();
    s.players[1].board[0].currentHealth = 2;
    const st = jouer(s, porteuse("guerison", { targetScope: "all_allies" }));
    expect(unite(st, "Allié A")!.currentHealth).toBe(5);
    expect(unite(st, "Allié B")!.currentHealth).toBe(5);
    expect(st.players[0].hero.hp).toBe(13);
    expect(unite(st, "Ennemi")!.currentHealth).toBe(2);
  });

  it("« S » à l'activation : se soigne elle-même", () => {
    const s = plateau();
    const h = porteuse("guerison", { recipient: "self" }, "tap");
    h.currentHealth = 1;
    s.players[0].board.push(h);
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: h.instanceId, instanceIdx: 0 } as GameAction);
    expect(unite(st, "Porteuse")!.currentHealth).toBe(4);
  });
});

describe("formes ACTION", () => {
  const sort = (sk: SpellKeywordInstance) => mkInstance(mkCard({ name: "Sort", card_type: "spell", mana_cost: 0, spell_keywords: [sk] }));

  it("Guérison : cibles alliées seulement, et le soin ne va jamais à l'ennemi", () => {
    const s = plateau();
    const h = sort({ id: "guerison", amount: 3 } as SpellKeywordInstance);
    s.players[0].hand.push(h);
    expect(getSpellTargets(s, h.card).sort()).toEqual([id(s, "Allié A"), id(s, "Allié B"), "friendly_hero"].sort());
    const st = applyAction(s, { type: "play_card", cardInstanceId: h.instanceId, targetMap: { kw_0: "friendly_hero" } } as GameAction);
    expect(st.players[0].hero.hp).toBe(13);
  });

  it("Guérison « A » : unités alliées et héros allié", () => {
    const s = plateau();
    const h = sort({ id: "guerison", amount: 3, targetScope: "all_allies" } as SpellKeywordInstance);
    s.players[0].hand.push(h);
    const st = applyAction(s, { type: "play_card", cardInstanceId: h.instanceId, targetMap: {} } as GameAction);
    expect(unite(st, "Allié A")!.currentHealth).toBe(5);
    expect(st.players[0].hero.hp).toBe(13);
  });

  it("Exécution « A » ennemies : les objets ennemis partent aussi", () => {
    const s = plateau();
    const h = sort({ id: "execution", targetScope: "all_enemies" } as SpellKeywordInstance);
    s.players[0].hand.push(h);
    const st = applyAction(s, { type: "play_card", cardInstanceId: h.instanceId, targetMap: {} } as GameAction);
    expect(st.players[1].items ?? []).toHaveLength(0);
    expect(st.players[0].items).toHaveLength(1);
  });

  it("un composé « unité ou héros allié, au choix » ouvre bien le sélecteur (Sève renouvelée)", () => {
    const card = mkCard({
      card_type: "spell", capabilities: [{
        uid: "c", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "heal", magnitude: { x: 3 }, target: { entity: "both", side: "ally", count: 1, location: "board", designation: "choice" } },
      }],
    } as Partial<Card>);
    expect(needsTarget(card)).toBe(true);
  });
});

describe("textes et barème", () => {
  it("« S » et « A » ont leur propre phrase", () => {
    expect(describeKeyword("silence", { instance: { recipient: "self" } })).toBe(
      "Perd tous ses mots-clés et ses stats reviennent à leur valeur d'origine.");
    expect(describeKeyword("guerison", { x: 2, instance: { recipient: "self" } })).toBe("Récupère 2 PV.");
    expect(describeKeyword("execution", { instance: { targetScope: "all_enemies" } })).toBe(
      "Détruit toutes les unités ennemies, objets compris.");
  });

  it("Silence coûte Impact 2", () => {
    const b = getBareme();
    expect(b.capacites.silence.base).toBeCloseTo(b.capacites.impact.base + 2 * b.capacites.impact.perX, 1);
    expect(b.capacites.silence.perX).toBe(0);
  });
});
