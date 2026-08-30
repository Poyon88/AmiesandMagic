// Une SÉLECTION portée par un emblème.
//
// Défaut vu en partie sur « Œil dans les feuillages » (Sélection, emblème 2
// tours) : l'emblème se posait, la fin de tour arrivait, et rien ne se passait.
//
// Deux murs successifs, tous deux dus à l'ABSENCE D'INSTANCE SOURCE — la carte
// d'origine est un sort, parti au cimetière :
//   1. `selCard = source?.card ?? opts?.sourceCard` était indéfini, et la
//      Sélection abandonnait à la ligne suivante, sans un mot ;
//   2. ce mur franchi, la garde d'interactivité n'acceptait que `!!source` ou
//      `spell_resolution` : la modale ne s'ouvrait pas et la carte tombait dans
//      le repli aléatoire.
//
// C'est la MÊME panne que celle déjà réparée pour les sorts, revenue sur une
// troisième provenance sans source.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, GameState } from "./types";

function sortEmblemeSelection(): ReturnType<typeof mkInstance> {
  const caps = [{
    uid: "cx_0", trigger: "on_end_of_turn", effectKind: "emblem", abilityId: "_composed",
    composed: { content: "selection", magnitude: { x: 3 } },
  }] as unknown as Capability[];
  return mkInstance(mkCard({
    name: "Œil dans les feuillages", card_type: "spell", attack: null, health: null,
    faction: "Elfes", card_alignment: "bon",
    capabilities: caps as never,
  }));
}

const commune = (id: number, cout: number): Card =>
  mkCard({ id, name: `Commune ${id}`, mana_cost: cout, rarity: "Commune", faction: "Elfes", card_alignment: "bon", attack: 1, health: 1 });

function poser(): GameState {
  const s = mkState();
  // Pool de collection : c'est là que la Sélection puise.
  s.factionCardPool = [commune(901, 1), commune(902, 1), commune(903, 1), commune(904, 1)];
  const sort = sortEmblemeSelection();
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
}

describe("emblème + Sélection", () => {
  it("garde la provenance de la carte qui l'a posé", () => {
    // Sans ces deux champs, le pool ne peut pas être construit : l'emblème n'a
    // plus sa carte, elle est au cimetière.
    const s = poser();
    expect(s.players[0].emblems).toHaveLength(1);
    expect(s.players[0].emblems[0].sourceFaction).toBe("Elfes");
    expect(s.players[0].emblems[0].sourceAlignment).toBe("bon");
  });

  it("OUVRE la modale à la fin du tour, au lieu de ne rien faire", () => {
    // Le symptôme exact : « l'emblème n'a pas fait son effet ».
    let s = poser();
    s = applyAction(s, { type: "end_turn" });

    const trig = (s.pendingTriggers ?? []).find(t => t.selectionType === "selection");
    expect(trig, "aucun déclencheur de Sélection posé").toBeDefined();
    expect(trig!.selectionOptionIds?.length).toBeGreaterThan(0);
    // Le tour reste en pause tant que le joueur n'a pas choisi.
    expect(s.endTurnPending).toBe(true);
  });

  it("donne au déclencheur une identité STABLE, sans instance source", () => {
    // La carte d'origine est au cimetière : le rang de l'emblème est la seule
    // identité dont on dispose.
    let s = poser();
    s = applyAction(s, { type: "end_turn" });
    expect((s.pendingTriggers ?? [])[0].id).toBe("emblem_0#selection");
  });
});
