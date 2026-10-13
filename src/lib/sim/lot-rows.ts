// Lignes `sim_deck_snapshots` d'un LOT sur decks existants. Les identifiants de
// partie sont DÉTERMINISTES (test, k) : reprendre un lot interrompu revient à
// sauter les k déjà en base. Les cartes ne sont pas recopiées (`cards` = []) :
// le module d'Équilibrage les recompose depuis les decks figés du test.
import type { DeckFige, PartieJouee } from "./deck-test";
import { POLICY } from "./deck-test";

const hex = (n: number, l: number) => n.toString(16).padStart(l, "0");
export const matchIdLot = (testId: number, k: number) => `${hex(testId, 8)}-0000-4000-8000-${hex(k, 12)}`;
const joueurId = (testId: number, k: number, siege: 0 | 1) => `${hex(testId, 8)}-0000-4000-800${siege + 1}-${hex(k, 12)}`;
/** k d'une partie à partir de son match_id (reprise). */
export const kDepuisMatchId = (id: string) => parseInt(id.slice(-12), 16);

export function lignesLot(testId: number, p: PartieJouee, decks: Map<number, DeckFige>) {
  if (p.vainqueur === null) return [];
  return ([0, 1] as const).map((siege) => {
    const d = decks.get(siege === 0 ? p.p1 : p.p2)!;
    return {
      run_id: `test-${testId}`, sim_test_id: testId, match_id: matchIdLot(testId, p.k), player_id: joueurId(testId, p.k, siege),
      deck_id: d.id, hero_id: d.hero?.id ?? null, is_winner: p.vainqueur === siege, went_first: p.premier === siege,
      cards: [], primary_faction: d.faction, clan: d.clans.length === 1 ? d.clans[0] : null, policy: POLICY, turns: p.tours,
      counters: { ...p.compteurs[siege], objets: p.objets[siege], etincelle: p.etincelle[siege] },
    };
  });
}
