// La CADENCE d'un emblème : à quoi il réagit une fois posé.
//
// Défaut vu en partie sur « Flèche de ronce » : l'emblème était bien déposé,
// mais ne se déclenchait jamais. Pour un SORT, l'éditeur ne proposait que
// `spell_resolution` — le seul déclencheur d'un sort, une fois `on_draw` écarté.
// Or aucun emblème ne répond à `spell_resolution` : `fireEmblemsForEvent` n'est
// appelé qu'avec des événements de créature, et la file de fin de tour exige
// `on_end_of_turn`. L'emblème naissait muet, définitivement.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { isEmblemCadence, DEFAULT_EMBLEM_CADENCE } from "./capability-adapter";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CapabilityTrigger, GameState } from "./types";

describe("cadences valides", () => {
  it("accepte les événements auxquels un emblème peut réagir", () => {
    for (const t of ["on_play", "on_death", "on_attack", "on_return", "on_activation", "on_low_hp", "on_end_of_turn"] as CapabilityTrigger[]) {
      expect(isEmblemCadence(t), t).toBe(true);
    }
  });

  it("REFUSE `spell_resolution` — la cadence morte du défaut", () => {
    expect(isEmblemCadence("spell_resolution")).toBe(false);
    // La pioche non plus : elle n'a pas de sens comme cadence permanente.
    expect(isEmblemCadence("on_draw")).toBe(false);
    expect(isEmblemCadence(undefined)).toBe(false);
  });

  it("le défaut est la fin de tour, comme le lit le moteur", () => {
    expect(DEFAULT_EMBLEM_CADENCE).toBe("on_end_of_turn");
    expect(isEmblemCadence(DEFAULT_EMBLEM_CADENCE)).toBe(true);
  });
});

describe("pose d'un emblème par un SORT", () => {
  function sortEmbleme(trigger: CapabilityTrigger): GameState {
    const caps = [{
      uid: "cx_0", trigger, effectKind: "emblem", abilityId: "_composed",
      composed: {
        content: "deal_damage", magnitude: { x: 2 },
        target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" },
      },
    }] as unknown as Capability[];
    const sort = mkInstance(mkCard({
      name: "Flèche de ronce", card_type: "spell", attack: null, health: null,
      capabilities: caps as never,
    }));
    const s = mkState();
    s.players[0].hand.push(sort);
    return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
  }

  it("RAMÈNE une cadence morte au défaut, au lieu de la stocker", () => {
    // Sans ce filet, l'emblème était posé avec `spell_resolution` et restait
    // muet pour le reste de la partie. Vaut aussi pour les cartes DÉJÀ
    // enregistrées avec la cadence morte : elles se remettent à parler seules.
    const s = sortEmbleme("spell_resolution");
    expect(s.players[0].emblems).toHaveLength(1);
    expect(s.players[0].emblems[0].trigger).toBeUndefined();
  });

  it("CONSERVE une cadence valide choisie par l'auteur", () => {
    const s = sortEmbleme("on_death");
    expect(s.players[0].emblems[0].trigger).toBe("on_death");
  });

  it("pose bien l'emblème, et ne résout pas l'effet sur-le-champ", () => {
    // Un emblème n'agit pas au moment où la carte arrive : il se dépose.
    const s = sortEmbleme("on_end_of_turn");
    expect(s.players[0].emblems).toHaveLength(1);
    expect(s.players[0].emblems[0].composed?.content).toBe("deal_damage");
  });
});

describe("et il PARLE vraiment", () => {
  // Le test qui compte : « l'effet de l'emblème ne s'est jamais déclenché ».
  function poser(trigger: CapabilityTrigger): GameState {
    const caps = [{
      uid: "cx_0", trigger, effectKind: "emblem", abilityId: "_composed",
      composed: {
        content: "deal_damage", magnitude: { x: 2 },
        target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" },
      },
    }] as unknown as Capability[];
    const sort = mkInstance(mkCard({
      name: "Flèche de ronce", card_type: "spell", attack: null, health: null,
      capabilities: caps as never,
    }));
    const s = mkState();
    s.players[1].board = [mkInstance(mkCard({ name: "Cible", attack: 0, health: 20 }))];
    s.players[0].hand.push(sort);
    return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
  }

  it("frappe à la fin du tour de son porteur", () => {
    let s = poser("on_end_of_turn");
    expect(s.players[1].board[0].currentHealth).toBe(20); // rien à la pose
    s = applyAction(s, { type: "end_turn" });
    expect(s.players[1].board[0].currentHealth).toBe(18);
  });

  it("frappe AUSSI depuis une cadence morte, désormais ramenée au défaut", () => {
    // C'est exactement l'état dans lequel « Flèche de ronce » a été enregistrée.
    let s = poser("spell_resolution");
    s = applyAction(s, { type: "end_turn" });
    expect(s.players[1].board[0].currentHealth).toBe(18);
  });
});
