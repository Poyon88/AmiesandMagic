// DON D'UN EFFET COMPOSÉ — « confère : à la fin du tour, dévore une unité au
// hasard du cimetière adverse ».
//
// Le don ne savait transporter qu'une capacité du registre et son déclencheur :
// impossible de dire CE que la capacité conférée viserait. `grantCapability`
// fait voyager l'effet composé entier (déclencheur, contenu, cibles) ; le moteur
// le recopie dans les capacités de la receveuse.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { describeComposedCap } from "./composed-display";
import { getCapabilities } from "./capability-adapter";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, GameState, TargetSpec } from "./types";

const ALLIE_AU_CHOIX: TargetSpec = { entity: "unit", count: 1, side: "ally", location: "board", designation: "choice" };

const DEVORE_AU_CIMETIERE: Capability = {
  uid: "x", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed",
  composed: { content: "devoration", target: { entity: "unit", count: 1, side: "enemy", location: "graveyard", designation: "random" } },
};

function don(conferee: Capability): CardInstance {
  const composed: ComposedEffect = { content: "grant_keyword", grantAbilityId: "_composed", grantCapability: conferee, target: ALLIE_AU_CHOIX };
  const caps: Capability[] = [{ uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed }];
  return mkInstance(mkCard({ name: "Le Don", card_type: "spell", attack: null, health: null, capabilities: caps as never }));
}

function lancer(s: GameState, sort: CardInstance, cible: CardInstance): GameState {
  initRNG(42);
  s.players[0].hand.push(sort);
  s.players[0].mana = 10;
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId, targetMap: { cx_0: cible.instanceId } });
}

describe("don d'un effet composé", () => {
  it("la capacité entière rejoint celles de la receveuse, sous un uid à elle", () => {
    const s0 = mkState();
    const goule = mkInstance(mkCard({ name: "Goule", attack: 1, health: 1 }));
    s0.players[0].board = [goule];

    const s = lancer(s0, don(DEVORE_AU_CIMETIERE), goule);
    const caps = getCapabilities(s.players[0].board[0].card);
    expect(caps).toContainEqual(expect.objectContaining({
      uid: "don_0", trigger: "on_end_of_turn", abilityId: "_composed",
      composed: expect.objectContaining({ content: "devoration" }),
    }));
  });

  it("fin de tour : la receveuse dévore une unité du cimetière ADVERSE, qui quitte la partie", () => {
    const s0 = mkState();
    const goule = mkInstance(mkCard({ name: "Goule", attack: 1, health: 1 }));
    s0.players[0].board = [goule];
    s0.players[0].graveyard = [mkInstance(mkCard({ name: "Mort allié", attack: 9, health: 9 }))];
    s0.players[1].graveyard = [
      mkInstance(mkCard({ name: "Cadavre", attack: 3, health: 4 })),
      mkInstance(mkCard({ name: "Parchemin", card_type: "spell", attack: null, health: null })),
    ];

    let s = lancer(s0, don(DEVORE_AU_CIMETIERE), goule);
    s = applyAction(s, { type: "end_turn" });

    const apres = s.players[0].board.find((c) => c.card.name === "Goule")!;
    expect([apres.currentAttack, apres.maxHealth]).toEqual([4, 5]);
    // Le cadavre est exilé ; l'action du cimetière et le mort allié restent.
    expect(s.players[1].graveyard.map((c) => c.card.name)).toEqual(["Parchemin"]);
    expect(s.players[0].graveyard.map((c) => c.card.name)).toContain("Mort allié");
    expect(s.devorationEvents).toEqual([
      expect.objectContaining({ zone: "graveyard", ownerId: s.players[1].id, card: expect.objectContaining({ name: "Cadavre" }) }),
    ]);
  });

  it("deux dons s'ajoutent", () => {
    const s0 = mkState();
    const goule = mkInstance(mkCard({ name: "Goule", attack: 1, health: 1 }));
    s0.players[0].board = [goule];
    let s = lancer(s0, don(DEVORE_AU_CIMETIERE), goule);
    s = lancer(s, don(DEVORE_AU_CIMETIERE), s.players[0].board[0]);
    const uids = getCapabilities(s.players[0].board[0].card).map((c) => c.uid);
    expect(uids).toEqual(expect.arrayContaining(["don_0", "don_1"]));
  });

  it("le texte de l'action dit ce que fera la capacité conférée", () => {
    const sort = don(DEVORE_AU_CIMETIERE);
    expect(describeComposedCap(getCapabilities(sort.card)[0])).toBe(
      "Confère « À la fin du tour : dévore une unité ennemie du cimetière au hasard » à une unité alliée au choix.",
    );
  });

  it("bord indifférent au cimetière : « de n'importe quel cimetière »", () => {
    const cap: Capability = {
      uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "devoration", magnitude: { x: 1 }, target: { entity: "unit", count: 2, side: "any", location: "graveyard", designation: "random" } },
    };
    expect(describeComposedCap(cap)).toBe("Dévore 2 unités de n'importe quel cimetière au hasard.");
  });

  it("bord indifférent : les unités sont prises dans les DEUX cimetières", () => {
    const s0 = mkState();
    s0.players[0].graveyard = [mkInstance(mkCard({ name: "Mort allié", attack: 2, health: 2 }))];
    s0.players[1].graveyard = [mkInstance(mkCard({ name: "Cadavre", attack: 3, health: 4 }))];
    const fosse = mkInstance(mkCard({
      name: "Fosse", attack: 0, health: 1, mana_cost: 1,
      capabilities: [{
        uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "devoration", target: { entity: "unit", count: 2, side: "any", location: "graveyard", designation: "random" } },
      }] as never,
    }));
    s0.players[0].hand.push(fosse);
    s0.players[0].mana = 10;
    initRNG(42);
    const s = applyAction(s0, { type: "play_card", cardInstanceId: fosse.instanceId });
    const apres = s.players[0].board.find((c) => c.card.name === "Fosse")!;
    expect([apres.currentAttack, apres.maxHealth]).toEqual([5, 7]);
    expect(s.players[0].graveyard).toHaveLength(0);
    expect(s.players[1].graveyard).toHaveLength(0);
  });
});
