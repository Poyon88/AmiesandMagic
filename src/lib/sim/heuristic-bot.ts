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
import { getConqueteOffer, getFoiOffer } from "@/lib/game/engine";
import { MAX_CONQUETE, MAX_EPARGNE, MAX_FOI, MAX_INVENTIONS_MACHINE } from "@/lib/game/constants";
import { bonusDObjet, objetsDe } from "@/lib/game/items";
import type { CardInstance, GameAction, GameState, PlayerState } from "@/lib/game/types";
import { candidateActions, coupsDeRessources, type Rand } from "./random-bot";

export interface Poids {
  heroAdverse: number;   // par PV retiré au héros adverse
  heroAllie: number;     // par PV de son propre héros
  heroAllieDanger: number; // supplément par PV quand il passe sous `seuilDanger`
  seuilDanger: number;
  creatureAllie: number; // par point (ATK + PV) de créature alliée
  creatureAdverse: number; // par point (ATK + PV) de créature adverse
  main: number;          // par carte en main
  mainParMana: number;   // + par point de coût d'une carte en main (une grosse carte vaut plus)
  manaGaspille: number;  // pénalité par mana non dépensé en fin d'évaluation
  // Valeur des points MIS DE CÔTÉ : sans elle, le bot ne verrait aucun intérêt
  // à jouer une carte qui alimente un compteur, ni rien à perdre à le vider.
  epargne: number;       // par point d'Épargne
  foi: number;           // par point de Foi
  conquete: number;      // par point de Conquête
  invention: number;     // par Invention de la machine en construction
  eveil: number;         // par point d'Éveil déjà versé
  // Objet posé SANS porteur : une part de son bonus (ATK + PV). Équipé, il vaut
  // plein pot puisque ses stats passent dans celles du porteur — d'où l'intérêt
  // de l'équiper. Sans cette valeur, poser un objet paraissait une perte.
  objetLibre: number;
}

export const POIDS_DEFAUT: Poids = {
  heroAdverse: 1, heroAllie: 0.7, heroAllieDanger: 1.5, seuilDanger: 10,
  creatureAllie: 1, creatureAdverse: 1.15, main: 1.2, mainParMana: 0.15, manaGaspille: 0,
  epargne: 0.3, foi: 0.2, conquete: 0.8, invention: 0.6, eveil: 0.5, objetLibre: 0.5,
};

const VICTOIRE = 1e6;

function valeurCreature(c: CardInstance): number {
  const atk = Math.max(0, c.currentAttack ?? 0);
  const pv = Math.max(0, c.currentHealth ?? 0);
  // Une créature qui ne peut plus agir vaut un peu moins ; une Provocation un peu plus.
  let v = atk + pv;
  if (c.isParalyzed) v *= 0.6;
  if (c.card.keywords?.includes("taunt")) v += 1;
  // Une capacité vaut quelque chose, même sans modèle fin de chacune : sans ce
  // terme, l'Armure ou la Première frappe qu'apporte un objet ne comptaient pas.
  v += 0.5 * (c.card.keywords?.length ?? 0);
  if (c.hasDivineShield) v += Math.min(atk, 3);
  return v;
}

/** Ce qu'un objet promet tant qu'il n'est pas porté : une part de son bonus
 *  et de ses capacités. Toujours en dessous de ce qu'il vaut une fois équipé. */
function potentielObjet(o: CardInstance, w: Poids): number {
  const b = bonusDObjet(o);
  return w.objetLibre * (b.atk + b.pv) + 0.3 * (o.card.keywords?.length ?? 0) + 0.3;
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
  v += me.hand.reduce((s, c) => s + (c.card.card_type === "item"
    ? potentielObjet(c, w)
    : w.main + w.mainParMana * Math.min(c.card.mana_cost ?? 0, 8)), 0);
  v += w.epargne * (me.epargne ?? 0) + w.foi * (me.foi ?? 0) + w.conquete * (me.conquete ?? 0);
  v += w.invention * (me.machine?.inventions ?? 0);
  // OBJETS : en main, ils valent leur potentiel ; posés sans porteur, un peu
  // plus (ils sont en jeu) ; équipés, leur bonus passe dans le porteur et vaut
  // davantage encore — l'ordre main < posé < équipé pousse à les jouer.
  for (const o of objetsDe(me)) if (!o.equippedToInstanceId) v += potentielObjet(o, w) + 0.2;
  v += w.eveil * (me.eveil ?? []).reduce((s, e) => s + Math.max(0, (e.instance.card.eveil_cost ?? 0) - e.remaining), 0);
  return v;
}

/** Une DÉPENSE de compteur est-elle opportune maintenant ? L'évaluation dit
 *  quel coup est le meilleur ; ces règles disent si c'est le MOMENT de vider la
 *  réserve plutôt que de la laisser grossir :
 *  · compteur au plafond (il ne peut plus rien gagner) ;
 *  · ce qu'on obtient tient sa place dans la courbe : coût ≥ mana max − 2 (entre
 *    2 et 5). Viser « ≥ mana max » laissait la réserve dormir toute la fin de
 *    partie, le mana montant plus vite que les compteurs ;
 *  · son héros est en danger (on prend ce qui est là) ;
 *  · la Conquête ne se dépense qu'au palier : on la prend dès qu'elle y est. */
export function depenseOpportune(state: GameState, a: GameAction, w: Poids = POIDS_DEFAUT): boolean {
  const me = state.players[state.currentPlayerIndex];
  const danger = pvHeros(me) <= w.seuilDanger;
  const courbe = me.maxMana;
  // Plafonné à 5 : en fin de partie le mana max atteint 10, et « mana max − 2 »
  // ne serait plus jamais atteint — une carte à 5 tient toujours sa place.
  const seuil = (plafond: number) => Math.min(plafond, 5, Math.max(2, courbe - 2));
  switch (a.type) {
    case "spend_epargne": {
      const n = me.epargne ?? 0;
      return n >= seuil(MAX_EPARGNE) || danger;
    }
    case "spend_foi": {
      const n = me.foi ?? 0;
      const offre = getFoiOffer(state).find((c) => c.instanceId === a.cardInstanceId);
      return n >= MAX_FOI || danger || (offre?.card.mana_cost ?? 0) >= seuil(n);
    }
    case "spend_conquete":
      return (me.conquete ?? 0) >= MAX_CONQUETE || getConqueteOffer(state).length > 0;
    case "take_machine": {
      const n = me.machine?.inventions ?? 0;
      return n >= seuil(MAX_INVENTIONS_MACHINE) || danger;
    }
    default:
      return true;
  }
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
    if (!depenseOpportune(state, a, w)) continue;
    let suivant: GameState;
    try { suivant = applyAction(state, a); } catch { continue; }
    if (suivant === state) continue;
    let v = evaluer(suivant, moi, w);
    // POSER UN OBJET : on le note avec le meilleur équipement qui peut suivre
    // dans la foulée — sans ce regard d'un coup plus loin, le bot ne voyait
    // jamais l'intérêt de poser un objet seul.
    if (a.type === "play_card" && !a.fromEveil && !a.fromGraveyard) {
      const pose = state.players[state.currentPlayerIndex].hand.find((c) => c.instanceId === a.cardInstanceId);
      if (pose?.card.card_type === "item") {
        for (const e of coupsDeRessources(suivant, rand, variantes)) {
          if (e.type !== "equip_item" || e.itemInstanceId !== a.cardInstanceId) continue;
          try {
            const apres = applyAction(suivant, e);
            if (apres !== suivant) v = Math.max(v, evaluer(apres, moi, w));
          } catch { /* équipement refusé : on garde la note de la pose seule */ }
        }
      }
    }
    // GAIN DE MANA pour ce tour (Étincelle de mana, Afflux…) : ce mana ne vaut
    // que par ce qu'il permet de jouer ensuite. On note donc le coup avec le
    // meilleur coup qu'il rend possible — un seul cran, pas de récursion. Sans
    // ce regard, l'Étincelle restait en main dans 100 % des parties.
    const actif = state.currentPlayerIndex;
    if (suivant.phase === "playing" && suivant.currentPlayerIndex === actif && !suivant.pendingTriggers?.length
        && suivant.players[actif].mana > state.players[actif].mana) {
      for (const b of candidateActions(suivant, rand, variantes)) {
        if (b.type === "end_turn" || b.type === "auto_resolve_pending_triggers") continue;
        if (!depenseOpportune(suivant, b, w)) continue;
        try {
          const apres = applyAction(suivant, b);
          if (apres !== suivant) v = Math.max(v, evaluer(apres, moi, w));
        } catch { /* coup refusé : sans effet sur la note */ }
      }
    }
    notes.push({ a, v });
  }
  notes.sort((x, y) => y.v - x.v);
  const utiles = notes.filter((n) => n.v > ici + 0.01).map((n) => n.a);
  const reste = notes.filter((n) => n.v <= ici + 0.01).map((n) => n.a);
  // Un déclencheur en attente DOIT être résolu : on y prend le meilleur choix,
  // même s'il dégrade la position.
  if (state.pendingTriggers?.length) return [...utiles, ...reste, ...(repli ? [repli] : [])];
  return [...utiles, ...(repli ? [repli] : []), ...reste];
}
