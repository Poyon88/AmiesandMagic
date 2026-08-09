// PURETÉ +X/+Y : l'unité gagne +X ATK / +Y PV tant que le cimetière de son
// contrôleur est VIDE.
//
// Miroir de Force des ancêtres, qui récompense au contraire un cimetière plein.
// « Vide » au sens STRICT — sorts compris, pas seulement les créatures : un
// seuil bas en ferait une troisième variante de sa jumelle, alors que tout son
// propos est de se rompre à la première perte.
//
// Aura DYNAMIQUE : elle doit monter ET redescendre. C'est là que ce genre de
// capacité casse — un bonus qui ne sait pas repartir laisse des statistiques
// fantômes, et un retrait mal comptabilisé tue l'unité.
import { describe, expect, it } from "vitest";
import { applyAction, recalculateAuras } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState } from "./types";

const pure = (x = 2, y = 3) => mkInstance(mkCard({
  name: "Colombe", mana_cost: 3, attack: 2, health: 2,
  keywords: ["purete"] as never,
  keyword_instances: [{ id: "purete", x, y }] as never,
}));

/** Statistiques courantes après un recalcul d'auras. */
function stats(s: GameState, nom = "Colombe") {
  recalculateAuras(s.players[0], s.players[1]);
  const c = s.players[0].board.find((u) => u.card.name === nom)!;
  return [c.currentAttack, c.currentHealth, c.maxHealth];
}

describe("le bonus suit l'état du cimetière", () => {
  it("cimetière vide ⇒ +X/+Y", () => {
    const s = mkState();
    s.players[0].board.push(pure(2, 3));
    expect(stats(s)).toEqual([4, 5, 5]); // 2/2 + 2/3
  });

  it("une seule carte au cimetière suffit à tout retirer", () => {
    const s = mkState();
    s.players[0].board.push(pure(2, 3));
    expect(stats(s)).toEqual([4, 5, 5]);

    s.players[0].graveyard.push(mkInstance(mkCard({ name: "Mort", card_type: "creature", attack: 1, health: 1 })));
    expect(stats(s)).toEqual([2, 2, 2]);
  });

  it("un SORT au cimetière compte aussi — « vide » est strict", () => {
    // C'est ce qui sépare Pureté d'un seuil bas : Force des ancêtres, elle, ne
    // compte que les créatures.
    const s = mkState();
    s.players[0].board.push(pure(2, 3));
    s.players[0].graveyard.push(mkInstance(mkCard({
      name: "Sort usé", card_type: "spell", attack: null, health: null,
    })));
    expect(stats(s)).toEqual([2, 2, 2]);
  });

  it("le bonus REVIENT si le cimetière se vide à nouveau", () => {
    const s = mkState();
    s.players[0].board.push(pure(2, 3));
    s.players[0].graveyard.push(mkInstance(mkCard({ name: "Mort", card_type: "creature", attack: 1, health: 1 })));
    expect(stats(s)).toEqual([2, 2, 2]);

    s.players[0].graveyard = []; // Exhumation, Incinération, Profanation…
    expect(stats(s)).toEqual([4, 5, 5]);
  });
});

describe("c'est le CONTRÔLEUR qui compte", () => {
  it("le cimetière adverse n'a aucun effet", () => {
    const s = mkState();
    s.players[0].board.push(pure(2, 3));
    s.players[1].graveyard.push(mkInstance(mkCard({ name: "Mort", card_type: "creature", attack: 1, health: 1 })));
    expect(stats(s)).toEqual([4, 5, 5]);
  });
});

describe("retrait de l'aura — les pièges des +PV dynamiques", () => {
  it("perdre le bonus ne TUE pas une unité déjà blessée", () => {
    // Garde partagée avec les auras jumelles : sans elle, une créature à 1 PV
    // sous aura mourrait en la perdant, alors qu'aucun dégât n'a été infligé.
    const s = mkState();
    const c = pure(0, 3);
    s.players[0].board.push(c);
    recalculateAuras(s.players[0], s.players[1]);
    c.currentHealth = 1; // blessée sous l'aura

    s.players[0].graveyard.push(mkInstance(mkCard({ name: "Mort", card_type: "creature", attack: 1, health: 1 })));
    recalculateAuras(s.players[0], s.players[1]);

    expect(c.currentHealth).toBe(1);
  });

  it("plusieurs recalculs d'affilée n'empilent pas le bonus", () => {
    // Le piège classique de ces auras : un `+=` non comptabilisé fait grimper
    // les statistiques à chaque passage.
    const s = mkState();
    s.players[0].board.push(pure(2, 3));
    for (let i = 0; i < 5; i++) recalculateAuras(s.players[0], s.players[1]);
    expect(stats(s)).toEqual([4, 5, 5]);
  });
});

describe("en partie", () => {
  it("le bonus tombe dès que la première créature meurt", () => {
    const s = mkState();
    const colombe = pure(2, 3);
    s.players[0].board.push(colombe);
    const chair = mkInstance(mkCard({ name: "Chair", attack: 1, health: 1 }));
    s.players[0].board.push(chair);

    const brute = mkInstance(mkCard({ name: "Brute", attack: 5, health: 5 }));
    brute.hasSummoningSickness = false;
    s.players[1].board.push(brute);
    s.currentPlayerIndex = 1;

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: brute.instanceId, targetInstanceId: chair.instanceId,
    });

    // « Chair » rejoint le cimetière ⇒ la Colombe repasse à ses stats de base.
    expect(st.players[0].graveyard).toHaveLength(1);
    const apres = st.players[0].board.find((u) => u.card.name === "Colombe")!;
    expect([apres.currentAttack, apres.maxHealth]).toEqual([2, 2]);
  });
});
