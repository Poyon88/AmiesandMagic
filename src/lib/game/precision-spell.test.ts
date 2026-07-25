// Précision, forme SORT : modificateur GLOBAL du sort, pas un don.
//
// Contrairement à Poison (qui pose un état sur la cible), Précision côté sort
// ne confère rien : sa seule présence dans la liste des mots-clés fait que TOUS
// les dégâts que le sort inflige aux créatures ignorent la réduction —
// Résistance, Armure et Bouclier (ignoreDR=true) — exactement comme la
// Précision d'une créature perce les défenses de sa cible. Le sort « a »
// Précision (ex. Tir de baliste = Impact + Précision), il ne la donne à
// personne. Ces tests verrouillent : la déclaration au registre, la face
// créature intacte, l'absence de cible propre, le perçage réel (Résistance et
// Bouclier) via Impact ciblé et via Déferlement de zone, l'inertie quand le
// mot-clé est seul, et surtout qu'aucune unité ne gagne le mot-clé.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { ABILITIES } from "./abilities";
import { ALL_SPELL_KEYWORDS } from "./spell-keywords";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState, SpellKeywordInstance } from "./types";

function play(state: GameState, ci: CardInstance, targetMap?: Record<string, string>) {
  initRNG(42);
  state.players[0].hand.push(ci);
  return applyAction(state, { type: "play_card", cardInstanceId: ci.instanceId, targetMap });
}

/** Sort générique à partir d'une liste de mots-clés (ordre = index de slot). */
function spell(kws: SpellKeywordInstance[]) {
  return mkInstance(mkCard({
    mana_cost: 0, card_type: "spell", attack: null, health: null,
    spell_keywords: kws,
  }));
}

describe("Précision — déclaration dans le registre", () => {
  it("est applicable aux deux hôtes et exposée comme mot-clé de sort", () => {
    expect(ABILITIES.precision.applicable_to).toEqual(["creature", "spell"]);
    expect((ALL_SPELL_KEYWORDS as string[])).toContain("precision");
  });

  it("garde sa face créature intacte (coût, tier, zone)", () => {
    const c = ABILITIES.precision.creature;
    expect(c?.cost).toBe(7);
    expect(c?.minTier).toBe(1);
    expect(c?.zone).toBe("Terrain");
  });

  it("n'exige AUCUNE cible propre (modificateur global) et n'a pas de paramètre", () => {
    expect(ABILITIES.precision.spell?.needsTarget).toBe(false);
    expect(ABILITIES.precision.spell?.params).toEqual([]);
  });
});

describe("Précision — forme sort : le sort perce les défenses de sa cible", () => {
  // Discriminateur : la Résistance (−1 par défaut) est lue via hasKw sur
  // card.keywords au moment des dégâts, sans init d'instance. Un sort ignore
  // DÉJÀ l'Armure ; Précision ajoute le perçage de Résistance et de Bouclier.
  it("Impact seul respecte la Résistance de la cible", () => {
    const s0 = mkState();
    const foe = mkInstance(mkCard({ health: 5, keywords: ["resistance"] }));
    s0.players[1].board = [foe];

    const s = play(s0, spell([{ id: "impact", amount: 3 }]), { kw_0: foe.instanceId });

    // 3 − 1 (Résistance) = 2 dégâts → 5 − 2 = 3
    expect(s.players[1].board[0].currentHealth).toBe(3);
  });

  it("Impact + Précision perce la Résistance (dégâts pleins)", () => {
    const s0 = mkState();
    const foe = mkInstance(mkCard({ health: 5, keywords: ["resistance"] }));
    s0.players[1].board = [foe];

    const s = play(s0, spell([{ id: "impact", amount: 3 }, { id: "precision" }]), { kw_0: foe.instanceId });

    // Résistance ignorée → 3 dégâts pleins → 5 − 3 = 2
    expect(s.players[1].board[0].currentHealth).toBe(2);
  });

  it("Impact + Précision perce le Bouclier : dégâts passent, Bouclier non consommé", () => {
    const s0 = mkState();
    const foe = mkInstance(mkCard({ health: 5 }));
    foe.hasDivineShield = true;
    s0.players[1].board = [foe];

    const s = play(s0, spell([{ id: "impact", amount: 3 }, { id: "precision" }]), { kw_0: foe.instanceId });

    const after = s.players[1].board[0];
    // Comme la Précision d'une créature : ignoreDR CONTOURNE le Bouclier sans
    // le déclencher — les dégâts passent et le Bouclier reste levé pour une
    // future frappe non-perçante.
    expect(after.hasDivineShield).toBe(true);
    expect(after.currentHealth).toBe(2); // 3 dégâts encaissés malgré le Bouclier
  });

  it("Impact seul est absorbé par le Bouclier (référence)", () => {
    const s0 = mkState();
    const foe = mkInstance(mkCard({ health: 5 }));
    foe.hasDivineShield = true;
    s0.players[1].board = [foe];

    const s = play(s0, spell([{ id: "impact", amount: 3 }]), { kw_0: foe.instanceId });

    const after = s.players[1].board[0];
    expect(after.hasDivineShield).toBe(false); // absorbe la frappe
    expect(after.currentHealth).toBe(5);       // aucun PV perdu
  });
});

describe("Précision — forme sort : s'applique aussi aux dégâts de zone", () => {
  it("Déferlement + Précision perce la Résistance de toutes les cibles", () => {
    const s0 = mkState();
    const a = mkInstance(mkCard({ name: "A", health: 5, keywords: ["resistance"] }));
    const b = mkInstance(mkCard({ name: "B", health: 5, keywords: ["resistance"] }));
    s0.players[1].board = [a, b];

    const s = play(s0, spell([{ id: "deferlement", amount: 3 }, { id: "precision" }]));

    // Sans Précision : 3 − 1 = 2 → PV 3. Avec : 3 pleins → PV 2.
    expect(s.players[1].board[0].currentHealth).toBe(2);
    expect(s.players[1].board[1].currentHealth).toBe(2);
  });
});

describe("Précision — forme sort : ne confère jamais le mot-clé", () => {
  it("aucune unité (alliée ou ciblée) ne gagne « precision » dans ses keywords", () => {
    const s0 = mkState();
    const ally = mkInstance(mkCard({ name: "Allié", attack: 2, health: 4 }));
    const foe = mkInstance(mkCard({ name: "Cible", health: 6 }));
    s0.players[0].board = [ally];
    s0.players[1].board = [foe];

    const s = play(s0, spell([{ id: "impact", amount: 2 }, { id: "precision" }]), { kw_0: foe.instanceId });

    expect(s.players[0].board[0].card.keywords).not.toContain("precision");
    expect(s.players[1].board[0].card.keywords).not.toContain("precision");
  });

  it("Précision seule (sans mot-clé de dégâts) est inerte et ne jette pas", () => {
    const s0 = mkState();
    const foe = mkInstance(mkCard({ health: 4 }));
    s0.players[1].board = [foe];

    const s = play(s0, spell([{ id: "precision" }]));

    expect(s.players[1].board[0].currentHealth).toBe(4);
    expect(s.players[1].board[0].card.keywords).not.toContain("precision");
  });
});
