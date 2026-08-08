// state.damageLedger : registre transitoire des dégâts RÉELLEMENT appliqués aux
// créatures pendant l'action. Le store diffe les PV pour animer les survivantes,
// mais une créature TUÉE quitte le plateau : le diff ne la voit plus et son
// popup de dégâts était perdu (un Cataclysme qui nettoie le plateau n'animait
// plus aucun dégât). Ce registre donne au store le montant exact des mortes.
// Indice d'animation pur : exclu du hash de synchro.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, SpellKeywordInstance } from "./types";

function play(state: ReturnType<typeof mkState>, ci: ReturnType<typeof mkInstance>): GameAction {
  state.players[0].hand.push(ci);
  return { type: "play_card", cardInstanceId: ci.instanceId };
}

function sumFor(state: ReturnType<typeof mkState>, instanceId: string): number {
  return (state.damageLedger ?? [])
    .filter((e) => e.targetInstanceId === instanceId)
    .reduce((n, e) => n + e.amount, 0);
}

describe("damageLedger — dégâts de zone qui TUENT", () => {
  it("Cataclysme 3 : une entrée par créature frappée, morte comprise", () => {
    const s = mkState();
    // 2 PV → meurt (surtuerie : PV finaux à -1) ; 6 PV → survit.
    const doomed = mkInstance(mkCard({ name: "Condamnee", attack: 1, health: 2 }));
    const tough = mkInstance(mkCard({ name: "Robuste", attack: 1, health: 6 }));
    s.players[1].board.push(doomed, tough);

    const spell = mkInstance(mkCard({
      name: "Cataclysme", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "cataclysme", amount: 3 }] as SpellKeywordInstance[],
    }));
    const next = applyAction(s, play(s, spell));

    // La morte est absente du plateau — sans le registre, le store n'avait AUCUN
    // moyen de connaître son chiffre de dégâts.
    expect(next.players[1].board.some((c) => c.instanceId === doomed.instanceId)).toBe(false);
    expect(sumFor(next, doomed.instanceId)).toBe(3);
    expect(sumFor(next, tough.instanceId)).toBe(3);
    // Dépouille au cimetière avec ses PV négatifs : le store écrête le montant
    // par cette perte réelle (2 − (−1) = 3).
    const corpse = next.players[1].graveyard.find((c) => c.instanceId === doomed.instanceId)!;
    expect(corpse.currentHealth).toBe(-1);
  });

  it("les réductions sont déjà appliquées : le registre porte les dégâts SUBIS", () => {
    const s = mkState();
    // Armure ne réduit que le combat ; Résistance 1 s'applique aussi aux sorts.
    const resistant = mkInstance(mkCard({
      name: "Resistant", attack: 1, health: 9,
      keywords: ["resistance"], effect_text: "[Résistance 1]",
    }));
    s.players[1].board.push(resistant);

    const spell = mkInstance(mkCard({
      name: "Cataclysme", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "cataclysme", amount: 3 }] as SpellKeywordInstance[],
    }));
    const next = applyAction(s, play(s, spell));

    expect(sumFor(next, resistant.instanceId)).toBe(2); // 3 − 1
    expect(next.players[1].board.find((c) => c.instanceId === resistant.instanceId)!.currentHealth).toBe(7);
  });

  it("un dégât ANNULÉ (Bouclier) n'entre pas au registre", () => {
    const s = mkState();
    const shielded = mkInstance(mkCard({ name: "Bouclier", attack: 1, health: 5 }));
    shielded.hasDivineShield = true;
    s.players[1].board.push(shielded);

    const spell = mkInstance(mkCard({
      name: "Cataclysme", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "cataclysme", amount: 3 }] as SpellKeywordInstance[],
    }));
    const next = applyAction(s, play(s, spell));

    expect(sumFor(next, shielded.instanceId)).toBe(0);
    expect(next.players[1].board.find((c) => c.instanceId === shielded.instanceId)!.currentHealth).toBe(5);
  });
});

describe("damageLedger — mort SANS dégât", () => {
  it("une Exécution ne laisse aucune entrée (pas de faux chiffre au-dessus de la dépouille)", () => {
    const s = mkState();
    const victim = mkInstance(mkCard({ name: "Victime", attack: 2, health: 4 }));
    s.players[1].board.push(victim);

    const spell = mkInstance(mkCard({
      name: "Exécution", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "execution" }] as SpellKeywordInstance[],
    }));
    s.players[0].hand.push(spell);
    const next = applyAction(s, {
      type: "play_card", cardInstanceId: spell.instanceId, targetInstanceId: victim.instanceId,
    });

    expect(next.players[1].graveyard.some((c) => c.instanceId === victim.instanceId)).toBe(true);
    expect(sumFor(next, victim.instanceId)).toBe(0);
  });
});

describe("damageLedger — exclu du hash d'état", () => {
  it("deux états ne différant que par damageLedger hashent identique", () => {
    const a = mkState();
    const b = mkState();
    b.damageLedger = [{ targetInstanceId: "x", amount: 3 }];
    expect(syncHash(a)).toBe(syncHash(b));
  });
});
