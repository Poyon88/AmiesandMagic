// PROTOTYPE — simule une partie complète entre deux bots et note
// tout ce qui empêche une simulation fiable : exceptions du moteur, coups
// refusés (état inchangé), appels à Math.random (non reproductibles), blocages.
import { applyAction, initializeGame } from "@/lib/game/engine";
import type { Card, FormatCode, GameAction, GameState, HeroDefinition, ReglesPartie, TokenTemplate } from "@/lib/game/types";
import { objetsDe } from "@/lib/game/items";
import { isManaSpark } from "@/lib/game/mana-spark";
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

/** ÉTINCELLE DE MANA (compensation du 2e joueur) : reçue, jouée à quel tour,
 *  et si le mana gagné a servi (plus de mana à la fin de ce tour-là) ou non. */
export interface UsageEtincelle { recue: boolean; joueeAuTour: number | null; manaPerdu: boolean | null }

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
  etincelle: [UsageEtincelle, UsageEtincelle];
  decouvertes: [UsageDecouverte, UsageDecouverte];
  /** Fatigue subie par chaque camp en fin de partie (0 = jamais à court de deck). */
  fatigue: [number, number];
  /** Par camp : ids des cartes PIOCHÉES (passées en main au moins une fois) et
   *  nombre de poses par id — de quoi mesurer l'apport de chaque carte. */
  cartes: [{ piochees: number[]; jouees: Record<number, number> }, { piochees: number[]; jouees: Record<number, number> }];
  /** Index du joueur qui a commencé. */
  premier: 0 | 1;
  /** Chronologie coup par coup (seulement avec `options.journal`). */
  journal?: EntreeJournal[];
  ms: number;
}

/** Une ligne du journal d'une partie rejouée. */
export interface EntreeJournal {
  tour: number;
  joueur: 0 | 1;
  coup: string;
  pv: [number, number];
  plateau: [string[], string[]];
}

export interface ViviersSim {
  factionCardPool: Card[];
  allSpellsPool: Card[];
  tokens: TokenTemplate[];
  machines?: Card[];
  formatCode?: FormatCode | null;
}

export interface OptionsPartie {
  /** Joueur qui commence ; par défaut `seed % 2`. */
  premier?: 0 | 1;
  /** Consigner la chronologie coup par coup (rejeu). */
  journal?: boolean;
  /** Variantes de règles de la partie (cf. ReglesPartie). */
  regles?: ReglesPartie;
}

/** Bilan des DÉCOUVERTES d'un camp (variante un tour sur deux). */
export interface UsageDecouverte {
  offres: number;
  /** Carte retenue d'un autre clan que celui du joueur. */
  autreClan: number;
  /** Offre « morte » : aucune des cartes jouable dans les 3 tours qui suivent. */
  mortes: number;
}

const nomCarte = (s: GameState, id?: string): string | undefined => {
  if (!id) return undefined;
  if (id === "enemy_hero" || id === "friendly_hero") return id === "enemy_hero" ? "héros adverse" : "son héros";
  for (const p of s.players) {
    const c = [...p.hand, ...p.board, ...p.graveyard, ...(p.items ?? [])].find((x) => x.instanceId === id);
    if (c) return c.card.name;
    if (p.id === id) return `héros ${p.id}`;
  }
  return id;
};

/** Phrase courte décrivant un coup, à partir de l'état AVANT le coup. */
export function decrireCoup(s: GameState, a: GameAction): string {
  const cible = (id?: string) => (id ? ` → ${nomCarte(s, id)}` : "");
  switch (a.type) {
    case "mulligan": return a.replacedInstanceIds.length ? `mulligan (${a.replacedInstanceIds.length} remplacée(s))` : "garde sa main";
    case "play_card": {
      const t = a.targetInstanceId ?? Object.values(a.targetMap ?? {})[0];
      const src = a.fromGraveyard ? " (Seconde vie)" : a.fromEveil ? " (Éveil)" : "";
      return `joue ${nomCarte(s, a.cardInstanceId)}${src}${cible(t)}`;
    }
    case "attack": return `${nomCarte(s, a.attackerInstanceId)} attaque${cible(a.targetInstanceId)}`;
    case "hero_power": return `pouvoir héroïque${cible(a.targetInstanceId)}`;
    case "tap_activate": return `active ${nomCarte(s, a.sourceInstanceId)}${cible(a.targetInstanceId)}`;
    case "equip_item": return `équipe ${nomCarte(s, a.itemInstanceId)}${cible(a.targetInstanceId)}`;
    case "spend_epargne": return "dépense son Épargne";
    case "spend_foi": return "dépense sa Foi";
    case "spend_conquete": return "dépense sa Conquête";
    case "take_machine": return "prend sa machine";
    case "suspend_eveil": return `met ${nomCarte(s, a.cardInstanceId)} en éveil`;
    case "pay_eveil": return `verse ${a.amount ?? 1} point(s) d'éveil à ${nomCarte(s, a.cardInstanceId)}`;
    case "resolve_pending_trigger": return `résout un déclencheur${cible(a.targetInstanceId)}`;
    case "auto_resolve_pending_triggers": return "résout les déclencheurs";
    case "end_turn": return "fin de tour";
    default: return a.type;
  }
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
  pools: ViviersSim,
  politiques: [Politique, Politique] = [politiqueAleatoire, politiqueAleatoire],
  options: OptionsPartie = {},
): ResultatPartie {
  const premier = options.premier ?? ((seed % 2) as 0 | 1);
  const journal: EntreeJournal[] | undefined = options.journal ? [] : undefined;
  const cartes: ResultatPartie["cartes"] = [{ piochees: [], jouees: {} }, { piochees: [], jouees: {} }];
  const piocheesVues = [new Set<string>(), new Set<string>()];
  const noterPioches = (st: GameState) => st.players.forEach((p, i) => {
    for (const c of p.hand) if (!piocheesVues[i].has(c.instanceId)) { piocheesVues[i].add(c.instanceId); cartes[i].piochees.push(c.card.id); }
  });
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
  const etincelle: ResultatPartie["etincelle"] = [
    { recue: false, joueeAuTour: null, manaPerdu: null }, { recue: false, joueeAuTour: null, manaPerdu: null },
  ];
  const decouvertes: ResultatPartie["decouvertes"] = [{ offres: 0, autreClan: 0, mortes: 0 }, { offres: 0, autreClan: 0, mortes: 0 }];
  const suivre = (avant: GameState, apres: GameState, act: GameAction) => {
    const actif = avant.currentPlayerIndex;
    const tete = avant.pendingTriggers?.[0];
    if (tete?.selectionType === "decouverte" && (act.type === "resolve_pending_trigger" || act.type === "auto_resolve_pending_triggers")) {
      const i = avant.players.findIndex((p) => p.id === tete.controllerId);
      const p = avant.players[i];
      const parId = new Map((avant.factionCardPool ?? []).map((c) => [c.id, c]));
      const offre = (tete.selectionOptionIds ?? []).map((id) => parId.get(id)).filter((c): c is Card => !!c);
      const choisie = parId.get(act.type === "resolve_pending_trigger" && act.selectionCardId != null
        ? act.selectionCardId : apres.players[i].hand.at(-1)?.card.id ?? -1);
      const d = decouvertes[i];
      d.offres++;
      if (choisie?.clan && p.identite?.clan && choisie.clan !== p.identite.clan) d.autreClan++;
      if (offre.length && Math.min(...offre.map((c) => c.mana_cost)) > Math.min(10, p.maxMana + 3)) d.mortes++;
    }
    if (act.type === "play_card") {
      const p = avant.players[actif];
      const c = [...p.hand, ...p.graveyard, ...(p.eveil ?? []).map((e) => e.instance)].find((x) => x.instanceId === act.cardInstanceId);
      if (c) cartes[actif].jouees[c.card.id] = (cartes[actif].jouees[c.card.id] ?? 0) + 1;
    }
    if (journal) {
      const qui = (avant.phase === "mulligan" && act.type === "mulligan")
        ? (avant.players[0].id === act.playerId ? 0 : 1)
        : avant.pendingTriggers?.[0] ? (avant.players[0].id === avant.pendingTriggers[0].controllerId ? 0 : 1) : actif;
      journal.push({
        tour: avant.turnNumber, joueur: qui as 0 | 1, coup: decrireCoup(avant, act),
        pv: [apres.players[0].hero.hp, apres.players[1].hero.hp],
        plateau: [0, 1].map((i) => apres.players[i].board.map((c) => `${c.card.name} ${c.currentAttack}/${c.currentHealth}`)) as [string[], string[]],
      });
    }
    noterPioches(apres);
    if (act.type === "play_card" && avant.players[actif].hand.find((c) => c.instanceId === act.cardInstanceId)?.card.card_type === "item") objets[actif].poses++;
    if (act.type === "equip_item") objets[actif].equipes++;
    const e = etincelle[actif];
    if (act.type === "play_card" && avant.players[actif].hand.find((c) => c.instanceId === act.cardInstanceId && isManaSpark(c.card))) e.joueeAuTour = avant.turnNumber;
    // Fin du tour où elle a servi : du mana inutilisé = le +1 n'a pas été converti.
    if (act.type === "end_turn" && e.joueeAuTour === avant.turnNumber && e.manaPerdu === null) e.manaPerdu = avant.players[actif].mana >= 1;
    apres.players.forEach((p, i) => { if (!etincelle[i].recue && p.hand.some((c) => isManaSpark(c.card))) etincelle[i].recue = true; });
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
    state = initializeGame("p1", "p2", a.cards, b.cards, premier, seed, a.hero, b.hero, pools.factionCardPool, pools.allSpellsPool, pools.formatCode ?? null, options.regles);
    state.tokenTemplates = pools.tokens;
    state.machineTemplates = pools.machines ?? [];
    noterPioches(state);

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
        // Comme le store (gameStore, « onAttackWave ») : la photo intermédiaire
        // d'une attaque ne sert qu'à l'animation. Gardée, chaque nouvelle photo
        // contient la précédente et l'état enfle (3,5 Mo, parties bloquées).
        if (state.onAttackWave) state.onAttackWave = undefined;
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
    etincelle, decouvertes, cartes, premier, ...(journal ? { journal } : {}),
    fatigue: [state!.players[0].fatigueDamage, state!.players[1].fatigueDamage],
    winner: w === "p1" ? 0 : w === "p2" ? 1 : null,
  };
}
