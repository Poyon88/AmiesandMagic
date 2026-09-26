// EXÉCUTION peut aussi détruire un OBJET : il quitte la table pour le cimetière
// de son propriétaire, et son porteur perd ce qu'il lui apportait.
import { describe, expect, it } from "vitest";
import { applyAction, getSpellTargets, needsTarget } from "./engine";
import { objetsDe } from "./items";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, CardInstance, GameAction, GameState, SpellKeywordInstance } from "./types";

const objet = (name: string, atk: number, pv: number): CardInstance =>
  mkInstance(mkCard({ name, card_type: "item", mana_cost: 0, attack: atk, health: pv, faction: "Humains", equip_cost: 0 }));
const creature = (name: string, atk = 1, pv = 3): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 0, attack: atk, health: pv, faction: "Humains" }));
const execution = () => mkInstance(mkCard({
  name: "Couperet", card_type: "spell", attack: null, health: null, mana_cost: 1,
  spell_keywords: [{ id: "execution" } as SpellKeywordInstance],
}));

/** Le joueur 1 porte une Épée +2/+1 équipée sur son Soldat. */
function table(): { s: GameState; epee: CardInstance; soldat: CardInstance } {
  const s = mkState();
  const soldat = creature("Soldat", 1, 3);
  const epee = objet("Épée", 2, 1);
  s.players[1].board.push(soldat);
  s.players[1].items = [epee];
  s.currentPlayerIndex = 1;
  const equipe = applyAction(s, { type: "equip_item", itemInstanceId: epee.instanceId, targetInstanceId: soldat.instanceId } as GameAction);
  equipe.currentPlayerIndex = 0;
  return { s: equipe, epee, soldat };
}

function jouer(s: GameState, sort: CardInstance, cible: string): GameState {
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId, targetMap: { kw_0: cible, target_0: cible } });
}

describe("Exécution sur un objet", () => {
  it("les objets des deux camps figurent parmi les cibles, avec les créatures", () => {
    const { s, epee, soldat } = table();
    const mien = objet("Anneau", 0, 1);
    s.players[0].items = [mien];
    const cibles = getSpellTargets(s, execution().card);
    expect(cibles).toEqual(expect.arrayContaining([epee.instanceId, mien.instanceId, soldat.instanceId]));
  });

  it("détruit l'objet équipé : cimetière du propriétaire, porteur ramené à ses stats", () => {
    const { s, epee } = table();
    const soldatAvant = s.players[1].board.find(c => c.card.name === "Soldat")!;
    expect(soldatAvant.currentAttack).toBe(3); // 1 + 2 de l'Épée
    const apres = jouer(s, execution(), epee.instanceId);
    expect(objetsDe(apres.players[1])).toHaveLength(0);
    expect(apres.players[1].graveyard.map(c => c.card.name)).toContain("Épée");
    const soldat = apres.players[1].board.find(c => c.card.name === "Soldat")!;
    expect(soldat).toBeDefined(); // le porteur survit
    expect(soldat.currentAttack).toBe(1);
    expect(soldat.maxHealth).toBe(3);
  });

  it("tue toujours une créature ciblée", () => {
    const { s, soldat } = table();
    const apres = jouer(s, execution(), soldat.instanceId);
    expect(apres.players[1].board.find(c => c.card.name === "Soldat")).toBeUndefined();
    // Son objet reste en jeu, déséquipé : seule la cible est touchée.
    expect(objetsDe(apres.players[1]).map(o => o.card.name)).toEqual(["Épée"]);
  });
});

describe("Exécution demande bien une cible", () => {
  it("needsTarget est vrai : le client ouvre le ciblage au lieu de jouer l'action à vide", () => {
    expect(needsTarget(execution().card)).toBe(true);
  });
});
