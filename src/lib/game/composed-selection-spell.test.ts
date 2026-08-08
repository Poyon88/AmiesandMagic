// Sélection composée portée par un SORT (« Héritage des Ancêtres » : deux
// effets composés « Sélection 1 parmi 3 » à la résolution).
//
// Un sort se résout avec `source: null` — il n'a pas d'unité sur le plateau.
// Le chemin interactif exigeait une instance source, donc AUCUN sort n'ouvrait
// la modale : la Sélection tombait dans le repli aléatoire et la carte
// atterrissait directement en main. Ce fichier verrouille les trois propriétés
// qui manquaient : un déclencheur par effet, des offres DISTINCTES entre deux
// Sélections d'une même carte, et rien en main tant que le joueur n'a pas choisi.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, GameState } from "./types";

function selectionCap(uid: string, x = 6): Capability {
  return {
    uid, trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "selection", magnitude: { x }, pool: { race: "Kobolds" } },
  };
}

function poolCard(name: string, over: Partial<Card> = {}): Card {
  return mkCard({
    name, faction: "Mercenaires", rarity: "Commune", mana_cost: 1,
    attack: 1, health: 1, race: "Kobolds", ...over,
  });
}

/** Le sort de la capture : deux Sélections Kobolds à la résolution. */
function heritage(caps: Capability[]) {
  return mkInstance(mkCard({
    name: "Héritage des Ancêtres", card_type: "spell", attack: null, health: null,
    capabilities: caps as never,
  }));
}

function jouer(s: GameState, spell: ReturnType<typeof heritage>): GameState {
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId });
}

function offres(next: GameState): string[][] {
  const byId = new Map((next.factionCardPool ?? []).map((c) => [c.id, c.name] as const));
  return (next.pendingTriggers ?? []).map((t) =>
    (t.selectionOptionIds ?? []).map((id) => byId.get(id) ?? String(id)));
}

describe("Sélection composée — porteuse SORT", () => {
  it("ouvre un déclencheur par effet au lieu de servir les cartes d'office", () => {
    const s = mkState();
    s.factionCardPool = ["A", "B", "C", "D", "E", "F", "G", "H"].map((n) => poolCard(n));

    const next = jouer(s, heritage([selectionCap("c0"), selectionCap("c1")]));

    expect(next.pendingTriggers).toHaveLength(2);
    expect(next.pendingTriggers!.every((t) => t.selectionType === "selection")).toBe(true);
    // Le sort n'a pas d'unité sur le plateau : la branche `selectionType`
    // d'applyOnePendingTrigger ne lit jamais sourceInstanceId, null est correct.
    expect(next.pendingTriggers!.every((t) => t.sourceInstanceId === null)).toBe(true);
    // Ids distincts : sans l'uid dans la clé, les deux effets n'en produiraient
    // qu'un seul et le joueur ne choisirait qu'une carte sur deux.
    expect(new Set(next.pendingTriggers!.map((t) => t.id)).size).toBe(2);
    // Rien en main tant que le joueur n'a pas tranché.
    expect(next.players[0].hand).toHaveLength(0);
  });

  it("les deux Sélections d'une même carte proposent des offres DISTINCTES", () => {
    const s = mkState();
    s.factionCardPool = ["A", "B", "C", "D", "E", "F", "G", "H"].map((n) => poolCard(n));

    const next = jouer(s, heritage([selectionCap("c0"), selectionCap("c1")]));

    // Sans sel dérivé de l'uid, les deux tirages partagent tout leur germe
    // (même carte source, même état) et proposent les 3 MÊMES cartes.
    const [o1, o2] = offres(next);
    expect(o1).toHaveLength(3);
    expect(o2).toHaveLength(3);
    expect(o1.join(",")).not.toBe(o2.join(","));
  });

  it("chaque choix est servi séparément, dans l'ordre des déclencheurs", () => {
    const s = mkState();
    s.factionCardPool = ["A", "B", "C", "D", "E", "F", "G", "H"].map((n) => poolCard(n));

    let st = jouer(s, heritage([selectionCap("c0"), selectionCap("c1")]));
    const premier = st.pendingTriggers![0];
    const choix1 = premier.selectionOptionIds![0];

    st = applyAction(st, {
      type: "resolve_pending_trigger", triggerId: premier.id, selectionCardId: choix1,
    });

    // Le 1er déclencheur est consommé, le 2nd attend toujours son choix.
    expect(st.pendingTriggers).toHaveLength(1);
    expect(st.players[0].hand.map((c) => c.card.id)).toEqual([choix1]);

    const second = st.pendingTriggers![0];
    const choix2 = second.selectionOptionIds![0];
    st = applyAction(st, {
      type: "resolve_pending_trigger", triggerId: second.id, selectionCardId: choix2,
    });

    expect(st.pendingTriggers ?? []).toHaveLength(0);
    expect(st.players[0].hand.map((c) => c.card.id)).toEqual([choix1, choix2]);
  });

  it("pool vide après filtrage → aucun déclencheur (no-op, pas de repli élargi)", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Nain", { race: "Nains" })];

    const next = jouer(s, heritage([selectionCap("c0")]));

    expect(next.pendingTriggers ?? []).toHaveLength(0);
    expect(next.players[0].hand).toHaveLength(0);
  });
});
