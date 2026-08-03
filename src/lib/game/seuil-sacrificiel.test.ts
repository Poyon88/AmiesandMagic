// SEUIL SACRIFICIEL +X/+Y : +X ATK / +Y PV tant que le deck du contrôleur est
// descendu au seuil (SEUIL_DECK_THRESHOLD) ou en dessous.
//
// Jumelle de Force des ancêtres, adossée à la BIBLIOTHÈQUE plutôt qu'au
// cimetière — même aura dynamique, même comptabilité par différentiel des PV.
// Le seuil se refranchit dans les deux sens : Incinération et Retour différé
// remettent des cartes sous le deck.
import { describe, expect, it } from "vitest";
import { applyAction, recalculateAuras } from "./engine";
import { SEUIL_DECK_THRESHOLD } from "./constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState } from "./types";

function porteur(x = 2, y = 3) {
  return mkInstance(mkCard({
    name: "Sacrifié", attack: 2, health: 5,
    keywords: ["seuil_sacrificiel"] as never,
    keyword_instances: [{ id: "seuil_sacrificiel", x, y } as never],
  }));
}

/** Plateau de P0 avec un porteur, et un deck de `n` cartes. */
function etat(n: number, inst = porteur()): GameState {
  const s = mkState();
  s.players[0].board.push(inst);
  s.players[0].deck = Array.from({ length: n }, (_, i) => mkInstance(mkCard({ name: `D${i}` })));
  return s;
}

describe("Seuil Sacrificiel — la bascule du seuil", () => {
  it("une carte AU-DESSUS du seuil : aucun bonus", () => {
    const s = etat(SEUIL_DECK_THRESHOLD + 1);
    recalculateAuras(s.players[0], s.players[1]);
    const c = s.players[0].board[0];
    expect(c.currentAttack).toBe(2);
    expect(c.maxHealth).toBe(5);
  });

  it("PILE au seuil : le bonus s'applique (la borne est inclusive)", () => {
    // C'est ici qu'un `<` au lieu d'un `<=` se verrait.
    const s = etat(SEUIL_DECK_THRESHOLD);
    recalculateAuras(s.players[0], s.players[1]);
    const c = s.players[0].board[0];
    expect(c.currentAttack).toBe(4); // 2 + 2
    expect(c.maxHealth).toBe(8);     // 5 + 3
    expect(c.currentHealth).toBe(8);
  });

  it("le bonus RETOMBE si le deck repasse au-dessus, sans tuer la créature", () => {
    const s = etat(SEUIL_DECK_THRESHOLD);
    recalculateAuras(s.players[0], s.players[1]);
    expect(s.players[0].board[0].maxHealth).toBe(8);

    // Incinération / Retour différé remettent des cartes sous le deck.
    s.players[0].deck.push(mkInstance(mkCard({ name: "Recyclée" })));
    // La créature est déjà blessée : le retrait d'aura ne doit pas l'achever.
    s.players[0].board[0].currentHealth = 2;
    recalculateAuras(s.players[0], s.players[1]);

    const c = s.players[0].board[0];
    expect(c.currentAttack).toBe(2);
    expect(c.maxHealth).toBe(5);
    expect(c.currentHealth).toBeGreaterThanOrEqual(1);
  });

  it("chaque camp regarde SON propre deck", () => {
    // Une créature adverse ne doit pas s'allumer parce que MON deck est bas.
    const s = etat(SEUIL_DECK_THRESHOLD);          // deck de P0 : au seuil
    s.players[1].deck = Array.from({ length: 40 }, (_, i) => mkInstance(mkCard({ name: `E${i}` })));
    const adverse = porteur();
    s.players[1].board.push(adverse);

    recalculateAuras(s.players[0], s.players[1]);

    expect(s.players[0].board[0].currentAttack).toBe(4); // allié : actif
    expect(s.players[1].board[0].currentAttack).toBe(2); // adverse : inactif
  });

  it("sans valeurs saisies, retombe sur +1/+1", () => {
    const nu = mkInstance(mkCard({
      name: "Nu", attack: 1, health: 1,
      keywords: ["seuil_sacrificiel"] as never,
    }));
    const s = etat(SEUIL_DECK_THRESHOLD, nu);
    recalculateAuras(s.players[0], s.players[1]);
    expect(s.players[0].board[0].currentAttack).toBe(2);
    expect(s.players[0].board[0].maxHealth).toBe(2);
  });

  it("un recalcul répété ne cumule pas le bonus", () => {
    // Le piège classique de ces auras : l'ATK est remise à plat en tête de
    // recalculateAuras, les PV suivent par différentiel. Deux passages doivent
    // donner le même résultat qu'un seul.
    const s = etat(SEUIL_DECK_THRESHOLD);
    recalculateAuras(s.players[0], s.players[1]);
    recalculateAuras(s.players[0], s.players[1]);
    recalculateAuras(s.players[0], s.players[1]);
    const c = s.players[0].board[0];
    expect(c.currentAttack).toBe(4);
    expect(c.maxHealth).toBe(8);
  });
});

// ─── Le piège du Silence ────────────────────────────────────────────────────
// `stripBoostsToBase` recompose les PV max à partir des bonus d'AURA conservés,
// qu'il ne remet pas à zéro (c'est recalculateAuras qui les réconcilie par
// différentiel). Oublier d'y compter le bonus de Seuil Sacrificiel ferait
// perdre des PV max à toute créature silencée qui le portait — sans erreur pour
// le signaler. Ce test est là pour ça.
describe("Seuil Sacrificiel — Silence", () => {
  function sortSilence() {
    return mkInstance(mkCard({
      name: "Silence", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "silence" }] as never,
    }));
  }

  it("la créature silencée perd le bonus et revient à ses stats imprimées", () => {
    const s = etat(SEUIL_DECK_THRESHOLD);
    recalculateAuras(s.players[0], s.players[1]);
    const cible = s.players[0].board[0];
    expect(cible.maxHealth).toBe(8); // 5 imprimés + 3 d'aura

    const sort = sortSilence();
    s.players[0].hand.push(sort);
    const st = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId, targetInstanceId: cible.instanceId,
    });

    const apres = st.players[0].board.find(c => c.card.name === "Sacrifié")!;
    expect(apres.currentAttack).toBe(2);
    expect(apres.maxHealth).toBe(5);          // et non 2, si le bonus était oublié
    expect(apres.currentHealth).toBeLessThanOrEqual(5);
    expect(apres.currentHealth).toBeGreaterThanOrEqual(1);
  });
});
