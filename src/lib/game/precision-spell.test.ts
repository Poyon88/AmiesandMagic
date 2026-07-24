// Précision, forme SORT : « L'unité ciblée gagne Précision. »
//
// Le mot-clé créature existait déjà (Ignore la Résistance, l'Armure et le
// Bouclier) ; ces tests couvrent la face sort ajoutée au registre, et surtout
// le fait que le don passe par applyGrantedKeyword — sans lui, le mot-clé
// n'atterrirait pas dans `card.keywords` et `hasKw` ne le verrait jamais au
// moment du calcul de dégâts.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { ABILITIES } from "./abilities";
import { ALL_SPELL_KEYWORDS } from "./spell-keywords";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

function play(state: GameState, ci: CardInstance, targetMap?: Record<string, string>) {
  initRNG(42);
  state.players[0].hand.push(ci);
  return applyAction(state, { type: "play_card", cardInstanceId: ci.instanceId, targetMap });
}

function precisionSpell() {
  return mkInstance(mkCard({
    mana_cost: 0, card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "precision" }],
  }));
}

describe("Précision — déclaration dans le registre", () => {
  it("est désormais applicable aux deux hôtes et exposée comme mot-clé de sort", () => {
    expect(ABILITIES.precision.applicable_to).toEqual(["creature", "spell"]);
    expect((ALL_SPELL_KEYWORDS as string[])).toContain("precision");
  });

  it("garde sa face créature intacte (coût, tier, zone)", () => {
    const c = ABILITIES.precision.creature;
    expect(c?.cost).toBe(7);
    expect(c?.minTier).toBe(1);
    expect(c?.zone).toBe("Terrain");
  });

  it("exige une cible, sans paramètre d'amplitude", () => {
    expect(ABILITIES.precision.spell?.needsTarget).toBe(true);
    expect(ABILITIES.precision.spell?.params).toEqual([]);
  });
});

describe("Précision — forme sort", () => {
  it("confère le mot-clé à l'unité alliée ciblée", () => {
    const s0 = mkState();
    const ally = mkInstance(mkCard({ attack: 3, health: 3 }));
    s0.players[0].board = [ally];

    const s = play(s0, precisionSpell(), { kw_0: ally.instanceId });

    expect(s.players[0].board[0].card.keywords).toContain("precision");
  });

  it("peut aussi viser une unité adverse (cible libre)", () => {
    const s0 = mkState();
    const foe = mkInstance(mkCard({ attack: 3, health: 3 }));
    s0.players[1].board = [foe];

    const s = play(s0, precisionSpell(), { kw_0: foe.instanceId });

    expect(s.players[1].board[0].card.keywords).toContain("precision");
  });

  it("ne touche pas les autres unités du plateau", () => {
    const s0 = mkState();
    const ciblee = mkInstance(mkCard({ name: "Ciblée", attack: 1, health: 1 }));
    const voisine = mkInstance(mkCard({ name: "Voisine", attack: 1, health: 1 }));
    s0.players[0].board = [ciblee, voisine];

    const s = play(s0, precisionSpell(), { kw_0: ciblee.instanceId });

    expect(s.players[0].board[0].card.keywords).toContain("precision");
    expect(s.players[0].board[1].card.keywords).not.toContain("precision");
  });

  it("sans cible résolue, ne confère rien et ne jette pas", () => {
    const s0 = mkState();
    const ally = mkInstance(mkCard({ attack: 1, health: 1 }));
    s0.players[0].board = [ally];

    const s = play(s0, precisionSpell());

    expect(s.players[0].board[0].card.keywords).not.toContain("precision");
  });

  it("est idempotent : le mot-clé n'est pas dupliqué sur une unité qui l'a déjà", () => {
    const s0 = mkState();
    const ally = mkInstance(mkCard({ attack: 1, health: 1, keywords: ["precision"] }));
    s0.players[0].board = [ally];

    const s = play(s0, precisionSpell(), { kw_0: ally.instanceId });

    const kws = s.players[0].board[0].card.keywords as string[];
    expect(kws.filter((k) => k === "precision")).toHaveLength(1);
  });
});

describe("Précision conférée — effet réel en combat", () => {
  // Le vrai contrat : une fois conférée, elle doit percer l'Armure comme si
  // l'unité était née avec. Sans passage par applyGrantedKeyword le mot-clé
  // resterait invisible pour hasKw et l'Armure absorberait quand même.
  it("l'unité qui la reçoit ignore l'Armure de sa cible", () => {
    const s0 = mkState();
    const attaquant = mkInstance(mkCard({ name: "Attaquant", attack: 3, health: 5 }));
    const blinde = mkInstance(mkCard({ name: "Blindé", attack: 0, health: 10, keywords: ["armure"] }));
    s0.players[0].board = [attaquant];
    s0.players[1].board = [blinde];

    // Référence : sans Précision, l'Armure réduit les dégâts.
    const sansDon = applyAction(mkStateWith(attaquant, blinde), {
      type: "attack", attackerInstanceId: attaquant.instanceId, targetInstanceId: blinde.instanceId,
    });
    const pvSansDon = sansDon.players[1].board[0].currentHealth;

    const s1 = play(s0, precisionSpell(), { kw_0: attaquant.instanceId });
    const s2 = applyAction(s1, {
      type: "attack", attackerInstanceId: attaquant.instanceId, targetInstanceId: blinde.instanceId,
    });
    const pvAvecDon = s2.players[1].board[0].currentHealth;

    expect(pvAvecDon).toBeLessThan(pvSansDon);
    expect(pvAvecDon).toBe(10 - 3); // Précision perce : 3 dégâts pleins
  });
});

/** État neuf partageant les mêmes cartes, pour comparer avec / sans le don. */
function mkStateWith(attaquant: CardInstance, cible: CardInstance): GameState {
  const s = mkState();
  s.players[0].board = [mkInstance(attaquant.card)];
  s.players[1].board = [mkInstance(cible.card)];
  s.players[0].board[0].instanceId = attaquant.instanceId;
  s.players[1].board[0].instanceId = cible.instanceId;
  return s;
}
