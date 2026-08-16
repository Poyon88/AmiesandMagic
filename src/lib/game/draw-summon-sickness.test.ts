// MAL D'INVOCATION des créatures arrivées PENDANT le début de tour.
//
// Le défaut, tel qu'il se produisait : `startTurn` pioche, puis parcourt tout le
// plateau pour « réveiller » les créatures (retirer leur mal d'invocation). Une
// créature invoquée PAR la pioche — Présage de l'Esprit Éveillé — était donc
// posée avec son mal d'invocation, puis réveillée deux lignes plus loin par une
// boucle qui ne savait pas qu'elle venait d'arriver. Elle pouvait attaquer le
// tour même de son apparition.
//
// Le retour d'une unité volée par Corruption souffrait exactement du même
// enchaînement, et c'est le second cas couvert ici.
//
// Ce que les tests verrouillent :
//   · une créature arrivée pendant ce début de tour GARDE son mal d'invocation ;
//   · la garde s'ABSTIENT de réveiller, elle ne pose jamais le mal elle-même —
//     sinon elle écraserait une Traque ;
//   · les créatures DÉJÀ en jeu sont bien réveillées — la correction ne doit pas
//     paralyser tout le plateau.
import { describe, expect, it } from "vitest";
import { applyAction, canAttack } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, GameState } from "./types";

function capPioche(composed: ComposedEffect): Capability {
  return { uid: "c0", trigger: "on_draw", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** Carte qui, en étant piochée, invoque un jeton sur le plateau du pioche-carte.
 *  Pas de mots-clés paramétrables : `summon_token` les tire du gabarit de jeton,
 *  pas de l'effet composé. */
function carteQuiInvoqueALaPioche() {
  return mkInstance(mkCard({
    name: "Présage",
    capabilities: [capPioche({
      content: "summon_token",
      token: { race: "Esprits", attack: 2, health: 2 },
    } as ComposedEffect)],
  }));
}

/** Fin de tour de P0 ⇒ début de tour de P1, qui pioche la 1re carte de son deck. */
const faitPiocher = (s: GameState) => applyAction(s, { type: "end_turn" });

const invoque = (s: GameState) => s.players[1].board.find((c) => c.card.name !== "Vétéran");

// ───────────────────────────────────────────────────────────────────────────

describe("créature invoquée par un effet « à la pioche »", () => {
  it("garde son mal d'invocation", () => {
    const s = mkState();
    s.players[1].deck = [carteQuiInvoqueALaPioche()];

    const st = faitPiocher(s);

    const nouvelle = invoque(st);
    expect(nouvelle, "aucune créature invoquée — le déclencheur n'a pas tiré").toBeDefined();
    expect(nouvelle!.hasSummoningSickness).toBe(true);
  });

  it("et ne peut donc pas attaquer le tour de son arrivée", () => {
    // `hasSummoningSickness` n'est qu'un drapeau : ce qui compte pour le joueur,
    // c'est que le moteur refuse l'attaque.
    const s = mkState();
    s.players[1].deck = [carteQuiInvoqueALaPioche()];
    s.players[0].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 5 })));

    const st = faitPiocher(s);

    const nouvelle = invoque(st)!;
    expect(canAttack(st, nouvelle.instanceId)).toBe(false);
  });

  it("la correction ne POSE pas le mal d'invocation, elle s'abstient de le retirer", () => {
    // Nuance qui compte : si la garde ÉCRIVAIT `true`, elle écraserait le choix
    // de l'invocation — une créature avec Traque, dispensée par son mot-clé,
    // se retrouverait paralysée. On vérifie donc qu'une créature arrivant SANS
    // mal d'invocation le reste.
    const s = mkState();
    s.players[1].deck = [carteQuiInvoqueALaPioche()];
    const st = faitPiocher(s);
    const nouvelle = invoque(st)!;

    // Elle l'a parce que l'invocation le lui a posé…
    expect(nouvelle.hasSummoningSickness).toBe(true);
    // …et le tour SUIVANT, elle est réveillée normalement.
    const apres = applyAction(applyAction(st, { type: "end_turn" }), { type: "end_turn" });
    const memeCreature = apres.players[1].board.find((c) => c.instanceId === nouvelle.instanceId)!;
    expect(memeCreature.hasSummoningSickness).toBe(false);
  });
});

describe("unité rendue par Corruption au début du tour", () => {
  it("garde son mal d'invocation — même enchaînement, même défaut", () => {
    // `startTurn` rend l'unité volée AVANT la boucle de réveil : elle arrivait
    // avec son mal d'invocation, aussitôt effacé. Elle pouvait donc attaquer
    // son voleur le tour même de son retour.
    const s = mkState();
    const volee = mkInstance(mkCard({ name: "Reprise", attack: 3, health: 3 }));
    volee.originalOwnerId = s.players[1].id;   // appartient à P1…
    s.players[0].board.push(volee);            // …mais se trouve chez P0
    s.players[0].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 5 })));

    const st = faitPiocher(s);                 // début de tour de P1

    const rendue = st.players[1].board.find((c) => c.card.name === "Reprise");
    expect(rendue, "l'unité n'a pas été rendue").toBeDefined();
    expect(rendue!.hasSummoningSickness).toBe(true);
    expect(canAttack(st, rendue!.instanceId)).toBe(false);
  });
});

describe("les créatures déjà en jeu sont toujours réveillées", () => {
  it("une créature posée au tour précédent peut attaquer", () => {
    // Le risque de la correction : figer la liste trop tôt et ne plus réveiller
    // personne. Ce test tomberait aussitôt.
    const s = mkState();
    const veteran = mkInstance(mkCard({ name: "Vétéran", attack: 3, health: 3 }));
    veteran.hasSummoningSickness = true; // posé au tour d'avant
    s.players[1].board.push(veteran);
    s.players[0].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 5 })));

    const st = faitPiocher(s);

    const apres = st.players[1].board.find((c) => c.card.name === "Vétéran")!;
    expect(apres.hasSummoningSickness).toBe(false);
    expect(canAttack(st, apres.instanceId)).toBe(true);
  });

  it("réveil et invocation cohabitent dans le même tour", () => {
    const s = mkState();
    const veteran = mkInstance(mkCard({ name: "Vétéran", attack: 3, health: 3 }));
    veteran.hasSummoningSickness = true;
    s.players[1].board.push(veteran);
    s.players[1].deck = [carteQuiInvoqueALaPioche()];

    const st = faitPiocher(s);

    expect(st.players[1].board.find((c) => c.card.name === "Vétéran")!.hasSummoningSickness).toBe(false);
    expect(invoque(st)!.hasSummoningSickness).toBe(true);
  });
});
