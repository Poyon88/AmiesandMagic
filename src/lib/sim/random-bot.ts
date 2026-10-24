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
  creatureNeedsTarget, deferredKwTargetIds, endOfTurnTriggerTargets, getCreatureTargets, getGraveyardTargets,
  ciblesEffetPouvoir, effetPouvoirACible, getSpellTargetSlots, getValidTargets, heroPowerComposedChoice,
  chantBonusForSpell, ordreSelectionsCreature, selectionAmplitudeOnPlay, selectionCardsForKeyword, tempoBonusForCard,
  canPlayFromGraveyard, canSuspendToEveil, getComposedTapTargets, getConqueteOffer, getCreatureTapComposedUid,
  getFoiOffer, getSelectionCards, getTapActivateTargets, maxEveilPayment, peutActiverPouvoir,
} from "@/lib/game/engine";
import { MAX_HAND_SIZE } from "@/lib/game/constants";
import { effetsDuPouvoir } from "@/lib/game/hero-power";
import { getEquipCost, objetsDe, peutRecevoirObjet } from "@/lib/game/items";
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
    // Cibles : capacité composée, emblème, sort retardé, frame suspendue…
    // et mots-clés curés (Impact, Remontée, Affaiblissement…), dont le pool
    // vit à part.
    const controller = state.players.find((p) => p.id === pending.controllerId);
    const other = state.players.find((p) => p.id !== pending.controllerId);
    const targets = pending.kw && !pending.capUid && controller && other
      ? deferredKwTargetIds(pending.kw, controller, other, pending.sourceInstanceId)
      : endOfTurnTriggerTargets(state, pending);
    for (const t of targets) out.push({ type: "resolve_pending_trigger", triggerId: pending.id, targetInstanceId: t });
    for (const id of pending.selectionOptionIds ?? []) out.push({ type: "resolve_pending_trigger", triggerId: pending.id, selectionCardId: id });
    for (const o of pending.alternativeOptions ?? []) out.push({ type: "resolve_pending_trigger", triggerId: pending.id, alternativeCapUid: o.capUid });
    if (pending.deckPick && controller) {
      const n = Math.min(pending.x ?? 1, controller.deck.length);
      for (let i = 0; i < n; i++) out.push({ type: "resolve_pending_trigger", triggerId: pending.id, deckChoiceIndex: i });
    }
    out.push({ type: "auto_resolve_pending_triggers", headTriggerId: pending.id });
    return out;
  }
  // Attaque suspendue sur un choix « à l'attaque », désormais tranché : seule
  // sa reprise est permise (le client l'émet d'office, cf. GameBoard).
  if (state.attaqueSuspendue) return [{ type: "attack", ...state.attaqueSuspendue, reprise: true }];

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
      // Sélections portées par un sort : même offre que la modale du client,
      // une réponse PAR mot-clé dans son créneau `<mot-clé>_0`.
      const creneauxSel: Record<string, string> = {};
      for (const kw of SELECTIONS_SORT) {
        const sk = card.spell_keywords?.find((k) => k.id === kw);
        if (!sk) continue;
        const x = (sk.amount ?? 0) + chantBonusForSpell(state, card) + tempoBonusForCard(state, card);
        const choisie = pick(rand, selectionCardsForKeyword(kw, state, x, card, undefined, undefined, sk.randomX === true, sk.minX));
        if (choisie) creneauxSel[`${kw}_0`] = String(choisie.id);
      }
      const premiers = slots.length ? plusieurs(rand, slots[0].c, variantes) : [undefined];
      for (const t0 of premiers) {
        const targetMap: Record<string, string> = { ...creneauxSel };
        slots.forEach((x, i) => { targetMap[x.slot.slot] = i === 0 && t0 ? t0 : pick(rand, x.c)!; });
        out.push({ ...base, targetMap });
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

  out.push(...coupsDeRessources(state, rand, variantes));

  const hero = me.hero.heroDefinition;
  if (hero && canUseHeroPower(state)) {
    // Une réponse PAR EFFET, comme le client : cible simple, cibles d'effet
    // composé (`hp_<i>#<n>`), Sélection, modale de deck. Le premier effet
    // ciblé est décliné en variantes, les autres tirés au hasard.
    const effets = effetsDuPouvoir(hero);
    const iVar = effets.findIndex((_, i) => effetPouvoirACible(hero, i));
    const premiers = iVar >= 0 ? plusieurs(rand, ciblesEffetPouvoir(state, hero, iVar), variantes) : [undefined];
    for (const t0 of premiers) {
      const a: Extract<GameAction, { type: "hero_power" }> = { type: "hero_power" };
      effets.forEach((e, i) => {
        if (e.mode === "spell_trigger" && (SELECTIONS_SORT as readonly string[]).includes(e.keywordId)) {
          const choisie = pick(rand, selectionCardsForKeyword(e.keywordId as SelectionFamilyId, state, e.params?.amount ?? 0, { faction: hero.faction ?? null } as never));
          if (choisie) a.selectionsEffets = { ...a.selectionsEffets, [i]: choisie.id };
        }
        if (e.mode === "spell_trigger" && ["divination", "presage", "creuser"].includes(e.keywordId)) {
          a.choixDeckEffets = { ...a.choixDeckEffets, [i]: Math.floor(rand() * 3) };
        }
        if (!effetPouvoirACible(hero, i)) return;
        const cibles = ciblesEffetPouvoir(state, hero, i);
        const choix = i === iVar && t0 ? t0 : pick(rand, cibles);
        if (!choix) return;
        const compose = heroPowerComposedChoice(hero, i);
        if (compose) {
          const tm: Record<string, string> = { ...a.targetMap };
          for (let n = 0; n < compose.count; n++) tm[`${compose.uid}#${n}`] = n === 0 ? choix : pick(rand, cibles)!;
          a.targetMap = tm;
        } else {
          a.ciblesEffets = { ...a.ciblesEffets, [i]: choix };
        }
      });
      out.push(a);
    }
  }

  out.push({ type: "end_turn" });
  return out;
}

/** Coups liés aux COMPTEURS et zones annexes : dépenses d'Épargne / Foi /
 *  Conquête, prise de la machine d'Invention, Éveil, Seconde vie, capacités
 *  activées (tap). L'Exploration n'a pas de dépense : elle pioche toute seule
 *  à son palier. Le bot heuristique décide ensuite QUAND dépenser
 *  (cf. depenseOpportune) ; ici on se contente de proposer. */
export function coupsDeRessources(state: GameState, rand: Rand, variantes = 1): GameAction[] {
  const out: GameAction[] = [];
  const me = state.players[state.currentPlayerIndex];
  const mainPleine = me.hand.length >= MAX_HAND_SIZE;

  const epargne = me.epargne ?? 0;
  if (epargne >= 1 && !mainPleine) {
    const offre = getSelectionCards(state, epargne, { faction: me.hero.heroDefinition?.faction ?? null });
    for (const c of plusieurs(rand, offre, variantes)) out.push({ type: "spend_epargne", selectionCardId: c.id });
  }
  if ((me.foi ?? 0) >= 1 && !mainPleine) {
    for (const c of plusieurs(rand, getFoiOffer(state), variantes)) out.push({ type: "spend_foi", cardInstanceId: c.instanceId });
  }
  if ((me.conquete ?? 0) >= 1 && !mainPleine) {
    for (const c of plusieurs(rand, getConqueteOffer(state), variantes)) out.push({ type: "spend_conquete", cardInstanceId: c.instanceId });
  }
  if ((me.machine?.inventions ?? 0) >= 1 && !mainPleine) out.push({ type: "take_machine" });

  // Éveil : mettre une carte en éveil, verser des points, la faire arriver.
  for (const ci of me.hand) if (canSuspendToEveil(state, ci.instanceId)) out.push({ type: "suspend_eveil", cardInstanceId: ci.instanceId });
  for (const e of me.eveil ?? []) {
    if (e.remaining === 1) out.push({ type: "play_card", fromEveil: true, cardInstanceId: e.instance.instanceId, boardPosition: me.board.length });
    else {
      const max = maxEveilPayment(state, e.instance.instanceId);
      if (max >= 1) out.push({ type: "pay_eveil", cardInstanceId: e.instance.instanceId, amount: max });
    }
  }

  // Seconde vie : rejouer une créature depuis le cimetière.
  for (const ci of me.graveyard) {
    if (canPlayFromGraveyard(state, ci.instanceId)) out.push({ type: "play_card", fromGraveyard: true, cardInstanceId: ci.instanceId, boardPosition: me.board.length });
  }

  // OBJETS posés mais sans porteur : les équiper (coût d'équipement en mana).
  for (const item of objetsDe(me)) {
    if (item.equippedToInstanceId) continue;
    if (me.mana < getEquipCost(item.card)) continue;
    for (const c of me.board) {
      if (peutRecevoirObjet(me, c, item)) out.push({ type: "equip_item", itemInstanceId: item.instanceId, targetInstanceId: c.instanceId });
    }
  }

  // Capacités activées (tap) : mot-clé en mode « tap » ou effet composé on_activation.
  for (const src of me.board) {
    if (!peutActiverPouvoir(src)) continue;
    (src.card.keyword_instances ?? []).forEach((inst, idx) => {
      if (inst.mode !== "tap") return;
      const cibles = getTapActivateTargets(state, inst.id, src.instanceId);
      if (cibles === null) out.push({ type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: idx });
      else for (const t of plusieurs(rand, cibles, variantes)) out.push({ type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: idx, targetInstanceId: t });
    });
    const uid = getCreatureTapComposedUid(src.card);
    if (uid) {
      const cibles = getComposedTapTargets(state, src.card, uid);
      if (!cibles || cibles.length === 0) out.push({ type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: -1, composedUid: uid });
      else for (const t of plusieurs(rand, cibles, variantes)) out.push({ type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: -1, composedUid: uid, targetInstanceId: t });
    }
  }
  return out;
}
