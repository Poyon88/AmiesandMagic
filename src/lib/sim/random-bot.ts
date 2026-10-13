// PROTOTYPE — bot ALÉATOIRE pour simuler des parties sans écran.
//
// But (2026-10-13) : vérifier que le moteur peut être joué jusqu'à la victoire
// par des actions pures, sans le store qui orchestre d'habitude les choix
// interactifs (cibles, Sélections, Divination, déclencheurs en attente). Le bot
// ne cherche pas à bien jouer : il énumère des coups plausibles, en tire un au
// hasard, et le simulateur note ce que le moteur refuse ou rate.
//
// Tout le hasard du bot passe par `rand` (graine propre) : une partie se rejoue
// à l'identique à partir de (graine du moteur, graine du bot).
import {
  canAttack, canPlayCard, canUseHeroPower, creatureNeedsDivination, creatureNeedsGraveyardTarget,
  creatureNeedsTarget, endOfTurnTriggerTargets, getCreatureTargets, getGraveyardTargets,
  getHeroPowerTargets, getSpellTargetSlots, getValidTargets, heroPowerNeedsTarget,
  chantBonusForSpell, ordreSelectionsCreature, selectionAmplitudeOnPlay, selectionCardsForKeyword, tempoBonusForCard,
} from "@/lib/game/engine";
import type { GameAction, GameState, PlayerState, SelectionFamilyId, SpellTargetType } from "@/lib/game/types";

const SELECTIONS_SORT: SelectionFamilyId[] = ["selection", "selection_magique", "renfort_royal", "tresor"];

export type Rand = () => number;

/** Générateur pseudo-aléatoire semé (mulberry32). */
export function seededRand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(rand: Rand, xs: readonly T[]): T | undefined => xs.length ? xs[Math.floor(rand() * xs.length)] : undefined;

function ids(p: PlayerState) { return p.board.map((c) => c.instanceId); }

/** Cibles possibles d'un emplacement de sort, vues du joueur actif. */
function slotCandidates(state: GameState, type: SpellTargetType): string[] | null {
  const me = state.players[state.currentPlayerIndex];
  const opp = state.players[1 - state.currentPlayerIndex];
  switch (type) {
    case "enemy_hero": return ["enemy_hero"];
    case "friendly_hero": return ["friendly_hero"];
    case "any": return ["enemy_hero", "friendly_hero", ...ids(opp), ...ids(me)];
    case "any_creature": case "any_creature_or_item": return [...ids(opp), ...ids(me)];
    case "enemy_creature": return ids(opp);
    case "friendly_creature": return ids(me);
    case "friendly_graveyard": case "friendly_graveyard_to_board":
      return me.graveyard.filter((c) => c.card.card_type === "creature").map((c) => c.instanceId);
    default: return null; // zone / sans cible
  }
}

/** Jusqu'à `n` éléments distincts, dans un ordre tiré au hasard. */
function plusieurs<T>(rand: Rand, xs: readonly T[], n: number): T[] {
  return [...xs].sort(() => rand() - 0.5).slice(0, Math.max(1, n));
}

/** Coups candidats du joueur qui doit agir. `end_turn` est toujours dernier.
 *
 *  `variantes` : nombre de cibles essayées par choix PRINCIPAL (cible d'une
 *  pose, premier emplacement d'un sort, cible d'attaque, de pouvoir). 1 = une
 *  cible au hasard (bot aléatoire) ; plus = autant de coups distincts, que le
 *  bot heuristique compare. Les choix secondaires restent tirés au hasard. */
export function candidateActions(state: GameState, rand: Rand, variantes = 1): GameAction[] {
  const out: GameAction[] = [];

  if (state.phase === "mulligan") {
    state.players.forEach((p, i) => {
      if (!state.mulliganReady[i]) out.push({ type: "mulligan", playerId: p.id, replacedInstanceIds: [] });
    });
    return out;
  }

  const pending = state.pendingTriggers?.[0];
  if (pending) {
    const targets = endOfTurnTriggerTargets(state, pending);
    for (const t of targets) out.push({ type: "resolve_pending_trigger", triggerId: pending.id, targetInstanceId: t });
    for (const id of pending.selectionOptionIds ?? []) out.push({ type: "resolve_pending_trigger", triggerId: pending.id, selectionCardId: id });
    out.push({ type: "auto_resolve_pending_triggers" });
    return out;
  }

  const me = state.players[state.currentPlayerIndex];

  for (const ci of me.hand) {
    if (!canPlayCard(state, ci.instanceId)) continue;
    const card = ci.card;
    // Coûts additionnels : le joueur désigne lui-même ce qu'il paie.
    const tirer = (pool: string[], n: number) => [...pool].sort(() => rand() - 0.5).slice(0, n);
    const autresEnMain = me.hand.filter((c) => c.instanceId !== ci.instanceId).map((c) => c.instanceId);
    const couts: Partial<Extract<GameAction, { type: "play_card" }>> = {};
    if (card.sacrifice_cost) couts.sacrificeInstanceIds = tirer(ids(me), card.sacrifice_cost);
    if (card.discard_cost) couts.discardInstanceIds = tirer(autresEnMain, card.discard_cost);
    if (card.topdeck_cost) couts.topdeckInstanceIds = tirer(autresEnMain, card.topdeck_cost);
    const base = { type: "play_card" as const, cardInstanceId: ci.instanceId, boardPosition: me.board.length, ...couts };
    if (card.card_type === "spell") {
      const slots = getSpellTargetSlots(card)
        .map((slot) => ({ slot, c: slotCandidates(state, slot.type) }))
        .filter((x): x is { slot: typeof x.slot; c: string[] } => x.c !== null);
      if (slots.some((x) => x.c.length === 0)) continue;
      // Sélection portée par un sort : même offre que la modale du client.
      let selectionCardId: number | undefined;
      for (const kw of SELECTIONS_SORT) {
        const sk = card.spell_keywords?.find((k) => k.id === kw);
        if (!sk) continue;
        const x = (sk.amount ?? 0) + chantBonusForSpell(state, card) + tempoBonusForCard(state, card);
        const choisie = pick(rand, selectionCardsForKeyword(kw, state, x, card, undefined, undefined, sk.randomX === true, sk.minX));
        if (choisie) { selectionCardId = choisie.id; break; }
      }
      const premiers = slots.length ? plusieurs(rand, slots[0].c, variantes) : [undefined];
      for (const t0 of premiers) {
        const targetMap: Record<string, string> = {};
        slots.forEach((x, i) => { targetMap[x.slot.slot] = i === 0 && t0 ? t0 : pick(rand, x.c)!; });
        out.push({ ...base, targetMap, ...(selectionCardId != null ? { selectionCardId } : {}) });
      }
      continue;
    }
    const a: Extract<GameAction, { type: "play_card" }> = { ...base };
    if (creatureNeedsGraveyardTarget(card)) {
      const t = pick(rand, getGraveyardTargets(state, card));
      if (t) a.graveyardTargetInstanceId = t;
    }
    if (creatureNeedsDivination(card)) a.divinationChoiceIndex = Math.floor(rand() * 3);
    // Sélections d'entrée en jeu : une carte par mot-clé, comme la modale.
    for (const kw of ordreSelectionsCreature(card)) {
      const amp = selectionAmplitudeOnPlay(card, kw);
      const choisie = pick(rand, selectionCardsForKeyword(kw, state, amp.x, card, undefined, undefined, amp.randomX, amp.minX));
      if (choisie) a.selectionCardIds = { ...a.selectionCardIds, [kw]: choisie.id };
    }
    const cibles = creatureNeedsTarget(card) ? getCreatureTargets(state, card) : [];
    if (cibles.length) for (const t of plusieurs(rand, cibles, variantes)) out.push({ ...a, targetInstanceId: t });
    else out.push(a);
  }

  for (const ci of me.board) {
    if (!canAttack(state, ci.instanceId)) continue;
    for (const t of plusieurs(rand, getValidTargets(state, ci.instanceId), variantes)) {
      if (t) out.push({ type: "attack", attackerInstanceId: ci.instanceId, targetInstanceId: t });
    }
  }

  const hero = me.hero.heroDefinition;
  if (hero && canUseHeroPower(state)) {
    if (heroPowerNeedsTarget(hero)) {
      for (const t of plusieurs(rand, getHeroPowerTargets(state, hero), variantes)) {
        if (t) out.push({ type: "hero_power", targetInstanceId: t });
      }
    } else out.push({ type: "hero_power" });
  }

  out.push({ type: "end_turn" });
  return out;
}
