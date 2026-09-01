// ORDRE DE LA FIN DE TOUR — le contrat, en deux règles :
//   1. les CRÉATURES parlent d'abord, les EMBLÈMES ensuite ;
//   2. entre emblèmes, le PREMIER POSÉ chronologiquement se résout en premier.
//
// Le moteur respectait déjà les deux, mais uniquement par construction : la
// règle 1 tient à l'ordre des boucles de `buildEndOfTurnQueue`, la règle 2 au
// simple fait que `placeEmblem` fait un `push` en fin de tableau. Rien ne les
// gardait — un `sort()` sur `emblems`, une insertion en tête, ou une inversion
// des deux boucles passaient sans casser un seul test. C'est ce que ce fichier
// verrouille.
//
// L'ordre s'observe par les PAUSES : un effet « au choix » suspend la fin de
// tour et publie un pendingTrigger qui nomme sa source. Ce qui s'est déjà
// appliqué au moment de la pause dit ce qui a été traité avant.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import type { Capability, ComposedEffect } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function capCompose(composed: ComposedEffect, uid: string): Capability {
  return { uid, trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed", composed };
}
/** Capacité qui POSE un emblème de fin de tour à l'arrivée de la carte. */
function capEmbleme(composed: ComposedEffect, uid: string): Capability {
  return { uid, trigger: "on_end_of_turn", effectKind: "emblem", abilityId: "_composed", composed };
}

/** INTERACTIF : suspend la fin de tour tant qu'aucune cible n'est désignée. */
const DEGATS_AU_CHOIX: ComposedEffect = {
  content: "deal_damage", magnitude: { x: 1 },
  target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
};
/** AUTOMATIQUE : +1/+1 sur soi, observable sans cible. */
const BUFF_SOI: ComposedEffect = {
  content: "buff", magnitude: { x: 1, y: 1 },
  target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" },
};

/** Deck adverse non vide (sinon la fatigue fausse les PV du héros) et une cible
 *  ennemie encaissante, pour que les effets « au choix » aient toujours de quoi
 *  se poser — sans cible éligible ils seraient sautés en silence. */
function etat() {
  const s = mkState();
  s.players[1].deck.push(mkInstance(mkCard({ name: "Pioche" })));
  s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 0, health: 20 })));
  return s;
}

describe("Règle 1 — les créatures avant les emblèmes", () => {
  it("l'effet AUTOMATIQUE d'une créature est déjà appliqué quand un emblème suspend le tour", () => {
    const s = etat();
    const creature = mkInstance(mkCard({
      name: "Automate", attack: 2, health: 2, capabilities: [capCompose(BUFF_SOI, "c1")],
    }));
    s.players[0].board.push(creature);
    s.players[0].emblems = [{ composed: DEGATS_AU_CHOIX, stacks: 1, trigger: "on_end_of_turn" } as never];

    const pause = applyAction(s, { type: "end_turn" });

    // La pause vient bien de l'EMBLÈME…
    expect(pause.endTurnPending).toBe(true);
    expect(pause.pendingTriggers?.[0].emblemIndex).toBe(0);
    // …et la créature avait déjà parlé : c'est tout l'objet de la règle.
    expect(pause.players[0].board.find(c => c.instanceId === creature.instanceId)!.currentAttack).toBe(3);
  });

  it("une créature INTERACTIVE suspend le tour AVANT que l'emblème n'ait agi", () => {
    // Miroir du précédent : la créature passe d'abord même quand c'est ELLE qui
    // suspend. Sans quoi la règle ne tiendrait que pour les automatiques.
    const s = etat();
    const creature = mkInstance(mkCard({
      name: "Choisisseuse", attack: 1, health: 1, capabilities: [capCompose(DEGATS_AU_CHOIX, "c1")],
    }));
    s.players[0].board.push(creature);
    s.players[0].emblems = [{ composed: DEGATS_AU_CHOIX, stacks: 1, trigger: "on_end_of_turn" } as never];

    const pause = applyAction(s, { type: "end_turn" });

    expect(pause.pendingTriggers?.[0].sourceInstanceId).toBe(creature.instanceId);
    expect(pause.pendingTriggers?.[0].emblemIndex).toBeUndefined();
    // L'emblème n'a rien fait : la cible est intacte.
    expect(pause.players[1].board[0].currentHealth).toBe(20);
  });
});

describe("Règle 2 — entre emblèmes, le premier posé d'abord", () => {
  it("le tour suspend sur l'emblème le PLUS ANCIEN, puis sur le suivant", () => {
    const s = etat();
    s.players[0].emblems = [
      { composed: DEGATS_AU_CHOIX, stacks: 1, trigger: "on_end_of_turn" } as never,
      { composed: DEGATS_AU_CHOIX, stacks: 1, trigger: "on_end_of_turn" } as never,
    ];

    const premier = applyAction(s, { type: "end_turn" });
    expect(premier.pendingTriggers?.[0].emblemIndex).toBe(0);

    const cible = premier.players[1].board[0].instanceId;
    const second = applyAction(premier, {
      type: "resolve_pending_trigger",
      triggerId: premier.pendingTriggers![0].id,
      targetInstanceId: cible,
    } as never);
    expect(second.pendingTriggers?.[0].emblemIndex).toBe(1);
  });

  it("un emblème à N piles épuise ses N résolutions avant de passer au suivant", () => {
    const s = etat();
    s.players[0].emblems = [
      { composed: DEGATS_AU_CHOIX, stacks: 2, trigger: "on_end_of_turn" } as never,
      { composed: DEGATS_AU_CHOIX, stacks: 1, trigger: "on_end_of_turn" } as never,
    ];

    let st = applyAction(s, { type: "end_turn" });
    const vus: (number | undefined)[] = [];
    for (let i = 0; i < 3 && st.pendingTriggers?.length; i++) {
      vus.push(st.pendingTriggers[0].emblemIndex);
      st = applyAction(st, {
        type: "resolve_pending_trigger",
        triggerId: st.pendingTriggers[0].id,
        targetInstanceId: st.players[1].board[0].instanceId,
      } as never);
    }
    expect(vus).toEqual([0, 0, 1]);
  });

  it("la POSE réelle range les emblèmes dans l'ordre chronologique", () => {
    // Les tests ci-dessus écrivent `emblems` à la main ; celui-ci vérifie que le
    // chemin de pose (placeEmblem) produit bien cet ordre-là, en jouant deux
    // cartes l'une après l'autre.
    const s = etat();
    const ancienne = mkInstance(mkCard({
      name: "Ancienne", mana_cost: 1, attack: 1, health: 1,
      capabilities: [capEmbleme(DEGATS_AU_CHOIX, "e1")],
    }));
    const recente = mkInstance(mkCard({
      name: "Récente", mana_cost: 1, attack: 1, health: 1,
      capabilities: [capEmbleme(BUFF_SOI, "e2")],
    }));
    s.players[0].hand.push(ancienne, recente);

    let st = applyAction(s, { type: "play_card", cardInstanceId: ancienne.instanceId } as never);
    st = applyAction(st, { type: "play_card", cardInstanceId: recente.instanceId } as never);

    expect(st.players[0].emblems).toHaveLength(2);
    expect(st.players[0].emblems[0].sourceName).toBe("Ancienne");
    expect(st.players[0].emblems[1].sourceName).toBe("Récente");
  });
});
