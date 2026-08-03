// SEUIL DE COLÈRE X : +X aux dégâts d'un sort si le deck du lanceur est
// descendu au seuil (SEUIL_DECK_THRESHOLD) ou en dessous.
//
// Modificateur GLOBAL sans cible propre, même famille que Précision et Touché
// mortel : seul il ne fait rien, il se combine à un mot-clé de dégâts.
//
// La règle qui structure tout : le bonus s'applique UNE SEULE FOIS, au premier
// paquet de dégâts du sort. Une Tempête 3 avec Colère 2 inflige 3, puis 1,
// puis 1 — et non 3×3.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { SEUIL_DECK_THRESHOLD } from "./constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState, SpellKeywordInstance } from "./types";

/** Deck du lanceur à `n` cartes ; `n <= 25` déclenche le seuil. */
function etat(n: number): GameState {
  const s = mkState();
  s.players[0].deck = Array.from({ length: n }, (_, i) => mkInstance(mkCard({ name: `D${i}` })));
  return s;
}

function sort(nom: string, kws: SpellKeywordInstance[]) {
  return mkInstance(mkCard({
    name: nom, card_type: "spell", attack: null, health: null,
    mana_cost: 0, spell_keywords: kws,
  }));
}

const jouer = (s: GameState, carte: ReturnType<typeof mkInstance>, cible?: string) =>
  applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, targetInstanceId: cible });

describe("Seuil de colère — la condition", () => {
  it("sous le seuil : les dégâts montent de X", () => {
    const s = etat(SEUIL_DECK_THRESHOLD);
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 10 }));
    s.players[1].board.push(cible);
    const c = sort("Foudre", [{ id: "impact", amount: 3 }, { id: "seuil_colere", amount: 2 }]);
    s.players[0].hand.push(c);

    const st = jouer(s, c, cible.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(5); // 10 - (3 + 2)
  });

  it("au-dessus du seuil : dégâts normaux", () => {
    const s = etat(SEUIL_DECK_THRESHOLD + 1);
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 10 }));
    s.players[1].board.push(cible);
    const c = sort("Foudre", [{ id: "impact", amount: 3 }, { id: "seuil_colere", amount: 2 }]);
    s.players[0].hand.push(c);

    const st = jouer(s, c, cible.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(7); // 10 - 3
  });

  it("le seuil regarde le deck du LANCEUR, pas celui de la cible", () => {
    const s = etat(SEUIL_DECK_THRESHOLD + 10);      // lanceur au-dessus
    s.players[1].deck = [];                          // adversaire à sec
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 10 }));
    s.players[1].board.push(cible);
    const c = sort("Foudre", [{ id: "impact", amount: 3 }, { id: "seuil_colere", amount: 2 }]);
    s.players[0].hand.push(c);

    const st = jouer(s, c, cible.instanceId);

    expect(st.players[1].board[0].currentHealth).toBe(7); // pas de bonus
  });
});

describe("Seuil de colère — une seule fois", () => {
  it("Tempête : seul le PREMIER paquet est majoré", () => {
    // LA décision de conception. Tempête 3 = 3 paquets de 1 dégât répartis au
    // hasard ; avec Colère 2 le total doit être 3 + 2 = 5, et non 3 × (1+2) = 9.
    const s = etat(SEUIL_DECK_THRESHOLD);
    initRNG(7);
    const cible = mkInstance(mkCard({ name: "Encaisseur", attack: 0, health: 30 }));
    s.players[1].board.push(cible);
    const c = sort("Tempête", [{ id: "tempete", amount: 3 }, { id: "seuil_colere", amount: 2 }]);
    s.players[0].hand.push(c);

    const st = jouer(s, c);

    const subis = 30 - st.players[1].board[0].currentHealth;
    expect(subis, "3 paquets de 1, dont un seul majoré de 2").toBe(5);
  });

  it("deux sorts dans le tour : chacun a sa propre colère", () => {
    // Le compteur doit être réarmé à chaque résolution, pas consommé pour la
    // partie entière.
    const s = etat(SEUIL_DECK_THRESHOLD);
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 30 }));
    s.players[1].board.push(cible);
    const a = sort("Foudre A", [{ id: "impact", amount: 3 }, { id: "seuil_colere", amount: 2 }]);
    const b = sort("Foudre B", [{ id: "impact", amount: 3 }, { id: "seuil_colere", amount: 2 }]);
    s.players[0].hand.push(a, b);

    let st = jouer(s, a, cible.instanceId);
    st = applyAction(st, {
      type: "play_card", cardInstanceId: b.instanceId,
      targetInstanceId: st.players[1].board[0].instanceId,
    });

    expect(st.players[1].board[0].currentHealth).toBe(20); // 30 - 5 - 5
  });

  it("un sort SANS le mot-clé n'est pas majoré", () => {
    const s = etat(SEUIL_DECK_THRESHOLD);
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 10 }));
    s.players[1].board.push(cible);
    const c = sort("Foudre nue", [{ id: "impact", amount: 3 }]);
    s.players[0].hand.push(c);

    expect(jouer(s, c, cible.instanceId).players[1].board[0].currentHealth).toBe(7);
  });
});

describe("Seuil de colère — portée", () => {
  it("majore aussi les dégâts au HÉROS", () => {
    const s = etat(SEUIL_DECK_THRESHOLD);
    const avant = s.players[1].hero.hp;
    const c = sort("Foudre", [{ id: "impact", amount: 3 }, { id: "seuil_colere", amount: 2 }]);
    s.players[0].hand.push(c);

    const st = jouer(s, c, "enemy_hero");

    expect(st.players[1].hero.hp).toBe(avant - 5);
  });

  it("ne fuit PAS sur le râle d'agonie d'une créature tuée par le sort", () => {
    // Le bonus appartient au sort. Un Carnage déclenché par sa victime emprunte
    // le canal « dégâts de sort » pour percer Armure et Indestructible, mais il
    // passe `fromSpell: false` — il doit donc rester à sa valeur nue.
    const s = etat(SEUIL_DECK_THRESHOLD);
    const victime = mkInstance(mkCard({
      name: "Vengeur", attack: 1, health: 1,
      keywords: ["carnage"] as never,
      keyword_instances: [{ id: "carnage", x: 2 } as never],
    }));
    victime.carnageX = 2; // mkInstance ne passe pas par createCardInstance
    const temoin = mkInstance(mkCard({ name: "Témoin", attack: 1, health: 10 }));
    s.players[1].board.push(victime, temoin);
    const c = sort("Foudre", [{ id: "impact", amount: 3 }, { id: "seuil_colere", amount: 2 }]);
    s.players[0].hand.push(c);

    const st = jouer(s, c, victime.instanceId);

    expect(st.players[1].board.some(x => x.card.name === "Vengeur")).toBe(false);
    // Carnage 2 nu — et non 4 si la colère avait fuité sur le râle.
    expect(st.players[1].board.find(x => x.card.name === "Témoin")!.currentHealth).toBe(8);
  });
});
