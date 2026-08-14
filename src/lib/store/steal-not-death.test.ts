// Une créature qui CHANGE DE CONTRÔLEUR n'est pas morte : ni animation de mort,
// ni fantôme de Cycle éternel filant vers le deck.
//
// Signalé en partie : « Cycle éternel se déclenche quand une créature change de
// contrôleur ». Le moteur, lui, ne recyclait rien — les deux chemins de vol
// (Corruption, Domination) déplacent simplement l'instance d'un plateau à
// l'autre. Seule l'ANIMATION mentait.
//
// Le store dérive les morts de « présente sur l'ancien plateau, absente du
// nouveau », en ne comparant qu'au plateau de MÊME index. Une créature volée
// disparaît donc de son plateau d'origine et passait pour morte. C'est
// exactement l'erreur de `bounce-not-death.test.ts`, sur une autre zone
// d'arrivée : l'autre plateau au lieu de la main.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { CardInstance } from "@/lib/game/types";

/** Sort volant une créature ennemie de façon PERMANENTE (Domination). */
function dominationSpell(): CardInstance {
  return mkInstance(mkCard({
    name: "Emprise", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "domination" }] as never,
  }));
}

/** Sort volant une créature jusqu'à la fin du tour (Corruption). */
function corruptionSpell(): CardInstance {
  return mkInstance(mkCard({
    name: "Emprise brève", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "corruption" }] as never,
  }));
}

function cycler(): CardInstance {
  const c = mkInstance(mkCard({
    name: "Recycleuse", attack: 1, health: 3,
    keywords: ["cycle_eternel"] as never,
  }));
  c.hasSummoningSickness = false;
  return c;
}

function etatPropre() {
  useGameStore.setState({
    targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
    isAnimating: false, pendingIncomingActions: [], deathEvents: [], cycleEternelEvent: null,
  });
}

describe("Changement de contrôleur ≠ mort", () => {
  beforeEach(etatPropre);

  it("Domination : ni animation de mort, ni fantôme Cycle éternel", () => {
    const s = mkState();
    const victime = cycler();
    s.players[1].board.push(victime);
    const sort = dominationSpell();
    s.players[0].hand.push(sort);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().dispatchAction({
      type: "play_card", cardInstanceId: sort.instanceId, targetMap: { kw_0: victime.instanceId },
    });

    const st = useGameStore.getState();
    expect(st.cycleEternelEvent).toBeNull();
    expect(st.deathEvents.some((e) => e.instanceId === victime.instanceId)).toBe(false);
  });

  it("Corruption : idem sur le vol temporaire", () => {
    const s = mkState();
    const victime = cycler();
    s.players[1].board.push(victime);
    const sort = corruptionSpell();
    s.players[0].hand.push(sort);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().dispatchAction({
      type: "play_card", cardInstanceId: sort.instanceId, targetMap: { kw_0: victime.instanceId },
    });

    const st = useGameStore.getState();
    expect(st.cycleEternelEvent).toBeNull();
    expect(st.deathEvents.some((e) => e.instanceId === victime.instanceId)).toBe(false);
  });

  it("une créature sans Cycle éternel n'a pas d'animation de mort non plus", () => {
    // Le défaut ne touchait pas que Cycle éternel : TOUTE créature volée jouait
    // son animation de mort.
    const s = mkState();
    const victime = mkInstance(mkCard({ name: "Banale", attack: 2, health: 2 }));
    s.players[1].board.push(victime);
    const sort = dominationSpell();
    s.players[0].hand.push(sort);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().dispatchAction({
      type: "play_card", cardInstanceId: sort.instanceId, targetMap: { kw_0: victime.instanceId },
    });

    const st = useGameStore.getState();
    expect(st.deathEvents.some((e) => e.instanceId === victime.instanceId)).toBe(false);
  });
});

// Contrôle positif au niveau MOTEUR : dans le store, une VRAIE mort capture des
// positions DOM (getElementCenter) et l'environnement de test est « node ».
// C'est d'ailleurs ce que dit le test jumeau du renvoi en main : l'absence de
// plantage y fait office de preuve. On vérifie donc ici que le recyclage a bien
// lieu quand la créature meurt pour de bon — le correctif ne devait pas
// disqualifier trop large.
describe("Le vol a bien lieu (sinon les tests ci-dessus passeraient à vide)", () => {
  it("Domination déplace l'instance vers l'autre plateau, sans rien recycler", () => {
    const s = mkState();
    const victime = cycler();
    s.players[1].board.push(victime);
    const sort = dominationSpell();
    s.players[0].hand.push(sort);
    s.players[0].mana = 10;

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId,
      targetMap: { kw_0: victime.instanceId },
    });

    // Même instanceId, autre plateau : c'est bien un changement de contrôleur.
    expect(st.players[0].board.some((c) => c.instanceId === victime.instanceId)).toBe(true);
    expect(st.players[1].board).toHaveLength(0);
    // Et Cycle éternel n'a RIEN recyclé — le moteur avait toujours raison.
    expect(st.players[1].deck).toHaveLength(0);
    expect(st.players[0].deck).toHaveLength(0);
  });
});

describe("Une VRAIE mort recycle toujours", () => {
  it("la créature morte repart dans le deck de son propriétaire", () => {
    const s = mkState();
    const victime = cycler();
    victime.currentHealth = 1;
    s.players[1].board.push(victime);
    const foudre = mkInstance(mkCard({
      name: "Foudre", card_type: "spell", attack: null, health: null, mana_cost: 1,
      spell_keywords: [{ id: "impact", amount: 5 }] as never,
    }));
    s.players[0].hand.push(foudre);
    s.players[0].mana = 10;

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: foudre.instanceId,
      targetMap: { kw_0: victime.instanceId },
    });

    // Recyclée dans le deck de son propriétaire, et absente du cimetière.
    expect(st.players[1].deck.map((c) => c.card.name)).toContain("Recycleuse");
    expect(st.players[1].graveyard.map((c) => c.card.name)).not.toContain("Recycleuse");
  });
});
