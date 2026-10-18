// RETARD X : l'effet part UNE fois, au début du X-ième tour suivant du
// contrôleur, juste après les effets de début de tour déjà en jeu. Unité : seulement
// si elle est encore en jeu et porte encore la capacité. Sort : toujours, cibles
// choisies au déclenchement. Voir lib/game/retard.ts.
import { describe, expect, it } from "vitest";
import { applyAction, getSpellTargetSlots } from "./engine";
import type { Capability, ComposedEffect, GameState, KeywordInstance, SpellKeywordInstance } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { delayedSpellParts, hasDelayedParts, immediateSpellView } from "./retard";
import { getBareme } from "@/lib/card-engine/bareme";
import { scoreCarte, type CarteNotee } from "@/lib/card-engine/card-points";

function composedCap(trigger: Capability["trigger"], composed: ComposedEffect, extra: Partial<Capability> = {}): Capability {
  return { uid: `cap_${Math.random().toString(36).slice(2, 8)}`, trigger, effectKind: "immediate", abilityId: "_composed", composed, ...extra };
}

const DEGATS_HEROS: ComposedEffect = {
  content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" },
};
const SELF_BUFF: ComposedEffect = {
  content: "buff", magnitude: { x: 1, y: 1 }, target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" },
};

function etat(): GameState {
  const s = mkState();
  for (let i = 0; i < 6; i++) {
    s.players[0].deck.push(mkInstance(mkCard({ name: "Pioche0" })));
    s.players[1].deck.push(mkInstance(mkCard({ name: "Pioche1" })));
  }
  return s;
}

/** Joue la carte depuis la main de P0. */
function jouer(s: GameState, card: ReturnType<typeof mkCard>, extra: Record<string, unknown> = {}): { st: GameState; id: string } {
  const inst = mkInstance(card);
  s.players[0].hand.push(inst);
  const st = applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId, ...extra } as never);
  return { st, id: inst.instanceId };
}

/** Fin du tour de P0 puis fin du tour de P1 : on est au début du tour suivant de P0. */
const tourComplet = (s: GameState) => applyAction(applyAction(s, { type: "end_turn" }), { type: "end_turn" });

describe("Retard — unité", () => {
  it("Retard 1 : part au début du prochain tour du contrôleur, une seule fois", () => {
    const { st, id } = jouer(etat(), mkCard({ attack: 1, health: 3, capabilities: [composedCap("on_delay", DEGATS_HEROS, { delay: 1 })] }));
    const hp = st.players[1].hero.hp;
    expect(st.players[0].board.find((c) => c.instanceId === id)!.retards).toEqual([{ key: expect.stringMatching(/^cap:/), turnsLeft: 1 }]);

    const s1 = applyAction(st, { type: "end_turn" });
    expect(s1.players[1].hero.hp).toBe(hp); // tour adverse : rien
    const s2 = applyAction(s1, { type: "end_turn" });
    expect(s2.players[1].hero.hp).toBe(hp - 2); // début du tour de P0
    expect(s2.players[0].board[0].retards).toBeUndefined();

    const s4 = tourComplet(s2);
    expect(s4.players[1].hero.hp).toBe(hp - 2); // une seule fois
  });

  it("Retard 2 : attend deux tours du contrôleur", () => {
    const { st } = jouer(etat(), mkCard({ attack: 1, health: 3, capabilities: [composedCap("on_delay", DEGATS_HEROS, { delay: 2 })] }));
    const hp = st.players[1].hero.hp;
    const s2 = tourComplet(st);
    expect(s2.players[1].hero.hp).toBe(hp);
    expect(s2.players[0].board[0].retards?.[0].turnsLeft).toBe(1);
    const s4 = tourComplet(s2);
    expect(s4.players[1].hero.hp).toBe(hp - 2);
  });

  it("mot-clé curé en mode delay (Inspiration 2) : pioche à terme", () => {
    const inst = { id: "inspiration", mode: "delay", delay: 1, x: 2 } as KeywordInstance;
    const { st } = jouer(etat(), mkCard({ attack: 1, health: 3, keywords: ["inspiration"] as never, keyword_instances: [inst] }));
    const main = st.players[0].hand.length;
    const s2 = tourComplet(st);
    // +1 pioche de début de tour, +2 Inspiration
    expect(s2.players[0].hand.length).toBe(main + 3);
  });

  it("part APRÈS les effets de début de tour déjà en jeu", () => {
    const s = etat();
    // L'unité de gauche a un buff de début de tour ; la retardée lit l'ATK de la source.
    const { st, id } = jouer(s, mkCard({ attack: 1, health: 5, capabilities: [
      composedCap("on_start_of_turn", SELF_BUFF),
      composedCap("on_delay", { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } }, { delay: 1 }),
    ] }));
    const s2 = tourComplet(st);
    const u = s2.players[0].board.find((c) => c.instanceId === id)!;
    expect(u.currentAttack).toBe(2); // le buff de début de tour est passé
    expect(s2.players[1].hero.hp).toBe(st.players[1].hero.hp - 1);
  });

  it("unité morte avant le terme : rien ne se passe", () => {
    const { st, id } = jouer(etat(), mkCard({ attack: 1, health: 3, capabilities: [composedCap("on_delay", DEGATS_HEROS, { delay: 1 })] }));
    const hp = st.players[1].hero.hp;
    const s1 = applyAction(st, { type: "end_turn" });
    s1.players[0].board = s1.players[0].board.filter((c) => c.instanceId !== id);
    const s2 = applyAction(s1, { type: "end_turn" });
    expect(s2.players[1].hero.hp).toBe(hp);
  });

  it("Silence avant le terme : l'effet est annulé", () => {
    const { st, id } = jouer(etat(), mkCard({ attack: 1, health: 3, capabilities: [composedCap("on_delay", DEGATS_HEROS, { delay: 1 })] }));
    const hp = st.players[1].hero.hp;
    const s1 = applyAction(st, { type: "end_turn" });
    const u = s1.players[0].board.find((c) => c.instanceId === id)!;
    u.card = { ...u.card, keywords: [], keyword_instances: null, capabilities: null }; // capacités retirées
    const s2 = applyAction(s1, { type: "end_turn" });
    expect(s2.players[1].hero.hp).toBe(hp);
  });

  it("unité invoquée (posée sans être jouée) : pas de décompte", () => {
    const s = etat();
    const u = mkInstance(mkCard({ attack: 1, health: 3, capabilities: [composedCap("on_delay", DEGATS_HEROS, { delay: 1 })] }));
    s.players[0].board.push(u);
    const hp = s.players[1].hero.hp;
    expect(tourComplet(s).players[1].hero.hp).toBe(hp);
  });

  it("unité volée : le décompte suit son contrôleur", () => {
    const { st, id } = jouer(etat(), mkCard({ attack: 1, health: 3, capabilities: [composedCap("on_delay", DEGATS_HEROS, { delay: 1 })] }));
    const s1 = applyAction(st, { type: "end_turn" });
    // P1 vole l'unité pendant son tour, puis finit son tour.
    const u = s1.players[0].board.find((c) => c.instanceId === id)!;
    s1.players[0].board = s1.players[0].board.filter((c) => c !== u);
    s1.players[1].board.push(u);
    const hp0 = s1.players[0].hero.hp;
    const s2 = applyAction(s1, { type: "end_turn" }); // début P0 : l'unité n'est plus chez lui
    expect(s2.players[0].hero.hp).toBe(hp0);
    const s3 = applyAction(s2, { type: "end_turn" }); // début P1 : son contrôleur actuel
    expect(s3.players[0].hero.hp).toBe(hp0 - 2);
  });
});

describe("Retard — sort", () => {
  const sortMixte = () => mkCard({
    name: "Présage", card_type: "spell", attack: null, health: null,
    spell_keywords: [
      { id: "inspiration", amount: 1 },
      { id: "impact", amount: 3, delay: 2 },
    ] as SpellKeywordInstance[],
  });

  it("vue immédiate : l'effet à Retard ne réclame aucune cible au lancement", () => {
    const c = sortMixte();
    expect(hasDelayedParts(c)).toBe(true);
    expect(immediateSpellView(c).spell_keywords!.map((k) => k.id)).toEqual(["inspiration"]);
    expect(getSpellTargetSlots(c)).toEqual([]);
    const parts = delayedSpellParts(c, "t");
    expect(parts).toHaveLength(1);
    expect(parts[0].turnsLeft).toBe(2);
    expect(parts[0].card.spell_keywords).toEqual([{ id: "impact", amount: 3 }]);
  });

  it("sort mixte : partie immédiate au lancement, partie retardée choisie au terme", () => {
    const s = etat();
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 }));
    s.players[1].board.push(cible);
    const main = s.players[0].hand.length;
    const { st } = jouer(s, sortMixte());
    expect(st.players[0].hand.length).toBe(main + 1); // Inspiration 1 tout de suite
    expect(st.players[0].delayedSpells).toHaveLength(1);
    expect(st.players[1].board[0].currentHealth).toBe(9);

    const s2 = tourComplet(st);
    expect(s2.players[0].delayedSpells?.[0].turnsLeft).toBe(1);
    expect(s2.pendingTriggers?.length ?? 0).toBe(0);

    const paused = tourComplet(s2);
    expect(paused.pendingTriggers).toHaveLength(1);
    const trig = paused.pendingTriggers![0];
    expect(trig.delayedSpell).toBeDefined();
    const done = applyAction(paused, { type: "resolve_pending_trigger", triggerId: trig.id, targetInstanceId: cible.instanceId });
    expect(done.players[1].board.find((c) => c.instanceId === cible.instanceId)!.currentHealth).toBe(6);
    expect(done.pendingTriggers?.length ?? 0).toBe(0);
    expect(done.startOfTurnQueue).toBeUndefined();
    expect(done.players[0].delayedSpells).toBeUndefined();
  });

  it("sans cible éligible au terme : l'effet est perdu, pas de blocage", () => {
    const s = etat();
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));
    const { st } = jouer(s, mkCard({
      name: "Coup différé", card_type: "spell", attack: null, health: null,
      capabilities: [composedCap("spell_resolution", {
        content: "deal_damage", magnitude: { x: 3 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
      }, { delay: 1 })],
    }));
    const s1 = applyAction(st, { type: "end_turn" });
    s1.players[1].board = [];
    const s2 = applyAction(s1, { type: "end_turn" });
    expect(s2.pendingTriggers?.length ?? 0).toBe(0);
    expect(s2.startOfTurnQueue).toBeUndefined();
    expect(s2.players[0].delayedSpells).toBeUndefined();
  });

  it("effet composé retardé sans cible à désigner : se résout seul au terme", () => {
    const { st } = jouer(etat(), mkCard({
      name: "Météore", card_type: "spell", attack: null, health: null,
      capabilities: [composedCap("spell_resolution", DEGATS_HEROS, { delay: 1 })],
    }));
    const hp = st.players[1].hero.hp;
    expect(hp).toBe(etat().players[1].hero.hp); // rien au lancement
    expect(tourComplet(st).players[1].hero.hp).toBe(hp - 2);
  });
});

describe("Retard — coût", () => {
  it("le coût d'une capacité baisse quand X augmente", () => {
    const b = getBareme();
    const cout = (delay?: number) => scoreCarte(b, mkCard({
      card_type: "spell", attack: null, health: null, mana_cost: 3,
      spell_keywords: [{ id: "impact", amount: 4, ...(delay ? { delay } : {}) }] as SpellKeywordInstance[],
    }) as unknown as CarteNotee).utilise;
    const [c0, c1, c2, c3] = [cout(), cout(1), cout(2), cout(3)];
    expect(c1).toBeLessThan(c0);
    expect(c2).toBeLessThan(c1);
    expect(c3).toBeLessThan(c2);
  });
});
