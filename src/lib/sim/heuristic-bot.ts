// PROTOTYPE — bot HEURISTIQUE glouton à un coup d'avance.
//
// À chaque décision, il applique chaque coup candidat sur une COPIE de l'état
// (le moteur est un réducteur pur) et note la position obtenue avec `evaluer`.
// Il joue le meilleur coup s'il améliore la position actuelle, sinon il finit
// son tour. Pas de recherche en profondeur : c'est le niveau « joueur
// raisonnable » qui sert de référence pour les simulations d'équilibrage.
//
// Limite connue : appliquer un coup révèle son issue exacte (la RNG est dans
// l'état), y compris une pioche. Le bot « voit » donc l'effet immédiat d'un coup
// aléatoire — biais mineur pour un usage de simulation, à corriger avant d'en
// faire un adversaire humain (déterminisation).
import { applyAction } from "@/lib/game/engine";
import type { CardInstance, GameAction, GameState, PlayerState } from "@/lib/game/types";
import { candidateActions, type Rand } from "./random-bot";

export interface Poids {
  heroAdverse: number;   // par PV retiré au héros adverse
  heroAllie: number;     // par PV de son propre héros
  heroAllieDanger: number; // supplément par PV quand il passe sous `seuilDanger`
  seuilDanger: number;
  creatureAllie: number; // par point (ATK + PV) de créature alliée
  creatureAdverse: number; // par point (ATK + PV) de créature adverse
  main: number;          // par carte en main
  manaGaspille: number;  // pénalité par mana non dépensé en fin d'évaluation
}

export const POIDS_DEFAUT: Poids = {
  heroAdverse: 1, heroAllie: 0.7, heroAllieDanger: 1.5, seuilDanger: 10,
  creatureAllie: 1, creatureAdverse: 1.15, main: 1.2, manaGaspille: 0,
};

const VICTOIRE = 1e6;

function valeurCreature(c: CardInstance): number {
  const atk = Math.max(0, c.currentAttack ?? 0);
  const pv = Math.max(0, c.currentHealth ?? 0);
  // Une créature qui ne peut plus agir vaut un peu moins ; une Provocation un peu plus.
  let v = atk + pv;
  if (c.isParalyzed) v *= 0.6;
  if (c.card.keywords?.includes("taunt")) v += 1;
  if (c.hasDivineShield) v += Math.min(atk, 3);
  return v;
}

function pvHeros(p: PlayerState): number { return p.hero.hp + (p.hero.armor ?? 0); }

/** Valeur de la position du point de vue de `moi` (id joueur). */
export function evaluer(state: GameState, moi: string, w: Poids = POIDS_DEFAUT): number {
  if (state.winner) return state.winner === moi ? VICTOIRE : -VICTOIRE;
  const me = state.players.find((p) => p.id === moi)!;
  const opp = state.players.find((p) => p.id !== moi)!;
  const pvMoi = pvHeros(me);
  let v = 0;
  v -= w.heroAdverse * pvHeros(opp);
  v += w.heroAllie * pvMoi + w.heroAllieDanger * Math.min(pvMoi - w.seuilDanger, 0);
  v += w.creatureAllie * me.board.reduce((s, c) => s + valeurCreature(c), 0);
  v -= w.creatureAdverse * opp.board.reduce((s, c) => s + valeurCreature(c), 0);
  v += w.main * me.hand.length;
  return v;
}

/** Qui choisit maintenant : le contrôleur d'un déclencheur en attente, sinon le joueur actif. */
function decideur(state: GameState): string {
  return state.pendingTriggers?.[0]?.controllerId ?? state.players[state.currentPlayerIndex].id;
}

/** Coups classés du meilleur au moins bon. La fin de tour (ou la résolution
 *  automatique) est placée là où elle se range : juste après les coups qui
 *  améliorent la position. */
export function coupsHeuristiques(state: GameState, rand: Rand, w: Poids = POIDS_DEFAUT, variantes = 6): GameAction[] {
  if (state.phase === "mulligan") {
    // Garde la main, sauf les cartes trop chères pour le début de partie.
    return state.players.flatMap((p, i) => state.mulliganReady[i] ? [] : [{
      type: "mulligan" as const, playerId: p.id,
      replacedInstanceIds: p.hand.filter((c) => (c.card.mana_cost ?? 0) >= 5).map((c) => c.instanceId),
    }]);
  }
  const moi = decideur(state);
  const ici = evaluer(state, moi, w);
  const notes: { a: GameAction; v: number }[] = [];
  let repli: GameAction | null = null;
  for (const a of candidateActions(state, rand, variantes)) {
    if (a.type === "end_turn" || a.type === "auto_resolve_pending_triggers") { repli = a; continue; }
    let suivant: GameState;
    try { suivant = applyAction(state, a); } catch { continue; }
    if (suivant === state) continue;
    notes.push({ a, v: evaluer(suivant, moi, w) });
  }
  notes.sort((x, y) => y.v - x.v);
  const utiles = notes.filter((n) => n.v > ici + 0.01).map((n) => n.a);
  const reste = notes.filter((n) => n.v <= ici + 0.01).map((n) => n.a);
  // Un déclencheur en attente DOIT être résolu : on y prend le meilleur choix,
  // même s'il dégrade la position.
  if (state.pendingTriggers?.length) return [...utiles, ...reste, ...(repli ? [repli] : [])];
  return [...utiles, ...(repli ? [repli] : []), ...reste];
}
