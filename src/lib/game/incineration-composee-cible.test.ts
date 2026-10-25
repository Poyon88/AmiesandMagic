// Incinération COMPOSÉE dont la cible décrit les cartes d'un cimetière :
// « toutes » vide le pool (X n'est plus un plafond), et le tirage respecte
// nature / appartenance / coût. Cas réel : un emblème « au début du tour,
// remet toutes les cartes de votre cimetière dans votre deck » n'en recyclait
// qu'une (X = 1), ou tout le cimetière sans filtre avec un grand X.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState, TargetSpec } from "./types";

const cimetiere = (spec: Partial<TargetSpec>): TargetSpec =>
  ({ side: "ally", count: "all", entity: "unit", location: "graveyard", designation: "random", ...spec }) as TargetSpec;

function emblemeIncineration(target: TargetSpec, x = 1) {
  return mkInstance(mkCard({
    name: "Cycle éternel", card_type: "spell", attack: null, health: null, mana_cost: 0,
    capabilities: [{
      uid: "cx_0", trigger: "on_start_of_turn", effectKind: "emblem", abilityId: "_composed",
      composed: { content: "incineration", magnitude: { x }, target },
    } as Capability] as never,
  }));
}

/** Pose l'emblème, ajoute 3 unités (coûts 1/2/5) et 2 actions au cimetière,
 *  puis avance jusqu'au début du prochain tour du porteur. */
function jouer(target: TargetSpec, x = 1): GameState {
  let st = mkState();
  for (const p of st.players) for (let i = 0; i < 5; i++) p.deck.push(mkInstance(mkCard({ name: "Pioche" })));
  const me = st.players[0];
  const c = emblemeIncineration(target, x);
  me.hand.push(c);
  st = applyAction(st, { type: "play_card", cardInstanceId: c.instanceId });
  const g = st.players[0].graveyard;
  [1, 2, 5].forEach((cout, i) => g.push(mkInstance(mkCard({ name: `Unité ${i}`, mana_cost: cout }))));
  for (let i = 0; i < 2; i++) g.push(mkInstance(mkCard({ name: `Action ${i}`, card_type: "spell", attack: null, health: null })));
  do st = applyAction(st, { type: "end_turn" }); while (st.currentPlayerIndex !== 0);
  return st;
}
const noms = (st: GameState) => st.players[0].graveyard.map(c => c.card.name).sort();

describe("Incinération composée — cible dans le cimetière", () => {
  it("« toutes » avec X = 1 : tout le cimetière repart sous le deck", () => {
    const st = jouer(cimetiere({}));
    expect(noms(st)).toEqual([]);
    // 5 cartes de départ + 6 recyclées (dont l'emblème lui-même) - 1 pioche.
    expect(st.players[0].deck).toHaveLength(10);
  });

  it("nature Unité : les actions restent au cimetière", () => {
    const st = jouer(cimetiere({ cardKind: "creature" }));
    expect(noms(st)).toEqual(["Action 0", "Action 1", "Cycle éternel"]);
  });

  it("coût max : seules les cartes assez peu chères partent", () => {
    const st = jouer(cimetiere({ cardKind: "creature", maxCost: 2 }));
    expect(noms(st)).toEqual(["Action 0", "Action 1", "Cycle éternel", "Unité 2"]);
  });

  it("nombre fixe au hasard : X cartes, prises dans le pool filtré", () => {
    // Pool = les 3 actions (dont l'emblème lui-même) ; X = 2 en recycle deux.
    const st = jouer(cimetiere({ count: 1, cardKind: "spell" }), 2);
    expect(noms(st).filter(n => n.startsWith("Unité"))).toEqual(["Unité 0", "Unité 1", "Unité 2"]);
    expect(noms(st)).toHaveLength(4);
  });

  it("bord indifférent : les deux cimetières, chacun sous le deck de son propriétaire", () => {
    for (const designation of ["random", "choice"] as const) {
      let st = mkState();
      for (const p of st.players) for (let i = 0; i < 5; i++) p.deck.push(mkInstance(mkCard({ name: "Pioche" })));
      const c = emblemeIncineration(cimetiere({ side: "any", designation }));
      st.players[0].hand.push(c);
      st = applyAction(st, { type: "play_card", cardInstanceId: c.instanceId });
      for (let i = 0; i < 2; i++) {
        st.players[0].graveyard.push(mkInstance(mkCard({ name: `Moi ${i}` })));
        st.players[1].graveyard.push(mkInstance(mkCard({ name: `Lui ${i}` })));
      }
      do st = applyAction(st, { type: "end_turn" }); while (st.currentPlayerIndex !== 0);
      // « Toutes » + « au choix » : rien à désigner, aucune pause.
      expect(st.pendingTriggers ?? []).toHaveLength(0);
      expect(st.players[0].graveyard).toHaveLength(0);
      expect(st.players[1].graveyard).toHaveLength(0);
      expect(st.players[0].deck.some(d => d.card.name === "Moi 0")).toBe(true);
      expect(st.players[1].deck.some(d => d.card.name === "Lui 0")).toBe(true);
      expect(st.players[0].deck.some(d => d.card.name.startsWith("Lui"))).toBe(false);
    }
  });

  it("texte de la carte", () => {
    expect(describeComposedCap({
      uid: "cx_0", trigger: "on_start_of_turn", effectKind: "emblem", abilityId: "_composed",
      composed: { content: "incineration", magnitude: { x: 1 }, target: cimetiere({ side: "any", designation: "choice" }) },
    } as Capability)).toBe("Emblème (permanent). Au début de votre tour : remet toutes les cartes des deux cimetières sous le deck de leur propriétaire.");
    const cap = (target: TargetSpec, x = 1) => describeComposedCap({
      uid: "cx_0", trigger: "on_start_of_turn", effectKind: "emblem", abilityId: "_composed",
      composed: { content: "incineration", magnitude: { x }, target },
    } as Capability);
    expect(cap(cimetiere({}))).toBe("Emblème (permanent). Au début de votre tour : remet toutes les cartes de votre cimetière sous votre deck.");
    expect(cap(cimetiere({ count: 1, cardKind: "creature", maxCost: 3 }), 2))
      .toBe("Emblème (permanent). Au début de votre tour : remet 2 unités de coût 3 ou moins au hasard de votre cimetière sous votre deck.");
    expect(cap(cimetiere({ side: "enemy", count: 4, designation: "choice" }), 4))
      .toBe("Emblème (permanent). Au début de votre tour : remet 4 cartes au choix du cimetière adverse sous le deck adverse.");
  });
});
