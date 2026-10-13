// PROTOTYPE — simule une partie complète entre deux bots et note
// tout ce qui empêche une simulation fiable : exceptions du moteur, coups
// refusés (état inchangé), appels à Math.random (non reproductibles), blocages.
import { applyAction, initializeGame } from "@/lib/game/engine";
import type { Card, GameAction, GameState, HeroDefinition, TokenTemplate } from "@/lib/game/types";
import { objetsDe } from "@/lib/game/items";
import { candidateActions, seededRand, type Rand } from "./random-bot";

/** Une stratégie : les coups qu'elle veut jouer, du préféré au moins voulu.
 *  Le simulateur applique le premier que le moteur accepte. */
export type Politique = (state: GameState, rand: Rand) => GameAction[];

/** Bot ALÉATOIRE : un coup au hasard, la fin de tour en dernier 85 % du temps. */
export const politiqueAleatoire: Politique = (state, rand) => {
  const candidats = candidateActions(state, rand);
  const finTour = candidats.find((c) => c.type === "end_turn");
  const autres = candidats.filter((c) => c.type !== "end_turn");
  const ordre: GameAction[] = [];
  while (autres.length) ordre.push(autres.splice(Math.floor(rand() * autres.length), 1)[0]);
  if (finTour) { if (rand() < 0.15) ordre.unshift(finTour); else ordre.push(finTour); }
  return ordre;
};

export interface DeckSim { label: string; cards: { card: Card; quantity: number }[]; hero: HeroDefinition | null }

export interface Incident { kind: "exception" | "refus" | "math_random" | "blocage"; action: string; detail: string; card?: string }

/** Usage d'un compteur par un camp sur la partie. */
export interface UsageCompteur { gagne: number; depense: number; depenses: number; reste: number; max: number }
export const COMPTEURS = ["epargne", "foi", "conquete", "invention", "exploration"] as const;
export type Compteur = (typeof COMPTEURS)[number];

function niveau(p: GameState["players"][number], c: Compteur): number {
  return c === "invention" ? p.machine?.inventions ?? 0 : (p[c] ?? 0);
}

/** Usage des OBJETS par un camp : reçus en main, posés, équipés, et inutilisés
 *  en fin de partie (encore en main, ou posés sans porteur). */
export interface UsageObjets { recus: number; poses: number; equipes: number; inutilises: number }

export interface ResultatPartie {
  seed: number;
  winner: 0 | 1 | null;
  fin: "victoire" | "limite_actions" | "limite_tours" | "blocage";
  tours: number;
  actions: number;
  incidents: Incident[];
  /** Coups ACCEPTÉS par type (play_card, attack, hero_power…). */
  parType: Record<string, number>;
  /** Par camp (p1, p2) : usage de chaque compteur alimenté au moins une fois. */
  compteurs: [Partial<Record<Compteur, UsageCompteur>>, Partial<Record<Compteur, UsageCompteur>>];
  objets: [UsageObjets, UsageObjets];
  ms: number;
}

const MAX_ACTIONS = 1500;
const MAX_TOURS = 80;

function decrire(state: GameState, a: GameAction): { action: string; card?: string } {
  const p = state.players[state.currentPlayerIndex];
  const find = (id?: string) => [...p.hand, ...p.board, ...p.graveyard].find((c) => c.instanceId === id)?.card.name;
  switch (a.type) {
    case "play_card": return { action: "play_card", card: find(a.cardInstanceId) };
    case "attack": return { action: "attack", card: find(a.attackerInstanceId) };
    case "resolve_pending_trigger": return { action: "resolve_pending_trigger", card: state.pendingTriggers?.[0]?.kw ?? state.pendingTriggers?.[0]?.capUid };
    default: return { action: a.type };
  }
}

export function simulerPartie(
  a: DeckSim, b: DeckSim, seed: number,
  pools: { factionCardPool: Card[]; allSpellsPool: Card[]; tokens: TokenTemplate[] },
  politiques: [Politique, Politique] = [politiqueAleatoire, politiqueAleatoire],
): ResultatPartie {
  const t0 = Date.now();
  const rand: Rand = seededRand(seed * 7919 + 1);
  const incidents: Incident[] = [];

  // Math.random n'est pas semé : tout appel rend la partie non reproductible
  // (et désynchroniserait deux clients). On le compte, attribué à l'action en cours.
  const vraiRandom = Math.random;
  let enCours = "init";
  let enCoursCarte: string | undefined;
  Math.random = () => {
    incidents.push({ kind: "math_random", action: enCours, detail: new Error().stack?.split("\n")[2]?.trim() ?? "", card: enCoursCarte });
    return vraiRandom();
  };

  let state: GameState;
  let actions = 0;
  const parType: Record<string, number> = {};
  const compteurs: ResultatPartie["compteurs"] = [{}, {}];
  const objets: ResultatPartie["objets"] = [
    { recus: 0, poses: 0, equipes: 0, inutilises: 0 }, { recus: 0, poses: 0, equipes: 0, inutilises: 0 },
  ];
  const objetsVus = new Set<string>();
  const suivre = (avant: GameState, apres: GameState, act: GameAction) => {
    const actif = avant.currentPlayerIndex;
    if (act.type === "play_card" && avant.players[actif].hand.find((c) => c.instanceId === act.cardInstanceId)?.card.card_type === "item") objets[actif].poses++;
    if (act.type === "equip_item") objets[actif].equipes++;
    apres.players.forEach((p, i) => {
      for (const c of p.hand) if (c.card.card_type === "item" && !objetsVus.has(c.instanceId)) { objetsVus.add(c.instanceId); objets[i].recus++; }
    });
    apres.players.forEach((p, i) => {
      for (const c of COMPTEURS) {
        const n0 = niveau(avant.players[i], c), n1 = niveau(p, c);
        if (n0 === n1 && !compteurs[i][c]) continue;
        const u = (compteurs[i][c] ??= { gagne: 0, depense: 0, depenses: 0, reste: 0, max: 0 });
        if (n1 > n0) u.gagne += n1 - n0;
        if (n1 < n0) { u.depense += n0 - n1; if (act.type.startsWith("spend_") || act.type === "take_machine") u.depenses++; }
        u.reste = n1;
        u.max = Math.max(u.max, n1);
      }
    });
  };
  let fin: ResultatPartie["fin"] = "limite_actions";
  try {
    state = initializeGame("p1", "p2", a.cards, b.cards, (seed % 2) as 0 | 1, seed, a.hero, b.hero, pools.factionCardPool, pools.allSpellsPool, null);
    state.tokenTemplates = pools.tokens;

    while (actions < MAX_ACTIONS) {
      if (state.phase === "finished") { fin = "victoire"; break; }
      if (state.turnNumber > MAX_TOURS) { fin = "limite_tours"; break; }
      // Qui décide : le joueur dont le mulligan est en attente, le contrôleur
      // d'un déclencheur en attente, sinon le joueur actif.
      const qui = state.phase === "mulligan"
        ? (state.mulliganReady[0] ? 1 : 0)
        : state.pendingTriggers?.[0]
          ? (state.players[0].id === state.pendingTriggers[0].controllerId ? 0 : 1)
          : state.currentPlayerIndex;
      let ordre = politiques[qui](state, rand);
      if (state.phase === "mulligan") ordre = ordre.filter((x) => x.type !== "mulligan" || x.playerId === state.players[qui].id);

      let avance = false;
      for (const act of ordre) {
        const d = decrire(state, act);
        enCours = d.action; enCoursCarte = d.card;
        let suivant: GameState;
        try {
          suivant = applyAction(state, act);
        } catch (e) {
          incidents.push({ kind: "exception", action: d.action, card: d.card, detail: e instanceof Error ? e.message.slice(0, 160) : String(e) });
          continue;
        }
        if (suivant === state) { incidents.push({ kind: "refus", action: d.action, card: d.card, detail: "état inchangé" }); continue; }
        suivre(state, suivant, act);
        state = suivant;
        actions++;
        parType[act.type] = (parType[act.type] ?? 0) + 1;
        avance = true;
        break;
      }
      if (!avance) {
        incidents.push({ kind: "blocage", action: "aucun coup accepté", detail: `tour ${state.turnNumber}, pending=${state.pendingTriggers?.length ?? 0}, phase=${state.phase}` });
        fin = "blocage";
        break;
      }
    }
  } finally {
    Math.random = vraiRandom;
  }

  const w = state!.winner;
  return {
    seed, fin, tours: state!.turnNumber, actions, incidents, parType, compteurs, ms: Date.now() - t0,
    objets: objets.map((o, i) => ({
      ...o,
      inutilises: state!.players[i].hand.filter((c) => c.card.card_type === "item").length
        + objetsDe(state!.players[i]).filter((x) => !x.equippedToInstanceId).length,
    })) as ResultatPartie["objets"],
    winner: w === "p1" ? 0 : w === "p2" ? 1 : null,
  };
}
