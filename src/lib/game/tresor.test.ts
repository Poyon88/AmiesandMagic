// TRÉSOR X — Sélection limitée aux OBJETS (révèle 3 objets communs de
// l'alignement de coût X, en garder un). Les objets ne se mettent plus dans un
// deck : Trésor est leur porte d'entrée dédiée en partie.
import { describe, expect, it } from "vitest";
import { applyAction, selectionCardsForKeyword } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, GameAction, GameState, Keyword, SpellKeywordInstance } from "./types";

/** Vivier : à chaque coût 1 à 4, deux objets et une créature, Mercenaires. */
function etat(): GameState {
  const s = mkState();
  s.factionCardPool = [1, 2, 3, 4].flatMap((cost) => [
    mkCard({ id: 900 + cost * 10, name: `Objet${cost}a`, card_type: "item", mana_cost: cost, faction: "Mercenaires", rarity: "Commune", attack: null, health: null }),
    mkCard({ id: 901 + cost * 10, name: `Objet${cost}b`, card_type: "item", mana_cost: cost, faction: "Mercenaires", rarity: "Commune", attack: null, health: null }),
    mkCard({ id: 902 + cost * 10, name: `Soldat${cost}`, card_type: "creature", mana_cost: cost, faction: "Mercenaires", rarity: "Commune" }),
  ]);
  return s;
}
const src = { faction: "Mercenaires" } as Card;
const pool = (s: GameState) => new Map((s.factionCardPool ?? []).map((c) => [c.id, c] as const));

describe("vivier de Trésor", () => {
  it("ne propose QUE des objets, au coût exact X", () => {
    const offre = selectionCardsForKeyword("tresor", etat(), 2, src);
    expect(offre.length).toBeGreaterThan(0);
    expect(offre.every((c) => c.card_type === "item" && c.mana_cost === 2)).toBe(true);
  });

  it("« ? » et plancher A : objets de coût A à X", () => {
    for (let i = 0; i < 20; i++) {
      const s = etat();
      s.players[0].mana = i;
      const offre = selectionCardsForKeyword("tresor", s, 4, src, undefined, undefined, true, 3);
      expect(offre.length).toBeGreaterThan(0);
      expect(offre.every((c) => c.card_type === "item" && c.mana_cost >= 3 && c.mana_cost <= 4)).toBe(true);
    }
  });

  it("un filtre composé ne peut pas élargir le type imposé", () => {
    const offre = selectionCardsForKeyword("tresor", etat(), 2, src, { cardType: "creature" });
    expect(offre.every((c) => c.card_type === "item")).toBe(true);
  });

  it("aucun objet au coût demandé : offre vide", () => {
    expect(selectionCardsForKeyword("tresor", etat(), 7, src)).toEqual([]);
  });

  it("alignement : un objet d'une faction hors alignement n'est jamais offert", () => {
    const s = etat();
    s.factionCardPool!.push(mkCard({ id: 999, name: "Relique maudite", card_type: "item", mana_cost: 2, faction: "Morts-Vivants", rarity: "Commune", attack: null, health: null }));
    for (let i = 0; i < 20; i++) {
      s.players[0].mana = i;
      const offre = selectionCardsForKeyword("tresor", s, 2, { faction: "Elfes" } as Card);
      expect(offre.map((c) => c.name)).not.toContain("Relique maudite");
    }
  });
});

describe("alignement de Trésor : celui de l'OBJET, plus les neutres", () => {
  /** Objets de la faction Elfes (bonne) : un neutre, un bon ; et un objet maléfique. */
  function etatAligne(): GameState {
    const s = mkState();
    s.factionCardPool = [
      mkCard({ id: 1101, name: "Cape neutre", card_type: "item", mana_cost: 2, faction: "Elfes", card_alignment: "neutre", rarity: "Commune", attack: null, health: null }),
      mkCard({ id: 1102, name: "Lame bénie", card_type: "item", mana_cost: 2, faction: "Elfes", card_alignment: "bon", rarity: "Commune", attack: null, health: null }),
      mkCard({ id: 1103, name: "Dague impie", card_type: "item", mana_cost: 2, faction: "Morts-Vivants", card_alignment: "maléfique", rarity: "Commune", attack: null, health: null }),
    ];
    return s;
  }
  const noms = (cs: Card[]) => cs.map((c) => c.name).sort();

  it("source maléfique : objets maléfiques + neutres, même d'une faction bonne ; jamais un objet bon", () => {
    const offre = selectionCardsForKeyword("tresor", etatAligne(), 2, { faction: "Morts-Vivants" } as Card);
    expect(noms(offre)).toEqual(["Cape neutre", "Dague impie"]);
  });

  it("source bonne : objets bons + neutres, jamais un objet maléfique", () => {
    const offre = selectionCardsForKeyword("tresor", etatAligne(), 2, { faction: "Elfes" } as Card);
    expect(noms(offre)).toEqual(["Cape neutre", "Lame bénie"]);
  });

  it("source maléfique sans objet maléfique : les neutres remplissent l'offre", () => {
    const s = etatAligne();
    s.factionCardPool = s.factionCardPool!.filter((c) => c.name !== "Dague impie");
    const offre = selectionCardsForKeyword("tresor", s, 2, { faction: "Morts-Vivants" } as Card);
    expect(noms(offre)).toEqual(["Cape neutre"]);
  });
});

describe("Trésor sur une unité", () => {
  it("à l'entrée en jeu : l'objet choisi (selectionCardIds.tresor) arrive en main", () => {
    const s = etat();
    const heraut = mkInstance(mkCard({
      name: "Chercheur", faction: "Mercenaires", mana_cost: 1, keywords: ["tresor"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "tresor" as Keyword, x: 2 }],
    }));
    s.players[0].hand.push(heraut);
    const objet = s.factionCardPool!.find((c) => c.name === "Objet2a")!;
    const next = applyAction(s, {
      type: "play_card", cardInstanceId: heraut.instanceId, selectionCardIds: { tresor: objet.id },
    } as GameAction);
    expect(next.players[0].hand.map((c) => c.card.name)).toEqual(["Objet2a"]);
  });

  it("en fin de tour : modale différée (selectionType « tresor »), 3 objets, puis l'objet choisi en main", () => {
    const s = etat();
    s.players[0].board.push(mkInstance(mkCard({
      name: "Chercheur", faction: "Mercenaires", keywords: ["tresor"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "tresor" as Keyword, x: 2, mode: "end_of_turn" }],
    })));
    const paused = applyAction(s, { type: "end_turn" } as GameAction);
    const trig = paused.pendingTriggers?.[0];
    expect(trig?.selectionType).toBe("tresor");
    const offre = (trig?.selectionOptionIds ?? []).map((id) => pool(s).get(id)!);
    expect(offre.length).toBeGreaterThan(0);
    expect(offre.every((c) => c.card_type === "item")).toBe(true);
    const next = applyAction(paused, { type: "resolve_pending_trigger", triggerId: trig!.id, selectionCardId: offre[0].id } as GameAction);
    expect(next.players[0].hand.map((c) => c.card.card_type)).toEqual(["item"]);
  });

  it("chrono écoulé : un objet de l'offre au hasard", () => {
    const s = etat();
    s.players[0].board.push(mkInstance(mkCard({
      name: "Chercheur", faction: "Mercenaires", keywords: ["tresor"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "tresor" as Keyword, x: 3, mode: "end_of_turn" }],
    })));
    const paused = applyAction(s, { type: "end_turn" } as GameAction);
    const next = applyAction(paused, { type: "auto_resolve_pending_triggers" } as GameAction);
    const main = next.players[0].hand;
    expect(main).toHaveLength(1);
    expect(main[0].card.card_type).toBe("item");
    expect(main[0].card.mana_cost).toBe(3);
  });
});

describe("Trésor sur un sort et en effet composé", () => {
  it("sort : l'objet choisi (tresor_0) arrive en main", () => {
    const s = etat();
    const sort = mkInstance(mkCard({
      name: "Coffre", card_type: "spell", faction: "Mercenaires", attack: null, health: null, mana_cost: 1,
      spell_keywords: [{ id: "tresor", amount: 2 } as SpellKeywordInstance],
    }));
    s.players[0].hand.push(sort);
    const objet = s.factionCardPool!.find((c) => c.name === "Objet2b")!;
    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId, targetMap: { tresor_0: String(objet.id) } });
    expect(next.players[0].hand.map((c) => c.card.name)).toEqual(["Objet2b"]);
  });

  it("effet composé : déclencheur de sélection dont l'offre ne contient que des objets", () => {
    const s = etat();
    const heraut = mkInstance(mkCard({
      name: "Héraut", faction: "Mercenaires", mana_cost: 1,
      capabilities: [{
        uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "tresor", magnitude: { x: 1 } },
      }] as unknown as Capability[],
    }));
    s.players[0].hand.push(heraut);
    const next = applyAction(s, { type: "play_card", cardInstanceId: heraut.instanceId });
    const trig = (next.pendingTriggers ?? []).find((t) => t.selectionType);
    expect(trig?.selectionType).toBe("tresor");
    const offre = (trig?.selectionOptionIds ?? []).map((id) => pool(s).get(id)!);
    expect(offre.length).toBeGreaterThan(0);
    expect(offre.every((c) => c.card_type === "item" && c.mana_cost === 1)).toBe(true);
  });
});
