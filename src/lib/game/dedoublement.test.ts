// Dédoublement : à l'invocation, crée en jeu une copie exacte de la créature
// qui porte la capacité. Le clone est une nouvelle instance (nouvel
// instanceId) reprenant les stats actuelles, et — bien qu'il porte lui aussi
// "dedoublement" — ne re-déclenche PAS l'effet (pas de duplication récursive).
import { describe, expect, it } from "vitest";
import { playCard, applyAction } from "./engine";
import type { Card } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function creature(name: string, attack = 3, health = 4, extra: Partial<Card> = {}): Card {
  return mkCard({ name, faction: "Elfes", attack, health, mana_cost: 0, ...extra });
}

describe("Dédoublement — invocation (on_play)", () => {
  it("crée exactement UNE copie sur le plateau avec les mêmes stats", () => {
    const s = mkState();
    const src = mkInstance(creature("Jumelle", 3, 4, { keywords: ["dedoublement"] }));
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });
    const board = next.players[0].board;

    // L'original + une seule copie = 2 créatures "Jumelle".
    const copies = board.filter((c) => c.card.name === "Jumelle");
    expect(copies).toHaveLength(2);

    // Le clone a un instanceId distinct de l'original.
    const ids = new Set(copies.map((c) => c.instanceId));
    expect(ids.size).toBe(2);

    // Les deux ont les mêmes stats.
    for (const c of copies) {
      expect(c.currentAttack).toBe(3);
      expect(c.currentHealth).toBe(4);
      expect(c.maxHealth).toBe(4);
    }
  });

  it("ne duplique pas récursivement (le clone ne re-déclenche pas Dédoublement)", () => {
    const s = mkState();
    const src = mkInstance(creature("Écho", 2, 2, { keywords: ["dedoublement"] }));
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });
    // Original + 1 clone = 2, jamais plus.
    expect(next.players[0].board.filter((c) => c.card.name === "Écho")).toHaveLength(2);
    // Le clone porte tout de même le mot-clé (copie exacte).
    const clone = next.players[0].board.find((c) => c.instanceId !== src.instanceId)!;
    expect(clone.card.keywords).toContain("dedoublement");
  });

  it("reflète les stats cuites dans la carte (buff permanent de +2/+3)", () => {
    const s = mkState();
    // Un buff permanent (ex. Renforcement/Entrainement) est CUIT dans la carte
    // (attack/health) et survit donc à l'invocation : la copie hérite du 7/9.
    const src = mkInstance(creature("Colosse", 7, 9, { keywords: ["dedoublement"] }));
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });
    const clone = next.players[0].board.find((c) => c.instanceId !== src.instanceId)!;
    expect(clone.currentAttack).toBe(7);
    expect(clone.maxHealth).toBe(9);
    expect(clone.currentHealth).toBe(9);
  });

  it("ne crée pas de copie si le plateau est plein (8 max)", () => {
    const s = mkState();
    // Remplit le plateau avec 7 créatures ; l'invocation de la 8ᵉ le complète.
    for (let i = 0; i < 7; i++) s.players[0].board.push(mkInstance(creature(`Filler${i}`, 1, 1)));
    const src = mkInstance(creature("Dernière", 2, 2, { keywords: ["dedoublement"] }));
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });
    // 7 fillers + l'original = 8, pas de place pour le clone.
    expect(next.players[0].board).toHaveLength(8);
    expect(next.players[0].board.filter((c) => c.card.name === "Dernière")).toHaveLength(1);
  });
});

describe("Dédoublement — tous les déclencheurs (multi-mode curé)", () => {
  it("se déclenche en FIN DE TOUR (mode end_of_turn)", () => {
    const s = mkState();
    // Placée directement sur le plateau (pas via invocation) : seul le
    // déclencheur fin-de-tour doit produire une copie.
    const src = mkInstance(creature("Fractale", 2, 3, {
      keywords: ["dedoublement"],
      keyword_instances: [{ id: "dedoublement", mode: "end_of_turn" }],
    }));
    s.players[0].board.push(src);

    const next = applyAction(s, { type: "end_turn" });
    const copies = next.players[0].board.filter((c) => c.card.name === "Fractale");
    // Une seule copie ce tour (pas de cascade dans la même passe).
    expect(copies).toHaveLength(2);
    expect(next.currentPlayerIndex).toBe(1); // tour basculé
  });

  it("se déclenche à l'ACTIVATION (mode tap)", () => {
    const s = mkState();
    const src = mkInstance(creature("Réplique", 2, 2, {
      keywords: ["dedoublement"],
      keyword_instances: [{ id: "dedoublement", mode: "tap" }],
    }));
    s.players[0].board.push(src);

    const next = applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
    });
    const copies = next.players[0].board.filter((c) => c.card.name === "Réplique");
    expect(copies).toHaveLength(2);
    // La source est tapée après activation.
    expect(next.players[0].board.find((c) => c.instanceId === src.instanceId)!.tapped).toBe(true);
  });

  it("le clone (mode fin de tour) ne se dédouble qu'à la PROCHAINE fin de tour de son contrôleur", () => {
    const s = mkState();
    const src = mkInstance(creature("Vague", 1, 1, {
      keywords: ["dedoublement"],
      keyword_instances: [{ id: "dedoublement", mode: "end_of_turn" }],
    }));
    s.players[0].board.push(src);
    const count = (st: typeof s) => st.players[0].board.filter((c) => c.card.name === "Vague").length;

    // Fin de tour P0 : l'original se dédouble une fois → 2. Le clone tout juste
    // créé n'entre PAS dans la file de ce tour.
    const t1 = applyAction(s, { type: "end_turn" });
    expect(count(t1)).toBe(2);

    // Fin de tour P1 : le plateau de P0 n'est pas concerné → toujours 2.
    const t2 = applyAction(t1, { type: "end_turn" });
    expect(count(t2)).toBe(2);

    // Fin de tour P0 suivante : l'original ET le clone se déclenchent → +2 → 4.
    const t3 = applyAction(t2, { type: "end_turn" });
    expect(count(t3)).toBe(4);
  });

  it("le clone créé hors invocation entre à PV pleins (viable même en mode mort)", () => {
    const s = mkState();
    // Simule un déclenchement fin-de-tour sur une créature ENDOMMAGÉE : le clone
    // doit entrer frais (3/3), pas à 1 PV.
    const src = mkInstance(creature("Phénix", 3, 3, {
      keywords: ["dedoublement"],
      keyword_instances: [{ id: "dedoublement", mode: "end_of_turn" }],
    }));
    src.currentHealth = 1; // endommagée
    s.players[0].board.push(src);

    const next = applyAction(s, { type: "end_turn" });
    const clone = next.players[0].board.find(
      (c) => c.card.name === "Phénix" && c.instanceId !== src.instanceId,
    )!;
    expect(clone.currentHealth).toBe(3);
    expect(clone.maxHealth).toBe(3);
    expect(clone.currentAttack).toBe(3);
  });
});
