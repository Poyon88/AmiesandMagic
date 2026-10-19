// Simulation de parties avec des CHOIX qui se déclenchent hors du tour de leur
// propriétaire (râles d'agonie, Blessure…), à l'attaque et en fin de tour.
// Filet anti-blocage du chantier « choix au déclenchement » : la file de choix
// change de propriétaire en cours de partie, le repli ne tranche que la tête —
// une partie ne doit jamais rester figée sur une question.
import { describe, expect, it } from "vitest";
import type { Capability, Card, Keyword } from "@/lib/game/types";
import { politiqueAleatoire, simulerPartie, type DeckSim, type Politique } from "./simulate";
import { coupsHeuristiques } from "./heuristic-bot";

let id = 70_000;
const carte = (mana: number, attack: number, health: number, extra: Partial<Card> = {}): Card => ({
  id: id++, name: `X${id}`, mana_cost: mana, card_type: "creature", attack, health, effect_text: "",
  keywords: [], keyword_instances: null, spell_keywords: null, spell_effects: null, image_url: null,
  faction: "Mercenaires", rarity: "Commune", ...extra,
} as unknown as Card);
const kw = (id: string, mode: string, x = 1, y?: number) => ({
  keywords: [id] as unknown as Card["keywords"],
  keyword_instances: [{ id: id as Keyword, mode, x, ...(y != null ? { y } : {}) }] as Card["keyword_instances"],
});
const choixComposé = (trigger: Capability["trigger"]): Partial<Card> => ({
  capabilities: [{
    uid: `c_${trigger}`, trigger, effectKind: "immediate", abilityId: "_composed", targets: [],
    composed: { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" } },
  }],
});

const lib: Card[] = [
  carte(1, 1, 2),
  carte(2, 2, 2, kw("selection", "death", 0)),
  carte(2, 2, 1, kw("impact", "death", 2)),
  carte(3, 3, 3, kw("affaiblissement", "attack", 1, 1)),
  carte(3, 3, 2, kw("selection", "attack", 0)),
  carte(3, 2, 4, kw("remontee", "death")),
  carte(4, 3, 4, choixComposé("on_death")),
  carte(4, 4, 4, choixComposé("on_wound")),
  carte(2, 2, 3, kw("impact", "end_of_turn", 1)),
  carte(5, 5, 5),
];
const deck = (label: string): DeckSim => ({ label, hero: null, cards: lib.map((card) => ({ card, quantity: 5 })) });
const pools = { factionCardPool: lib, allSpellsPool: [], tokens: [] };
const heur: Politique = (s, r) => coupsHeuristiques(s, r);

const N = Number(process.env.SIM_CHOIX_PARTIES ?? 12);

describe("simulation — choix au déclenchement", () => {
  it(`${N} parties vont au bout, sans blocage ni exception`, () => {
    // Témoin : la simulation exerce-t-elle VRAIMENT des choix posés au joueur
    // non actif ? Sans lui, le test pourrait passer à vide.
    let choixHorsTour = 0;
    const espion = (pol: Politique): Politique => (s, r) => {
      const tete = s.pendingTriggers?.[0];
      if (tete && tete.controllerId !== s.players[s.currentPlayerIndex].id) choixHorsTour++;
      return pol(s, r);
    };
    for (let seed = 1; seed <= N; seed++) {
      const politiques: [Politique, Politique] = seed % 3 === 0 ? [espion(heur), espion(politiqueAleatoire)] : [espion(politiqueAleatoire), espion(politiqueAleatoire)];
      const r = simulerPartie(deck("a"), deck("b"), seed, pools, politiques);
      const graves = r.incidents.filter((i) => i.kind !== "refus");
      expect(graves, `graine ${seed}`).toEqual([]);
      expect(r.fin, `graine ${seed}`).toBe("victoire");
    }
    expect(choixHorsTour).toBeGreaterThan(0);
  });
});
