import { create } from "zustand";
import type { Capability, GameState, GameAction, Card, CardInstance, DamageEvent, DeathFxEvent, HeroDefinition, KeywordMode, PlayerState, SpellTargetSlot, TokenTemplate } from "@/lib/game/types";
import type { DeckPickerKeyword } from "@/lib/game/engine";
import { useAudioStore } from "./audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";
import { playAttackLunge } from "@/lib/game/animations";
import { findInstanceEl, overlayRect, OVERLAY } from "@/lib/fx/overlayMotion";
import { parseXValuesFromEffectText, KEYWORD_LABELS, KEYWORD_SYMBOLS, keywordModeColor } from "@/lib/game/keyword-labels";
import { composedCapsOf, composedTriggerMode, composedChoicePrompt } from "@/lib/game/composed-display";
import { getCapabilities } from "@/lib/game/capability-adapter";
import {
  initializeGame,
  applyAction,
  canPlayCard,
  canAttack,
  getValidTargets,
  needsTarget,
  getSpellSlotTargets,
  getSpellTargetSlots,
  canUseHeroPower,
  heroPowerNeedsTarget,
  getHeroPowerTargets,
  heroPowerComposedChoice,
  creatureNeedsTarget,
  getCreatureTargets,
  getCreatureComposedChoice,
  getOnAttackComposedChoice,
  getOnAttackTargets,
  getComposedTapTargets,
  creatureNeedsGraveyardTarget,
  getGraveyardTargets,
  onPlayDeckPickers,
  PRESAGE_REVEAL_COUNT,
  creatureCanCastLearnedSpell,
  canSuspendToEveil,
  canPayEveil,
  maxEveilPayment,
  creatureNeedsApprentissage,
  handSpellsFor,
  chantBonusForSpell,
  tempoBonusForCard,
  creatureNeedsTraqueDuDestin,
  getTraqueDuDestinX,
  creatureNeedsSelection,
  getSelectionCards,
  creatureNeedsRenfortRoyal,
  getRenfortRoyalCards,
  creatureNeedsMagicalSelection,
  getMagicalSelectionCards,
  getSpellGraveyardTargets,
  getComposedGraveyardTargets,
  creatureNeedsComposedGraveyardTarget,
  getCreatureComposedGraveyardChoice,
  getDiscardCost,
  getSacrificeCost,
  getTopdeckCost,
  getTapActivateTargets,
  deferredKwTargetIds,
  endOfTurnTriggerTargets,
} from "@/lib/game/engine";
import { MAX_HAND_SIZE } from "@/lib/game/constants";
import { attackerRemovedItself } from "@/lib/game/attack-wave-order";
import { drawnCardIds } from "@/lib/game/drawn-cards";

/** PRÉSAGE — prépare la modale : les cartes du dessus du deck DANS LE DÉSORDRE,
 *  accompagnées de la table qui retraduit la position cliquée en index réel.
 *
 *  `Math.random()` est ici légitime, contrairement à la règle du moteur : cette
 *  permutation est un habillage strictement LOCAL. Seul le contrôleur voit la
 *  modale, et l'action diffusée ne porte que l'index RÉEL — elle n'entre donc
 *  jamais dans l'état de jeu, ne touche pas `rngState`, et les deux clients
 *  n'ont aucun besoin de tomber d'accord dessus.
 *
 *  Renvoie `null` quand il n'y a rien à révéler (deck vide) : l'appelant doit
 *  alors laisser passer, sans ouvrir de modale vide. */
function presagePickerState(
  deck: CardInstance[],
): { divinationCards: CardInstance[]; deckPickerOrder: number[] } | null {
  const reelles = deck.slice(0, PRESAGE_REVEAL_COUNT);
  if (reelles.length === 0) return null;
  const ordre = reelles.map((_, i) => i);
  for (let i = ordre.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
  }
  return { divinationCards: ordre.map((i) => reelles[i]), deckPickerOrder: ordre };
}

/** Payload de modale pour UN mot-clé de deck, ou null si ce mot-clé n'a rien à
 *  montrer (deck trop court).
 *
 *  `deck` est passé explicitement, et jamais relu depuis l'état : entre deux
 *  maillons d'un enchaînement, le Repli a pu remettre des cartes sur le dessus
 *  (cf. `deckApresRepli`) et c'est ce deck-là que le mot-clé suivant révélera. */
function deckPickerState(
  kw: DeckPickerKeyword,
  deck: CardInstance[],
  creuserX: number,
): { divinationCards: CardInstance[]; deckPickerOrder: number[] | null } | null {
  if (kw === "presage") return presagePickerState(deck);
  // Creuser puise au FOND du deck, Divination sur le DESSUS. Même modale, même
  // sens de lecture pour le joueur : la première carte montrée est celle que
  // le moteur lira en premier.
  const cartes = kw === "creuser"
    ? (creuserX > 0 ? deck.slice(Math.max(0, deck.length - creuserX)) : [])
    : deck.slice(0, Math.min(3, deck.length));
  if (cartes.length === 0) return null;
  return { divinationCards: cartes, deckPickerOrder: null };
}

/** Cadence des points SÉQUENTIELS, par type.
 *
 *  Les dégâts et les soins passent vite : leur popup est bref, 140 ms suffisent
 *  à les distinguer à l'œil.
 *
 *  Les BOOSTS ont leur propre cadence, bien plus lente, et c'est délibéré :
 *  `DamageOverlay` les fait déjà durer ~4,9 s (ralentis ×1,7 pour rester
 *  lisibles). À 140 ms, les trois compteurs d'un Esprit de corps se
 *  superposaient donc presque intégralement — on voyait une bouillie de « +1 »
 *  au lieu de compter la troupe qui se renforce cran par cran.
 *
 *  C'est LE réglage à toucher pour accélérer ou ralentir l'animation des
 *  boosts ; le son suit automatiquement, il lit les mêmes délais. */
const SEQ_STEP_MS = 140;
const SEQ_STEP_BUFF_MS = 550;

const seqStepFor = (type: string): number => (type === "buff" ? SEQ_STEP_BUFF_MS : SEQ_STEP_MS);

/** Décale une série de points selon la cadence propre à chacun, et rend le
 *  délai du DERNIER — c'est lui qui décide du temps à réserver à la phase.
 *  Un simple `i * pas` ne suffit plus dès que deux cadences se mélangent. */
function echelonnerPoints(hits: Array<{ type: string }>): { delais: number[]; dernier: number } {
  let cumul = 0;
  const delais: number[] = [];
  for (const h of hits) {
    delais.push(cumul);
    cumul += seqStepFor(h.type);
  }
  return { delais, dernier: delais.length > 0 ? delais[delais.length - 1] : 0 };
}

/** Retrouve une carte JOUABLE par son instanceId, quelle que soit sa provenance.
 *
 *  La main d'abord — le cas de tout le jeu. Puis les sorts MÉMORISÉS par les
 *  créatures du plateau (Apprentissage) : ceux-là ne vivent dans aucune zone,
 *  et toute la chaîne « sélectionner → payer les coûts → choisir les cibles →
 *  envoyer » les cherchait en main, donc ne les trouvait jamais.
 *
 *  Un seul point de résolution plutôt qu'une quinzaine de `hand.find` élargis
 *  un à un : c'est ce qui garantit qu'un chemin oublié se voie tout de suite
 *  (la carte reste introuvable) au lieu de se comporter à moitié. */
function carteJouable(player: PlayerState, instanceId: string | null | undefined): CardInstance | undefined {
  if (!instanceId) return undefined;
  const enMain = player.hand.find((c) => c.instanceId === instanceId);
  if (enMain) return enMain;
  for (const creature of player.board) {
    if (creature.apprentissageSpell?.instanceId === instanceId) return creature.apprentissageSpell;
  }
  // ÉVEIL — troisième source. Une carte en éveil n'est plus en main, mais tout
  // le flux client (pickers de coûts, ciblage, envoi) doit continuer de la
  // trouver : c'est ce point de résolution unique qui a évité de rouvrir la
  // quinzaine de `hand.find` remplacés lors d'Apprentissage.
  const enEveil = (player.eveil ?? []).find((e) => e.instance.instanceId === instanceId);
  if (enEveil) return enEveil.instance;
  return undefined;
}

/** ÉVEIL — l'entrée correspondante, si la carte attend dans la zone d'éveil.
 *  Sert à estampiller l'action sortante de `fromEveil`. */
function entreeEnEveil(player: PlayerState, instanceId: string | null | undefined) {
  if (!instanceId) return undefined;
  return (player.eveil ?? []).find((e) => e.instance.instanceId === instanceId);
}

/** La créature qui a mémorisé ce sort, s'il en est un. Sert à estampiller
 *  l'action sortante de `learnedFromInstanceId`. */
function apprenanteDuSort(player: PlayerState, instanceId: string | null | undefined): CardInstance | undefined {
  if (!instanceId) return undefined;
  return player.board.find((c) => c.apprentissageSpell?.instanceId === instanceId);
}

/** Position cliquée dans la modale → index réel attendu par le moteur.
 *  Sans table de permutation (Divination, Creuser, Traque), c'est l'identité. */
export function indexReelDuPicker(
  positionCliquee: number,
  ordre: number[] | null,
): number {
  if (!ordre) return positionCliquee;
  return ordre[positionCliquee] ?? positionCliquee;
}

// Overlay de ciblage pour un déclencheur interactif en attente (Remontée mort/
// retour au tour du contrôleur). Si le 1er pending appartient au joueur local
// et a des cibles valides, on entre le mode "pending_trigger" ; sinon "none".
function pendingTriggerOverlay(
  gs: GameState | null,
  localPlayerId: string | null,
): { targetingMode: "pending_trigger" | "selection" | "none"; validTargets: string[]; pendingTriggerId: string | null; pendingTriggerPrompt: string | null; pendingTriggerNeeded: number; pendingTriggerPicked: string[]; selectionCards?: Card[] } {
  const none = { targetingMode: "none" as const, validTargets: [], pendingTriggerId: null, pendingTriggerPrompt: null, pendingTriggerNeeded: 1, pendingTriggerPicked: [] };
  const t = gs?.pendingTriggers?.[0];
  if (!t || !localPlayerId || t.controllerId !== localPlayerId) return none;
  // Variante « Sélection en fin de tour » : ouvre la modale « 1 parmi 3 » (les
  // cartes offertes sont portées par le trigger sous forme d'ids).
  if (t.selectionType) {
    const byId = new Map([...(gs!.factionCardPool ?? []), ...(gs!.allSpellsPool ?? [])].map(c => [c.id, c] as const));
    const ordered = (t.selectionOptionIds ?? []).map(id => byId.get(id)).filter((c): c is Card => !!c);
    if (ordered.length === 0) return none;
    return { targetingMode: "selection" as const, validTargets: [], pendingTriggerId: t.id, pendingTriggerPrompt: null, pendingTriggerNeeded: 1, pendingTriggerPicked: [], selectionCards: ordered };
  }
  // Variante « fin de tour » (effet composé) vs mot-clé curé différé
  // (Remontée, Impact, et tous les curés ciblés du chantier multi-déclencheurs).
  // Un choix de fin de tour a DEUX provenances : une capacité composée portée
  // par une créature (`capUid`), ou un EMBLÈME (`emblemIndex`). L'emblème n'a ni
  // capUid ni kw — sa source est partie, c'est ce qui le définit — si bien que
  // le seul test de `capUid` renvoyait `none` pour tout emblème « au choix » :
  // le moteur suspendait bien le tour (endTurnPending, cf. advanceEndOfTurn)
  // mais aucun sélecteur ne s'ouvrait, et le joueur restait devant un tour figé
  // jusqu'au repli automatique du chrono.
  const isEmblem = t.emblemIndex != null;
  const isEndOfTurn = !!t.capUid || isEmblem;
  if (!isEndOfTurn && !t.kw) return none;
  const controller = gs!.players.find(p => p.id === t.controllerId);
  const other = gs!.players.find(p => p.id !== t.controllerId);
  if (!controller || !other) return none;
  const targets = isEndOfTurn
    ? endOfTurnTriggerTargets(gs!, t)
    : deferredKwTargetIds(t.kw, controller, other, t.sourceInstanceId);
  if (targets.length === 0) return none;
  // Le message du sélecteur doit refléter l'EFFET réel. Pour un effet composé de
  // fin de tour, on le dérive de la capability (ex. buff → « choisissez une
  // créature à renforcer ») au lieu du texte de Remontée qui était figé.
  const KW_PROMPTS: Record<string, string> = {
    impact: `💥 Impact — choisissez une cible à frapper${t.x ? ` (${t.x})` : ""}`,
    remontee: "🔼 Remontée — choisissez l'unité à renvoyer en main",
    affaiblissement: `🔻 Affaiblissement — choisissez la créature ennemie à affaiblir${t.x != null ? ` (-${t.x}/-${t.y ?? 0})` : ""}`,
    benediction: "✝️ Bénédiction — choisissez l'unité alliée à soigner entièrement",
    tactique: "📋 Tactique — choisissez l'allié qui reçoit la capacité",
    sacrifice: "💔 Sacrifice — choisissez l'allié à sacrifier",
    permutation: "🔀 Permutation — choisissez la créature ennemie dont échanger les PV",
    malediction: "💀 Malédiction — choisissez la créature ennemie à maudire",
    mimique: "🪞 Mimique — choisissez l'unité dont copier les capacités",
    metamorphose: "🦎 Métamorphose — choisissez l'unité à copier entièrement",
  };
  // Capacité composée à l'origine du choix, quelle que soit sa provenance. Un
  // `Emblem` n'est pas une `Capability`, mais composedChoicePrompt/composedIcon
  // ne lisent que `.composed` : une enveloppe minimale suffit, et évite de
  // dupliquer un second rendu de libellé pour les emblèmes.
  const capEnCours: Capability | undefined = !isEndOfTurn ? undefined
    : isEmblem
      ? (() => {
        const composed = (controller.emblems ?? [])[t.emblemIndex!]?.composed;
        return composed
          ? { uid: "", trigger: "on_end_of_turn", effectKind: "emblem", abilityId: "_composed", composed } as Capability
          : undefined;
      })()
      : (() => {
        const source = controller.board.find(c => c.instanceId === t.sourceInstanceId);
        return source ? getCapabilities(source.card).find(c => c.uid === t.capUid && c.composed) : undefined;
      })();

  let prompt = (t.kw && KW_PROMPTS[t.kw]) || "🎯 Choisissez une cible";
  if (isEndOfTurn) prompt = capEnCours ? composedChoicePrompt(capEnCours) : "🎯 Choisissez une cible";
  // Nombre de cibles à désigner. `count` du TargetSpec, écrêté au nombre de
  // cibles réellement disponibles — sinon un effet « 4 cartes » sur un cimetière
  // qui n'en compte que 2 attendrait indéfiniment un 3e clic impossible.
  let needed = 1;
  if (isEndOfTurn) {
    const count = capEnCours?.composed?.target?.count;
    if (count === "all") needed = targets.length;
    else if (typeof count === "number") needed = Math.max(1, count);
  }
  needed = Math.min(needed, targets.length);
  return { targetingMode: "pending_trigger", validTargets: targets, pendingTriggerId: t.id, pendingTriggerPrompt: prompt, pendingTriggerNeeded: needed, pendingTriggerPicked: [] };
}

export interface SpellCastEvent {
  spellName: string;
  effectText: string;
  timestamp: number;
  countered?: boolean;
  card?: Card | null;
  targetIds?: string[];
  // Révélation d'une carte dont l'effet « à la pioche » vient de partir (elle
  // n'est PAS jouée : elle rejoint la main). Porte le point de vue du client
  // local pour que la bannière dise qui a pioché — c'est tout l'intérêt côté
  // adversaire, qui ne voit pas la carte entrer dans la main d'en face.
  drawTrigger?: "self" | "opponent";
}

// Flèche source→cible tracée depuis la CRÉATURE qui active un pouvoir (tap)
// vers chaque cible touchée, pour que les deux joueurs voient d'où viennent
// les dégâts (ex. Veilleur des Lisières). Transient (hors hash de désync) ;
// coords DOM déterministes, rejoué chez l'adversaire via dispatchAction.
export interface PowerArrowGroup {
  // instanceId d'une créature OU sentinelle héros ("friendly_hero"/"enemy_hero",
  // relative au joueur local) — findInstanceEl résout les deux.
  sourceId: string;
  targetIds: string[];
  color: string;
}
export interface PowerArrowEvent {
  // Un groupe de flèches par (source, couleur). Un pouvoir activé = jaune ; les
  // dégâts déclenchés (mort/retour/attaque/fin de tour) portent leur couleur de mode.
  arrows: PowerArrowGroup[];
  timestamp: number;
}

export interface FireBreathEvent {
  attackerInstanceId: string;
  timestamp: number;
}

// Cycle éternel — one entry per dead creature carrying the keyword. The
// overlay shows a ghostly copy of each card flying back into its owner's
// deck (data-cycle-deck="my" or "opponent").
export interface CycleEternelEntry {
  card: Card;
  ownerIsLocal: boolean;
}
export interface CycleEternelEvent {
  entries: CycleEternelEntry[];
  timestamp: number;
}

/** Coût d'EXIL payé : X cartes retirées du dessus d'un deck. Elles ne rejoignent
 *  aucune zone et personne ne peut les récupérer — sans animation, seul le
 *  compteur du deck baissait, sans lien visible avec la carte jouée. */
/** Effet « deck » silencieux (Préincanter / Fortifier) ayant réellement modifié
 *  une carte du deck. Un badge s'élève de la pile visée.
 *
 *  Ne porte PAS la carte affectée : la capacité tient à ne pas divulguer le
 *  sommet du deck, et l'animation respecte ce choix — on montre QU'il s'est
 *  passé quelque chose, jamais SUR QUOI. */
export interface DeckEffectEvent {
  abilityId: "preincanter" | "fortifier";
  /** Amplitude RÉELLEMENT accordée (Préincanter est écrêté au plancher de 1 mana). */
  x: number;
  y: number;
  /** Deck du joueur LOCAL ou de l'adversaire — décide de la pile visée. */
  isLocal: boolean;
  timestamp: number;
}

export interface ExileCostEvent {
  count: number;
  /** Deck du joueur LOCAL ou de l'adversaire — décide de la pile visée. */
  isLocal: boolean;
  /** Dos de carte de ce deck, pour que les moitiés déchirées en aient l'air. */
  cardBackUrl: string | null;
  /** Son propre à la carte qui paie ce coût. Absent ⇒ repli sur le son global
   *  `exile_cost` s'il en existe un. */
  sfxUrl?: string | null;
  timestamp: number;
}

/** Coût de REPLI : N cartes quittent la main pour le dessus du deck.
 *
 *  On ne transporte QUE le nombre et le camp : la carte repliée n'est jamais
 *  révélée — ni à l'adversaire, à qui elle donnerait la prochaine pioche, ni
 *  même au joueur, qui vient de la désigner et n'a rien à réapprendre. */
export interface TopdeckCostEvent {
  count: number;
  /** Deck du joueur LOCAL ou de l'adversaire — décide de la pile visée. */
  isLocal: boolean;
  /** Dos de carte de ce deck : c'est ce qu'on voit filer vers la pile. */
  cardBackUrl: string | null;
  timestamp: number;
}

/** ÉVEIL — un mouvement de la zone d'éveil, à signaler à l'écran.
 *
 *  Contrairement au repli, la CARTE est transportée : l'éveil est public, des
 *  deux côtés. Sans ce signal, une carte quitterait la main pour ressurgir
 *  plusieurs tours plus tard sur le plateau, et l'adversaire ne verrait qu'un
 *  compteur bouger dans un coin de l'écran. */
export interface EveilEvent {
  kind: "suspend" | "pay" | "arrive";
  card: Card;
  /** Points restants après le mouvement (0 à l'arrivée). */
  remaining: number;
  /** Zone d'éveil du joueur LOCAL ou de l'adversaire — décide de la tuile visée. */
  isLocal: boolean;
  timestamp: number;
}

// Tempête X — lightning rain animation. Driven by the per-target damage
// events the engine emits during the resolved action; we collect those
// here so the overlay can stagger one bolt per drop.
export interface TempeteEvent {
  targetIds: string[];
  timestamp: number;
}

// Une ou plusieurs cartes de la main du joueur local viennent de voir leur
// coût en mana réduit (Sacrifice démoniaque…). Sert à faire flotter un « -N »
// vert sur chaque carte concernée. `byInstance` mappe instanceId → réduction
// appliquée par CETTE action.
export interface ManaReductionEvent {
  byInstance: Record<string, number>;
  timestamp: number;
}

/** Gain de compteur d'Épargne à animer, par camp (point de vue local). Le
 *  montant est un DIFF d'état côté store : il couvre donc tous les chemins
 *  d'alimentation (invocation, fin de tour, sort, effet composé) sans que le
 *  moteur ait à émettre quoi que ce soit. */
export interface EpargneGainEvent {
  bySide: Partial<Record<"mine" | "theirs", number>>;
  timestamp: number;
}

export interface HeroPowerCastEvent {
  // Purely an FX payload (not part of hashed GameState). heroId lets the
  // overlay localise name / power via useHeroText at render time.
  heroId: number;
  heroName: string;
  race: string;
  powerName: string;
  powerDescription: string;
  // Per-hero illustration for the cast overlay. Falls back to the
  // race-generic image (HERO_IMAGES[race]) in HeroPowerOverlay when null.
  powerImageUrl?: string | null;
  timestamp: number;
}

export interface GraveyardAffectEvent {
  cards: Card[];
  timestamp: number;
}

// A card was forcibly discarded from a player's hand to their graveyard
// (Combustion, future "forced discard" effects). Shown in its own phase
// between summons and draws so the player sees what was discarded *before*
// the new cards are drawn.
export interface DiscardFromHandEvent {
  cards: Card[];
  ownerPlayerId: string;
  timestamp: number;
}

// ── Historique d'actions (bande latérale « à la Hearthstone ») ──────────────
// Journal STRUCTURÉ des dernières actions : contrairement aux champs d'overlay
// ci-dessus (vidés par les clearXEvent dès l'animation finie), ces entrées
// persistent pour être relues au calme. Purement client : rien n'entre dans
// GameState, donc aucun impact sur le hash de synchro ni sur match_state.
export type HistoryKind = "spell" | "attack" | "death" | "bounce" | "power" | "hero_power";

export interface ActionHistoryEntry {
  // `${timestamp}-${idx}` : plusieurs entrées naissent dans le MÊME tick, un
  // timestamp nu ne serait pas une clé React unique (cf. le piège des sorts
  // relancés, plus bas dans dispatchAction).
  id: string;
  kind: HistoryKind;
  // Point de vue LOCAL : qui a agi (couleur de bord de la vignette).
  side: "friendly" | "enemy";
  // Carte affichée en vignette + en aperçu. Absente pour un pouvoir de héros.
  card?: Card;
  hero?: {
    heroId: number;
    heroName: string;
    race: string;
    powerName: string;
    powerDescription: string;
    powerImageUrl?: string | null;
  };
  // Cible principale : une carte en jeu, ou un héros (POV local).
  targetCard?: Card;
  targetIsHero?: "friendly" | "enemy" | null;
  // Cibles supplémentaires au-delà de la première (« +2 »).
  extraTargets?: number;
  // Dégâts subis par la cible principale, quand connus.
  amount?: number;
  // kind === "power" : couleur du mode de déclenchement (keywordModeColor).
  modeColor?: string;
  countered?: boolean;
  timestamp: number;
}

/** Nombre d'entrées conservées dans la bande latérale. */
export const ACTION_HISTORY_MAX = 7;

interface GameStore {
  // State
  gameState: GameState | null;
  localPlayerId: string | null;
  selectedCardInstanceId: string | null;
  selectedAttackerInstanceId: string | null;
  validTargets: string[];
  targetingMode: "none" | "attack" | "attack_power" | "spell" | "spell_multi" | "creature" | "graveyard" | "divination" | "selection" | "tactique_keywords" | "hero_power" | "cost_payment" | "tap" | "pending_trigger";
  // Id du déclencheur interactif en attente que le contrôleur résout (Remontée
  // mort/retour à son tour). null hors de ce mode.
  pendingTriggerId: string | null;
  // Message du sélecteur du déclencheur en attente, dérivé de l'effet réel
  // (ex. buff de fin de tour → « choisissez une créature à renforcer »). null
  // hors du mode pending_trigger.
  pendingTriggerPrompt: string | null;
  /** Nombre de cibles que le déclencheur en attente réclame (TargetSpec.count,
   *  écrêté au pool disponible), et celles déjà désignées. */
  pendingTriggerNeeded: number;
  pendingTriggerPicked: string[];
  // Tap-activation targeting context — set when the player clicks Activer
  // on a creature whose tap-mode keyword needs a target (e.g. Vampirisme).
  // Both fields stay null outside of tap targeting.
  pendingTapSourceId: string | null;
  pendingTapInstanceIdx: number | null;
  // uid de l'effet composé activable en attente de cible (null sinon).
  pendingTapComposedUid: string | null;
  // Alternative-cost payment state — set when the player tries to play a card
  // with a discard_cost, sacrifice_cost or topdeck_cost > 0. The player picks N
  // cards from hand (défausse et/ou repli) and/or N creatures from board, then
  // confirms via CostPaymentOverlay.
  pendingCostCard: { instanceId: string; discardNeeded: number; sacrificeNeeded: number; topdeckNeeded: number; boardPosition: number | null } | null;
  selectedDiscardIds: string[];
  selectedSacrificeIds: string[];
  /** REPLI : cartes de la main désignées pour retourner sur le deck. L'ORDRE
   *  est significatif — la première désignée finira sur le dessus — donc on
   *  garde un tableau, jamais un Set. */
  selectedTopdeckIds: string[];
  // True while the active selection overlay was opened by a hero power
  // (selection / renfort_royal / selection_magique). The next selectTarget
  // call dispatches a hero_power action instead of a play_card.
  pendingHeroPowerSelection: boolean;
  /** Le picker « 1 parmi 3 » ouvert est celui du compteur d'Épargne : le
   *  dispatch à venir est un `spend_epargne`, pas un play_card. */
  pendingEpargneSelection: boolean;
  pendingBoardPosition: number | null;
  /** Instance dont les sons d'ENTRÉE EN JEU ont déjà été joués au moment de
   *  l'aperçu (créature posée, picker de capacité ouvert). Le dispatch qui suit
   *  ne doit pas les rejouer : ils seraient entendus deux fois, la seconde après
   *  la fermeture de la fenêtre — soit très loin de ce qu'ils accompagnent. */
  sfxPreAnnouncedInstanceId: string | null;
  markOnPlaySfxAnnounced: (instanceId: string) => void;
  divinationCards: CardInstance[];
  /** PRÉSAGE — traduction « position AFFICHÉE → index RÉEL dans le deck ».
   *
   *  Présage montre les cartes DANS LE DÉSORDRE : sans cette table, l'index que
   *  le joueur clique ne désignerait plus la même carte que celle que le moteur
   *  lit dans `deck.splice(0, 3)`, et la bonne réponse deviendrait aléatoire.
   *
   *  `null` = ordre réel, c'est-à-dire le comportement inchangé de Divination,
   *  Creuser et Traque du destin, qui partagent la même modale.
   *
   *  La permutation est purement LOCALE : seul le contrôleur voit la modale, et
   *  l'action diffusée ne porte que l'index réel. Elle n'entre donc ni dans
   *  l'état de jeu, ni dans le hash de synchro, et ne consomme pas la RNG
   *  partagée. */
  deckPickerOrder: number[] | null;
  /** APPRENTISSAGE — la modale partagée sert ici à choisir un sort de la MAIN,
   *  pas une carte du deck. Porte l'instanceId de la créature qui apprend ;
   *  `null` = usage habituel (Divination, Creuser, Traque, Présage). */
  learnPickerFor: string | null;
  /** À QUEL mot-clé de deck appartient la modale actuellement ouverte.
   *
   *  Quatre mécaniques partagent cette modale ; tant qu'une carte n'en portait
   *  qu'une, savoir laquelle était inutile. Une carte qui en porte DEUX
   *  (« Veilleuse des Étoiles » : Divination puis Présage) doit en revanche
   *  ranger chaque réponse sous le bon mot-clé avant d'ouvrir la suivante.
   *  `null` = modale ouverte pour autre chose (Traque du destin, Apprentissage),
   *  qui n'entre pas dans l'enchaînement. */
  deckPickerKeyword: DeckPickerKeyword | null;
  /** Réponses déjà données pour la carte en cours de pose, par mot-clé. Vidé à
   *  chaque nouvelle pose ; part dans l'action sous `deckChoiceIndices`. */
  collectedDeckChoices: Partial<Record<DeckPickerKeyword, number>>;
  selectionCards: Card[];
  tactiqueAvailableKeywords: string[];
  tactiqueMaxSelections: number;
  pendingTargetInstanceId: string | null;
  // Multi-target spell state
  spellTargetSlots: SpellTargetSlot[];
  currentTargetSlotIndex: number;
  collectedTargetMap: Record<string, string>;
  // Cibles collectées pour un effet composé multi-cibles "au choix" d'une créature.
  creatureComposedCollected: string[];
  // Pouvoir de héros composé en cours de ciblage : uid de la capacité + nombre
  // de cibles à collecter (réutilise creatureComposedCollected pour l'accu).
  pendingHeroPowerComposed: { uid: string; count: number } | null;
  // Exhumation composée en cours de ciblage cimetière. `caps` est une FILE : une
  // carte peut porter plusieurs Exhumations composées (une capacité par
  // résurrection, ex. « Légion des Damnés » et ses 3 cx_N), et chacune réclame
  // son propre choix. On les enchaîne dans l'ordre des capacités ; sans file,
  // seule la première était choisie et les autres retombaient sur le repli
  // déterministe « plus hauts coûts d'abord » du moteur.
  // `context` route l'action finale (le picker cimetière est partagé).
  pendingComposedGraveyard: {
    caps: { uid: string; count: number }[];
    capIndex: number;
    picked: Record<string, string[]>;
    context: "spell" | "creature" | "hero_power";
  } | null;
  // Attaque avec pouvoir composé "à l'attaque" en désignation "au choix" : la
  // cible d'attaque est mémorisée pendant qu'on collecte les cibles du pouvoir.
  pendingAttackDefenderId: string | null;
  attackPowerCollected: string[];
  // Carries the partial play_card payload from a creature's first picker
  // (target / graveyard / divination) into a subsequent selection picker on
  // the same creature, so a creature combining e.g. mimique + selection can
  // resolve both halves in one dispatch. Null outside of that chain.
  pendingCreatureChain: {
    targetInstanceId?: string;
    graveyardTargetInstanceId?: string;
    divinationChoiceIndex?: number;
    boardPosition?: number | null;
  } | null;
  tokenTemplates: TokenTemplate[];
  effectLog: { id: string; text: string; timestamp: number }[];
  // Bande latérale d'historique — les ACTION_HISTORY_MAX dernières entrées,
  // plus ancienne en tête (le composant inverse pour l'affichage).
  actionHistory: ActionHistoryEntry[];
  damageEvents: DamageEvent[];
  deathEvents: DeathFxEvent[];
  summonEvents: string[]; // instanceIds of creatures summoned this action (FX)
  entryEvents: string[]; // instanceIds de créatures JOUÉES depuis la main cette action → entrée douce (≠ FX portail des invocations)
  spellCastEvent: SpellCastEvent | null;
  fireBreathEvent: FireBreathEvent | null;
  cycleEternelEvent: CycleEternelEvent | null;
  compagnonsEvent: CycleEternelEvent | null;
  exileCostEvent: ExileCostEvent | null;
  topdeckCostEvent: TopdeckCostEvent | null;
  eveilEvent: EveilEvent | null;
  deckEffectEvent: DeckEffectEvent | null;
  clearExileCostEvent: () => void;
  clearTopdeckCostEvent: () => void;
  clearEveilEvent: () => void;
  clearDeckEffectEvent: () => void;
  tempeteEvent: TempeteEvent | null;
  powerArrowEvent: PowerArrowEvent | null;
  manaReductionEvent: ManaReductionEvent | null;
  epargneGainEvent: EpargneGainEvent | null;
  heroPowerCastEvent: HeroPowerCastEvent | null;
  graveyardAffectEvent: GraveyardAffectEvent | null;
  discardFromHandEvent: DiscardFromHandEvent | null;
  boardImageUrl: string | null;
  // Layout variant carried by the active game_board. "classic" = legacy
  // positions; "mtgo" = MTGO-inspired with a clickable graveyard tile on
  // the left and the hero/deck/mana stack on the right (mirrored at top
  // for the opponent).
  boardLayout: string;
  // Optional admin-uploaded image used as the clickable graveyard tile in
  // layouts that surface one (mtgo). Falls back to a generic 💀 icon when
  // null.
  boardGraveyardImageUrl: string | null;
  myCardBackUrl: string | null;
  opponentCardBackUrl: string | null;
  boardMusicUrls: string[];
  boardTenseMusicUrl: string | null;
  boardVictoryMusicUrl: string | null;
  boardDefeatMusicUrl: string | null;
  lastSfxEvents: { type: string; cardSfxUrl?: string }[];
  // Animation orchestration
  isAnimating: boolean;
  pendingIncomingActions: GameAction[];

  // Actions
  initGame: (
    player1Id: string,
    player2Id: string,
    player1Cards: { card: Card; quantity: number }[],
    player2Cards: { card: Card; quantity: number }[],
    firstPlayerIndex?: 0 | 1,
    seed?: number,
    player1Hero?: HeroDefinition | null,
    player2Hero?: HeroDefinition | null,
    factionCardPool?: Card[],
    allSpellsPool?: Card[],
    formatCode?: import("@/lib/game/types").FormatCode | null,
  ) => void;
  setGameState: (state: GameState) => void;
  setLocalPlayerId: (id: string) => void;
  setTokenTemplates: (templates: TokenTemplate[]) => void;
  setBoardImageUrl: (url: string | null) => void;
  setBoardLayout: (layout: string) => void;
  setBoardGraveyardImageUrl: (url: string | null) => void;
  setMyCardBackUrl: (url: string | null) => void;
  setOpponentCardBackUrl: (url: string | null) => void;
  setBoardMusicUrls: (urls: string[]) => void;
  setBoardTenseMusicUrl: (url: string | null) => void;
  setBoardVictoryMusicUrl: (url: string | null) => void;
  setBoardDefeatMusicUrl: (url: string | null) => void;
  /** Push the per-player owned-limited-card lists onto each PlayerState
   *  after `initGame`. Used by Renfort Royal to know which limited
   *  prints the player can pull from. */
  setOwnedLimitedCardIds: (player1Ids: number[], player2Ids: number[]) => void;

  // Game actions
  dispatchAction: (action: GameAction) => GameAction | null;
  playCardDirect: (instanceId: string, boardPosition?: number) => GameAction | null;
  /** Sélectionne une carte de la main et ouvre ce qu'elle réclame (paiement de
   *  coût, ciblage, modale de deck…). Sans rien à réclamer, elle est JOUÉE.
   *
   *  `ciblageSeulement` coupe cette dernière branche : chaque feuille qui
   *  lancerait la carte renvoie `null` au lieu de la jouer. C'est ce qui rend le
   *  SIMPLE clic sûr sur un sort à cible — il ne peut qu'ouvrir le ciblage,
   *  jamais lancer. Le double-clic, lui, appelle sans le drapeau. */
  selectCardInHand: (instanceId: string, opts?: { ciblageSeulement?: boolean }) => GameAction | null;
  /** ÉVEIL — met une carte de la MAIN en éveil (0 mana, une place sous le
   *  plafond). */
  suspendToEveil: (instanceId: string) => GameAction | null;
  /** ÉVEIL — verse `amount` points sur une carte en éveil (1 par défaut). Le
   *  dernier point est une entrée en jeu : il repart par le flux de jeu normal,
   *  pickers compris, et `amount` y est sans objet. */
  payEveilPoint: (instanceId: string, amount?: number) => GameAction | null;
  selectAttacker: (instanceId: string) => void;
  selectTarget: (targetId: string) => GameAction | null;
  clearSelection: () => void;
  clearDamageEvents: () => void;
  clearDeathEvents: () => void;
  clearSummonEvents: () => void;
  clearSpellCastEvent: () => void;
  clearFireBreathEvent: () => void;
  clearCycleEternelEvent: () => void;
  clearCompagnonsEvent: () => void;
  clearTempeteEvent: () => void;
  clearPowerArrowEvent: () => void;
  clearManaReductionEvent: () => void;
  clearEpargneGainEvent: () => void;
  clearHeroPowerCastEvent: () => void;
  clearGraveyardAffectEvent: () => void;
  clearDiscardFromHandEvent: () => void;
  toggleDiscardSelection: (instanceId: string) => void;
  toggleSacrificeSelection: (instanceId: string) => void;
  toggleTopdeckSelection: (instanceId: string) => void;
  confirmCostPayment: () => GameAction | null;
  cancelCostPayment: () => void;
  activateHeroPower: () => GameAction | null;
  /** Clic sur le compteur d'Épargne : ouvre le picker. Renvoie toujours null
   *  (rien n'est diffusé tant que le joueur n'a pas choisi). */
  openEpargnePicker: () => GameAction | null;
  /** APPRENTISSAGE — lance le sort mémorisé par cette créature (coûts et
   *  ciblage passent par la chaîne habituelle des sorts). */
  activateLearnedSpell: (creatureInstanceId: string) => GameAction | null;
  activateTap: (sourceInstanceId: string, instanceIdx: number) => GameAction | null;
  activateTapComposed: (sourceInstanceId: string, capUid: string) => GameAction | null;
  confirmMulligan: (selectedInstanceIds: string[]) => GameAction | null;

  // Queries
  isMyTurn: () => boolean;
  getMyPlayerState: () => ReturnType<typeof getPlayerState>;
  getOpponentPlayerState: () => ReturnType<typeof getPlayerState>;
}

function getPlayerState(state: GameState, playerId: string) {
  const idx = state.players.findIndex((p) => p.id === playerId);
  return idx !== -1 ? state.players[idx] : null;
}

function getElementCenter(targetId: string): { x: number; y: number } {
  let el: Element | null = null;
  if (targetId === "enemy_hero" || targetId === "friendly_hero") {
    el = document.querySelector(`[data-target-id="${targetId}"]`);
  } else {
    // Prefer the on-board creature over any hand copy sharing this instanceId,
    // so the damage popup/FX anchors on the board fighter, not a card in hand.
    el = findInstanceEl(targetId);
  }
  if (el) {
    const rect = overlayRect(el);
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: -9999, y: -9999 };
}

// Keywords that already have their own dedicated popup — skip them in the
// generic "empower" (capability acquired) detection so we don't double up.
const EMPOWER_SKIP = new Set(["divine_shield", "poison", "paralysie"]);

// Build a readable "🏅 Gloire" label for a freshly-granted keyword. Image-path
// symbols (e.g. /icons/augure.png) fall back to a generic rune glyph; numeric
// keywords drop their trailing " X" placeholder.
function keywordGrantLabel(kw: string): string | null {
  const label = (KEYWORD_LABELS as Record<string, string>)[kw];
  if (!label) return null; // internal/undisplayable flag — ignore
  const sym = (KEYWORD_SYMBOLS as Record<string, string>)[kw];
  const glyph = sym && !sym.startsWith("/") ? sym : "✦";
  return `${glyph} ${label.replace(/ X$/, "")}`;
}

// Popups de dégâts des créatures TUÉES pendant l'action. `detectDamageEvents`
// ne diffe que les créatures encore présentes sur le nouveau plateau : une
// morte n'y figure plus, donc son chiffre de dégâts n'était jamais émis — un
// Cataclysme qui nettoie le plateau n'animait alors AUCUN dégât, juste des
// morts. Le montant vient du registre moteur `damageLedger` (dégâts réellement
// appliqués, après immunités et réductions) : un `destroy` / sacrifice, qui met
// les PV à 0 sans passer par les dégâts, n'y a pas d'entrée et ne fait donc
// flotter aucun chiffre — comportement inchangé.
//
// Écrêtage par la perte de PV RÉELLE de cette vague (`dead` porte les PV du
// début de vague, la dépouille au cimetière les PV finaux, négatifs en cas de
// surtuerie) : sur une attaque à deux vagues, une créature blessée par le
// pouvoir puis achevée au combat a déjà vu son premier popup à la vague 1 ;
// sans l'écrêtage, le registre cumulé le recompterait à la vague 2.
function lethalDamageEvents(
  dead: CardInstance[],
  waveEnd: GameState,
  ledger: Map<string, number>,
): DamageEvent[] {
  const events: DamageEvent[] = [];
  for (const c of dead) {
    const dealt = ledger.get(c.instanceId) ?? 0;
    if (dealt <= 0) continue;
    const corpse = waveEnd.players
      .flatMap((p) => p.graveyard)
      .find((g) => g.instanceId === c.instanceId);
    // Dépouille introuvable (exil, métamorphose) → on fait confiance au registre.
    const hpDrop = corpse ? c.currentHealth - corpse.currentHealth : dealt;
    const amount = Math.min(dealt, Math.max(0, hpDrop));
    if (amount <= 0) continue;
    events.push({
      targetId: c.instanceId,
      amount,
      type: c.isPoisoned && amount === 1 ? "poison" : "damage",
      ...getElementCenter(c.instanceId),
    });
  }
  return events;
}

function detectDamageEvents(
  oldState: GameState,
  newState: GameState,
  localPlayerId: string | null
): DamageEvent[] {
  const events: DamageEvent[] = [];

  for (let i = 0; i < 2; i++) {
    const oldPlayer = oldState.players[i];
    const newPlayer = newState.players[i];
    const isLocal = oldPlayer.id === localPlayerId;
    const heroId = isLocal ? "friendly_hero" : "enemy_hero";

    // Hero damage — inclut les dégâts absorbés par l'armure. dealDamageToHero
    // retire d'abord l'armure puis les PV : un coup encaissé par l'armure fait
    // baisser hero.armor SANS toucher hero.hp. Sans ce cumul, un surplus de
    // Piétinement (ou toute attaque) mangé par l'armure n'affichait aucun FX de
    // dégât. Total ressenti = PV perdus + armure perdue.
    const heroHpLoss = oldPlayer.hero.hp - newPlayer.hero.hp;
    const heroArmorLoss = oldPlayer.hero.armor - newPlayer.hero.armor;
    const heroDamageTaken = Math.max(0, heroHpLoss) + Math.max(0, heroArmorLoss);
    if (heroDamageTaken > 0) {
      const pos = getElementCenter(heroId);
      events.push({
        targetId: heroId,
        amount: heroDamageTaken,
        type: "damage",
        ...pos,
      });
    }

    // Hero heal
    if (newPlayer.hero.hp > oldPlayer.hero.hp) {
      const pos = getElementCenter(heroId);
      events.push({
        targetId: heroId,
        amount: newPlayer.hero.hp - oldPlayer.hero.hp,
        type: "heal",
        ...pos,
      });
    }

    // Armor gain
    if (newPlayer.hero.armor > oldPlayer.hero.armor) {
      const pos = getElementCenter(heroId);
      events.push({
        targetId: heroId,
        amount: newPlayer.hero.armor - oldPlayer.hero.armor,
        type: "buff",
        label: `+${newPlayer.hero.armor - oldPlayer.hero.armor} Armor`,
        ...pos,
      });
    }

    // Creature changes — check old board creatures
    for (const oldCreature of oldPlayer.board) {
      const newCreature = newPlayer.board.find(
        (c) => c.instanceId === oldCreature.instanceId
      );
      if (!newCreature) continue;

      // Damage (poison tick or regular)
      // Dégâts réels = baisse de PV courants NON expliquée par une baisse de PV
      // max (celle-ci vient d'un debuff, géré plus bas comme « -X/-Y »). Évite un
      // double popup (dégât + debuff) quand un debuff réduit aussi les PV courants.
      const maxHpDrop = Math.max(0, oldCreature.maxHealth - newCreature.maxHealth);
      const dmgAmount = (oldCreature.currentHealth - newCreature.currentHealth) - maxHpDrop;
      if (dmgAmount > 0) {
        const pos = getElementCenter(oldCreature.instanceId);
        const isPoisonTick = oldCreature.isPoisoned && dmgAmount === 1;
        events.push({
          targetId: oldCreature.instanceId,
          amount: dmgAmount,
          type: isPoisonTick ? "poison" : "damage",
          ...pos,
        });
      }

      // Heal
      if (
        newCreature.currentHealth > oldCreature.currentHealth &&
        newCreature.currentAttack === oldCreature.currentAttack
      ) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: newCreature.currentHealth - oldCreature.currentHealth,
          type: "heal",
          ...pos,
        });
      }

      // Buff / debuff (ATK ou PV max changés par un effet). On teinte le popup
      // par la couleur de l'effet déclencheur (lastBuffMode → keywordModeColor).
      // maxHealth pour les PV : un DÉGÂT baisse currentHealth sans toucher
      // maxHealth → il ne déclenche pas de faux popup de debuff.
      const atkDiff = newCreature.currentAttack - oldCreature.currentAttack;
      const hpDiff = newCreature.maxHealth - oldCreature.maxHealth;
      const buffColor = keywordModeColor(newCreature.lastBuffMode) ?? undefined;
      if (atkDiff > 0 || hpDiff > 0) {
        const pos = getElementCenter(oldCreature.instanceId);
        const parts: string[] = [];
        if (atkDiff > 0) parts.push(`+${atkDiff}`);
        if (hpDiff > 0) parts.push(`+${hpDiff}`);
        events.push({
          targetId: oldCreature.instanceId,
          amount: atkDiff + hpDiff,
          type: "buff",
          label: parts.join("/"),
          ...(buffColor ? { color: buffColor } : {}),
          ...pos,
        });
      }
      // Debuff : baisse PERMANENTE des stats de BASE (card.attack/health) — seuls
      // les vrais debuffs (Affaiblissement, debuff composé, malédiction) la cuisent
      // dans `card`. On l'isole ainsi de l'expiration d'un buff temporaire / d'une
      // aura (qui ne baisse que currentAttack/maxHealth sans toucher `card`) pour
      // éviter de faux « -1 ». Même carte requise (≠ transformation).
      const baseAtkDrop = (oldCreature.card.attack ?? 0) - (newCreature.card.attack ?? 0);
      const baseHpDrop = (oldCreature.card.health ?? 0) - (newCreature.card.health ?? 0);
      if (newCreature.card.id === oldCreature.card.id && (baseAtkDrop > 0 || baseHpDrop > 0)) {
        const pos = getElementCenter(oldCreature.instanceId);
        const parts: string[] = [];
        if (baseAtkDrop > 0) parts.push(`-${baseAtkDrop}`);
        if (baseHpDrop > 0) parts.push(`-${baseHpDrop}`);
        events.push({
          targetId: oldCreature.instanceId,
          amount: -(baseAtkDrop + baseHpDrop),
          type: "debuff",
          label: parts.join("/"),
          ...(buffColor ? { color: buffColor } : {}),
          ...pos,
        });
      }

      // Poisoned
      if (!oldCreature.isPoisoned && newCreature.isPoisoned) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: 0,
          type: "poison",
          label: "☠️ Poison",
          ...pos,
        });
      }

      // Divine Shield gained
      if (!oldCreature.hasDivineShield && newCreature.hasDivineShield) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: 0,
          type: "shield",
          label: "Divine Shield",
          ...pos,
        });
      }

      // Divine Shield broken (absorbed damage)
      if (oldCreature.hasDivineShield && !newCreature.hasDivineShield) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: 0,
          type: "shield",
          label: "Bouclier brisé",
          ...pos,
        });
      }

      // Paralyzed
      if (!oldCreature.isParalyzed && newCreature.isParalyzed) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: 0,
          type: "paralyze",
          label: "⛓️ Paralysie",
          ...pos,
        });
      }

      // Capability acquired — a keyword/ability was granted at runtime (hero
      // power aura, composed grant, spell grant…). Previously silent. We diff
      // the keyword set + grantedKeywordX and surface one "empower" flourish
      // per creature (batched) so the player sees the unit gain power.
      const oldKws = new Set((oldCreature.card.keywords as unknown as string[]).map(String));
      const gained: string[] = [];
      for (const kw of newCreature.card.keywords as unknown as string[]) {
        const k = String(kw);
        if (!oldKws.has(k) && !EMPOWER_SKIP.has(k)) gained.push(k);
      }
      // grantedKeywordX entries that are new (numeric keyword X assigned) and
      // not already covered by the set diff above.
      const oldGx = oldCreature.grantedKeywordX ?? {};
      const newGx = newCreature.grantedKeywordX ?? {};
      for (const k of Object.keys(newGx)) {
        if (!(k in oldGx) && !oldKws.has(k) && !EMPOWER_SKIP.has(k) && !gained.includes(k)) {
          gained.push(k);
        }
      }
      if (gained.length > 0) {
        const labels = gained.map(keywordGrantLabel).filter(Boolean) as string[];
        if (labels.length > 0) {
          const pos = getElementCenter(oldCreature.instanceId);
          events.push({
            targetId: oldCreature.instanceId,
            amount: 0,
            type: "empower",
            label: labels.join("  ·  "),
            ...pos,
          });
        }
      }
    }

    // Buffs sur les créatures EN MAIN (ex. Entrainement). La boucle ci-dessus
    // ne diffe que le plateau, donc un boost de la main serait silencieux. On
    // ne diffe que les cartes présentes dans les DEUX états de main : une carte
    // piochée ou renvoyée en main (rebond) n'était pas dans l'ancienne main →
    // ignorée, donc pas de faux popup. Popup flottant "+X/+Y" identique au
    // plateau, ancré sur la carte en main via son data-instance-id.
    for (const oldCard of oldPlayer.hand) {
      if (oldCard.card.card_type !== "creature") continue;
      const newCard = newPlayer.hand.find((c) => c.instanceId === oldCard.instanceId);
      if (!newCard) continue;
      const atkDiff = newCard.currentAttack - oldCard.currentAttack;
      const hpDiff = newCard.maxHealth - oldCard.maxHealth;
      const buffColor = keywordModeColor(newCard.lastBuffMode) ?? undefined;
      if (atkDiff > 0 || hpDiff > 0) {
        const pos = getElementCenter(oldCard.instanceId);
        const parts: string[] = [];
        if (atkDiff > 0) parts.push(`+${atkDiff}`);
        if (hpDiff > 0) parts.push(`+${hpDiff}`);
        events.push({
          targetId: oldCard.instanceId,
          amount: atkDiff + hpDiff,
          type: "buff",
          label: parts.join("/"),
          ...(buffColor ? { color: buffColor } : {}),
          ...pos,
        });
      }
      const baseAtkDrop = (oldCard.card.attack ?? 0) - (newCard.card.attack ?? 0);
      const baseHpDrop = (oldCard.card.health ?? 0) - (newCard.card.health ?? 0);
      if (newCard.card.id === oldCard.card.id && (baseAtkDrop > 0 || baseHpDrop > 0)) {
        const pos = getElementCenter(oldCard.instanceId);
        const parts: string[] = [];
        if (baseAtkDrop > 0) parts.push(`-${baseAtkDrop}`);
        if (baseHpDrop > 0) parts.push(`-${baseHpDrop}`);
        events.push({
          targetId: oldCard.instanceId,
          amount: -(baseAtkDrop + baseHpDrop),
          type: "debuff",
          label: parts.join("/"),
          ...(buffColor ? { color: buffColor } : {}),
          ...pos,
        });
      }
    }

    // Detect new creatures on board (resurrection, exhumation, convocation)
    for (const newCreature of newPlayer.board) {
      const existed = oldPlayer.board.find(c => c.instanceId === newCreature.instanceId);
      if (!existed && newCreature.hasUsedResurrection) {
        const pos = getElementCenter(newCreature.instanceId);
        events.push({
          targetId: newCreature.instanceId,
          amount: 0,
          type: "resurrect",
          label: "✨ Résurrection",
          ...pos,
        });
      }
    }
  }

  // Detect esquive (dodge): attacker's attacksRemaining decreased but no damage dealt to target
  if (newState.lastAction?.type === "attack") {
    const action = newState.lastAction;
    const targetId = action.targetInstanceId;
    if (targetId && targetId !== "enemy_hero") {
      const attackerPlayerIdx = oldState.currentPlayerIndex;
      const defenderPlayerIdx = attackerPlayerIdx === 0 ? 1 : 0;
      const oldTarget = oldState.players[defenderPlayerIdx].board.find(c => c.instanceId === targetId);
      const newTarget = newState.players[defenderPlayerIdx].board.find(c => c.instanceId === targetId);
      if (oldTarget && newTarget && oldTarget.currentHealth === newTarget.currentHealth) {
        // Target took no damage — check if attacker used an attack
        const oldAttacker = oldState.players[attackerPlayerIdx].board.find(c => c.instanceId === action.attackerInstanceId);
        const newAttacker = newState.players[attackerPlayerIdx].board.find(c => c.instanceId === action.attackerInstanceId);
        if (oldAttacker && newAttacker && oldAttacker.attacksRemaining > newAttacker.attacksRemaining) {
          // Attack happened but target took no damage = esquive
          if (oldTarget.esquiveUsedThisTurn === false && newTarget.esquiveUsedThisTurn === true) {
            const pos = getElementCenter(targetId);
            events.push({
              targetId,
              amount: 0,
              type: "dodge",
              label: "💨 Esquive !",
              ...pos,
            });
          }
        }
      }
    }
  }

  return events;
}

function generateEffectLog(
  oldState: GameState,
  newState: GameState,
  action: GameAction
): { id: string; text: string; timestamp: number }[] {
  const entries: { id: string; text: string; timestamp: number }[] = [];
  const now = Date.now();
  let idx = 0;
  const add = (text: string) => entries.push({ id: `${now}-${idx++}`, text, timestamp: now });

  if (action.type === "play_card") {
    const player = oldState.players[oldState.currentPlayerIndex];
    const cardInst = carteJouable(player, action.cardInstanceId);
    if (cardInst) add(`📥 ${cardInst.card.name} joué`);
  }

  // Detect deaths
  for (let i = 0; i < 2; i++) {
    const oldBoard = oldState.players[i].board;
    const newBoard = newState.players[i].board;
    for (const c of oldBoard) {
      if (!newBoard.find(nc => nc.instanceId === c.instanceId)) {
        add(`💀 ${c.card.name} détruit`);
      }
    }
  }

  // Detect poison ticks
  for (let i = 0; i < 2; i++) {
    for (const nc of newState.players[i].board) {
      const oc = oldState.players[i].board.find(c => c.instanceId === nc.instanceId);
      if (oc && nc.isPoisoned && nc.currentHealth < oc.currentHealth) {
        add(`☠️ Poison : ${nc.card.name} -${oc.currentHealth - nc.currentHealth} PV`);
      }
    }
  }

  // Detect regen
  for (let i = 0; i < 2; i++) {
    for (const nc of newState.players[i].board) {
      const oc = oldState.players[i].board.find(c => c.instanceId === nc.instanceId);
      if (oc && nc.currentHealth > oc.currentHealth && nc.card.keywords.includes("regeneration" as import("@/lib/game/types").Keyword)) {
        add(`💚 Régénération : ${nc.card.name} +${nc.currentHealth - oc.currentHealth} PV`);
      }
    }
  }

  return entries;
}

/**
 * Construit les entrées d'HISTORIQUE (bande latérale) d'une action résolue.
 *
 * Appelée depuis `dispatchAction` une fois toutes les dérivations faites (sorts,
 * morts, dégâts, powerStrikes) : c'est le SEUL moment où source + cible + montant
 * cohabitent. Surtout ne pas lire les champs d'overlay du store — ils sont vidés
 * par les `clearXEvent` pour des raisons purement FX.
 */
function buildHistoryEntries(ctx: {
  oldState: GameState;
  newState: GameState;
  action: GameAction;
  localPlayerId: string | null;
  spellEvent: SpellCastEvent | null;
  recastSpells: SpellCastEvent[];
  heroPowerEvent: HeroPowerCastEvent | null;
  deadCreatures: CardInstance[];
  deathOwnerIdx: Map<string, number>;
  dmgEvents: DamageEvent[];
  powerStrikes: { sourceId: string; targetId: string; mode: KeywordMode }[];
}): ActionHistoryEntry[] {
  const { oldState, newState, action, localPlayerId } = ctx;
  const entries: ActionHistoryEntry[] = [];
  const now = Date.now();
  let idx = 0;
  const push = (e: Omit<ActionHistoryEntry, "id" | "timestamp">) =>
    entries.push({ ...e, id: `${now}-${idx++}`, timestamp: now });

  const localIdx = Math.max(0, newState.players.findIndex((p) => p.id === localPlayerId));
  const sideOf = (playerIdx: number): "friendly" | "enemy" =>
    playerIdx === localIdx ? "friendly" : "enemy";

  /** Retrouve une créature par instanceId, avant OU après l'action (une cible
   *  tuée n'existe plus dans newState), avec l'index de son propriétaire. */
  const findInstance = (id: string): { inst: CardInstance; ownerIdx: number } | null => {
    for (const st of [oldState, newState]) {
      for (let i = 0; i < 2; i++) {
        const inst = st.players[i].board.find((c) => c.instanceId === id);
        if (inst) return { inst, ownerIdx: i };
      }
    }
    return null;
  };

  /** Dégâts agrégés subis par une cible. `dmgEvents` porte déjà des sentinelles
   *  héros en repère LOCAL (detectDamageEvents), d'où la conversion en amont. */
  const damageOn = (localTargetId: string): number | undefined => {
    let total = 0;
    for (const ev of ctx.dmgEvents) {
      if (ev.targetId === localTargetId && ev.type === "damage") total += ev.amount ?? 0;
    }
    return total > 0 ? total : undefined;
  };

  /** Sentinelle héros ABSOLUE du moteur (`__hero_<idx>__`) → repère local. */
  const heroIdxOfSentinel = (id: string): number | null => {
    const m = /^__hero_(\d+)__$/.exec(id);
    return m ? Number(m[1]) : null;
  };

  /** Décrit une cible (créature ou héros) à partir d'un id en repère ABSOLU :
   *  instanceId de créature, ou index de joueur pour un héros. */
  const describeTarget = (
    creatureId: string | null,
    heroPlayerIdx: number | null,
  ): { targetCard?: Card; targetIsHero?: "friendly" | "enemy"; amount?: number } => {
    if (heroPlayerIdx != null) {
      const side = sideOf(heroPlayerIdx);
      return { targetIsHero: side, amount: damageOn(side === "friendly" ? "friendly_hero" : "enemy_hero") };
    }
    if (!creatureId) return {};
    const found = findInstance(creatureId);
    if (!found) return {};
    return { targetCard: found.inst.card, amount: damageOn(creatureId) };
  };

  // ── Sort lancé (et chaque relance de « Relancer ») ───────────────────────
  // Les cibles d'un sort sont déclarées par le LANCEUR : ses sentinelles héros
  // sont donc en POV lanceur, pas en POV local. On les repasse en absolu.
  const casterIdx = oldState.currentPlayerIndex;
  const oppOfCasterIdx = casterIdx === 0 ? 1 : 0;
  const spellTargetToAbsolute = (id: string): { creatureId: string | null; heroPlayerIdx: number | null } => {
    if (id === "friendly_hero") return { creatureId: null, heroPlayerIdx: casterIdx };
    if (id === "enemy_hero") return { creatureId: null, heroPlayerIdx: oppOfCasterIdx };
    const abs = heroIdxOfSentinel(id);
    if (abs != null) return { creatureId: null, heroPlayerIdx: abs };
    return { creatureId: id, heroPlayerIdx: null };
  };

  for (const spell of [ctx.spellEvent, ...ctx.recastSpells]) {
    if (!spell?.card) continue;
    const tgts = spell.targetIds ?? [];
    const first = tgts.length > 0 ? spellTargetToAbsolute(tgts[0]) : null;
    push({
      kind: "spell",
      side: sideOf(casterIdx),
      card: spell.card,
      countered: spell.countered,
      extraTargets: tgts.length > 1 ? tgts.length - 1 : undefined,
      ...(first ? describeTarget(first.creatureId, first.heroPlayerIdx) : {}),
    });
  }

  // ── Pouvoir de héros ─────────────────────────────────────────────────────
  if (ctx.heroPowerEvent) {
    push({
      kind: "hero_power",
      side: sideOf(casterIdx),
      hero: {
        heroId: ctx.heroPowerEvent.heroId,
        heroName: ctx.heroPowerEvent.heroName,
        race: ctx.heroPowerEvent.race,
        powerName: ctx.heroPowerEvent.powerName,
        powerDescription: ctx.heroPowerEvent.powerDescription,
        powerImageUrl: ctx.heroPowerEvent.powerImageUrl,
      },
    });
  }

  // ── Combat ───────────────────────────────────────────────────────────────
  if (action.type === "attack") {
    const attacker = findInstance(action.attackerInstanceId);
    if (attacker) {
      // `targetInstanceId` est en POV de l'ATTAQUANT : "enemy_hero" désigne le
      // héros du joueur opposé à l'attaquant, quel que soit l'écran qui regarde.
      const tgt = action.targetInstanceId;
      const heroPlayerIdx =
        tgt === "enemy_hero" ? (attacker.ownerIdx === 0 ? 1 : 0)
        : tgt === "friendly_hero" ? attacker.ownerIdx
        : heroIdxOfSentinel(tgt);
      push({
        kind: "attack",
        side: sideOf(attacker.ownerIdx),
        card: attacker.inst.card,
        ...describeTarget(heroPlayerIdx == null ? tgt : null, heroPlayerIdx),
      });
    }
  }

  // ── Pouvoirs déclenchés (mort / retour / attaque / fin de tour) ──────────
  // powerStrikes est la seule source portant source + cible + « pourquoi ».
  // Regroupées par créature source pour ne pas noyer la bande.
  const strikeGroups = new Map<string, { targets: string[]; mode: KeywordMode }>();
  for (const st of ctx.powerStrikes) {
    let g = strikeGroups.get(st.sourceId);
    if (!g) { g = { targets: [], mode: st.mode }; strikeGroups.set(st.sourceId, g); }
    if (st.targetId !== st.sourceId && !g.targets.includes(st.targetId)) g.targets.push(st.targetId);
  }
  for (const [sourceId, g] of strikeGroups) {
    const source = findInstance(sourceId);
    if (!source) continue; // source héros → déjà couvert par kind "hero_power"
    const firstTarget = g.targets[0];
    const heroPlayerIdx = firstTarget ? heroIdxOfSentinel(firstTarget) : null;
    push({
      kind: "power",
      side: sideOf(source.ownerIdx),
      card: source.inst.card,
      modeColor: keywordModeColor(g.mode) ?? undefined,
      extraTargets: g.targets.length > 1 ? g.targets.length - 1 : undefined,
      ...(firstTarget ? describeTarget(heroPlayerIdx == null ? firstTarget : null, heroPlayerIdx) : {}),
    });
  }

  // ── Départs du plateau : mort vs retour en main ──────────────────────────
  // « Absent du nouveau plateau » ne veut PAS dire « détruit » : Remontée
  // renvoie la MÊME instance en main (returnInstanceToPlay conserve l'objet),
  // et une métamorphose/exil la fait disparaître des deux zones. On classe
  // donc d'après la zone d'arrivée, sinon une unité renvoyée en main était
  // annoncée « détruite ».
  const zoneAfter = (instanceId: string): "graveyard" | "hand" | "gone" => {
    for (let i = 0; i < 2; i++) {
      if (newState.players[i].graveyard.some((c) => c.instanceId === instanceId)) return "graveyard";
    }
    for (let i = 0; i < 2; i++) {
      if (newState.players[i].hand.some((c) => c.instanceId === instanceId)) return "hand";
    }
    return "gone";
  };
  for (const dead of ctx.deadCreatures) {
    const zone = zoneAfter(dead.instanceId);
    if (zone === "gone") continue; // transformée / exilée : ni morte, ni renvoyée
    push({
      kind: zone === "hand" ? "bounce" : "death",
      side: sideOf(ctx.deathOwnerIdx.get(dead.instanceId) ?? 0),
      card: dead.card,
    });
  }

  return entries;
}

/** Couleur de surbrillance des cibles valides pendant le ciblage d'un POUVOIR
 *  ACTIVABLE (mode "tap"). Reprend la couleur d'icône du pouvoir activé
 *  (keywordModeColor du mode / trigger composé) pour que le bord des cibles
 *  matche l'icône : activable → jaune, retour en main → bleu, etc. Renvoie
 *  null hors ciblage de pouvoir — l'attaque et les sorts gardent alors leur
 *  bord rouge / violet habituel (repli côté composant). */
export function selectPowerTargetingColor(s: GameStore): string | null {
  if (s.targetingMode !== "tap" || !s.gameState || !s.pendingTapSourceId) return null;
  const gs = s.gameState;
  const src = gs.players[gs.currentPlayerIndex].board.find(c => c.instanceId === s.pendingTapSourceId);
  if (!src) return null;
  if (s.pendingTapInstanceIdx != null) {
    return keywordModeColor(src.card.keyword_instances?.[s.pendingTapInstanceIdx]?.mode) ?? null;
  }
  if (s.pendingTapComposedUid) {
    const cap = composedCapsOf(src.card.capabilities).find(c => c.uid === s.pendingTapComposedUid);
    return cap ? (keywordModeColor(composedTriggerMode(cap)) ?? null) : null;
  }
  return null;
}

export const useGameStore = create<GameStore>((set, get) => {
  // After on-board target collection finishes for a spell (e.g. Renforcement),
  // check if the same spell also carries a selection-style picker
  // (selection / selection_magique / renfort_royal). If yes, switch the UI
  // to the selection mode and carry the collected targetMap forward so the
  // eventual dispatch contains both halves. Returns true when a picker was
  // opened — caller should bail instead of dispatching.
  const openSelectionPickerIfNeeded = (
    gs: GameState,
    instanceId: string,
    carriedMap: Record<string, string>,
  ): boolean => {
    const player = gs.players[gs.currentPlayerIndex];
    const cardInst = carteJouable(player, instanceId);
    if (!cardInst || cardInst.card.card_type !== "spell" || !cardInst.card.spell_keywords) return false;
    const tryOpen = (kwId: string, getter: (x: number) => Card[]): boolean => {
      const found = cardInst.card.spell_keywords!.find(k => k.id === kwId);
      if (!found) return false;
      // Plafond de coût de l'offre = X + bonus d'amplification (Chant, tempo),
      // comme à la résolution.
      const x = (found.amount ?? 0)
        + chantBonusForSpell(gs, cardInst.card)
        + tempoBonusForCard(gs, cardInst.card);
      const choices = getter(x);
      if (choices.length === 0) return false;
      set({
        targetingMode: "selection",
        selectionCards: choices,
        validTargets: [],
        // selectedCardInstanceId stays as-is. collectedTargetMap holds the
        // carry forward so the selection-mode dispatch can merge it in.
        collectedTargetMap: carriedMap,
      });
      return true;
    };
    return (
      tryOpen("selection", (x) => getSelectionCards(gs, x, cardInst.card)) ||
      tryOpen("selection_magique", (x) => getMagicalSelectionCards(gs, x, cardInst.card)) ||
      tryOpen("renfort_royal", (x) => getRenfortRoyalCards(gs, x, cardInst.card))
    );
  };

  /** Pendant de `openSelectionPickerIfNeeded` pour le picker de DECK (Creuser X,
   *  qui réutilise la modale de Divination alimentée par le fond du deck).
   *
   *  Même raison d'être : sur un sort qui porte À LA FOIS une cible et un picker,
   *  la cible doit être collectée d'ABORD. Ouvert en premier, le picker de deck
   *  court-circuitait la collecte — « Corde tendue » (Impact 2 + Creuser 3) ne
   *  demandait jamais la cible de son Impact, qui partait donc sans cible et ne
   *  faisait rien, en silence.
   *
   *  `carriedMap` est reversé dans `collectedTargetMap` pour que la résolution du
   *  picker parte avec les cibles déjà choisies.
   *
   *  Rend true quand un picker a été ouvert — l'appelant ne doit alors PAS
   *  dispatcher. */
  const openDeckPickerIfNeeded = (
    gs: GameState,
    instanceId: string,
    carriedMap: Record<string, string>,
  ): boolean => {
    const player = gs.players[gs.currentPlayerIndex];
    const cardInst = carteJouable(player, instanceId);
    if (!cardInst || cardInst.card.card_type !== "spell") return false;
    // Les cibles déjà collectées voyagent avec la modale : un sort qui porte une
    // cible ET un mot-clé de deck se résout dans cet ordre, et sans ce report la
    // cible serait perdue (bug « Corde tendue »).
    return openNextDeckPicker(gs, cardInst.card, instanceId, player.deck, { carriedMap });
  };

  /** X de Creuser — même calcul qu'à la résolution (amplification comprise),
   *  sans quoi la modale montrerait un autre nombre de cartes que le moteur. */
  const creuserXFor = (gs: GameState, card: Card): number => {
    const base = card.card_type === "spell"
      ? ((card.spell_keywords ?? []).find(kw => kw.id === "creuser")?.amount ?? 1)
        + chantBonusForSpell(gs, card)
      // Lune et Soleil valent sur les DEUX faces. La carte n'est pas encore
      // jouée, donc le compteur n'est pas encore incrémenté : ce que ce picker
      // calcule est exactement ce que la résolution appliquera.
      : (parseXValuesFromEffectText(card.effect_text)["creuser"] ?? 1);
    return base + tempoBonusForCard(gs, card);
  };

  /** Ouvre la PROCHAINE modale de deck de la carte, dans l'ORDRE D'AUTEUR (le
   *  même que celui où le moteur résoudra), en sautant celles dont la réponse
   *  est déjà collectée. Renvoie false quand il n'en reste plus : l'appelant
   *  peut alors poursuivre son propre enchaînement, puis dispatcher.
   *
   *  Un seul point d'ouverture pour les trois mécaniques, là où trois blocs
   *  recopiés testaient Présage avant Divination dans un ordre écrit en dur :
   *  une carte portant les deux n'ouvrait donc jamais que la modale de Présage,
   *  et Divination consommait en silence la réponse de sa voisine.
   *
   *  `deck` est passé explicitement : entre deux maillons, le Repli a pu
   *  remettre des cartes sur le dessus, et ce sont celles-là qu'il faut montrer. */
  const openNextDeckPicker = (
    gs: GameState,
    card: Card,
    instanceId: string,
    deck: CardInstance[],
    extra: { boardPosition?: number | null; carriedMap?: Record<string, string> } = {},
  ): boolean => {
    const deja = get().collectedDeckChoices;
    for (const kw of onPlayDeckPickers(card)) {
      if (deja[kw] != null) continue;
      const picker = deckPickerState(kw, deck, kw === "creuser" ? creuserXFor(gs, card) : 0);
      // Rien à montrer (deck trop court) : on n'ouvre pas de modale vide, le
      // moteur retombera sur son repli déterministe.
      if (!picker) continue;
      set({
        selectedCardInstanceId: instanceId,
        selectedAttackerInstanceId: null,
        validTargets: [],
        targetingMode: "divination",
        ...picker,
        learnPickerFor: null,
        deckPickerKeyword: kw,
        ...(extra.carriedMap ? { collectedTargetMap: extra.carriedMap } : {}),
        ...(extra.boardPosition !== undefined ? { pendingBoardPosition: extra.boardPosition } : {}),
      });
      return true;
    }
    return false;
  };

  // Creature counterpart of openSelectionPickerIfNeeded. After the user
  // resolves a creature's target / graveyard / divination picker, this
  // checks whether the same creature ALSO carries a selection-style
  // picker keyword and, if so, opens the second picker carrying the
  // already-collected fields (target, graveyard target, divination index,
  // board position) via pendingCreatureChain. The chain payload is read
  // back in the selection-mode creature dispatch branch so the final
  // play_card action contains every half. Returns true when a picker was
  // opened — caller should bail instead of dispatching.
  const openCreaturePickerIfNeeded = (
    gs: GameState,
    instanceId: string,
    carried: {
      targetInstanceId?: string;
      graveyardTargetInstanceId?: string;
      divinationChoiceIndex?: number;
      boardPosition?: number | null;
    },
  ): boolean => {
    const player = gs.players[gs.currentPlayerIndex];
    const cardInst = carteJouable(player, instanceId);
    if (!cardInst || cardInst.card.card_type !== "creature") return false;
    const card = cardInst.card;
    let choices: Card[] | null = null;
    if (creatureNeedsSelection(card)) {
      const x = parseXValuesFromEffectText(card.effect_text)["selection"] ?? 0;
      choices = getSelectionCards(gs, x, card);
    } else if (creatureNeedsRenfortRoyal(card)) {
      const x = parseXValuesFromEffectText(card.effect_text)["renfort_royal"] ?? 0;
      choices = getRenfortRoyalCards(gs, x, card);
    } else if (creatureNeedsMagicalSelection(card)) {
      const x = parseXValuesFromEffectText(card.effect_text)["selection_magique"] ?? 0;
      choices = getMagicalSelectionCards(gs, x, card);
    }
    if (!choices || choices.length === 0) return false;
    set({
      targetingMode: "selection",
      selectionCards: choices,
      validTargets: [],
      pendingCreatureChain: carried,
    });
    return true;
  };

  return ({
  gameState: null,
  localPlayerId: null,
  selectedCardInstanceId: null,
  selectedAttackerInstanceId: null,
  validTargets: [],
  targetingMode: "none",
  pendingTriggerId: null,
  pendingTriggerPrompt: null,
  pendingCostCard: null,
  selectedDiscardIds: [],
  selectedSacrificeIds: [],
  selectedTopdeckIds: [],
  pendingHeroPowerSelection: false,
  pendingEpargneSelection: false,
  pendingBoardPosition: null,
  sfxPreAnnouncedInstanceId: null,
  markOnPlaySfxAnnounced: (instanceId) => set({ sfxPreAnnouncedInstanceId: instanceId }),
  pendingTriggerNeeded: 1,
  pendingTriggerPicked: [],
  divinationCards: [],
  deckPickerOrder: null,
  learnPickerFor: null,
  deckPickerKeyword: null,
  collectedDeckChoices: {},
  selectionCards: [],
  tactiqueAvailableKeywords: [],
  tactiqueMaxSelections: 0,
  pendingTargetInstanceId: null,
  pendingTapSourceId: null,
  pendingTapInstanceIdx: null,
  pendingTapComposedUid: null,
  spellTargetSlots: [],
  currentTargetSlotIndex: 0,
  collectedTargetMap: {},
  creatureComposedCollected: [],
  pendingHeroPowerComposed: null,
  pendingComposedGraveyard: null,
  pendingAttackDefenderId: null,
  attackPowerCollected: [],
  pendingCreatureChain: null,
  tokenTemplates: [],
  effectLog: [],
  actionHistory: [],
  damageEvents: [],
  deathEvents: [],
  summonEvents: [],
  entryEvents: [],
  spellCastEvent: null,
  fireBreathEvent: null,
  cycleEternelEvent: null,
  compagnonsEvent: null,
  exileCostEvent: null,
  topdeckCostEvent: null,
  eveilEvent: null,
  deckEffectEvent: null,
  tempeteEvent: null,
  powerArrowEvent: null,
  manaReductionEvent: null,
  epargneGainEvent: null,
  heroPowerCastEvent: null,
  graveyardAffectEvent: null,
  discardFromHandEvent: null,
  isAnimating: false,
  pendingIncomingActions: [],
  boardImageUrl: null,
  boardLayout: "classic",
  boardGraveyardImageUrl: null,
  myCardBackUrl: null,
  opponentCardBackUrl: null,
  boardMusicUrls: [],
  boardTenseMusicUrl: null,
  boardVictoryMusicUrl: null,
  boardDefeatMusicUrl: null,
  lastSfxEvents: [],

  initGame: (player1Id, player2Id, player1Cards, player2Cards, firstPlayerIndex, seed, player1Hero, player2Hero, factionCardPool, allSpellsPool, formatCode) => {
    const state = initializeGame(
      player1Id,
      player2Id,
      player1Cards,
      player2Cards,
      firstPlayerIndex,
      seed,
      player1Hero,
      player2Hero,
      factionCardPool,
      allSpellsPool,
      formatCode,
    );
    // Inject token templates into GameState for engine access
    state.tokenTemplates = get().tokenTemplates;
    set({ gameState: state });
  },

  setGameState: (state) => set({ gameState: state, ...pendingTriggerOverlay(state, get().localPlayerId) }),
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setTokenTemplates: (templates) => set({ tokenTemplates: templates }),
  setBoardImageUrl: (url) => set({ boardImageUrl: url }),
  setBoardLayout: (layout) => set({ boardLayout: layout }),
  setBoardGraveyardImageUrl: (url) => set({ boardGraveyardImageUrl: url }),
  setMyCardBackUrl: (url) => set({ myCardBackUrl: url }),
  setOpponentCardBackUrl: (url) => set({ opponentCardBackUrl: url }),
  setBoardMusicUrls: (urls: string[]) => set({ boardMusicUrls: urls }),
  setBoardTenseMusicUrl: (url: string | null) => set({ boardTenseMusicUrl: url }),
  setBoardVictoryMusicUrl: (url: string | null) => set({ boardVictoryMusicUrl: url }),
  setBoardDefeatMusicUrl: (url: string | null) => set({ boardDefeatMusicUrl: url }),
  setOwnedLimitedCardIds: (player1Ids, player2Ids) => {
    const { gameState } = get();
    if (!gameState) return;
    gameState.players[0].ownedLimitedCardIds = player1Ids;
    gameState.players[1].ownedLimitedCardIds = player2Ids;
    set({ gameState: { ...gameState, players: [...gameState.players] as [PlayerState, PlayerState] } });
  },

  dispatchAction: (action) => {
    const { gameState, localPlayerId, isAnimating } = get();
    if (!gameState || gameState.phase === "finished") return null;

    // Concede bypasses every guard — a forfeit must always work, even mid-
    // animation, even on the opponent's turn. We interrupt any running
    // animation pipeline and drop the queued remote actions so the
    // VICTORY/DEFEAT overlay surfaces immediately on both clients.
    if (action.type === "concede") {
      const next = applyAction(gameState, action);
      set({
        gameState: next,
        isAnimating: false,
        pendingIncomingActions: [],
        damageEvents: [],
        deathEvents: [],
        summonEvents: [],
        entryEvents: [],
        spellCastEvent: null,
        fireBreathEvent: null,
        cycleEternelEvent: null,
        heroPowerCastEvent: null,
        graveyardAffectEvent: null,
        discardFromHandEvent: null,
        tempeteEvent: null,
        powerArrowEvent: null,
        manaReductionEvent: null,
        epargneGainEvent: null,
      });
      return action;
    }

    // If the animation pipeline is still playing a previous action, drop this
    // one silently — the UI lock (myTurn && !isAnimating) normally prevents
    // local clicks from getting here, and the page.tsx broadcast handler
    // enqueues remote actions via pendingIncomingActions directly.
    if (isAnimating) {
      return null;
    }

    // Tant qu'un déclencheur interactif est en attente, seule sa résolution est
    // permise (le contrôleur doit choisir une cible avant toute autre action).
    if ((gameState.pendingTriggers?.length ?? 0) > 0
      && action.type !== "resolve_pending_trigger"
      && action.type !== "auto_resolve_pending_triggers") {
      // Refus SILENCIEUX jusqu'ici : c'est ce qui rendait le blocage
      // incompréhensible en partie (le plateau reste cliquable, END TURN aussi,
      // et rien ne se passe). Le moteur purge désormais les déclencheurs
      // insolubles, mais on trace le refus pour que le cas suivant soit lisible.
      console.warn(`[end-turn] action « ${action.type} » refusée : ${gameState.pendingTriggers!.length} choix en attente (${gameState.pendingTriggers!.map(t => t.id).join(", ")})`);
      return null;
    }

    // Merge any pending alternative-cost selections (discards / sacrifices /
    // replis) into the play_card action — single chokepoint so callers don't
    // each have to remember to forward the IDs.
    // APPRENTISSAGE — même point de passage unique : si la carte jouée est un
    // sort MÉMORISÉ, l'action doit dire de quelle créature il vient. L'estampiller
    // ici plutôt qu'à chaque appelant, c'est la garantie qu'aucun chemin (coûts,
    // ciblage simple, ciblage multiple, enchaînement de pickers) ne l'oublie —
    // et l'oublier ferait chercher le sort en main, où il n'est plus.
    if (action.type === "play_card" && !action.learnedFromInstanceId) {
      const source = apprenanteDuSort(
        gameState.players[gameState.currentPlayerIndex],
        action.cardInstanceId,
      );
      if (source) action = { ...action, learnedFromInstanceId: source.instanceId };
    }

    // ÉVEIL — même point de passage unique : une carte qui attend dans la zone
    // d'éveil n'est ni en main ni au cimetière, et l'action doit le dire. Sans
    // cet estampillage, le moteur la chercherait en main et refuserait l'action
    // en silence — après plusieurs tours d'attente, le pire des échecs muets.
    if (action.type === "play_card" && !action.fromEveil && !action.fromGraveyard) {
      const enEveil = entreeEnEveil(
        gameState.players[gameState.currentPlayerIndex],
        action.cardInstanceId,
      );
      if (enEveil) action = { ...action, fromEveil: true };
    }

    if (action.type === "play_card") {
      const { selectedDiscardIds, selectedSacrificeIds, selectedTopdeckIds } = get();
      if (selectedDiscardIds.length > 0 || selectedSacrificeIds.length > 0 || selectedTopdeckIds.length > 0) {
        action = {
          ...action,
          discardInstanceIds: action.discardInstanceIds ?? selectedDiscardIds,
          sacrificeInstanceIds: action.sacrificeInstanceIds ?? selectedSacrificeIds,
          // L'ORDRE de selectedTopdeckIds est celui des clics du joueur, et il
          // décide de la carte qui finit sur le dessus : on le transmet tel
          // quel, l'adversaire rejouera la même pile.
          topdeckInstanceIds: action.topdeckInstanceIds ?? selectedTopdeckIds,
        };
      }
    }

    // Detect spell cast before applying action
    let spellEvent: SpellCastEvent | null = null;
    if (action.type === "play_card") {
      const player = gameState.players[gameState.currentPlayerIndex];
      const cardInst = carteJouable(player, action.cardInstanceId);
      if (cardInst && cardInst.card.card_type === "spell") {
        // Collect every target this cast references so the overlay can draw
        // arrows from the spell card to each target on the board.
        const tgts: string[] = [];
        if (action.targetInstanceId) tgts.push(action.targetInstanceId);
        if (action.graveyardTargetInstanceId) tgts.push(action.graveyardTargetInstanceId);
        if (action.targetMap) {
          for (const v of Object.values(action.targetMap)) {
            if (v && !tgts.includes(v)) tgts.push(v);
          }
        }
        spellEvent = {
          spellName: cardInst.card.name,
          effectText: cardInst.card.effect_text,
          timestamp: Date.now(),
          card: cardInst.card,
          targetIds: tgts,
        };
      }
    }

    // Detect hero power cast before applying action
    let heroPowerEvent: HeroPowerCastEvent | null = null;
    if (action.type === "hero_power") {
      const player = gameState.players[gameState.currentPlayerIndex];
      const heroDef = player.hero.heroDefinition;
      if (heroDef) {
        heroPowerEvent = {
          heroId: heroDef.id,
          heroName: heroDef.name,
          race: heroDef.race,
          powerName: heroDef.powerName,
          powerDescription: heroDef.powerDescription,
          powerImageUrl: heroDef.powerImageUrl ?? null,
          timestamp: Date.now(),
        };
      }
    }

    // Detect fire breath before applying action
    let fireEvent: FireBreathEvent | null = null;
    if (action.type === "attack" && action.attackerInstanceId) {
      const player = gameState.players[gameState.currentPlayerIndex];
      const attacker = player.board.find((c) => c.instanceId === action.attackerInstanceId);
      if (attacker && attacker.card.keywords.includes("souffle_de_feu" as import("@/lib/game/types").Keyword)) {
        fireEvent = {
          attackerInstanceId: action.attackerInstanceId,
          timestamp: Date.now(),
        };
      }
    }

    // playerIdx = joueur actif (caster) ; réutilisé plus bas (POV, oppIdx…).
    const playerIdx = gameState.currentPlayerIndex;
    // Fin de tour : le moteur a DÉJÀ basculé le tour dans newState (voir plus bas
    // le maintien de l'identité du tour sortant + l'ordre plateau des effets).
    const isEndTurn = action.type === "end_turn";

    const newState = applyAction(gameState, action);
    // Two-wave attack: pop the post-power / pre-combat snapshot the engine
    // attached when an "à l'attaque" composed power fired. Wave 1 = power
    // (gameState→intermediate), wave 2 = combat (intermediate→newState). The
    // combat builders below diff from `combatOld` so the power's damage isn't
    // re-shown in the combat wave.
    const onAttackWave = newState.onAttackWave ?? null;
    if (newState.onAttackWave) newState.onAttackWave = undefined;
    const combatOld = onAttackWave ? onAttackWave.intermediate : gameState;

    // FRONTIÈRE DE PIOCHE — l'axe du temps INTERNE de l'action (cf.
    // GameState.animationCheckpoints). Le moteur a noté l'état au moment précis
    // où la carte piochée a rejoint la main, avant que son effet ne frappe.
    //
    // Sans elle, tout ce que l'action a produit était peint d'un bloc : la
    // révélation de la carte passait devant des dégâts ANTÉRIEURS à la pioche
    // (Diablotin Ricanant / Lances du Zénith), et la carte n'arrivait en main
    // qu'après avoir tué sa victime.
    //
    // Avec elle, la séquence se coupe en deux : tout ce qui précède la pioche est
    // diffé jusqu'à `visualEnd`, la pioche s'anime, la carte se révèle, puis une
    // dernière vague peint ce que son effet a fait.
    // Le moteur pose ses frontières dans l'ordre chronologique de l'action ; on
    // garde cet ordre, c'est lui qui définit les intervalles.
    const frontieres = newState.animationCheckpoints ?? [];
    if (newState.animationCheckpoints) newState.animationCheckpoints = undefined;
    const drawWave = frontieres.find(c => c.label === "pioche") ?? null;
    // Les frontières « mort » et « effet » se répètent ; seule « pioche » est
    // unique. On sépare donc par POSITION, pas par étiquette : tout ce qui
    // précède la pioche s'enchaîne à la suite de l'animation de mort, tout ce
    // qui la suit se joue après que la carte est arrivée en main.
    const idxPioche = drawWave ? frontieres.indexOf(drawWave) : -1;
    const frontieresAvantPioche = idxPioche === -1 ? frontieres : frontieres.slice(0, idxPioche);
    const frontieresDepuisPioche = idxPioche === -1 ? [] : frontieres.slice(idxPioche);
    // Fin de la partie VISIBLE d'abord : la PREMIÈRE frontière. L'état
    // RÉELLEMENT engagé reste `newState` — seul le diff d'animation s'arrête là.
    const visualEnd = frontieres.length > 0 ? frontieres[0].state : newState;
    /** État à la fin de l'intervalle ouvert par `f` : la frontière suivante,
     *  ou l'état final s'il n'y en a plus. */
    const finDeLIntervalle = (f: typeof frontieres[number]): GameState => {
      const i = frontieres.indexOf(f);
      return frontieres[i + 1]?.state ?? newState;
    };
    /** Rang du registre séquentiel à la fin de ce même intervalle. */
    const seqFinDeLIntervalle = (f: typeof frontieres[number]): number | undefined => {
      const i = frontieres.indexOf(f);
      return frontieres[i + 1]?.sequentialHitsBefore;
    };

    const dmgEvents = detectDamageEvents(combatOld, visualEnd, localPlayerId);
    // Cosmetic: stamp the attacker centre onto combat-damage events so the FX
    // layer can shoot debris / kick the shake along the strike vector. Same
    // DOM-derived coords on both clients → no effect on game state or sync.
    // `getElementCenter` returns a -9999 sentinel if the node is gone; the FX
    // layer treats that as "no direction" and falls back to a radial burst.
    if (action.type === "attack" && action.attackerInstanceId) {
      const src = getElementCenter(action.attackerInstanceId);
      for (const ev of dmgEvents) {
        if (ev.type === "damage") {
          ev.srcX = src.x;
          ev.srcY = src.y;
        }
      }
    }
    const logEntries = generateEffectLog(gameState, newState, action);

    // Pop Fureur strikes off the state so they only animate once. Each
    // entry becomes a delayed attack-lunge plus a delayed damage popup on
    // the random victim, sequenced after the main combat. The chain can
    // be multi-step (one entry per strike) when the Fureur creature
    // survives its first retaliation — the lunges fire one after another
    // and each victim's damage popup is offset accordingly.
    const rawFureurStrikes = newState.fureurStrikes ?? [];
    if (newState.fureurStrikes) newState.fureurStrikes = undefined;
    // Translate hero sentinels (`__hero_<idx>__`) into local-POV labels so
    // playAttackLunge + damage events resolve to the right DOM nodes.
    const fureurStrikes = rawFureurStrikes.map((s) => {
      const m = /^__hero_(\d)__$/.exec(s.victimInstanceId);
      if (!m) return s;
      const idx = parseInt(m[1]);
      const isLocal = newState.players[idx]?.id === localPlayerId;
      return { ...s, victimInstanceId: isLocal ? "friendly_hero" : "enemy_hero" };
    });
    // Cadence de la chaîne Fureur. Règle à tenir : l'écart entre deux assauts
    // doit dépasser la DURÉE VISIBLE d'un assaut (lunge ~650ms + son popup de
    // dégâts, qui tombe ~1,1s après le départ du lunge). En dessous, le lunge
    // suivant part alors que le popup précédent flotte encore et la chaîne se
    // lit comme une bouillie — c'est le même piège que l'écart entre relances
    // de sort, plus court que la fenêtre d'affichage (cf. OVERLAY.spell).
    //
    // L'écart entre FIRST_DELAY et DAMAGE_DELAY (400ms) est LOAD-BEARING : il
    // fixe le moment du popup dans le lunge. Le déplacer désynchronise le
    // chiffre de dégâts de l'impact ; pour ralentir, on bouge les trois
    // ensemble en gardant cet écart.
    const FUREUR_LUNGE_GAP_MS = 1600;       // écart entre deux assauts Fureur successifs
    const FUREUR_FIRST_DELAY_MS = 1200;     // écart entre l'assaut principal et le 1er assaut Fureur
    const FUREUR_DAMAGE_DELAY_MS = 1600;    // décalage de base des popups de dégâts (= FIRST + 400)
    const FUREUR_PHASE_EXTRA_MS = fureurStrikes.length > 0
      ? FUREUR_DAMAGE_DELAY_MS + (fureurStrikes.length - 1) * FUREUR_LUNGE_GAP_MS + 500
      : 0;

    // Points séquentiels (scatter / Tempête) : un popup + un burst VFX par point,
    // dans l'ordre réel, au lieu d'un total agrégé par cible (même patron que
    // fureurStrikes). On vide la liste transitoire après extraction. Désactivé
    // sur le chemin "à l'attaque" (onAttackWave) où ces dégâts vivent dans la
    // vague 1 — on retombe alors sur l'agrégat existant.
    const rawSeqHitsAll = (!onAttackWave && newState.sequentialHits) ? newState.sequentialHits : [];
    if (newState.sequentialHits) newState.sequentialHits = undefined;
    // Coupe à la frontière de pioche : les points émis APRÈS elle appartiennent
    // à la vague finale. Ils ne se déduisent pas d'un diff d'état (registre plat
    // alimenté coup par coup), d'où le rang porté par la frontière.
    const rawSeqHits = frontieres.length > 0
      ? rawSeqHitsAll.slice(0, frontieres[0].sequentialHitsBefore)
      : rawSeqHitsAll;
    /** Tranche du registre séquentiel appartenant à l'intervalle de `f`. */
    const seqHitsDeLIntervalle = (f: typeof frontieres[number]) =>
      rawSeqHitsAll.slice(f.sequentialHitsBefore, seqFinDeLIntervalle(f));
    // Retraduit le sentinel héros `__hero_<idx>__` en repère local (cf. fureur).
    const seqHits = rawSeqHits.map((h) => {
      const m = /^__hero_(\d)__$/.exec(h.targetInstanceId);
      if (!m) return h;
      const isLocal = newState.players[+m[1]]?.id === localPlayerId;
      return { ...h, targetInstanceId: isLocal ? "friendly_hero" : "enemy_hero" };
    });
    const seqTargets = new Set(seqHits.map((h) => h.targetInstanceId));
    const { delais: seqDelais, dernier: seqDernier } = echelonnerPoints(seqHits);
    /** Teinte d'un boost séquentiel : la couleur du déclencheur, comme pour le
     *  popup agrégé qu'il remplace (sinon un boost de fin de tour perdrait son
     *  vert en passant par ce canal). */
    const couleurBoost = (instanceId: string): string | undefined => {
      for (const p of newState.players) {
        const inst = p.board.find((c) => c.instanceId === instanceId)
          ?? p.hand.find((c) => c.instanceId === instanceId);
        if (inst) return keywordModeColor(inst.lastBuffMode) ?? undefined;
      }
      return undefined;
    };
    const seqEvents: DamageEvent[] = seqHits.map((h, i) => {
      const couleur = h.type === "buff" ? couleurBoost(h.targetInstanceId) : undefined;
      return {
        targetId: h.targetInstanceId,
        amount: 1,
        type: h.type,
        ...(h.label ? { label: h.label } : {}),
        ...(couleur ? { color: couleur } : {}),
        ...getElementCenter(h.targetInstanceId),
        delayMs: seqDelais[i],
      };
    });
    const SEQ_PHASE_EXTRA_MS = seqEvents.length > 0 ? seqDernier + 500 : 0;

    // Sorts relancés (capacité Relancer) : le moteur a enregistré chaque relance
    // dans newState.recastEvents {card, targetIds}, dans l'ordre de relance. On
    // les anime comme un sort joué depuis la main (overlay + flèches vers les
    // cibles choisies aléatoirement + VFX de ciblage). Sentinelles héros
    // absolues `__hero_<idx>__` → POV local (cf. fureurStrikes / sequentialHits).
    // On vide la liste transitoire après extraction (exclue du hash).
    const rawRecasts = newState.recastEvents ?? [];
    if (newState.recastEvents) newState.recastEvents = undefined;
    const recastSpells: SpellCastEvent[] = rawRecasts.map((rc, i) => ({
      spellName: `♻️ ${rc.card.name}`,
      effectText: rc.card.effect_text,
      // `timestamp` sert de CLÉ de montage à l'overlay (AnimatePresence). Tous
      // ces évènements naissaient dans le même tick de dispatch, donc avec le
      // même Date.now() — et une clé inchangée = pas de remontage : le 2ᵉ sort
      // relancé remplaçait le contenu de la carte SANS rejouer la moindre
      // animation (ni pop, ni flèches, ni FX). Le décalage par index rend
      // chaque révélation distincte. Purement visuel, hors hash de synchro.
      timestamp: Date.now() + 1 + i,
      card: rc.card,
      targetIds: rc.targetIds.map((id) => {
        const m = /^__hero_(\d)__$/.exec(id);
        if (!m) return id;
        const isLocal = newState.players[+m[1]]?.id === localPlayerId;
        return isLocal ? "friendly_hero" : "enemy_hero";
      }),
    }));

    // Effets « à la pioche » : le moteur a noté chaque carte dont le
    // déclencheur a résolu. Elle n'est PAS jouée — elle rejoint la main — donc
    // rien à l'écran n'expliquait ses dégâts ou ses invocations, et l'adversaire
    // ne voit même pas la carte arriver. On la révèle avec l'overlay de sort,
    // juste avant les impacts, exactement comme un sort relancé. La liste
    // transitoire est vidée après extraction (exclue du hash).
    const rawDrawTriggers = newState.drawTriggerEvents ?? [];
    if (newState.drawTriggerEvents) newState.drawTriggerEvents = undefined;
    const drawTriggerSpells: SpellCastEvent[] = rawDrawTriggers.map((dt, i) => ({
      spellName: dt.card.name,
      effectText: dt.card.effect_text,
      // Clé de montage distincte de celles des relances (même piège qu'elles :
      // deux overlays nés dans le même tick partageraient une clé et le second
      // ne serait jamais remonté). On prolonge donc leur numérotation.
      timestamp: Date.now() + 1 + recastSpells.length + i,
      card: dt.card,
      drawTrigger: dt.ownerId === localPlayerId ? "self" : "opponent",
    }));

    // Detect if a spell was countered (contresort)
    if (spellEvent && action.type === "play_card") {
      const opponentIdx = gameState.currentPlayerIndex === 0 ? 1 : 0;
      const oldOpponent = gameState.players[opponentIdx];
      const hadCounter = oldOpponent.board.some(c => c.contresortActive);
      const newOpponent = newState.players[opponentIdx];
      const stillHasCounter = newOpponent.board.some(c => c.contresortActive);
      if (hadCounter && !stillHasCounter) {
        spellEvent = { ...spellEvent, countered: true, effectText: "Contré !" };
      }
    }

    // Registre moteur des dégâts appliqués (hors hash), cumulé par cible et
    // vidé après extraction comme sequentialHits. Sert UNIQUEMENT aux popups
    // des créatures mortes (cf. lethalDamageEvents) ; les survivantes restent
    // couvertes par le diff de PV.
    const damageLedger = new Map<string, number>();
    for (const entry of newState.damageLedger ?? []) {
      damageLedger.set(entry.targetInstanceId, (damageLedger.get(entry.targetInstanceId) ?? 0) + entry.amount);
    }
    if (newState.damageLedger) newState.damageLedger = undefined;

    // Find creatures that died (were on old board but not on new board).
    // Track owner index so cycle_eternel can fly the copy back to the right
    // deck (data-cycle-deck="my" vs "opponent").
    //
    // « Absente du plateau » ne veut PAS dire « morte » : une Remontée renvoie
    // l'instance en MAIN, une métamorphose la fait disparaître. Sans ce test de
    // zone d'arrivée, une créature renvoyée en main jouait son animation de mort
    // — et si elle portait Cycle éternel, le fantôme partait vers le deck alors
    // que le moteur, lui, n'avait rien recyclé du tout.
    const deadCreatures: CardInstance[] = [];
    const deathOwnerIdx = new Map<string, number>();
    for (let i = 0; i < 2; i++) {
      // combatOld = post-power board on a two-wave attack, so combat deaths
      // exclude power-killed creatures (those animate in wave 1).
      const oldBoard = combatOld.players[i].board;
      // `visualEnd` et non `newState` : une créature tuée par l'effet « à la
      // pioche » meurt APRÈS la frontière et appartient à la vague finale.
      const newBoard = visualEnd.players[i].board;
      for (const oldC of oldBoard) {
        if (newBoard.find((c) => c.instanceId === oldC.instanceId)) continue;
        // Cycle éternel / Résurrection sortent la dépouille du cimetière dans
        // la foulée : elles restent des MORTS. On ne disqualifie que ce qui a
        // rejoint une main (renvoi) ou disparu sans laisser de corps.
        // Cycle éternel / Résurrection ressortent la dépouille du cimetière dans
        // la foulée : ce sont bien des MORTS. Seul un retour en MAIN disqualifie.
        const returnedToHand = visualEnd.players.some((p) => p.hand.some((c) => c.instanceId === oldC.instanceId));
        if (returnedToHand) continue;
        // CHANGEMENT DE CONTRÔLEUR (Corruption, Domination) : la boucle ne
        // compare qu'au plateau de MÊME index, donc une créature volée
        // « disparaissait » de son plateau d'origine et passait pour morte. Elle
        // jouait son animation de mort, et si elle portait Cycle éternel, le
        // fantôme filait vers le deck alors que le moteur n'avait rien recyclé.
        // Même erreur que le renvoi en main juste au-dessus, sur l'autre zone
        // d'arrivée : la même instance est simplement passée sur l'AUTRE plateau.
        const aChangeDeCamp = visualEnd.players.some((p) => p.board.some((c) => c.instanceId === oldC.instanceId));
        if (aChangeDeCamp) continue;
        deadCreatures.push(oldC);
        deathOwnerIdx.set(oldC.instanceId, i);
      }
    }

    // Death FX positions — captured NOW, while the dying creatures are still
    // mounted in the DOM (this runs synchronously at dispatch, before the death
    // phase removes them). Viewport coords → identical on both clients. Power-
    // wave deaths animate separately and aren't included here.
    const deathFxEvents: DeathFxEvent[] = deadCreatures.map((dead) => {
      const pos = getElementCenter(dead.instanceId);
      return { instanceId: dead.instanceId, x: pos.x, y: pos.y, poisoned: !!dead.isPoisoned };
    });

    // Chiffres de dégâts des mortes de cette vague — même capture DOM que les
    // deathFxEvents (les dépouilles sont encore montées à cet instant). Ils
    // rejoignent dmgEvents pour être décalés et peints à la phase d'impact,
    // donc AVANT que la phase de mort ne les retire du plateau.
    dmgEvents.push(...lethalDamageEvents(deadCreatures, visualEnd, damageLedger));

    // Cycle éternel — one entry per dead creature carrying the keyword. The
    // engine has already inserted a copy at a random position in the owner's
    // deck; the overlay just visualises the return trip.
    const localIdx = newState.players.findIndex((p) => p.id === localPlayerId);
    const cycleEntries: CycleEternelEntry[] = [];
    for (const dead of deadCreatures) {
      if (dead.card.keywords.includes("cycle_eternel" as import("@/lib/game/types").Keyword)) {
        const ownerIdx = deathOwnerIdx.get(dead.instanceId) ?? 0;
        cycleEntries.push({ card: dead.card, ownerIsLocal: ownerIdx === localIdx });
      }
    }
    const cycleEvent: CycleEternelEvent | null = cycleEntries.length > 0
      ? { entries: cycleEntries, timestamp: Date.now() }
      : null;

    // COMPAGNONS : mêmes entrées que Cycle éternel (carte + camp), donc même
    // overlay, dans un autre habillage. Le moteur ne note que les cartes
    // RÉELLEMENT mélangées : une carte liée introuvable dans les pools est
    // sautée et n'anime rien.
    const rawCompagnons = newState.compagnonsEvents ?? [];
    if (newState.compagnonsEvents) newState.compagnonsEvents = undefined;
    const compagnonsEntries: CycleEternelEntry[] = rawCompagnons.flatMap((e) =>
      e.cards.map((card) => ({ card, ownerIsLocal: e.ownerId === localPlayerId })));
    const compagnonsEvent: CycleEternelEvent | null = compagnonsEntries.length > 0
      ? { entries: compagnonsEntries, timestamp: Date.now() }
      : null;

    // Coût d'EXIL payé pendant l'action. Le moteur a noté combien de cartes ont
    // quitté quel deck ; on y ajoute le POINT DE VUE local (quelle pile viser)
    // et le dos de carte correspondant. On vide la liste transitoire après
    // extraction (exclue du hash).
    const rawExile = newState.exileCostEvents ?? [];
    if (newState.exileCostEvents) newState.exileCostEvents = undefined;
    const exileTotal = rawExile.reduce((n, e) => n + e.count, 0);
    const exileIsLocal = rawExile[0]?.ownerId === localPlayerId;
    const exileCostEvent: ExileCostEvent | null = exileTotal > 0
      ? {
        count: exileTotal,
        isLocal: exileIsLocal,
        cardBackUrl: exileIsLocal ? get().myCardBackUrl : get().opponentCardBackUrl,
        // Le son suit la CARTE JOUÉE, celle dont le coût est payé — pas les
        // cartes exilées, qui sont anonymes et jamais révélées.
        sfxUrl: action.type === "play_card"
          ? gameState.players[gameState.currentPlayerIndex].hand
            .find((c) => c.instanceId === action.cardInstanceId)?.card.sfx_exile_url ?? null
          : null,
        timestamp: Date.now(),
      }
      : null;

    // Coût de REPLI payé pendant l'action. Comme pour l'exil, le moteur n'a noté
    // qu'un NOMBRE et un propriétaire : la carte repliée n'est jamais transmise,
    // donc jamais révélée. On y ajoute le point de vue local (quelle pile viser)
    // et le dos de carte correspondant. Liste transitoire vidée après extraction
    // (exclue du hash).
    const rawTopdeck = newState.topdeckCostEvents ?? [];
    if (newState.topdeckCostEvents) newState.topdeckCostEvents = undefined;
    const topdeckTotal = rawTopdeck.reduce((n, e) => n + e.count, 0);
    const topdeckIsLocal = rawTopdeck[0]?.ownerId === localPlayerId;
    const topdeckCostEvent: TopdeckCostEvent | null = topdeckTotal > 0
      ? {
        count: topdeckTotal,
        isLocal: topdeckIsLocal,
        cardBackUrl: topdeckIsLocal ? get().myCardBackUrl : get().opponentCardBackUrl,
        timestamp: Date.now(),
      }
      : null;

    // ÉVEIL — mouvements de la zone d'éveil pendant l'action. On ne garde que le
    // DERNIER : une action n'en produit jamais plus d'un (mise en éveil, point
    // versé, ou arrivée), et le tableau n'existe que parce que le moteur pousse
    // dans un sink comme partout ailleurs. Liste transitoire vidée après
    // extraction (exclue du hash).
    const rawEveil = newState.eveilEvents ?? [];
    if (newState.eveilEvents) newState.eveilEvents = undefined;
    const dernierEveil = rawEveil[rawEveil.length - 1];
    const eveilEvent: EveilEvent | null = dernierEveil
      ? {
        kind: dernierEveil.kind,
        card: dernierEveil.card,
        remaining: dernierEveil.remaining,
        isLocal: dernierEveil.ownerId === localPlayerId,
        timestamp: Date.now(),
      }
      : null;

    // Effets « deck » silencieux (Préincanter / Fortifier). Le moteur n'en note
    // un que s'il a RÉELLEMENT modifié une carte : un no-op n'anime rien, sinon
    // le badge annoncerait un effet qui n'a pas eu lieu.
    //
    // Plusieurs dans la même action (deux Préincanter) : on n'en montre qu'UN, en
    // cumulant les amplitudes par capacité — deux badges superposés sur la même
    // pile seraient illisibles. Le premier gagne quand les capacités diffèrent :
    // les enchaîner ferait attendre le joueur pour une information secondaire.
    const rawDeckFx = newState.deckEffectEvents ?? [];
    if (newState.deckEffectEvents) newState.deckEffectEvents = undefined;
    const premierFx = rawDeckFx[0];
    const deckEffectEvent: DeckEffectEvent | null = premierFx
      ? {
        abilityId: premierFx.abilityId,
        x: rawDeckFx.filter((e) => e.abilityId === premierFx.abilityId).reduce((n, e) => n + e.x, 0),
        y: rawDeckFx.filter((e) => e.abilityId === premierFx.abilityId).reduce((n, e) => n + e.y, 0),
        isLocal: premierFx.ownerId === localPlayerId,
        timestamp: Date.now(),
      }
      : null;

    // Sons d'entrée en jeu déjà joués à l'APERÇU (créature posée, picker ouvert) :
    // on ne les rejoue pas ici, sinon on les entendrait une seconde fois après
    // la fermeture de la fenêtre — soit très loin de ce qu'ils accompagnent.
    const suppressOnPlaySfx =
      action.type === "play_card" && get().sfxPreAnnouncedInstanceId === action.cardInstanceId;
    if (get().sfxPreAnnouncedInstanceId) set({ sfxPreAnnouncedInstanceId: null });

    // Build SFX events
    const sfxEvents: { type: string; cardSfxUrl?: string; delayMs?: number }[] = [];

    if (action.type === "play_card") {
      const player = gameState.players[gameState.currentPlayerIndex];
      const cardInst = carteJouable(player, action.cardInstanceId);
      if (cardInst) {
        if (cardInst.card.card_type === "spell") {
          sfxEvents.push({ type: "spell_cast" });
        } else if (!suppressOnPlaySfx) {
          sfxEvents.push({ type: "play_card", cardSfxUrl: cardInst.card.sfx_play_url ?? undefined });
        }
      }
    } else if (action.type === "attack") {
      sfxEvents.push({ type: "attack" });
    } else if (action.type === "end_turn") {
      sfxEvents.push({ type: "end_turn" });
    } else if (action.type === "hero_power") {
      // Son propre au héros s'il en a un, son global sinon — même priorité que
      // le son de carte à la pose (`cardSfxUrl || standardSfxUrls[type]`).
      const heroDef = gameState.players[gameState.currentPlayerIndex].hero.heroDefinition;
      sfxEvents.push({ type: "hero_power", cardSfxUrl: heroDef?.powerSfxUrl ?? undefined });
    }

    // SFX from damage events (deduplicate by type)
    //
    // Exception : quand des BOOSTS séquentiels sont en jeu (Esprit de corps), le
    // son unique de l'agrégat céderait sa place — on veut un son PAR compteur,
    // décalé comme les popups. On le neutralise ici et on les pousse juste après.
    const seqBuffs = seqHits.filter((h) => h.type === "buff");
    const dmgSfxSeen = new Set<string>();
    if (seqBuffs.length > 0) dmgSfxSeen.add("buff");
    for (const de of dmgEvents) {
      const sfxType = de.type === "shield" ? "divine_shield" : de.type;
      if (["damage", "heal", "buff", "debuff", "divine_shield", "poison", "dodge", "paralyze", "resurrect"].includes(sfxType) && !dmgSfxSeen.has(sfxType)) {
        dmgSfxSeen.add(sfxType);
        sfxEvents.push({ type: sfxType });
      }
    }
    // Un son de boost par compteur, à la même cadence que les popups : c'est ce
    // qui fait entendre la troupe se renforcer cran par cran plutôt qu'un seul
    // « pling » pour trois points.
    // On relit les délais des ÉVÉNEMENTS eux-mêmes plutôt que de les recalculer :
    // un son qui dériverait du popup qu'il accompagne s'entendrait aussitôt.
    for (const ev of seqEvents) {
      if (ev.type === "buff") sfxEvents.push({ type: "buff", delayMs: ev.delayMs });
    }

    // SFX from dead creatures
    for (const dead of deadCreatures) {
      sfxEvents.push({ type: "creature_death", cardSfxUrl: dead.card.sfx_death_url ?? undefined });
    }

    // SFX from summoned creatures — any creature that appeared on a board and
    // wasn't the card directly played. Covers Convocation X, Convocations
    // multiples, Résurrection, spell-summons, etc. Deduped: one SFX per action.
    const playedInstanceId =
      action.type === "play_card" ? action.cardInstanceId : null;
    let summonedTotal = 0;
    for (let i = 0; i < 2; i++) {
      const oldBoard = gameState.players[i].board;
      const newBoard = newState.players[i].board;
      for (const nc of newBoard) {
        if (nc.instanceId === playedInstanceId) continue;
        if (!oldBoard.find((c) => c.instanceId === nc.instanceId)) {
          summonedTotal++;
        }
      }
    }
    if (summonedTotal > 0) {
      sfxEvents.push({ type: "summon" });
    }

    // SFX from spell countered
    if (spellEvent?.countered) {
      sfxEvents.push({ type: "counter_spell" });
    }

    // SFX from fire breath
    if (fireEvent) {
      sfxEvents.push({ type: "fire_breath" });
    }

    // Tempête X — detect when the played card carries the keyword either
    // creature-side (card.keywords includes "tempete") or spell-side
    // (spell_keywords contains an entry with id "tempete"). Targets are
    // the enemy creatures that took at least one drop, recovered from
    // dmgEvents (the engine deals the damage one HP at a time, so an
    // enemy hit twice still yields a single targetId entry).
    let tempeteEvent: TempeteEvent | null = null;
    {
      // Did THIS action resolve a Tempête effect? Three sources:
      //  - play_card: creature-side keyword OR spell_keywords entry (on-play)
      //  - tap_activate: the activated keyword instance is a "tap"-mode Tempête
      // (Death-mode Tempête resolves during play/combat and shares the
      // standard damage feedback, like the other curated death keywords.)
      let carriesTempete = false;
      if (action.type === "play_card") {
        const player = gameState.players[gameState.currentPlayerIndex];
        const playedCard = carteJouable(player, action.cardInstanceId);
        carriesTempete = playedCard
          ? playedCard.card.keywords.includes("tempete" as import("@/lib/game/types").Keyword) ||
            (playedCard.card.spell_keywords ?? []).some((k) => k.id === "tempete")
          : false;
      } else if (action.type === "tap_activate") {
        const player = gameState.players[gameState.currentPlayerIndex];
        const source = player.board.find((c) => c.instanceId === action.sourceInstanceId);
        const inst = source?.card.keyword_instances?.[action.instanceIdx];
        carriesTempete = inst?.id === "tempete" && inst?.mode === "tap";
      }
      if (carriesTempete) {
        const opponentBoardIds = new Set(
          gameState.players[gameState.currentPlayerIndex === 0 ? 1 : 0].board.map((c) => c.instanceId),
        );
        // Expand each damage event into N per-HP entries so the overlay
        // shows ONE bolt per drop (rather than one bolt per unique
        // target). A creature that took 3 damage gets 3 separate bolts
        // hitting it. The actual random order chosen by the engine is
        // not recorded, so the bolts on the same target appear in a row
        // — sufficient for the "successively" feel without threading
        // additional state through the engine.
        const targetIds: string[] = [];
        for (const ev of dmgEvents) {
          if (ev.type !== "damage") continue;
          if (!opponentBoardIds.has(ev.targetId)) continue;
          const drops = Math.max(1, ev.amount ?? 1);
          for (let i = 0; i < drops; i++) targetIds.push(ev.targetId);
        }
        if (targetIds.length > 0) {
          tempeteEvent = { targetIds, timestamp: Date.now() };
        }
      }
    }

    // Flèche source→cible pour un pouvoir qui inflige des dégâts : trace un
    // trait depuis la SOURCE (la créature qui active un pouvoir tap, ou le
    // héros du lanceur pour un pouvoir de héros) vers chaque cible ENNEMIE
    // touchée — créatures adverses ET héros adverse — pour que les DEUX
    // joueurs voient d'où viennent les dégâts (ex. Veilleur des Lisières).
    // Les sentinelles héros sont relatives au joueur local (comme dmgEvents /
    // data-target-id), donc l'ancrage reste correct sur les deux écrans.
    let powerArrowEvent: PowerArrowEvent | null = null;
    const powerArrows: PowerArrowGroup[] = [];
    // Fin de tour : cible touchée → index plateau de sa créature source
    // (rempli depuis powerStrikes) pour ordonner les popups gauche→droite.
    const endTurnSourceIdxByTarget = new Map<string, number>();
    // Sentinelle héros moteur `__hero_<idx>__` → repère LOCAL ("friendly_hero"/
    // "enemy_hero") ; un instanceId de créature passe tel quel.
    const heroSentinelToLocal = (id: string): string => {
      const m = /^__hero_(\d+)__$/.exec(id);
      if (!m) return id;
      return gameState.players[Number(m[1])]?.id === localPlayerId ? "friendly_hero" : "enemy_hero";
    };

    // (1) Pouvoir ACTIVÉ (tap) ou pouvoir de HÉROS → flèche JAUNE. Cibles
    // déduites en comparant l'état AVANT (gameState) / APRÈS (newState) sur le
    // plateau adverse (PAS detectDamageEvents : il rate les créatures mortes et
    // confond perte de boost et dégâts).
    if (action.type === "tap_activate" || action.type === "hero_power") {
      const oppIdx = playerIdx === 0 ? 1 : 0;
      const casterIsLocal = localPlayerId === gameState.players[playerIdx].id;
      const casterHeroSentinel = casterIsLocal ? "friendly_hero" : "enemy_hero";
      const enemyHeroSentinel = casterIsLocal ? "enemy_hero" : "friendly_hero";
      const sourceId = action.type === "tap_activate" ? action.sourceInstanceId : casterHeroSentinel;

      const hit = new Set<string>();
      const newOppById = new Map(newState.players[oppIdx].board.map((c) => [c.instanceId, c]));
      for (const oldC of gameState.players[oppIdx].board) {
        const newC = newOppById.get(oldC.instanceId);
        if (!newC) hit.add(oldC.instanceId); // tuée
        else if (newC.currentHealth < oldC.currentHealth && newC.maxHealth >= oldC.maxHealth) hit.add(oldC.instanceId); // vrais dégâts (exclut perte de boost)
        else if (oldC.hasDivineShield && !newC.hasDivineShield) hit.add(oldC.instanceId); // bouclier absorbé
      }
      const oldHero = gameState.players[oppIdx].hero;
      const newHero = newState.players[oppIdx].hero;
      if (newHero.hp < oldHero.hp || newHero.armor < oldHero.armor) hit.add(enemyHeroSentinel);

      // Pouvoir de HÉROS ciblé : le diff de plateau adverse ci-dessus rate les
      // cibles ALLIÉES (un buff/boost n'inflige pas de dégâts). On lit donc les
      // cibles explicitement déclarées dans l'action (targetInstanceId + valeurs
      // de targetMap pour les pouvoirs composés/sort) et on trace une flèche vers
      // toute créature en jeu ainsi ciblée — alliée (boost) comme ennemie.
      if (action.type === "hero_power") {
        const onBoard = new Set<string>([
          ...newState.players[0].board.map((c) => c.instanceId),
          ...newState.players[1].board.map((c) => c.instanceId),
        ]);
        const declared: string[] = [];
        if (action.targetInstanceId) declared.push(action.targetInstanceId);
        if (action.targetMap) declared.push(...Object.values(action.targetMap));
        for (const id of declared) if (onBoard.has(id)) hit.add(id);
      }

      hit.delete(sourceId);
      const targetIds = Array.from(hit);
      if (targetIds.length > 0) powerArrows.push({ sourceId, targetIds, color: "#F68D09" });
    }

    // (1b) Créature JOUÉE avec un effet d'arrivée CIBLÉ (« à l'entrée ») →
    // flèche BLANCHE de la créature vers chaque créature ciblée. Les autres
    // déclencheurs (mort/retour/attaque/fin de tour) portent leur couleur de
    // mode via powerStrikes ; l'entrée en jeu n'a pas de couleur de mode, d'où
    // le blanc. On lit la/les cible(s) déclarée(s) dans l'action (comme le
    // pouvoir de héros), ce qui couvre tous les contenus (buff/dégâts/…), pas
    // seulement les dégâts. Les sorts ont leur propre animation (SpellCastOverlay),
    // donc on se limite à une carte devenue une CRÉATURE sur le plateau.
    if (action.type === "play_card") {
      const sourceId = action.cardInstanceId;
      const playedIsCreature =
        newState.players[0].board.some((c) => c.instanceId === sourceId) ||
        newState.players[1].board.some((c) => c.instanceId === sourceId);
      if (playedIsCreature) {
        // Union avant/après pour retrouver aussi une cible tuée par l'effet.
        const boardIds = new Set<string>([
          ...gameState.players[0].board.map((c) => c.instanceId),
          ...gameState.players[1].board.map((c) => c.instanceId),
          ...newState.players[0].board.map((c) => c.instanceId),
          ...newState.players[1].board.map((c) => c.instanceId),
        ]);
        const declared: string[] = [];
        if (action.targetInstanceId) declared.push(action.targetInstanceId);
        if (action.targetMap) declared.push(...Object.values(action.targetMap));
        const targetIds = Array.from(new Set(declared)).filter(
          (id) => id !== sourceId && boardIds.has(id),
        );
        if (targetIds.length > 0) powerArrows.push({ sourceId, targetIds, color: "#ffffff" });
      }
    }

    // (2) Dégâts de pouvoir DÉCLENCHÉS (mort/retour/attaque/fin de tour),
    // enregistrés par le moteur avec leur mode → flèche colorée par mode
    // (rouge/bleu/violet/vert, via keywordModeColor). Regroupées par (source, couleur).
    // Copie conservée pour l'historique : le bloc ci-dessous consomme
    // `newState.powerStrikes` (indice d'animation, hors état).
    const rawPowerStrikes = newState.powerStrikes ? [...newState.powerStrikes] : [];
    if (newState.powerStrikes && newState.powerStrikes.length > 0) {
      const groups = new Map<string, { sourceId: string; color: string; targets: Set<string> }>();
      for (const st of newState.powerStrikes) {
        const color = keywordModeColor(st.mode) ?? "#d4a800";
        const src = heroSentinelToLocal(st.sourceId);
        const tgt = heroSentinelToLocal(st.targetId);
        const key = `${src}|${color}`;
        let g = groups.get(key);
        if (!g) { g = { sourceId: src, color, targets: new Set() }; groups.set(key, g); }
        if (tgt !== src) g.targets.add(tgt);
        // Fin de tour : le moteur résout les effets dans l'ordre plateau
        // gauche→droite des créatures sources. On mémorise, par cible touchée,
        // l'index plateau de sa créature source (dans le plateau du joueur
        // SORTANT) pour rejouer les popups de dégâts dans ce même ordre.
        if (isEndTurn && !endTurnSourceIdxByTarget.has(tgt)) {
          const srcIdx = gameState.players[playerIdx].board.findIndex((c) => c.instanceId === st.sourceId);
          if (srcIdx >= 0) endTurnSourceIdxByTarget.set(tgt, srcIdx);
        }
      }
      for (const g of groups.values()) {
        if (g.targets.size > 0) powerArrows.push({ sourceId: g.sourceId, targetIds: Array.from(g.targets), color: g.color });
      }
      newState.powerStrikes = undefined; // consommé (indice d'animation, hors état)
    }

    if (powerArrows.length > 0) powerArrowEvent = { arrows: powerArrows, timestamp: Date.now() };
    // Fin de tour avec plusieurs sources : au lieu de faire partir toutes les
    // flèches d'un coup, on les révèle une par une gauche→droite (ordre plateau
    // déjà porté par powerArrows) — voir le planificateur cumulatif plus bas.
    const staggerEndTurnArrows = isEndTurn && !!powerArrowEvent && powerArrowEvent.arrows.length > 1;

    // Réduction de coût (Sacrifice démoniaque…) : on diffe le manaCostReduction
    // des cartes de la main du joueur LOCAL avant/après l'action et on émet un
    // « -N » vert flottant sur chaque carte concernée. Pur diff côté store,
    // aucun changement moteur.
    let manaReductionEvent: ManaReductionEvent | null = null;
    {
      const byInstance: Record<string, number> = {};
      for (let i = 0; i < 2; i++) {
        if (newState.players[i].id !== localPlayerId) continue;
        const oldHand = new Map(gameState.players[i].hand.map(c => [c.instanceId, c.manaCostReduction ?? 0]));
        for (const c of newState.players[i].hand) {
          const delta = (c.manaCostReduction ?? 0) - (oldHand.get(c.instanceId) ?? 0);
          if (delta > 0) byInstance[c.instanceId] = delta;
        }
      }
      if (Object.keys(byInstance).length > 0) {
        manaReductionEvent = { byInstance, timestamp: Date.now() };
      }
    }

    // Épargne : même patron de diff pur (aucun changement moteur). Couvre donc
    // les quatre chemins d'alimentation d'un coup — mot-clé de créature à
    // l'invocation, déclencheur fin de tour / mort / tap, mot-clé de sort,
    // effet composé. `null` (jamais déclenchée) compte pour 0 : le tout premier
    // gain est ainsi animé comme les suivants, alors que c'est justement lui
    // qui fait APPARAÎTRE le losange.
    let epargneGainEvent: EpargneGainEvent | null = null;
    {
      const bySide: Partial<Record<"mine" | "theirs", number>> = {};
      for (let i = 0; i < 2; i++) {
        const delta = (newState.players[i].epargne ?? 0) - (gameState.players[i].epargne ?? 0);
        if (delta > 0) bySide[newState.players[i].id === localPlayerId ? "mine" : "theirs"] = delta;
      }
      if (Object.keys(bySide).length > 0) {
        epargneGainEvent = { bySide, timestamp: Date.now() };
        // Pas de son dédié en base (`sfx_tracks`) : on réutilise `buff`, qui est
        // déjà la signature sonore d'un gain de ressource. Dédoublonné — un même
        // tour peut aussi contenir un vrai buff.
        if (!sfxEvents.some(e => e.type === "buff")) sfxEvents.push({ type: "buff" });
      }
    }

    // Historique latéral : construit ICI, une fois toutes les dérivations faites
    // (sort + relances, pouvoir de héros, combat, pouvoirs déclenchés, morts) et
    // AVANT que les champs d'overlay ne soient planifiés puis vidés.
    //
    // Attaque en DEUX VAGUES (pouvoir « à l'attaque ») : `deadCreatures` et
    // `dmgEvents` diffent depuis `combatOld` (= plateau APRÈS le pouvoir), donc
    // les victimes du pouvoir et leurs dégâts n'y figurent pas. On récupère la
    // vague 1 séparément, sinon l'historique perd purement et simplement ces
    // morts.
    const historyDeaths: CardInstance[] = [];
    const historyDeathOwnerIdx = new Map(deathOwnerIdx);
    let historyDmgEvents = dmgEvents;
    if (onAttackWave) {
      const inter = onAttackWave.intermediate;
      for (let i = 0; i < 2; i++) {
        const interBoard = inter.players[i].board;
        for (const oldC of gameState.players[i].board) {
          if (!interBoard.find((c) => c.instanceId === oldC.instanceId)) {
            historyDeaths.push(oldC);
            historyDeathOwnerIdx.set(oldC.instanceId, i);
          }
        }
      }
      historyDmgEvents = [...detectDamageEvents(gameState, inter, localPlayerId), ...dmgEvents];
    }
    historyDeaths.push(...deadCreatures);

    const historyEntries = buildHistoryEntries({
      oldState: gameState,
      newState,
      action,
      localPlayerId,
      spellEvent,
      recastSpells,
      heroPowerEvent,
      deadCreatures: historyDeaths,
      deathOwnerIdx: historyDeathOwnerIdx,
      dmgEvents: historyDmgEvents,
      powerStrikes: rawPowerStrikes,
    });

    // SFX from card draw (new cards in hand). The mulligan action is the one
    // exception: its pipeline fires ~1250ms after confirm, while the mulligan
    // overlay is still flipping cards and masking its own audio. The Mana
    // Spark / turn-start draw become visible only once the overlay unmounts,
    // so GameBoard replays the draw SFX from onRevealComplete instead.
    const oldHandSize = gameState.players.reduce((s, p) => s + p.hand.length, 0);
    const newHandSize = newState.players.reduce((s, p) => s + p.hand.length, 0);
    if (newHandSize > oldHandSize && action.type !== "mulligan") {
      sfxEvents.push({ type: "draw_card" });
    }

    // ============================================================
    // Sequenced animation pipeline
    // Order: overlay → impacts → deaths → triggered summons → final
    // Local + remote actions queue behind each other via isAnimating.
    // ============================================================

    // Bucket SFX by phase so each sound fires at the right moment.
    // Bruitages par CAPACITÉ. Le moteur a noté celles qui ont réellement résolu ;
    // leur `trigger` décide de la phase où le son s'enchaîne — après le son de
    // pose pour une entrée en jeu, après le son de mort pour un râle d'agonie.
    // On vide la liste transitoire après extraction (exclue du hash).
    const rawAbilitySfx = newState.abilitySfxEvents ?? [];
    if (newState.abilitySfxEvents) newState.abilitySfxEvents = undefined;
    const abilitySfxByPhase = { overlay: [] as string[], death: [] as string[] };
    {
      const urls = useAudioStore.getState().abilitySfxUrls;
      for (const ev of rawAbilitySfx) {
        if (suppressOnPlaySfx && ev.trigger === "on_play") continue;
        const url = urls[ev.abilityId];
        if (!url) continue;
        // Seule la mort a sa propre phase sonore ; tout le reste (entrée en jeu,
        // tap, attaque, fin de tour, retour, pioche, sort) s'enchaîne après le
        // son d'ouverture de l'action.
        const bucket = ev.trigger === "on_death" ? abilitySfxByPhase.death : abilitySfxByPhase.overlay;
        if (!bucket.includes(url)) bucket.push(url);
      }
    }

    /** `delayMs` : décalage de lecture. Sert aux séries (un son par compteur
     *  d'Esprit de corps) — sans lui les N sons partiraient dans le même tick et
     *  ne s'entendraient que comme un seul, plus fort. */
    type SfxEvt = { type: string; cardSfxUrl?: string; delayMs?: number };
    const overlaySfx: SfxEvt[] = [];
    const impactSfx: SfxEvt[] = [];
    const deathSfx: SfxEvt[] = [];
    const summonSfx: SfxEvt[] = [];
    const drawSfx: SfxEvt[] = [];
    for (const evt of sfxEvents) {
      if (evt.type === "draw_card") {
        drawSfx.push(evt);
      } else if (["spell_cast", "hero_power", "attack", "end_turn", "play_card", "counter_spell", "fire_breath"].includes(evt.type)) {
        overlaySfx.push(evt);
      } else if (["damage", "heal", "buff", "debuff", "divine_shield", "poison", "dodge", "paralyze"].includes(evt.type)) {
        impactSfx.push(evt);
      } else if (evt.type === "creature_death") {
        deathSfx.push(evt);
      } else if (evt.type === "summon" || evt.type === "resurrect") {
        summonSfx.push(evt);
      } else {
        overlaySfx.push(evt);
      }
    }

    /** Joue les sons d'une phase. `chained` (les bruitages de capacité) ne se
     *  superpose PAS au reste : le premier son de la phase sert d'ancre et les
     *  bruitages s'enchaînent derrière lui (cf. SfxEngine.playChain). Sans quoi
     *  le son d'une capacité d'entrée en jeu couvrirait celui de la carte. */
    const playSfxBatch = (events: SfxEvt[], chained: string[] = []) => {
      if (typeof window === "undefined") return;
      if (events.length === 0 && chained.length === 0) return;
      const audioState = useAudioStore.getState();
      if (!audioState.userHasInteracted || audioState.settings.sfxMuted) return;
      const engine = SfxEngine.getInstance();
      // Les sons DÉCALÉS sortent du lot : ils ne peuvent servir ni d'ancre de
      // chaîne ni de lecture immédiate. On les programme à part.
      for (const evt of events) {
        if (!evt.delayMs) continue;
        const url = evt.cardSfxUrl || audioState.standardSfxUrls[evt.type];
        if (url) setTimeout(() => engine.play(url), evt.delayMs);
      }
      const resolved = events
        .filter((evt) => !evt.delayMs)
        .map((evt) => evt.cardSfxUrl || audioState.standardSfxUrls[evt.type])
        .filter(Boolean) as string[];
      if (chained.length === 0) {
        for (const url of resolved) engine.play(url);
        return;
      }
      // Ancre = premier son de la phase, puis les bruitages de capacité. Les
      // sons restants gardent leur lecture simultanée : seule la relation
      // « carte → capacité » demandait un enchaînement.
      const [anchor, ...rest] = resolved;
      for (const url of rest) engine.play(url);
      engine.playChain(anchor ? [anchor, ...chained] : chained);
    };

    // Identify what kind of visible events this action produces.
    const hasOverlay = !!spellEvent || !!heroPowerEvent || !!fireEvent;
    const isAttack = action.type === "attack";

    // Detect cards that left the graveyard (exiled, reanimated, sacrificed…).
    // Shown to both players so they see which cards from the graveyard were
    // affected (Profanation, Exhumation, Résurrection, Nécrophagie…).
    const graveyardRemoved: Card[] = [];
    for (let i = 0; i < 2; i++) {
      const oldGY = gameState.players[i].graveyard;
      const newGY = newState.players[i].graveyard;
      for (const oldC of oldGY) {
        if (!newGY.find((c) => c.instanceId === oldC.instanceId)) {
          graveyardRemoved.push(oldC.card);
        }
      }
    }
    const graveyardAffectEvent: GraveyardAffectEvent | null =
      graveyardRemoved.length > 0
        ? { cards: graveyardRemoved, timestamp: Date.now() }
        : null;

    // Detect cards forced from a player's hand into their graveyard during
    // this action. Two distinct cases:
    //   • COST discard — the player paid `discard_cost` to play the card.
    //     Logically the cost is paid BEFORE the card resolves, so the popup
    //     must appear before the spell overlay (otherwise the discard looks
    //     like a consequence of the spell instead of a prerequisite).
    //   • EFFECT discard — Combustion ("défaussez une carte de votre main")
    //     and similar spell-driven forced discards. These belong AFTER the
    //     spell overlay since they're caused by the spell.
    // Splitting the popup keeps each one in the right narrative beat.
    const playedActionInstanceId = action.type === "play_card" ? action.cardInstanceId : null;
    const costDiscardIds = new Set<string>(
      action.type === "play_card" ? action.discardInstanceIds ?? [] : [],
    );
    const costDiscardedFromHand: { card: Card; ownerPlayerId: string }[] = [];
    const effectDiscardedFromHand: { card: Card; ownerPlayerId: string }[] = [];
    for (let i = 0; i < 2; i++) {
      const oldHand = gameState.players[i].hand;
      const newHand = newState.players[i].hand;
      const newGY = newState.players[i].graveyard;
      for (const oldCardInstance of oldHand) {
        if (oldCardInstance.instanceId === playedActionInstanceId) continue;
        const stillInHand = newHand.find((c) => c.instanceId === oldCardInstance.instanceId);
        if (stillInHand) continue;
        const inGraveyard = newGY.find((c) => c.instanceId === oldCardInstance.instanceId);
        if (inGraveyard) {
          const target = costDiscardIds.has(oldCardInstance.instanceId)
            ? costDiscardedFromHand
            : effectDiscardedFromHand;
          target.push({
            card: oldCardInstance.card,
            ownerPlayerId: gameState.players[i].id,
          });
        }
      }
    }
    const costDiscardEvent: DiscardFromHandEvent | null =
      costDiscardedFromHand.length > 0
        ? {
            cards: costDiscardedFromHand.map((d) => d.card),
            ownerPlayerId: costDiscardedFromHand[0].ownerPlayerId,
            timestamp: Date.now(),
          }
        : null;
    const discardFromHandEvent: DiscardFromHandEvent | null =
      effectDiscardedFromHand.length > 0
        ? {
            cards: effectDiscardedFromHand.map((d) => d.card),
            ownerPlayerId: effectDiscardedFromHand[0].ownerPlayerId,
            timestamp: Date.now(),
          }
        : null;
    const hasImpacts = dmgEvents.length > 0;
    const hasDeaths = deadCreatures.length > 0;

    const playedId = action.type === "play_card" ? action.cardInstanceId : null;
    const newCreatureIds = new Set<string>();
    for (let i = 0; i < 2; i++) {
      // `visualEnd` : une créature invoquée par un effet « à la pioche » ne doit
      // pas apparaître AVANT la pioche qui l'a produite. Elle est peinte avec la
      // vague finale, qui réinjecte les nouvelles venues.
      for (const nc of visualEnd.players[i].board) {
        if (nc.instanceId === playedId) continue;
        if (!gameState.players[i].board.find((c) => c.instanceId === nc.instanceId)) {
          newCreatureIds.add(nc.instanceId);
        }
      }
    }
    const hasSummons = newCreatureIds.size > 0;

    // Invocations déclenchées PENDANT la vague de pouvoir « à l'attaque »
    // (on_attack) : la créature est réinjectée dans powerImpactState et donc
    // peinte à t=0 (cf. la boucle de réinjection plus bas). Son portail + son
    // son d'invocation doivent jouer AVEC elle, à cette vague, et non à la
    // phase d'invocation finale — sinon la carte apparaît avant son propre
    // effet d'apparition (bug spécifique on_attack, ex. Appel du clan). On
    // reprend exactement la condition de la réinjection : présente dans
    // l'intermédiaire, absente de l'ancien plateau.
    const powerWaveSummonIds = new Set<string>();
    if (onAttackWave) {
      for (let i = 0; i < 2; i++) {
        const oldBoard = gameState.players[i].board;
        for (const nc of onAttackWave.intermediate.players[i].board) {
          if (nc.instanceId === playedId) continue;
          if (!oldBoard.find((c) => c.instanceId === nc.instanceId)) {
            powerWaveSummonIds.add(nc.instanceId);
          }
        }
      }
    }
    // Invocations qui apparaissent PLUS TARD (entrée en jeu classique, ou
    // invocation déclenchée en cours de combat / à la mort) : elles gardent
    // leur portail + son à la phase d'invocation finale.
    const lateSummonIds = [...newCreatureIds].filter((id) => !powerWaveSummonIds.has(id));

    // Créature JOUÉE depuis la main qui vient d'arriver sur le plateau (≠ sort,
    // ≠ invocation par effet) → entrée « douce » (fondu + légère montée). Vaut
    // null si le playedId est un sort ou n'est pas une créature nouvellement en jeu.
    let playedCreatureId: string | null = null;
    if (playedId) {
      const onNew = newState.players.some((p) => p.board.some((c) => c.instanceId === playedId));
      const onOld = gameState.players.some((p) => p.board.some((c) => c.instanceId === playedId));
      if (onNew && !onOld) playedCreatureId = playedId;
    }

    // How many cards each player drew this action — we hold them out of the
    // hand until the final "draw" phase so the animation is clearly separated.
    //
    // Comptées par IDENTITÉ, et non par différence de taille de main : une carte
    // RENVOYÉE en main (Remontée, « Se renvoie en main ») fait elle aussi grossir
    // la main, elle était donc prise pour une pioche et retenue hors des états
    // intermédiaires. La Louve kiptchake arrivait en main, disparaissait le temps
    // des phases d'impact, puis réapparaissait au commit final — un clignotement.
    //
    // Une carte déjà présente sur un PLATEAU avant l'action n'est pas une pioche :
    // elle en revient. Les cartes surgies d'un pool (Sélection) restent comptées,
    // comme avant — elles arrivent bien de nulle part et gagnent à être révélées
    // dans la phase dédiée.
    const drawnIds = drawnCardIds(gameState, newState);
    const drawnCounts: [number, number] = [drawnIds[0].size, drawnIds[1].size];
    const hasDraws = drawnCounts[0] + drawnCounts[1] > 0;

    // NB : drawTriggerSpells compte ici mais PAS dans `hasOverlay` — ce dernier
    // pilote aussi le décalage avant impact (OVERLAY_PRE_IMPACT_MS), déjà couvert
    // par le RECAST_GAP_MS que chaque révélation « pioche » réserve elle-même.
    // NB : `cycleEvent` et `compagnonsEvent` sont les deux SEULS événements dont
    // rien d'autre ne garantit la présence. Cycle éternel accompagne toujours
    // une mort (hasDeaths) — mais Compagnons ne bouge QUE le deck : sur une
    // créature vanille, aucun des autres drapeaux ne lève, l'action prenait le
    // chemin rapide et les phases — donc l'animation — n'existaient jamais.
    // `eveilEvent` est du même bois, et pour la même raison : mettre une carte
    // en éveil ou y verser un point ne fait grossir aucune zone visible — la main
    // RÉTRÉCIT, ce que `drawnCardIds` ne regarde pas. Sans ce drapeau, le seul
    // mouvement du mécanisme n'aurait jamais d'animation.
    const hasAnything = hasOverlay || hasImpacts || hasDeaths || hasSummons || hasDraws || isAttack || !!graveyardAffectEvent || !!discardFromHandEvent || !!costDiscardEvent || !!tempeteEvent || !!powerArrowEvent || !!manaReductionEvent || !!epargneGainEvent || !!exileCostEvent || !!topdeckCostEvent || !!deckEffectEvent || !!cycleEvent || !!compagnonsEvent || !!eveilEvent || drawTriggerSpells.length > 0;

    // Deep clone helper — factionCardPool / allSpellsPool carry non-serialisable refs, keep them aside.
    const cloneState = (state: GameState): GameState => {
      const { factionCardPool, allSpellsPool, ...rest } = state;
      const cloned = JSON.parse(JSON.stringify(rest)) as GameState;
      cloned.factionCardPool = factionCardPool;
      cloned.allSpellsPool = allSpellsPool;
      return cloned;
    };

    // Death-triggered buffs we need to defer visually (Nécrophagie, …).
    // For each surviving creature, compute the delta in nécrophagie bonus gained
    // during this action. We subtract it from the impact/post-death snapshots
    // so the +1/+1 buff only appears AFTER the dead creatures are removed.
    const necroDeltas = new Map<string, number>();
    for (let i = 0; i < 2; i++) {
      for (const oldC of gameState.players[i].board) {
        const newC = newState.players[i].board.find((c) => c.instanceId === oldC.instanceId);
        if (!newC) continue;
        const delta = (newC.necrophagieATKBonus ?? 0) - (oldC.necrophagieATKBonus ?? 0);
        if (delta > 0) necroDeltas.set(oldC.instanceId, delta);
      }
    }
    const rewindNecro = <T extends { instanceId: string; currentAttack: number; currentHealth: number; maxHealth: number; necrophagieATKBonus?: number; necrophagiePVBonus?: number }>(c: T): T => {
      const delta = necroDeltas.get(c.instanceId);
      if (!delta || delta <= 0) return c;
      return {
        ...c,
        necrophagieATKBonus: Math.max(0, (c.necrophagieATKBonus ?? 0) - delta),
        necrophagiePVBonus: Math.max(0, (c.necrophagiePVBonus ?? 0) - delta),
        currentAttack: Math.max(0, c.currentAttack - delta),
        currentHealth: Math.max(0, c.currentHealth - delta),
        maxHealth: Math.max(0, c.maxHealth - delta),
      };
    };

    // Impact state: HP reduced (same values as newState), dead creatures still
    // shown at 0 HP on their original slot, freshly summoned creatures NOT yet
    // on the board so they enter later with their own animation. Nécrophagie
    // buffs are rewound so they only appear after the death animation.
    // Bâtis sur `visualEnd` : sur une action qui pioche, ces états s'arrêtent à
    // la frontière de pioche, et la vague finale (plus bas) prend le relais.
    const impactState = cloneState(visualEnd);
    for (let i = 0; i < 2; i++) {
      // combatOld baseline so the combat wave doesn't resurrect power-killed
      // creatures (already removed in wave 1) nor re-show their HP loss.
      const oldBoard = combatOld.players[i].board;
      const newBoard = visualEnd.players[i].board;
      const deadIds = new Set(
        oldBoard
          .filter((c) => !newBoard.find((nc) => nc.instanceId === c.instanceId))
          .map((c) => c.instanceId),
      );
      impactState.players[i].board = oldBoard.map((c) => {
        if (deadIds.has(c.instanceId)) {
          return { ...c, currentHealth: 0 };
        }
        const updated = newBoard.find((nc) => nc.instanceId === c.instanceId);
        return rewindNecro(updated ?? c);
      });
      // Also append any freshly-played creature (the one the user just cast) so
      // the hand→board animation still works. We exclude newCreatureIds
      // (resurrections / convocations) which belong to a later phase.
      for (const nc of newBoard) {
        if (nc.instanceId === playedId && !impactState.players[i].board.find((c) => c.instanceId === nc.instanceId)) {
          impactState.players[i].board.push(rewindNecro(nc));
        }
      }
    }

    // Post-death state: dead creatures gone, new summons still absent, buffs
    // still rewound — the Nécrophagie +1/+1 lands in the final phase.
    const postDeathState = cloneState(visualEnd);
    for (let i = 0; i < 2; i++) {
      postDeathState.players[i].board = visualEnd.players[i].board
        .filter((c) => !newCreatureIds.has(c.instanceId))
        .map((c) => rewindNecro(c));
    }

    // Trim drawn cards from every intermediate state so they only appear in
    // the dedicated draw phase. Engine pushes drawn cards to the end of the
    // hand, so we slice the tail.
    const trimDrawsFromHand = (state: GameState) => {
      for (let i = 0; i < 2; i++) {
        if (drawnIds[i].size === 0) continue;
        // Retrait par IDENTITÉ plutôt que par découpe de la queue : la queue
        // contenait aussi les cartes revenues du plateau, qui ne sont pas des
        // pioches et doivent rester visibles.
        state.players[i].hand = state.players[i].hand.filter((c) => !drawnIds[i].has(c.instanceId));
      }
    };
    trimDrawsFromHand(impactState);
    trimDrawsFromHand(postDeathState);

    // Pre-draw state: dead + summons already resolved, buffs applied, but the
    // newly-drawn cards are still held back.
    // État à l'instant de la PIOCHE : la frontière de pioche s'il y en a une
    // (tout ce qui précède a déjà été peint, râles compris), sinon l'état final.
    const etatAvantPioche = drawWave ? drawWave.state : newState;
    const preDrawState = cloneState(etatAvantPioche);
    trimDrawsFromHand(preDrawState);

    // --- Fin de tour : garder l'identité du tour SORTANT sur les états
    // intermédiaires. Bug : le tour suivant « commençait » (indicateur de tour,
    // timer, mana rechargé) AVANT que les effets de fin de tour ne finissent de
    // s'animer, parce que le moteur bascule déjà tout dans newState et que ces
    // états intermédiaires en sont des clones. On rétablit currentPlayerIndex /
    // turnStartedAt / turnNumber / mana aux valeurs sortantes pendant que les
    // FX de fin de tour jouent ; la bascule visible n'arrive qu'au commit final
    // (phaseDraws → newState). preDrawState n'est préservé QUE s'il reste une
    // phase de pioche après lui ; sinon il est l'état terminal et doit déjà
    // porter le tour basculé (paquet vide → pas de phaseDraws).
    if (isEndTurn) {
      const keepOutgoingTurn = (state: GameState) => {
        state.currentPlayerIndex = gameState.currentPlayerIndex;
        state.turnStartedAt = gameState.turnStartedAt;
        state.turnNumber = gameState.turnNumber;
        for (let i = 0; i < 2; i++) {
          state.players[i].mana = gameState.players[i].mana;
          state.players[i].maxMana = gameState.players[i].maxMana;
        }
      };
      keepOutgoingTurn(impactState);
      keepOutgoingTurn(postDeathState);
      if (hasDraws) keepOutgoingTurn(preDrawState);
    }

    // Fast path: trivial action (no visible effects) — commit immediately.
    if (!hasAnything) {
      const overlay = pendingTriggerOverlay(newState, get().localPlayerId);
      set({
        gameState: newState,
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        ...overlay,
        pendingCostCard: null,
        selectedDiscardIds: [],
        selectedSacrificeIds: [],
        selectedTopdeckIds: [],
        pendingHeroPowerSelection: false,
  pendingEpargneSelection: false,
        pendingTapSourceId: null,
        pendingTapInstanceIdx: null,
        pendingTapComposedUid: null,
        pendingCreatureChain: null,
        damageEvents: [],
        entryEvents: playedCreatureId ? [playedCreatureId] : [],
        lastSfxEvents: sfxEvents,
        effectLog: [...get().effectLog, ...logEntries].slice(-20),
        actionHistory: [...get().actionHistory, ...historyEntries].slice(-ACTION_HISTORY_MAX),
      });
      // Pas d'exil ici : `hasAnything` en tient compte, donc une action qui en
      // porte un ne prend jamais ce chemin rapide (TypeScript le déduit seul et
      // rendait le bloc précédent mort).
      playSfxBatch(sfxEvents, [...abilitySfxByPhase.overlay, ...abilitySfxByPhase.death]);
      return action;
    }

    // Lock the UI while the sequence plays.
    set({
      isAnimating: true,
      selectedCardInstanceId: null,
      selectedAttackerInstanceId: null,
      validTargets: [],
      targetingMode: "none",
      pendingCostCard: null,
      selectedDiscardIds: [],
      selectedSacrificeIds: [],
      selectedTopdeckIds: [],
      pendingHeroPowerSelection: false,
  pendingEpargneSelection: false,
      pendingTapSourceId: null,
      pendingTapInstanceIdx: null,
      pendingTapComposedUid: null,
      // Posé avant les phases : la créature jouée monte en phase d'impact avec
      // `entering` vrai → entrée douce. Réécrit à chaque action donc auto-reset.
      entryEvents: playedCreatureId ? [playedCreatureId] : [],
    });

    // --- Phase timings ---
    const OVERLAY_PRE_IMPACT_MS = 1150; // spell / hero-power → impact start (tightened: the card's motion is done by ~600ms, so 1800 left a long dead hold before impact)
    const POWER_ARROW_PRE_IMPACT_MS = 550; // pouvoir tap sans overlay : laisse la flèche partir avant que les dégâts/bouclier ne s'affichent
    const ATTACK_LUNGE_PRE_IMPACT_MS = 700; // lunge (~650ms) + short buffer
    const IMPACT_MS = 1200;
    const DRAW_MS = 1000;
    const DEATH_MS = 1000;
    const SUMMON_MS = 1400;
    const DISCARD_MS = 1800; // forced-discard popup display time
    // Cost discard runs BEFORE the spell overlay to communicate that the
    // discard is a prerequisite, not a consequence. Shorter than DISCARD_MS
    // so it doesn't drag the cast — the popup visually starts here and
    // continues fading while the spell overlay flies in.
    const COST_DISCARD_MS = 1000;
    // Cadence des sorts : pilotée par OVERLAY.spell (cf. overlayMotion), pour
    // que le store et l'overlay ne puissent pas diverger. L'écart entre deux
    // relances vaut désormais la fenêtre de lecture pleine de la carte — avant,
    // 1200ms pour 2000ms d'affichage, chaque relance était tronquée.
    const RECAST_GAP_MS = OVERLAY.spell.recastGapMs;

    // Une attaque sur héros porte une sentinelle en POINT DE VUE DE L'ATTAQUANT
    // ("enemy_hero" = héros défenseur). Le lunge la résout via `data-target-id`,
    // qui est en repère LOCAL — donc sur l'écran du joueur qui SUBIT l'attaque,
    // "enemy_hero" désigne le héros de l'attaquant et le lunge vise le mauvais
    // héros (bug : « la créature adverse semble attaquer son propre héros »). On
    // la retraduit en repère local d'après le propriétaire de l'attaquant. Les
    // cibles créature (instanceId global) passent inchangées.
    const attackHeroTargetToLocal = (targetId: string, attackerInstanceId: string): string => {
      if (targetId !== "enemy_hero" && targetId !== "friendly_hero") return targetId;
      const atkIdx = gameState.players.findIndex((p) => p.board.some((c) => c.instanceId === attackerInstanceId));
      if (atkIdx < 0) return targetId;
      // "enemy_hero" (POV attaquant) = héros du joueur OPPOSÉ à l'attaquant.
      const defenderIdx = targetId === "enemy_hero" ? (atkIdx === 0 ? 1 : 0) : atkIdx;
      return gameState.players[defenderIdx]?.id === localPlayerId ? "friendly_hero" : "enemy_hero";
    };

    // --- Phase handlers ---
    const phaseOverlay = () => {
      set((s) => ({
        effectLog: [...s.effectLog, ...logEntries].slice(-20),
        // L'entrée d'historique apparaît EN MÊME TEMPS que l'animation, pas au
        // moment du dispatch — sinon la bande spoile ce qui va être joué.
        actionHistory: [...s.actionHistory, ...historyEntries].slice(-ACTION_HISTORY_MAX),
        ...(spellEvent ? { spellCastEvent: spellEvent } : {}),
        ...(fireEvent ? { fireBreathEvent: fireEvent } : {}),
        ...(heroPowerEvent ? { heroPowerCastEvent: heroPowerEvent } : {}),
        // La flèche de pouvoir part AVANT l'impact (simultanée à l'anim
        // héroïque pour un pouvoir de héros ; les dégâts/bouclier suivent).
        // En fin de tour étalée, l'émission est déléguée au planificateur
        // cumulatif (plus bas) — on ne pousse pas le lot complet ici.
        ...(powerArrowEvent && !staggerEndTurnArrows ? { powerArrowEvent } : {}),
      }));
      playSfxBatch(overlaySfx, abilitySfxByPhase.overlay);
      // Attack lunge plays on BOTH the active and passive client, since this
      // runs inside dispatchAction which remote broadcasts go through too.
      if (isAttack && action.type === "attack") {
        playAttackLunge(action.attackerInstanceId, attackHeroTargetToLocal(action.targetInstanceId, action.attackerInstanceId));
        // Fureur chain: each strike replays a lunge from the Fureur
        // creature to its current victim, staggered so the player sees
        // them as successive events. Multi-step chains animate
        // sequentially (one lunge per surviving strike).
        for (let i = 0; i < fureurStrikes.length; i++) {
          const s = fureurStrikes[i];
          setTimeout(
            () => playAttackLunge(s.attackerInstanceId, s.victimInstanceId),
            FUREUR_FIRST_DELAY_MS + i * FUREUR_LUNGE_GAP_MS,
          );
        }
      }
    };

    // Cascade: if multiple targets are hit by the same action, stagger their
    // floating popups by 200ms each so the player can read each one.
    const STAGGER_MS = 200;
    // Split damage events into impact (direct dégâts/heal/shield/…) and
    // deferred buffs triggered by deaths (Nécrophagie) — the latter must wait
    // until the creatures have actually left for the graveyard.
    const deferredBuffEvents = dmgEvents.filter(
      (ev) => ev.type === "buff" && necroDeltas.has(ev.targetId),
    );
    const impactOnlyEvents = dmgEvents.filter(
      (ev) => !(ev.type === "buff" && necroDeltas.has(ev.targetId)),
    );
    // Per-victim delay derived from the Fureur strike order: victim of the
    // 1st strike shows at +DAMAGE_DELAY, victim of the 2nd at +DAMAGE_DELAY
    // +LUNGE_GAP, etc. — matches the lunge sequencing above. If a chain
    // happens to hit the same victim twice the combined damage popup
    // appears at the first occurrence's time (later strikes are folded in).
    const fureurVictimDelay = new Map<string, number>();
    fureurStrikes.forEach((s, i) => {
      if (!fureurVictimDelay.has(s.victimInstanceId)) {
        fureurVictimDelay.set(s.victimInstanceId, FUREUR_DAMAGE_DELAY_MS + i * FUREUR_LUNGE_GAP_MS);
      }
    });

    const staggerByTarget = (events: typeof dmgEvents) => {
      const order = new Map<string, number>();
      for (const ev of events) {
        if (!order.has(ev.targetId)) order.set(ev.targetId, order.size);
      }
      return events.map((ev) => {
        const base = (order.get(ev.targetId) ?? 0) * STAGGER_MS;
        const fureurBonus = fureurVictimDelay.get(ev.targetId) ?? 0;
        return { ...ev, delayMs: base + fureurBonus };
      });
    };
    // Pour les cibles touchées par des points séquentiels, on retire l'agrégat
    // diffé (damage/heal) — remplacé par les seqEvents par point déjà décalés
    // (qui NE repassent PAS par staggerByTarget, sinon leur delayMs serait
    // écrasé). Les autres types (shield/poison/empower) restent intacts.
    const nonSeqImpactEvents = impactOnlyEvents.filter(
      (ev) => !(seqTargets.has(ev.targetId)
        && (ev.type === "damage" || ev.type === "heal" || ev.type === "buff")),
    );
    // Fin de tour : ordonner les popups par index plateau de la créature SOURCE
    // (gauche→droite, comme le moteur résout) plutôt que par ordre d'apparition
    // des cibles. Les cibles sans source connue (buffs sans powerStrike) passent
    // après, dans l'ordre courant.
    const staggerEndTurnBySource = (events: typeof dmgEvents) => {
      const idxOf = (t: string) => endTurnSourceIdxByTarget.get(t) ?? Number.MAX_SAFE_INTEGER;
      const ordered = events
        .map((ev, i) => ({ ev, i }))
        .sort((a, b) => idxOf(a.ev.targetId) - idxOf(b.ev.targetId) || a.i - b.i);
      const rank = new Map<string, number>();
      for (const { ev } of ordered) {
        if (!rank.has(ev.targetId)) rank.set(ev.targetId, rank.size);
      }
      return ordered.map(({ ev }) => ({ ...ev, delayMs: (rank.get(ev.targetId) ?? 0) * STAGGER_MS }));
    };
    const staggeredDmgEvents = isEndTurn
      ? [...staggerEndTurnBySource(nonSeqImpactEvents), ...seqEvents]
      : [...staggerByTarget(nonSeqImpactEvents), ...seqEvents];
    const staggeredTriggerEvents = staggerByTarget(deferredBuffEvents);

    // --- Wave 1 (on-attack power) artifacts: diff gameState → intermediate ---
    let powerImpactState: GameState | null = null;
    let powerDeathState: GameState | null = null;
    let powerDmgStaggered: ReturnType<typeof staggerByTarget> = [];
    let powerHasDeaths = false;
    if (onAttackWave) {
      const inter = onAttackWave.intermediate;
      powerImpactState = cloneState(inter);
      for (let i = 0; i < 2; i++) {
        const oldBoard = gameState.players[i].board;
        const interBoard = inter.players[i].board;
        const deadIds = new Set(
          oldBoard.filter((c) => !interBoard.find((nc) => nc.instanceId === c.instanceId)).map((c) => c.instanceId),
        );
        if (deadIds.size > 0) powerHasDeaths = true;
        // Originally-living creatures: power-dead shown at 0 HP on their slot,
        // survivors at their post-power values.
        powerImpactState.players[i].board = oldBoard.map((c) =>
          deadIds.has(c.instanceId) ? { ...c, currentHealth: 0 } : (interBoard.find((nc) => nc.instanceId === c.instanceId) ?? c),
        );
        // Append creatures the power summoned (on_attack summon_token) so they
        // appear in the power wave rather than popping in later.
        for (const nc of interBoard) {
          if (!powerImpactState.players[i].board.find((c) => c.instanceId === nc.instanceId)) {
            powerImpactState.players[i].board.push(nc);
          }
        }
      }
      // The intermediate already has power-dead creatures removed → it IS the
      // post-power-death state.
      powerDeathState = cloneState(inter);
      // Mortes DE CETTE VAGUE : absentes du plateau intermédiaire sans être
      // reparties en main (même distinction que deadCreatures). Elles n'entrent
      // pas dans deadCreatures (bâti depuis combatOld = l'intermédiaire), donc
      // aucun risque de double popup entre les deux vagues.
      const powerDead: CardInstance[] = [];
      for (let i = 0; i < 2; i++) {
        for (const oldC of gameState.players[i].board) {
          if (inter.players[i].board.find((c) => c.instanceId === oldC.instanceId)) continue;
          if (inter.players.some((p) => p.hand.some((c) => c.instanceId === oldC.instanceId))) continue;
          powerDead.push(oldC);
        }
      }
      powerDmgStaggered = staggerByTarget([
        ...detectDamageEvents(gameState, inter, localPlayerId),
        ...lethalDamageEvents(powerDead, inter, damageLedger),
      ]);
    }

    // --- VAGUES D'INTERVALLE : une par frontière posée par le moteur ---------
    //
    // Même construction que la vague de pouvoir « à l'attaque », mais posée
    // n'importe où dans la séquence : là-bas le point de passage décale le DÉBUT
    // du diff principal, ici chaque frontière ouvre un intervalle qui se peint
    // à son tour. Le diff principal, lui, s'arrête à la première (`visualEnd`).
    type Vague = {
      impactState: GameState;
      /** État à la fin de l'intervalle — celui qu'on engage après la vague. */
      finState: GameState;
      dmg: DamageEvent[];
      dead: CardInstance[];
      hasDeaths: boolean;
      /** Points séquentiels de l'intervalle : ils s'égrènent, la vague doit
       *  durer assez pour tous les sortir avant la phase de mort. */
      seqCount: number;
      /** Délai du DERNIER point de l'intervalle. Les cadences diffèrent selon
       *  le type (les boosts sont bien plus lents que les dégâts) : un
       *  `count × pas` mentirait dès qu'une vague les mélange. */
      seqDuree: number;
    };

    const construireVague = (f: typeof frontieres[number]): Vague => {
      const bord = f.state;
      const fin = finDeLIntervalle(f);
      const impactState = cloneState(fin);
      const dead: CardInstance[] = [];
      let hasDeaths = false;

      for (let i = 0; i < 2; i++) {
        const bordBoard = bord.players[i].board;
        const finBoard = fin.players[i].board;
        const mortes = new Set(
          bordBoard
            .filter((c) => !finBoard.find((nc) => nc.instanceId === c.instanceId))
            // Renvoyée en main ou passée sur l'autre plateau ⇒ pas une morte.
            .filter((c) => !fin.players.some((p) =>
              p.hand.some((h) => h.instanceId === c.instanceId)
              || p.board.some((b) => b.instanceId === c.instanceId)))
            .map((c) => c.instanceId),
        );
        if (mortes.size > 0) hasDeaths = true;
        for (const c of bordBoard) if (mortes.has(c.instanceId)) dead.push(c);
        // Les mortes restent affichées à 0 PV sur leur case le temps de la
        // vague ; la phase suivante les retire.
        impactState.players[i].board = bordBoard.map((c) =>
          mortes.has(c.instanceId)
            ? { ...c, currentHealth: 0 }
            : (finBoard.find((nc) => nc.instanceId === c.instanceId) ?? c),
        );
        // Créatures apparues DANS cet intervalle (un râle ou un effet de pioche
        // qui invoque) : elles montent avec la vague, pas avant.
        for (const nc of finBoard) {
          if (!impactState.players[i].board.find((c) => c.instanceId === nc.instanceId)) {
            impactState.players[i].board.push(nc);
          }
        }
      }

      // Points séquentiels de l'intervalle (scatter, Tempête). Ils ne se lisent
      // pas dans l'état — registre plat alimenté coup par coup — donc aucun diff
      // ne les couperait : c'est le rang porté par la frontière qui les tranche.
      const pointsIntervalle = seqHitsDeLIntervalle(f);
      const { delais: delaisIntervalle, dernier: dernierIntervalle } = echelonnerPoints(pointsIntervalle);
      const seq: DamageEvent[] = pointsIntervalle.map((h, i) => {
        const m = /^__hero_(\d)__$/.exec(h.targetInstanceId);
        const targetId = m
          ? (newState.players[+m[1]]?.id === localPlayerId ? "friendly_hero" : "enemy_hero")
          : h.targetInstanceId;
        return { targetId, amount: 1, type: h.type, ...getElementCenter(targetId), delayMs: delaisIntervalle[i] };
      });
      const seqCibles = new Set(seq.map((e) => e.targetId));
      // Même règle qu'en vague 1 : pour une cible touchée point par point, on
      // retire l'agrégat diffé et on garde les points, déjà décalés (les faire
      // repasser par staggerByTarget écraserait leur delayMs).
      const agregats = [
        ...detectDamageEvents(bord, fin, localPlayerId),
        ...lethalDamageEvents(dead, fin, damageLedger),
      ].filter((ev) => !(seqCibles.has(ev.targetId) && (ev.type === "damage" || ev.type === "heal")));

      return {
        impactState,
        finState: fin,
        dmg: [...staggerByTarget(agregats), ...seq],
        dead,
        hasDeaths,
        seqCount: seq.length,
        seqDuree: dernierIntervalle,
      };
    };

    const vaguesAvantPioche = frontieresAvantPioche.map(construireVague);
    const vaguesDepuisPioche = frontieresDepuisPioche.map(construireVague);

    /** Programme une vague d'intervalle et rend le curseur avancé. Une vague
     *  SANS RIEN À PEINDRE n'occupe aucun temps : une frontière posée pour un
     *  râle qui ne produit rien ne doit pas introduire de temps mort. */
    const programmerVague = (v: Vague | null, at: number): number => {
      if (!v) return at;
      let c = at;
      const aPeindre = v.dmg.length > 0 || v.hasDeaths;
      if (!aPeindre) return c;
      setTimeout(() => set({ gameState: v.impactState, damageEvents: v.dmg }), c);
      c += IMPACT_MS + (v.seqCount > 0 ? v.seqDuree + 500 : 0);
      if (v.hasDeaths) {
        setTimeout(() => set({
          gameState: v.finState,
          deathEvents: v.dead.map((mort) => {
            const pos = getElementCenter(mort.instanceId);
            return { instanceId: mort.instanceId, x: pos.x, y: pos.y, poisoned: !!mort.isPoisoned };
          }),
        }), c);
        c += DEATH_MS;
      }
      return c;
    };

    const phasePowerImpacts = () => {
      if (!powerImpactState) return;
      set({
        gameState: powerImpactState,
        damageEvents: powerDmgStaggered,
        // Portail des créatures invoquées à cette vague : elles montent dans le
        // même rendu, la couche Canvas résout leur position DOM et y fait éclore
        // le portail — comme phaseSummons, mais synchronisé avec leur apparition.
        ...(powerWaveSummonIds.size > 0 ? { summonEvents: Array.from(powerWaveSummonIds) } : {}),
      });
      // Son d'invocation joué ICI pour ces créatures (et non à la fin).
      if (powerWaveSummonIds.size > 0) playSfxBatch(summonSfx);
    };
    const phasePowerDeaths = () => {
      if (powerDeathState) set({ gameState: powerDeathState });
    };

    const phaseImpacts = () => {
      set({
        gameState: impactState,
        damageEvents: staggeredDmgEvents,
        lastSfxEvents: impactSfx,
        ...(graveyardAffectEvent ? { graveyardAffectEvent } : {}),
        ...(tempeteEvent ? { tempeteEvent } : {}),
        // Épargne posée ICI et pas en phase morts : cette phase est la seule à
        // être planifiée inconditionnellement, et un gain d'Épargne ne tue
        // personne (une Épargne « fin de tour » n'aurait rien animé du tout).
        ...(epargneGainEvent ? { epargneGainEvent } : {}),
      });
      playSfxBatch(impactSfx);
    };

    const phaseDeaths = () => {
      set({
        gameState: postDeathState,
        ...(deathFxEvents.length > 0 ? { deathEvents: deathFxEvents } : {}),
        // Le « -N » mana flotte au moment de la mort (Sacrifice démoniaque).
        ...(manaReductionEvent ? { manaReductionEvent } : {}),
      });
      playSfxBatch(deathSfx, abilitySfxByPhase.death);
    };

    const phaseSummons = () => {
      set({
        gameState: preDrawState,
        ...(staggeredTriggerEvents.length > 0 ? { damageEvents: staggeredTriggerEvents } : {}),
        ...(cycleEvent ? { cycleEternelEvent: cycleEvent } : {}),
        ...(compagnonsEvent ? { compagnonsEvent } : {}),
        // FX: the new creatures mount in this same render — the Canvas layer
        // resolves each one's position from the DOM and bursts a portal there.
        // On EXCLUT les invocations de la vague de pouvoir (déjà portées à
        // phasePowerImpacts) : les réémettre ici ferait un second portail après
        // que la couche FX ait purgé le premier (signature réinitialisée).
        ...(lateSummonIds.length > 0 ? { summonEvents: lateSummonIds } : {}),
      });
      // Son d'invocation seulement pour les invocations tardives — celles de la
      // vague de pouvoir l'ont déjà joué à phasePowerImpacts.
      if (lateSummonIds.length > 0) playSfxBatch(summonSfx);
    };

    const phaseDiscard = () => {
      // Surface the forced-discard popup just before the draw phase so the
      // player sees what was discarded by Combustion (or future similar
      // effects) before the new cards arrive.
      if (discardFromHandEvent) set({ discardFromHandEvent });
    };

    const phaseCostDiscard = () => {
      // Cost discards reuse the same popup as effect discards but fire at
      // the very start, before the spell overlay, so the discarded card
      // reads as a prerequisite of the cast (which it is, in the engine).
      if (costDiscardEvent) set({ discardFromHandEvent: costDiscardEvent });
      // L'exil est un COÛT lui aussi : il se paie avant que la carte n'agisse,
      // et la déchirure doit donc précéder l'overlay du sort.
      // Le REPLI est un coût du même rang : la carte remonte sur la pile avant
      // que celle qu'on paie ne parte. Pas de son dédié — le geste est discret,
      // là où l'exil déchire.
      if (topdeckCostEvent) set({ topdeckCostEvent });
      if (eveilEvent) set({ eveilEvent });
      if (exileCostEvent) {
        set({ exileCostEvent });
        // Son propre à la carte, repli sur le son global `exile_cost` — même
        // priorité que le son de pose (`cardSfxUrl || standardSfxUrls[type]`).
        playSfxBatch([{ type: "exile_cost", cardSfxUrl: exileCostEvent.sfxUrl ?? undefined }]);
      }
    };

    const phaseDraws = () => {
      // Avec une frontière de pioche, on s'arrête à l'instant où la carte entre
      // en main : son effet n'a pas encore frappé, et c'est la vague suivante
      // qui le montrera. Sans frontière, rien ne change.
      set({ gameState: etatAvantPioche });
      playSfxBatch(drawSfx);
    };

    const phaseFinalize = () => {
      // Landing state when we skipped summons+draws.
      set({
        gameState: preDrawState,
        ...(staggeredTriggerEvents.length > 0 ? { damageEvents: staggeredTriggerEvents } : {}),
        ...(cycleEvent ? { cycleEternelEvent: cycleEvent } : {}),
        ...(compagnonsEvent ? { compagnonsEvent } : {}),
      });
    };

    const phaseUnlock = () => {
      set({ isAnimating: false });
      // Draine la file des actions reçues pendant l'animation. Chaque dispatch
      // peut emprunter le « slow path » (qui repasse isAnimating à true et
      // re-drainera via SON propre phaseUnlock — on s'arrête alors ici) ou le
      // « fast path » (commit synchrone sans animation : isAnimating reste
      // false). Avant, on ne dépilait qu'UNE action puis on faisait return ;
      // si c'était une action rapide, la suite de la file restait bloquée
      // jusqu'à la prochaine action animée — et comme lastSeqRef a déjà avancé
      // côté page à la mise en file, ces actions n'étaient jamais re-récupérées
      // par le gap-recovery → désync permanente. On boucle donc tant que la
      // file n'est pas vide et qu'aucune animation n'a redémarré.
      while (get().pendingIncomingActions.length > 0 && !get().isAnimating) {
        const [next, ...rest] = get().pendingIncomingActions;
        set({ pendingIncomingActions: rest });
        get().dispatchAction(next);
      }
      // Une action a relancé une animation : son phaseUnlock poursuivra le drain.
      if (get().isAnimating) return;
      // Plus d'action en file : si la dernière action a créé un déclencheur
      // interactif en attente pour le joueur local, on entre le mode de ciblage.
      set(pendingTriggerOverlay(get().gameState, get().localPlayerId));
    };

    // --- Schedule the sequence ---
    let cursor = 0;
    // Wave 1 (on-attack power) — plays BEFORE the attack lunge/combat: the
    // power's damage popups, then its deaths, so the player sees the power
    // resolve fully before combat.
    //
    // EXCEPTION — un pouvoir « à l'attaque » qui RETIRE L'ATTAQUANT lui-même
    // (« Se renvoie en main » de la Louve kiptchake). Jouer la vague d'abord
    // effaçait l'attaquant du plateau AVANT son assaut : on la voyait repartir en
    // main, puis un lunge sans personne pour le porter. L'assaut passe donc en
    // premier, et le retrait le suit — l'ordre que le joueur attend.
    const attaquantSeRetire = action.type === "attack"
      && attackerRemovedItself(onAttackWave?.intermediate, action.attackerInstanceId);

    if (onAttackWave && !attaquantSeRetire) {
      phasePowerImpacts(); // t=0
      cursor += IMPACT_MS;
      if (powerHasDeaths) {
        setTimeout(phasePowerDeaths, cursor);
        cursor += DEATH_MS;
      }
    }
    // Phase 0 (Cost discard) — runs before the overlay so the discarded
    // card reads as a paid prerequisite, not a consequence of the spell.
    if (costDiscardEvent || exileCostEvent || topdeckCostEvent || eveilEvent) {
      if (cursor === 0) phaseCostDiscard();
      else setTimeout(phaseCostDiscard, cursor);
      cursor += COST_DISCARD_MS;
    }
    // Phase A (Overlay) — fires at t=cursor (0 if no power wave / cost discard).
    const overlayAt = cursor;
    if (cursor === 0) phaseOverlay();
    else setTimeout(phaseOverlay, cursor);

    // Fin de tour : révèle les flèches de pouvoir une par une, gauche→droite.
    // Émission CUMULATIVE avec le MÊME timestamp que powerArrowEvent : le
    // composant ne remonte pas (clé = timestamp), donc chaque flèche ajoutée
    // apparaît sans re-fondu de l'ensemble et reste visible pendant que la
    // suivante arrive. Cadence alignée sur celle des popups (STAGGER_MS) pour
    // que chaque flèche précède son dégât du même délai (POWER_ARROW_PRE_IMPACT_MS).
    if (staggerEndTurnArrows && powerArrowEvent) {
      const groups = powerArrowEvent.arrows;
      const ts = powerArrowEvent.timestamp;
      for (let i = 0; i < groups.length; i++) {
        const cumulative = { arrows: groups.slice(0, i + 1), timestamp: ts };
        const at = overlayAt + i * STAGGER_MS;
        if (at === 0) set({ powerArrowEvent: cumulative });
        else setTimeout(() => set({ powerArrowEvent: cumulative }), at);
      }
    }

    // Un sort laisse plus de temps avant l'impact que les autres overlays : il y
    // a un texte d'effet à lire. Pouvoir de héros / souffle de feu gardent leur
    // cadence d'origine (rien à lire, un ralentissement les rendrait mous).
    if (spellEvent) cursor += OVERLAY.spell.preImpactMs;
    else if (hasOverlay) cursor += OVERLAY_PRE_IMPACT_MS;
    else if (isAttack) cursor += ATTACK_LUNGE_PRE_IMPACT_MS;
    else if (powerArrowEvent) cursor += POWER_ARROW_PRE_IMPACT_MS;

    // Vague de pouvoir DIFFÉRÉE : l'attaquant s'est retiré lui-même, on a laissé
    // son assaut se jouer d'abord (cf. l'exception plus haut). Le retrait tombe
    // maintenant, juste après le lunge.
    if (attaquantSeRetire) {
      setTimeout(phasePowerImpacts, cursor);
      cursor += IMPACT_MS;
      if (powerHasDeaths) {
        setTimeout(phasePowerDeaths, cursor);
        cursor += DEATH_MS;
      }
    }

    // Recast spell overlays must appear BEFORE phaseImpacts so each
    // recasted spell is shown casting *before* its (already-applied)
    // damage paints. Without this re-order, recast HP changes landed at
    // OVERLAY_PRE_IMPACT_MS while the recast spell visuals only played
    // out at the tail of the sequence — visually disconnected.
    // Les révélations « à la pioche » suivent la même règle et pour la même
    // raison : la carte doit être lue AVANT que son effet ne peigne ses dégâts.
    // Elles passent après les relances (aucune action ne produit les deux
    // aujourd'hui, mais l'ordre reste défini si cela arrivait).
    // Une frontière de pioche déplace ces révélations APRÈS la pioche (voir la
    // fin de la séquence) : les annoncer ici les ferait passer devant des dégâts
    // qui leur sont antérieurs — le défaut signalé en partie.
    const revelationsAvantImpacts = drawWave ? recastSpells : [...recastSpells, ...drawTriggerSpells];
    for (const reveal of revelationsAvantImpacts) {
      setTimeout(() => set({ spellCastEvent: reveal }), cursor);
      cursor += RECAST_GAP_MS;
    }

    // Phase B (Impacts) — always run if there's anything beyond the overlay.
    setTimeout(phaseImpacts, cursor);
    cursor += IMPACT_MS + FUREUR_PHASE_EXTRA_MS + SEQ_PHASE_EXTRA_MS;

    if (hasDeaths) {
      setTimeout(phaseDeaths, cursor);
      cursor += DEATH_MS;
    }

    // INTERVALLES ANTÉRIEURS À LA PIOCHE, dans l'ordre où le moteur les a
    // franchis : râles d'agonie (leurs dégâts tombent après l'animation de mort
    // qui les déclenche — le son du râle était déjà joué là, les deux moitiés du
    // même effet se rejoignent enfin) et effets successifs d'un sort multiple
    // (« Tempête 3 se résout entièrement avant Déchainement »).
    for (const v of vaguesAvantPioche) cursor = programmerVague(v, cursor);

    if (hasSummons) {
      setTimeout(phaseSummons, cursor);
      cursor += SUMMON_MS;
    } else if (!hasDraws) {
      // No summons and no draws — commit the pre-draw state (= final state)
      // so faction pool and buff deltas land.
      setTimeout(phaseFinalize, cursor);
      cursor += 50;
    } else {
      // Draws but no summons: still need to land on preDrawState first so the
      // draw phase has a correct pre-state.
      setTimeout(phaseFinalize, cursor);
      cursor += 50;
    }

    if (discardFromHandEvent) {
      setTimeout(phaseDiscard, cursor);
      cursor += DISCARD_MS;
    }

    if (hasDraws) {
      setTimeout(phaseDraws, cursor);
      cursor += DRAW_MS;
    }

    // --- Ce que l'effet « à la pioche » a provoqué ---------------------------
    //
    // Enfin dans l'ordre où le moteur l'a vécu : la carte est arrivée en main
    // (phase ci-dessus), elle se révèle, puis ses dégâts et ses morts tombent.
    if (drawWave) {
      for (const reveal of drawTriggerSpells) {
        setTimeout(() => set({ spellCastEvent: reveal }), cursor);
        cursor += RECAST_GAP_MS;
      }
      const avant = cursor;
      for (const v of vaguesDepuisPioche) cursor = programmerVague(v, cursor);
      // Effet sans dégât ni mort : rien n'a été programmé, mais l'écran est
      // resté sur la frontière — on engage l'état final.
      if (cursor === avant) {
        setTimeout(() => set({ gameState: newState }), cursor);
        cursor += 50;
      }
    }

    // Badge des effets « deck » (Préincanter / Fortifier). Phase PROPRE, et non
    // greffée sur la pioche : `phaseDraws` ne tourne que s'il y a une carte
    // piochée, si bien que le badge ne s'affichait QUE dans ce cas — jamais sur
    // un pouvoir de héros, ni sur une simple pose de créature à Fortifier.
    // Placé après la pioche quand il y en a une, pour que la pile ait déjà bougé.
    if (deckEffectEvent) {
      setTimeout(() => set({ deckEffectEvent }), cursor);
      cursor += 120;
    }

    setTimeout(phaseUnlock, cursor);

    return action;
  },

  playCardDirect: (instanceId, boardPosition) => {
    const { gameState } = get();
    if (!gameState) return null;
    // Table des réponses de deck REMISE À ZÉRO : une pose abandonnée en cours
    // de modale (annulation, carte injouable) laisserait sinon ses choix en
    // place, et la pose suivante croirait avoir déjà répondu.
    set({ collectedDeckChoices: {}, deckPickerKeyword: null });
    const joueurCourant = gameState.players[gameState.currentPlayerIndex];
    // Même dérogation qu'au-dessus pour un sort MÉMORISÉ.
    const apprenanteDirecte = apprenanteDuSort(joueurCourant, instanceId);
    // Même dérogation pour une carte en ÉVEIL (cf. selectCardInHand).
    const enEveilDirect = entreeEnEveil(joueurCourant, instanceId);
    if (apprenanteDirecte
      ? !creatureCanCastLearnedSpell(gameState, apprenanteDirecte.instanceId)
      : enEveilDirect
        ? !canPayEveil(gameState, instanceId)
        : !canPlayCard(gameState, instanceId)) return null;

    const player = gameState.players[gameState.currentPlayerIndex];
    const card = carteJouable(player, instanceId);
    // Alternative-cost gating: if the card requires discards, sacrifices or
    // replis, open the cost-payment flow first. Targeting (creature/graveyard/
    // etc.) resumes after confirmCostPayment.
    if (card) {
      const discardNeeded = getDiscardCost(card.card);
      const sacrificeNeeded = getSacrificeCost(card.card);
      const topdeckNeeded = getTopdeckCost(card.card);
      if (discardNeeded > 0 || sacrificeNeeded > 0 || topdeckNeeded > 0) {
        set({
          targetingMode: "cost_payment",
          pendingCostCard: { instanceId, discardNeeded, sacrificeNeeded, topdeckNeeded, boardPosition: boardPosition ?? null },
          selectedDiscardIds: [],
          selectedSacrificeIds: [],
          selectedTopdeckIds: [],
          selectedCardInstanceId: instanceId,
        });
        return null;
      }
    }
    if (card && creatureNeedsTarget(card.card)) {
      const targets = getCreatureTargets(gameState, card.card);
      if (targets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: targets,
          targetingMode: "creature",
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    // Exhumation composée à l'entrée (picker cimetière). Placé AVANT le bloc
    // mot-clé ci-dessous pour ne pas interférer avec rappel/heritage/exhumation
    // mot-clé (qui passent par graveyardTargetInstanceId).
    if (card && creatureNeedsComposedGraveyardTarget(card.card)) {
      const choice = getCreatureComposedGraveyardChoice(card.card)!;
      const gravTargets = getComposedGraveyardTargets(gameState, card.card, choice.uid);
      if (gravTargets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: gravTargets,
          targetingMode: "graveyard",
          pendingBoardPosition: boardPosition ?? null,
          creatureComposedCollected: [],
          pendingComposedGraveyard: {
            // Côté créature, le moteur ne remonte que la PREMIÈRE capacité
            // composée « au choix » (firstOnPlayComposedChoiceCap) : la file
            // n'a donc qu'un élément ici. Cf. getCreatureComposedGraveyardChoice.
            caps: [{ uid: choice.uid, count: Math.min(choice.count, gravTargets.length) }],
            capIndex: 0,
            picked: {},
            context: "creature",
          },
        });
        return null;
      }
    }

    if (card && creatureNeedsGraveyardTarget(card.card)) {
      const gravTargets = getGraveyardTargets(gameState, card.card);
      if (gravTargets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: gravTargets,
          targetingMode: "graveyard",
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    // MODALES DE DECK (Divination / Creuser / Présage), dans l'ordre d'auteur.
    if (card && openNextDeckPicker(gameState, card.card, instanceId, player.deck, {
      boardPosition: boardPosition ?? null,
    })) {
      return null;
    }

    if (card && creatureNeedsTraqueDuDestin(card.card)) {
      const x = getTraqueDuDestinX(card.card);
      const deckCards = player.deck.slice(0, Math.min(x, player.deck.length));
      if (deckCards.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: deckCards,
          deckPickerOrder: null,
        learnPickerFor: null,
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    if (card && creatureNeedsSelection(card.card)) {
      const selXVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = selXVals["selection"] ?? 0;
      const choices = getSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    if (card && creatureNeedsRenfortRoyal(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["renfort_royal"] ?? 0;
      const choices = getRenfortRoyalCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    if (card && creatureNeedsMagicalSelection(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["selection_magique"] ?? 0;
      const choices = getMagicalSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    return get().dispatchAction({
      type: "play_card",
      cardInstanceId: instanceId,
      boardPosition,
    });
  },

  suspendToEveil: (instanceId) => {
    const { gameState } = get();
    if (!gameState) return null;
    if (!canSuspendToEveil(gameState, instanceId)) return null;
    return get().dispatchAction({ type: "suspend_eveil", cardInstanceId: instanceId });
  },

  payEveilPoint: (instanceId, amount = 1) => {
    const { gameState } = get();
    if (!gameState) return null;
    const player = gameState.players[gameState.currentPlayerIndex];
    const entree = (player.eveil ?? []).find(e => e.instance.instanceId === instanceId);
    if (!entree) return null;
    if (!canPayEveil(gameState, instanceId)) return null;
    // DERNIER point : ce n'est plus un versement, c'est une entrée en jeu. On
    // délègue à `selectCardInHand` — exactement ce qu'a fait Apprentissage avec
    // `activateLearnedSpell` : toute la chaîne coûts additionnels → pickers de
    // ciblage → envoi de l'action est réutilisée telle quelle, et `carteJouable`
    // sait désormais trouver la carte dans la zone d'éveil.
    if (entree.remaining === 1) return get().selectCardInHand(instanceId);
    // Montant borné par la MÊME source que le moteur : un bouton qui demanderait
    // plus que le maximum serait refusé en silence.
    const montant = Math.min(amount, maxEveilPayment(gameState, instanceId));
    if (montant < 1) return null;
    return get().dispatchAction({ type: "pay_eveil", cardInstanceId: instanceId, amount: montant });
  },

  selectCardInHand: (instanceId, opts) => {
    const { gameState } = get();
    if (!gameState) return null;

    // Toutes les feuilles « rien à réclamer, on joue » passent par ici. Sous
    // `ciblageSeulement`, elles s'arrêtent : le simple clic d'un sort à cible
    // ne doit JAMAIS lancer, y compris dans les cas où la cascade retombe sur
    // un lancer direct (aucun slot sélectionnable, plus aucune cible éligible).
    // Un seul point de sortie plutôt qu'un test à chaque feuille : c'est ce qui
    // garantit qu'une feuille ajoutée plus tard ne rouvre pas le trou.
    const jouerMaintenant = (): GameAction | null =>
      opts?.ciblageSeulement
        ? null
        : get().dispatchAction({ type: "play_card", cardInstanceId: instanceId });

    const player = gameState.players[gameState.currentPlayerIndex];
    const card = carteJouable(player, instanceId);
    if (!card) return null;

    // APPRENTISSAGE : un sort mémorisé n'est pas en main, `canPlayCard` le
    // déclarerait donc injouable. Son pendant vérifie les mêmes coûts PLUS les
    // gardes d'activation de la créature (engagée, paralysée, mal d'invocation).
    const apprenanteIci = apprenanteDuSort(player, instanceId);
    // ÉVEIL : la carte n'est pas en main non plus, `canPlayCard` la déclarerait
    // injouable. Son pendant vérifie le DERNIER point (1 mana) et la
    // faisabilité de l'arrivée — plateau, cibles, coûts additionnels.
    const enEveilIci = entreeEnEveil(player, instanceId);
    if (apprenanteIci
      ? !creatureCanCastLearnedSpell(gameState, apprenanteIci.instanceId)
      : enEveilIci
        ? !canPayEveil(gameState, instanceId)
        : !canPlayCard(gameState, instanceId)) return null;

    // Alternative-cost gating — see playCardDirect for the same pattern.
    {
      const discardNeeded = getDiscardCost(card.card);
      const sacrificeNeeded = getSacrificeCost(card.card);
      const topdeckNeeded = getTopdeckCost(card.card);
      if (discardNeeded > 0 || sacrificeNeeded > 0 || topdeckNeeded > 0) {
        set({
          targetingMode: "cost_payment",
          pendingCostCard: { instanceId, discardNeeded, sacrificeNeeded, topdeckNeeded, boardPosition: null },
          selectedDiscardIds: [],
          selectedSacrificeIds: [],
          selectedTopdeckIds: [],
          selectedCardInstanceId: instanceId,
        });
        return null;
      }
    }

    // Check if creature needs a target
    if (card.card.card_type === "creature" && creatureNeedsTarget(card.card)) {
      const targets = getCreatureTargets(gameState, card.card);
      if (targets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: targets,
          targetingMode: "creature",
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs graveyard target
    if (card.card.card_type === "creature" && creatureNeedsGraveyardTarget(card.card)) {
      const gravTargets = getGraveyardTargets(gameState, card.card);
      if (gravTargets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: gravTargets,
          targetingMode: "graveyard",
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // MODALES DE DECK, dans l'ordre d'auteur.
    //
    // Sauf sur un SORT qui réclame AUSSI une cible : ouvrir ces modales d'abord
    // court-circuitait la collecte de cible, et l'autre effet partait sans la
    // sienne — « Corde tendue » (Impact 2 + Creuser 3) ne proposait jamais de
    // cibler son Impact, qui ne faisait donc rien, en silence. Dans ce cas la
    // cible est collectée par le bloc de ciblage plus bas, puis ces mêmes
    // modales sont ouvertes depuis `selectTarget` via `openDeckPickerIfNeeded`.
    const deckApresCiblage = card.card.card_type === "spell" && needsTarget(card.card);
    if (!deckApresCiblage && openNextDeckPicker(gameState, card.card, instanceId, player.deck, {
      boardPosition: null,
    })) {
      return null;
    }

    // APPRENTISSAGE : la modale sert ici à choisir un sort de la MAIN à
    // mémoriser. `learnPickerFor` la distingue des pickers de DECK, qui
    // partagent le même mode d'affichage.
    if (creatureNeedsApprentissage(card.card)) {
      const sorts = handSpellsFor(player);
      if (sorts.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: sorts,
          deckPickerOrder: null,
          learnPickerFor: instanceId,
          pendingBoardPosition: null,
        });
        return null;
      }
      // Aucun sort en main : on pose la créature sans rien apprendre.
    }

    // Check if creature needs Traque du destin pick (reuses the divination
    // picker UI; the engine branches on the keyword).
    if (card.card.card_type === "creature" && creatureNeedsTraqueDuDestin(card.card)) {
      const x = getTraqueDuDestinX(card.card);
      const deckCards = player.deck.slice(0, Math.min(x, player.deck.length));
      if (deckCards.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: deckCards,
          deckPickerOrder: null,
        learnPickerFor: null,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs selection
    if (card.card.card_type === "creature" && creatureNeedsSelection(card.card)) {
      const selXVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = selXVals["selection"] ?? 0;
      const choices = getSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs renfort_royal
    if (card.card.card_type === "creature" && creatureNeedsRenfortRoyal(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["renfort_royal"] ?? 0;
      const choices = getRenfortRoyalCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs selection_magique
    if (card.card.card_type === "creature" && creatureNeedsMagicalSelection(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["selection_magique"] ?? 0;
      const choices = getMagicalSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if spell needs a target (new multi-target system) — runs BEFORE
    // the selection-style pickers below so that on a spell carrying both a
    // needs-target keyword (e.g. Renforcement) and a card picker (e.g.
    // Sélection magique), the target is collected first. The picker is
    // then opened from selectTarget once all targets are in, carrying the
    // collected targetMap into the final dispatch.
    if (card.card.card_type === "spell" && needsTarget(card.card)) {
      const slots = getSpellTargetSlots(card.card);
      const selectableSlots = slots.filter(s =>
        s.type === "any" || s.type === "any_creature"
        || s.type === "friendly_creature" || s.type === "enemy_creature"
        || s.type === "friendly_graveyard" || s.type === "friendly_graveyard_to_board"
      );

      if (selectableSlots.length === 0) {
        // No player selection needed — play directly
        return jouerMaintenant();
      }

      const firstSlot = selectableSlots[0];

      // Graveyard-targeting spell keywords
      if (firstSlot.type === "friendly_graveyard" || firstSlot.type === "friendly_graveyard_to_board") {
        // Slot composé (clé `${uid}#i`) → exhumation composée : provider filtré
        // par coût + flag de dispatch. Distinct des slots mot-clé `kw_N`.
        if (firstSlot.slot.includes("#")) {
          // File de TOUTES les capacités composées à cible cimetière, dans
          // l'ordre des slots (donc l'ordre des capacités, cf.
          // getSpellTargetSlots). Chacune a son propre lot de slots `${uid}#i`,
          // donc son propre nombre de cibles à choisir.
          const uids: string[] = [];
          for (const s of selectableSlots) {
            if (s.type !== "friendly_graveyard" && s.type !== "friendly_graveyard_to_board") continue;
            if (!s.slot.includes("#")) continue;
            const u = s.slot.split("#")[0];
            if (!uids.includes(u)) uids.push(u);
          }
          const caps = uids
            .map(u => ({
              uid: u,
              // Nombre de cibles = count configuré (nb de slots `${u}#i`), borné
              // par les créatures éligibles disponibles (« jusqu'à N »).
              count: Math.min(
                selectableSlots.filter(s => s.slot.startsWith(`${u}#`)).length,
                getComposedGraveyardTargets(gameState, card.card, u).length,
              ),
            }))
            .filter(c => c.count > 0);
          const firstTargets = caps.length > 0 ? getComposedGraveyardTargets(gameState, card.card, caps[0].uid) : [];
          if (caps.length > 0 && firstTargets.length > 0) {
            set({
              selectedCardInstanceId: instanceId,
              selectedAttackerInstanceId: null,
              validTargets: firstTargets,
              targetingMode: "graveyard",
              creatureComposedCollected: [],
              pendingComposedGraveyard: { caps, capIndex: 0, picked: {}, context: "spell" },
            });
            return null;
          }
          // Aucune créature éligible → joue sans effet.
          return jouerMaintenant();
        }
        const kwIndex = parseInt(firstSlot.slot.replace("kw_", ""));
        const gravTargets = getSpellGraveyardTargets(gameState, card.card, kwIndex);
        if (gravTargets.length > 0) {
          set({
            selectedCardInstanceId: instanceId,
            selectedAttackerInstanceId: null,
            validTargets: gravTargets,
            targetingMode: "graveyard",
            spellTargetSlots: selectableSlots,
            currentTargetSlotIndex: 0,
            collectedTargetMap: {},
          });
          return null;
        }
        // No valid graveyard targets — play without effect
        return jouerMaintenant();
      }

      const targets = getSpellSlotTargets(gameState, card.card, firstSlot);

      // Aucune cible éligible (ex. un don « à une créature alliée » avec un
      // plateau vide) : on ne DOIT PAS entrer en mode ciblage, sinon la flèche
      // s'affiche, rien n'est cliquable, et le joueur reste bloqué jusqu'à
      // « Annuler le ciblage ». Même repli que les branches cimetière
      // ci-dessus : la carte se joue, les effets sans cible se résolvent.
      if (targets.length === 0) {
        return jouerMaintenant();
      }

      if (selectableSlots.length === 1) {
        // Single target — simple flow
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: targets,
          targetingMode: "spell",
          spellTargetSlots: selectableSlots,
          currentTargetSlotIndex: 0,
          collectedTargetMap: {},
        });
        return null;
      }

      // Multi-target — sequential selection
      set({
        selectedCardInstanceId: instanceId,
        selectedAttackerInstanceId: null,
        validTargets: targets,
        targetingMode: "spell_multi",
        spellTargetSlots: selectableSlots,
        currentTargetSlotIndex: 0,
        collectedTargetMap: {},
      });
      return null;
    }

    // Selection-style pickers — only reachable when the spell has no
    // needs-target keyword (the block above returned null in that case).
    // Spells with BOTH a needs-target keyword AND a picker route here via
    // selectTarget once targeting is done, carrying the collected map.

    if (card.card.card_type === "spell" && card.card.spell_keywords?.some(kw => kw.id === "selection")) {
      const selKw = card.card.spell_keywords!.find(kw => kw.id === "selection")!;
      const x = selKw.amount ?? 0;
      const choices = getSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    if (card.card.card_type === "spell" && card.card.spell_keywords?.some(kw => kw.id === "selection_magique")) {
      const smKw = card.card.spell_keywords!.find(kw => kw.id === "selection_magique")!;
      const x = smKw.amount ?? 0;
      const choices = getMagicalSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    if (card.card.card_type === "spell" && card.card.spell_keywords?.some(kw => kw.id === "renfort_royal")) {
      const rrKw = card.card.spell_keywords!.find(kw => kw.id === "renfort_royal")!;
      const x = rrKw.amount ?? 0;
      const choices = getRenfortRoyalCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Play immediately (no targeting needed)
    return jouerMaintenant();
  },

  selectAttacker: (instanceId) => {
    const { gameState } = get();
    if (!gameState) return;

    if (!canAttack(gameState, instanceId)) return;

    const targets = getValidTargets(gameState, instanceId);
    set({
      selectedAttackerInstanceId: instanceId,
      selectedCardInstanceId: null,
      validTargets: targets,
      targetingMode: "attack",
    });
  },

  selectTarget: (targetId) => {
    const {
      targetingMode,
      selectedAttackerInstanceId,
      selectedCardInstanceId,
      pendingComposedGraveyard,
    } = get();

    if (targetingMode === "attack" && selectedAttackerInstanceId) {
      // Defender chosen. If the attacker carries an "à l'attaque" composed
      // power with player-chosen targets, collect those next (carried in the
      // same attack action) before dispatching. Otherwise dispatch now.
      const gs = get().gameState;
      const attacker = gs?.players[gs.currentPlayerIndex].board.find(c => c.instanceId === selectedAttackerInstanceId);
      const powerChoice = attacker ? getOnAttackComposedChoice(attacker.card) : null;
      if (gs && attacker && powerChoice) {
        set({
          pendingAttackDefenderId: targetId,
          targetingMode: "attack_power",
          attackPowerCollected: [],
          validTargets: getOnAttackTargets(gs, attacker.card),
        });
        return null;
      }
      return get().dispatchAction({
        type: "attack",
        attackerInstanceId: selectedAttackerInstanceId,
        targetInstanceId: targetId,
      });
    } else if (targetingMode === "attack_power" && selectedAttackerInstanceId) {
      // Collecting the on-attack power's target(s). When complete, dispatch the
      // attack carrying both the defender and the power's targetMap.
      const { pendingAttackDefenderId, gameState: gs } = get();
      const attacker = gs?.players[gs.currentPlayerIndex].board.find(c => c.instanceId === selectedAttackerInstanceId);
      const powerChoice = attacker ? getOnAttackComposedChoice(attacker.card) : null;
      if (!gs || !attacker || !powerChoice || pendingAttackDefenderId == null) {
        set({ targetingMode: "none", validTargets: [], pendingAttackDefenderId: null, attackPowerCollected: [] });
        return null;
      }
      const collected = [...get().attackPowerCollected, targetId];
      if (collected.length < powerChoice.count) {
        set({
          attackPowerCollected: collected,
          validTargets: get().validTargets.filter(t => t !== targetId),
        });
        return null; // continue collecting
      }
      const targetMap: Record<string, string> = {};
      collected.forEach((id, i) => { targetMap[`${powerChoice.uid}#${i}`] = id; });
      set({ pendingAttackDefenderId: null, attackPowerCollected: [] });
      return get().dispatchAction({
        type: "attack",
        attackerInstanceId: selectedAttackerInstanceId,
        targetInstanceId: pendingAttackDefenderId,
        targetMap,
      });
    } else if (targetingMode === "spell" && selectedCardInstanceId) {
      const { spellTargetSlots, currentTargetSlotIndex, collectedTargetMap, gameState: gs } = get();
      // Use the CURRENT slot (not always the first) and carry forward targets
      // already collected for earlier slots. A multi-target spell whose last
      // slot resolves in "spell" mode (e.g. Rappel des Tempêtes : Exhumation
      // kw_0 puis Remontée kw_1) otherwise lost its kw_0 graveyard target and
      // mis-keyed the final one onto kw_0 — silently dropping the resurrection.
      const currentSlot = spellTargetSlots[currentTargetSlotIndex] ?? spellTargetSlots[0];
      const slot = currentSlot?.slot ?? "target_0";
      const collectedMap = { ...collectedTargetMap, [slot]: targetId };
      // Chain into a selection-style picker if the spell carries one (e.g.
      // Souffle des Origines: Renforcement targets first, then the
      // Sélection magique picker, with the kw_0 target carried forward).
      if (gs && openSelectionPickerIfNeeded(gs, selectedCardInstanceId, collectedMap)) {
        return null;
      }
      // Picker de DECK (Creuser) : même chaînage, cibles emportées.
      if (gs && openDeckPickerIfNeeded(gs, selectedCardInstanceId, collectedMap)) {
        return null;
      }
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        targetMap: collectedMap,
      });
    } else if (targetingMode === "spell_multi" && selectedCardInstanceId) {
      const { spellTargetSlots, currentTargetSlotIndex, collectedTargetMap, gameState: gs } = get();
      const currentSlot = spellTargetSlots[currentTargetSlotIndex];
      const newMap = { ...collectedTargetMap, [currentSlot.slot]: targetId };
      const nextIndex = currentTargetSlotIndex + 1;

      if (nextIndex >= spellTargetSlots.length) {
        if (gs && openSelectionPickerIfNeeded(gs, selectedCardInstanceId, newMap)) {
          return null;
        }
        if (gs && openDeckPickerIfNeeded(gs, selectedCardInstanceId, newMap)) {
          return null;
        }
        return get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: newMap,
        });
      } else {
        const nextSlot = spellTargetSlots[nextIndex];
        const card = gs ? carteJouable(gs.players[gs.currentPlayerIndex], selectedCardInstanceId) : undefined;
        // If the next slot targets a graveyard, switch to graveyard mode
        // so the UI surfaces the cimetière picker instead of board targets.
        if (nextSlot.type === "friendly_graveyard" || nextSlot.type === "friendly_graveyard_to_board") {
          const kwIndex = parseInt(nextSlot.slot.replace("kw_", ""));
          const nextTargets = (card && gs) ? getSpellGraveyardTargets(gs, card.card, kwIndex) : [];
          set({
            validTargets: nextTargets,
            currentTargetSlotIndex: nextIndex,
            collectedTargetMap: newMap,
            targetingMode: "graveyard",
          });
          return null;
        }
        const nextTargets = card ? getSpellSlotTargets(gs!, card.card, nextSlot) : [];
        set({
          validTargets: nextTargets,
          currentTargetSlotIndex: nextIndex,
          collectedTargetMap: newMap,
        });
        return null; // not dispatched yet, still collecting targets
      }
    } else if (targetingMode === "creature" && selectedCardInstanceId) {
      const { pendingBoardPosition, gameState: gs } = get();

      // Effet composé multi-cibles "au choix" : on collecte N cibles avant de jouer.
      if (gs) {
        const player0 = gs.players[gs.currentPlayerIndex];
        const cardInst0 = carteJouable(player0, selectedCardInstanceId);
        const choice = cardInst0 ? getCreatureComposedChoice(cardInst0.card) : null;
        if (choice && choice.count >= 2) {
          const collected = [...get().creatureComposedCollected, targetId];
          if (collected.length < choice.count) {
            set({
              creatureComposedCollected: collected,
              validTargets: get().validTargets.filter(t => t !== targetId),
            });
            return null; // on continue à collecter
          }
          const targetMap: Record<string, string> = {};
          collected.forEach((id, i) => { targetMap[`${choice.uid}#${i}`] = id; });
          set({ creatureComposedCollected: [] });
          return get().dispatchAction({
            type: "play_card",
            cardInstanceId: selectedCardInstanceId,
            targetMap,
            boardPosition: pendingBoardPosition ?? undefined,
          });
        }
      }

      if (gs) {
        const player = gs.players[gs.currentPlayerIndex];
        const cardInst = carteJouable(player, selectedCardInstanceId);
        if (cardInst && cardInst.card.keywords.includes("tactique" as import("@/lib/game/types").Keyword)) {
          const grantable = cardInst.card.keywords.filter(kw => kw !== "tactique");
          const x = Math.max(1, Math.floor(cardInst.card.mana_cost / 3));
          set({
            targetingMode: "tactique_keywords",
            pendingTargetInstanceId: targetId,
            tactiqueAvailableKeywords: grantable,
            tactiqueMaxSelections: Math.min(x, grantable.length),
            validTargets: [],
          });
          return null; // waiting for keyword selection
        }
      }

      // Chain into a creature-side selection picker if the same creature
      // also carries selection / selection_magique / renfort_royal.
      if (gs && openCreaturePickerIfNeeded(gs, selectedCardInstanceId, {
        targetInstanceId: targetId,
        boardPosition: pendingBoardPosition,
      })) {
        return null;
      }

      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        targetInstanceId: targetId,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "tactique_keywords" && selectedCardInstanceId) {
      const { pendingBoardPosition, pendingTargetInstanceId } = get();
      const keywords = JSON.parse(targetId) as import("@/lib/game/types").Keyword[];
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        targetInstanceId: pendingTargetInstanceId ?? undefined,
        tactiqueKeywords: keywords,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "graveyard" && pendingComposedGraveyard) {
      // Exhumation composée (multi-cible possible) : on COLLECTE jusqu'à `count`
      // créatures du cimetière (chacune retirée des cibles restantes), puis on
      // les keye sur les slots composés `${uid}#i` et on DIFFUSE l'action
      // (déterminisme multijoueur), comme tout autre pick composé. Précède la
      // logique mot-clé ci-dessous (kw_ / creature graveyardTargetInstanceId),
      // qui ne s'exécute que si le flag est null → garde de non-régression.
      // Couvre aussi le pouvoir de héros (selectedCardInstanceId null), que la
      // branche suivante n'atteindrait pas.
      const { caps, capIndex, picked, context } = pendingComposedGraveyard;
      const currentCap = caps[capIndex];
      const collected = [...get().creatureComposedCollected, targetId];
      if (collected.length < currentCap.count) {
        set({
          creatureComposedCollected: collected,
          validTargets: get().validTargets.filter(t => t !== targetId), // pas de double-pick
        });
        return null; // on continue à collecter pour CETTE capacité
      }
      const nextPicked = { ...picked, [currentCap.uid]: collected };

      // Capacité suivante qui a encore de quoi choisir. Un cadavre déjà retenu
      // est exclu de TOUTES les capacités suivantes : il ne quittera le
      // cimetière qu'à la résolution, donc rien côté état ne l'empêcherait
      // d'être proposé — et donc « ressuscité » deux fois — sans ce filtre.
      const alreadyPicked = new Set(Object.values(nextPicked).flat());
      const gsNow = get().gameState;
      const selCard = gsNow?.players[gsNow.currentPlayerIndex].hand
        .find(c => c.instanceId === get().selectedCardInstanceId);
      for (let j = capIndex + 1; j < caps.length; j++) {
        const pool = (gsNow && selCard)
          ? getComposedGraveyardTargets(gsNow, selCard.card, caps[j].uid).filter(id => !alreadyPicked.has(id))
          : [];
        if (pool.length === 0) continue; // plus rien d'éligible → capacité sautée
        set({
          creatureComposedCollected: [],
          validTargets: pool,
          pendingComposedGraveyard: { caps, capIndex: j, picked: nextPicked, context },
        });
        return null; // on passe à la résurrection suivante
      }

      const targetMap: Record<string, string> = {};
      for (const cap of caps) {
        (nextPicked[cap.uid] ?? []).forEach((id, i) => { targetMap[`${cap.uid}#${i}`] = id; });
      }
      const boardPos = get().pendingBoardPosition;
      const selId = get().selectedCardInstanceId;
      set({ creatureComposedCollected: [], pendingComposedGraveyard: null });
      if (context === "hero_power") {
        return get().dispatchAction({ type: "hero_power", targetMap });
      }
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selId!,
        targetMap,
        boardPosition: boardPos ?? undefined,
      });
    } else if (targetingMode === "graveyard" && selectedCardInstanceId) {
      const { pendingBoardPosition, spellTargetSlots, currentTargetSlotIndex, collectedTargetMap, gameState: gs } = get();
      // Check if this is a spell graveyard targeting
      const cardInHand = gs ? carteJouable(gs.players[gs.currentPlayerIndex], selectedCardInstanceId) : undefined;
      if (cardInHand?.card.card_type === "spell" && spellTargetSlots.length > 0) {
        const currentSlot = spellTargetSlots[currentTargetSlotIndex] ?? spellTargetSlots[0];
        const slot = currentSlot.slot ?? "kw_0";
        const newMap = { ...collectedTargetMap, [slot]: targetId };
        const nextIndex = currentTargetSlotIndex + 1;

        // More target slots left? Transition to the next one (supports a
        // hypothetical spell combining e.g. exhumation + rappel, or
        // exhumation + impact). The next slot's type drives the mode.
        if (nextIndex < spellTargetSlots.length) {
          const nextSlot = spellTargetSlots[nextIndex];
          if (nextSlot.type === "friendly_graveyard" || nextSlot.type === "friendly_graveyard_to_board") {
            const kwIndex = parseInt(nextSlot.slot.replace("kw_", ""));
            const nextTargets = gs ? getSpellGraveyardTargets(gs, cardInHand.card, kwIndex) : [];
            set({
              validTargets: nextTargets,
              currentTargetSlotIndex: nextIndex,
              collectedTargetMap: newMap,
              // targetingMode stays "graveyard"
            });
          } else {
            const nextTargets = gs ? getSpellSlotTargets(gs, cardInHand.card, nextSlot) : [];
            set({
              validTargets: nextTargets,
              currentTargetSlotIndex: nextIndex,
              collectedTargetMap: newMap,
              targetingMode: spellTargetSlots.length - nextIndex > 1 ? "spell_multi" : "spell",
            });
          }
          return null;
        }

        // All target slots done — chain into a selection-style picker if
        // the spell also carries one (e.g. Aya Marcay Quilla: Exhumation
        // graveyard target first, then the Sélection picker, with kw_0
        // carried forward).
        if (gs && openSelectionPickerIfNeeded(gs, selectedCardInstanceId, newMap)) {
          return null;
        }
        if (gs && openDeckPickerIfNeeded(gs, selectedCardInstanceId, newMap)) {
          return null;
        }
        return get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: newMap,
        });
      }
      // Creature graveyard targeting (existing behavior)
      // Chain into a creature-side selection picker if applicable.
      if (gs && openCreaturePickerIfNeeded(gs, selectedCardInstanceId, {
        graveyardTargetInstanceId: targetId,
        boardPosition: pendingBoardPosition,
      })) {
        return null;
      }
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        graveyardTargetInstanceId: targetId,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "divination" && get().pendingTapSourceId !== null && get().pendingTapInstanceIdx !== null) {
      // Divination déclenchée par un TAP : le choix part avec l'action, il n'y
      // a pas de carte en cours de pose. Branche placée AVANT celle du jeu de
      // carte, qui exige `selectedCardInstanceId` (null dans ce flux).
      return get().dispatchAction({
        type: "tap_activate",
        sourceInstanceId: get().pendingTapSourceId!,
        instanceIdx: get().pendingTapInstanceIdx!,
        // Présage montre les cartes dans le désordre : la position cliquée est
        // retraduite en index réel du deck (identité pour les autres pickers).
        divinationChoiceIndex: indexReelDuPicker(parseInt(targetId) || 0, get().deckPickerOrder),
        // Apprentissage : c'est un SORT DE LA MAIN qui est désigné, pas une
        // carte du deck — on transmet son instanceId, sans ambiguïté possible.
        ...(get().learnPickerFor
          ? { learnSpellInstanceId: get().divinationCards[parseInt(targetId) || 0]?.instanceId }
          : {}),
      });
    } else if (targetingMode === "divination" && selectedCardInstanceId) {
      const { pendingBoardPosition, gameState: gs } = get();
      const choiceIndex = indexReelDuPicker(parseInt(targetId) || 0, get().deckPickerOrder);
      const sortAppris = get().learnPickerFor
        ? get().divinationCards[parseInt(targetId) || 0]?.instanceId
        : undefined;

      // La réponse est rangée sous SON mot-clé, puis on regarde si la carte en
      // pose une autre. Une carte qui porte Divination ET Présage doit poser ses
      // deux questions ; sans cet enchaînement, une seule modale s'ouvrait et le
      // second effet réutilisait la réponse de la première.
      const kwCourant = get().deckPickerKeyword;
      const choix = kwCourant
        ? { ...get().collectedDeckChoices, [kwCourant]: choiceIndex }
        : get().collectedDeckChoices;
      if (kwCourant) set({ collectedDeckChoices: choix });

      const carteJouee = gs ? carteJouable(gs.players[gs.currentPlayerIndex], selectedCardInstanceId) : null;
      if (gs && kwCourant && carteJouee && openNextDeckPicker(
        gs, carteJouee.card, selectedCardInstanceId, gs.players[gs.currentPlayerIndex].deck,
      )) {
        return null;
      }

      // Chain into a creature-side selection picker if applicable.
      if (gs && openCreaturePickerIfNeeded(gs, selectedCardInstanceId, {
        divinationChoiceIndex: choiceIndex,
        boardPosition: pendingBoardPosition,
      })) {
        return null;
      }
      // Les cibles déjà collectées voyagent avec l'action : sur un sort qui porte
      // une cible ET un picker de deck (Impact + Creuser), le picker se résout en
      // DERNIER, et sans ce report la cible collectée juste avant serait perdue —
      // l'effet ciblé repartait à vide.
      const carte = get().collectedTargetMap;
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        // Champ historique conservé : il reste le seul rempli quand la carte n'a
        // qu'un mot-clé de deck, et c'est lui que relisent les actions déjà
        // journalisées (rejeu, resync).
        divinationChoiceIndex: choiceIndex,
        ...(Object.keys(choix).length > 0 ? { deckChoiceIndices: choix } : {}),
        ...(sortAppris ? { learnSpellInstanceId: sortAppris } : {}),
        ...(Object.keys(carte).length > 0 ? { targetMap: carte } : {}),
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "selection" && get().pendingTapSourceId !== null && get().pendingTapInstanceIdx !== null) {
      // Sélection déclenchée par un TAP : la carte choisie est ajoutée en main.
      const cardId = parseInt(targetId) || 0;
      return get().dispatchAction({
        type: "tap_activate",
        sourceInstanceId: get().pendingTapSourceId!,
        instanceIdx: get().pendingTapInstanceIdx!,
        selectionCardId: cardId,
      });
    } else if (targetingMode === "selection" && get().pendingTriggerId) {
      // Sélection en FIN DE TOUR (déclencheur interactif en attente).
      const cardId = parseInt(targetId) || 0;
      return get().dispatchAction({
        type: "resolve_pending_trigger",
        triggerId: get().pendingTriggerId!,
        selectionCardId: cardId,
      });
    } else if (targetingMode === "selection" && get().pendingEpargneSelection) {
      // Picker d'Épargne : une seule action porte le choix, le moteur re-valide
      // la carte et remet le compteur à zéro.
      const cardId = parseInt(targetId) || 0;
      return get().dispatchAction({ type: "spend_epargne", selectionCardId: cardId });
    } else if (targetingMode === "selection" && get().pendingHeroPowerSelection) {
      // Hero power picker — dispatch a hero_power action with the chosen
      // card id ; engine.ts mirrors it into targetMap for the selection /
      // renfort_royal / selection_magique resolver.
      const cardId = parseInt(targetId) || 0;
      return get().dispatchAction({
        type: "hero_power",
        selectionCardId: cardId,
      });
    } else if (targetingMode === "selection" && selectedCardInstanceId) {
      const { pendingBoardPosition, gameState: gs, collectedTargetMap, pendingCreatureChain } = get();
      const cardInHand = gs ? carteJouable(gs.players[gs.currentPlayerIndex], selectedCardInstanceId) : undefined;
      const cardId = parseInt(targetId) || 0;
      if (cardInHand?.card.card_type === "spell") {
        // Spell selection: pass card ID via targetMap. collectedTargetMap
        // carries any on-board targets gathered before this picker (e.g.
        // Renforcement → Sélection magique), so they reach the engine on
        // the same dispatch.
        return get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: { ...collectedTargetMap, selection_0: String(cardId) },
        });
      }
      // Creature selection: merge in pendingCreatureChain (carries the
      // target / graveyard / divination choice from an earlier picker on
      // the same creature, e.g. mimique + selection).
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        selectionCardId: cardId,
        boardPosition: pendingCreatureChain?.boardPosition ?? pendingBoardPosition ?? undefined,
        targetInstanceId: pendingCreatureChain?.targetInstanceId,
        graveyardTargetInstanceId: pendingCreatureChain?.graveyardTargetInstanceId,
        divinationChoiceIndex: pendingCreatureChain?.divinationChoiceIndex,
      });
    } else if (targetingMode === "hero_power") {
      // Pouvoir composé multi-cibles "au choix" : collecte N cibles puis dispatch
      // un targetMap par slot (même patron que l'effet composé de créature).
      const { pendingHeroPowerComposed } = get();
      if (pendingHeroPowerComposed) {
        const collected = [...get().creatureComposedCollected, targetId];
        if (collected.length < pendingHeroPowerComposed.count) {
          set({
            creatureComposedCollected: collected,
            validTargets: get().validTargets.filter(t => t !== targetId), // pas de double-pick
          });
          return null; // on continue à collecter
        }
        const targetMap: Record<string, string> = {};
        collected.forEach((id, i) => { targetMap[`${pendingHeroPowerComposed.uid}#${i}`] = id; });
        set({ creatureComposedCollected: [], pendingHeroPowerComposed: null });
        return get().dispatchAction({ type: "hero_power", targetMap });
      }
      return get().dispatchAction({
        type: "hero_power",
        targetInstanceId: targetId,
      });
    } else if (targetingMode === "tap") {
      const { pendingTapSourceId, pendingTapInstanceIdx, pendingTapComposedUid } = get();
      if (pendingTapSourceId === null) return null;
      if (pendingTapComposedUid) {
        return get().dispatchAction({
          type: "tap_activate",
          sourceInstanceId: pendingTapSourceId,
          instanceIdx: -1,
          composedUid: pendingTapComposedUid,
          targetInstanceId: targetId,
        });
      }
      if (pendingTapInstanceIdx === null) return null;
      return get().dispatchAction({
        type: "tap_activate",
        sourceInstanceId: pendingTapSourceId,
        instanceIdx: pendingTapInstanceIdx,
        targetInstanceId: targetId,
      });
    } else if (targetingMode === "pending_trigger") {
      const { pendingTriggerId, pendingTriggerNeeded, pendingTriggerPicked, validTargets: vt } = get();
      if (!pendingTriggerId) return null;
      // Un clic sur une cible DÉJÀ retenue la retire — sans ça, un mauvais clic
      // dans une désignation à 4 cartes ne se rattrape plus (le déclencheur est
      // obligatoire, on ne peut pas annuler pour recommencer).
      if (pendingTriggerPicked.includes(targetId)) {
        set({ pendingTriggerPicked: pendingTriggerPicked.filter(id => id !== targetId) });
        return null;
      }
      const picked = [...pendingTriggerPicked, targetId];
      // Il reste des cibles à désigner ET des candidates non retenues → on
      // attend le clic suivant. La seconde condition évite de bloquer sur un
      // pool épuisé quand `needed` dépasse ce que le plateau/cimetière offre.
      if (picked.length < pendingTriggerNeeded && picked.length < vt.length) {
        set({ pendingTriggerPicked: picked });
        return null;
      }
      return get().dispatchAction({
        type: "resolve_pending_trigger",
        triggerId: pendingTriggerId,
        // Cible unique → on garde le champ historique, pour que rien ne change
        // pour les effets à une seule cible (et leurs actions déjà en journal).
        ...(picked.length > 1 ? { targetInstanceIds: picked } : { targetInstanceId: picked[0] }),
      });
    }
    return null;
  },

  clearSelection: () => {
    // Un sélecteur « Sélection » (révélation de N cartes : pouvoir de héros,
    // sort, ou invocation de créature) est un choix OBLIGATOIRE une fois les
    // cartes révélées : on refuse d'annuler (clic fond / Échap / clic droit),
    // sinon le joueur « scoute » gratuitement puis relance pour de nouvelles
    // cartes. La confirmation passe par dispatchAction (pas clearSelection) et
    // reste donc possible. La Divination (mode dédié) garde son annulation.
    if (get().targetingMode === "selection") return;

    // Un déclencheur interactif en attente (Remontée mort/retour) est un choix
    // OBLIGATOIRE : on ne le laisse pas annuler (clic fond / clic droit) — on
    // ré-affiche le sélecteur.
    const overlay = pendingTriggerOverlay(get().gameState, get().localPlayerId);
    if (overlay.targetingMode === "pending_trigger") {
      set(overlay);
      return;
    }
    set({
      selectedCardInstanceId: null,
      selectedAttackerInstanceId: null,
      validTargets: [],
      targetingMode: "none",
      pendingBoardPosition: null,
      divinationCards: [],
      deckPickerOrder: null,
      learnPickerFor: null,
      deckPickerKeyword: null,
      collectedDeckChoices: {},
      tactiqueAvailableKeywords: [],
      tactiqueMaxSelections: 0,
      pendingTargetInstanceId: null,
      pendingTapSourceId: null,
      pendingTapInstanceIdx: null,
      pendingTapComposedUid: null,
      spellTargetSlots: [],
      currentTargetSlotIndex: 0,
      collectedTargetMap: {},
      creatureComposedCollected: [],
      pendingHeroPowerComposed: null,
      pendingComposedGraveyard: null,
      pendingAttackDefenderId: null,
      attackPowerCollected: [],
      pendingCreatureChain: null,
      pendingCostCard: null,
      selectedDiscardIds: [],
      selectedSacrificeIds: [],
      selectedTopdeckIds: [],
      pendingHeroPowerSelection: false,
  pendingEpargneSelection: false,
    });
  },

  clearDamageEvents: () => {
    set({ damageEvents: [] });
  },

  clearSpellCastEvent: () => {
    set({ spellCastEvent: null });
  },

  clearPowerArrowEvent: () => {
    set({ powerArrowEvent: null });
  },

  clearFireBreathEvent: () => {
    set({ fireBreathEvent: null });
  },

  clearTopdeckCostEvent: () => {
    set({ topdeckCostEvent: null });
  },

  clearEveilEvent: () => {
    set({ eveilEvent: null });
  },

  clearExileCostEvent: () => {
    set({ exileCostEvent: null });
  },

  clearDeckEffectEvent: () => {
    set({ deckEffectEvent: null });
  },

  clearCycleEternelEvent: () => {
    set({ cycleEternelEvent: null });
  },

  clearCompagnonsEvent: () => {
    set({ compagnonsEvent: null });
  },

  clearTempeteEvent: () => {
    set({ tempeteEvent: null });
  },

  clearManaReductionEvent: () => {
    set({ manaReductionEvent: null });
  },

  clearEpargneGainEvent: () => {
    set({ epargneGainEvent: null });
  },

  clearDeathEvents: () => {
    set({ deathEvents: [] });
  },

  clearSummonEvents: () => {
    set({ summonEvents: [] });
  },

  clearHeroPowerCastEvent: () => {
    set({ heroPowerCastEvent: null });
  },

  clearGraveyardAffectEvent: () => {
    set({ graveyardAffectEvent: null });
  },

  clearDiscardFromHandEvent: () => {
    set({ discardFromHandEvent: null });
  },

  toggleDiscardSelection: (instanceId) => {
    const { pendingCostCard, selectedDiscardIds, selectedTopdeckIds } = get();
    if (!pendingCostCard) return;
    if (instanceId === pendingCostCard.instanceId) return; // can't discard the card being played
    const idx = selectedDiscardIds.indexOf(instanceId);
    if (idx !== -1) {
      const next = [...selectedDiscardIds];
      next.splice(idx, 1);
      set({ selectedDiscardIds: next });
    } else if (!selectedTopdeckIds.includes(instanceId)
      && selectedDiscardIds.length < pendingCostCard.discardNeeded) {
      // Une carte déjà promise au REPLI ne peut pas être défaussée en plus :
      // même main, deux coûts, un seul exemplaire.
      set({ selectedDiscardIds: [...selectedDiscardIds, instanceId] });
    }
  },

  toggleSacrificeSelection: (instanceId) => {
    const { pendingCostCard, selectedSacrificeIds } = get();
    if (!pendingCostCard) return;
    const idx = selectedSacrificeIds.indexOf(instanceId);
    if (idx !== -1) {
      const next = [...selectedSacrificeIds];
      next.splice(idx, 1);
      set({ selectedSacrificeIds: next });
    } else if (selectedSacrificeIds.length < pendingCostCard.sacrificeNeeded) {
      set({ selectedSacrificeIds: [...selectedSacrificeIds, instanceId] });
    }
  },

  /** REPLI : désigne (ou retire) une carte de la main à replacer sur le deck.
   *
   *  L'ordre des clics est CONSERVÉ et significatif — la première désignée
   *  finira sur le dessus de la pile. Une carte déjà promise à la défausse ne
   *  peut pas être repliée : elle ne peut pas payer les deux coûts, et le
   *  moteur rejetterait l'action en silence. */
  toggleTopdeckSelection: (instanceId) => {
    const { pendingCostCard, selectedTopdeckIds, selectedDiscardIds } = get();
    if (!pendingCostCard) return;
    if (instanceId === pendingCostCard.instanceId) return; // la carte jouée ne se replie pas elle-même
    const idx = selectedTopdeckIds.indexOf(instanceId);
    if (idx !== -1) {
      const next = [...selectedTopdeckIds];
      next.splice(idx, 1);
      set({ selectedTopdeckIds: next });
    } else if (!selectedDiscardIds.includes(instanceId)
      && selectedTopdeckIds.length < pendingCostCard.topdeckNeeded) {
      set({ selectedTopdeckIds: [...selectedTopdeckIds, instanceId] });
    }
  },

  confirmCostPayment: () => {
    const { gameState, pendingCostCard, selectedDiscardIds, selectedSacrificeIds, selectedTopdeckIds } = get();
    if (!gameState || !pendingCostCard) return null;
    if (selectedDiscardIds.length !== pendingCostCard.discardNeeded) return null;
    if (selectedSacrificeIds.length !== pendingCostCard.sacrificeNeeded) return null;
    if (selectedTopdeckIds.length !== pendingCostCard.topdeckNeeded) return null;

    const player = gameState.players[gameState.currentPlayerIndex];
    const card = carteJouable(player, pendingCostCard.instanceId);
    if (!card) {
      get().cancelCostPayment();
      return null;
    }
    const instanceId = pendingCostCard.instanceId;
    const boardPosition = pendingCostCard.boardPosition;

    // Exit cost_payment mode but KEEP the selected IDs — dispatchAction merges
    // them automatically into any subsequent play_card action.
    set({ targetingMode: "none", pendingCostCard: null });

    // Now route through the standard targeting checks (creature/graveyard/
    // divination/selection/spell), exactly like playCardDirect / selectCardInHand
    // do after their canPlayCard check. Mirroring keeps the flow consistent.

    // Le REPLI se paie DANS le moteur, donc après ces pickers — mais il change
    // le dessus du deck, que Divination et Traque du destin donnent justement à
    // voir. Sans cette vue anticipée, le joueur choisissait parmi les cartes
    // d'AVANT son repli, et le moteur appliquait son index à une pile qui avait
    // bougé : une carte pour une autre. On reconstruit donc le deck tel qu'il
    // sera, dans le même ordre que le moteur (première désignée sur le dessus).
    const deckApresRepli = selectedTopdeckIds.length > 0
      ? [
        ...selectedTopdeckIds
          .map(id => player.hand.find(c => c.instanceId === id))
          .filter((c): c is NonNullable<typeof c> => !!c),
        ...player.deck,
      ]
      : player.deck;

    if (creatureNeedsTarget(card.card)) {
      const targets = getCreatureTargets(gameState, card.card);
      if (targets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: targets,
          targetingMode: "creature",
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsGraveyardTarget(card.card)) {
      const gravTargets = getGraveyardTargets(gameState, card.card);
      if (gravTargets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: gravTargets,
          targetingMode: "graveyard",
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    // MODALES DE DECK, dans l'ordre d'auteur. `deckApresRepli` et non
    // `player.deck` : le Repli vient de remettre des cartes sur le DESSUS, et
    // ce sont celles-là que ces mots-clés révéleront.
    if (openNextDeckPicker(gameState, card.card, instanceId, deckApresRepli, {
      boardPosition,
    })) {
      return null;
    }

    if (creatureNeedsTraqueDuDestin(card.card)) {
      const x = getTraqueDuDestinX(card.card);
      const deckCards = deckApresRepli.slice(0, Math.min(x, deckApresRepli.length));
      if (deckCards.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: deckCards,
          deckPickerOrder: null,
        learnPickerFor: null,
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsSelection(card.card)) {
      const selXVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = selXVals["selection"] ?? 0;
      const choices = getSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsRenfortRoyal(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["renfort_royal"] ?? 0;
      const choices = getRenfortRoyalCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsMagicalSelection(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["selection_magique"] ?? 0;
      const choices = getMagicalSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }

    if (card.card.card_type === "spell" && needsTarget(card.card)) {
      const slots = getSpellTargetSlots(card.card);
      const selectableSlots = slots.filter(s =>
        s.type === "any" || s.type === "any_creature"
        || s.type === "friendly_creature" || s.type === "enemy_creature"
        || s.type === "friendly_graveyard" || s.type === "friendly_graveyard_to_board"
      );
      if (selectableSlots.length > 0) {
        const firstSlot = selectableSlots[0];
        if (firstSlot.type === "friendly_graveyard" || firstSlot.type === "friendly_graveyard_to_board") {
          const kwIndex = parseInt(firstSlot.slot.replace("kw_", ""));
          const gravTargets = getSpellGraveyardTargets(gameState, card.card, kwIndex);
          if (gravTargets.length > 0) {
            set({
              selectedCardInstanceId: instanceId,
              selectedAttackerInstanceId: null,
              validTargets: gravTargets,
              targetingMode: "graveyard",
              spellTargetSlots: selectableSlots,
              currentTargetSlotIndex: 0,
              collectedTargetMap: {},
            });
            return null;
          }
        } else {
          const targets = getSpellSlotTargets(gameState, card.card, firstSlot);
          // Même garde que le chemin principal : pas de mode ciblage sans
          // cible éligible, sinon la flèche s'affiche dans le vide — on laisse
          // le flux retomber sur le dispatch direct plus bas.
          if (targets.length > 0) {
          set({
            selectedCardInstanceId: instanceId,
            selectedAttackerInstanceId: null,
            validTargets: targets,
            targetingMode: selectableSlots.length === 1 ? "spell" : "spell_multi",
            spellTargetSlots: selectableSlots,
            currentTargetSlotIndex: 0,
            collectedTargetMap: {},
          });
          return null;
          }
        }
      }
    }

    // No additional targeting needed — dispatch directly. dispatchAction
    // merges selectedDiscardIds/selectedSacrificeIds into the action.
    return get().dispatchAction({
      type: "play_card",
      cardInstanceId: instanceId,
      boardPosition: boardPosition ?? undefined,
    });
  },

  cancelCostPayment: () => {
    set({
      targetingMode: "none",
      pendingCostCard: null,
      selectedDiscardIds: [],
      selectedSacrificeIds: [],
      selectedTopdeckIds: [],
      selectedCardInstanceId: null,
    });
  },

  openEpargnePicker: () => {
    const { gameState, targetingMode, isAnimating } = get();
    if (!gameState || isAnimating) return null;
    // Anti-réentrance : un picker « 1 parmi 3 » déjà ouvert ne doit pas être
    // réarmé (même garde que le pouvoir de héros — sans elle, un second clic
    // recalculerait l'offre et laisserait voir d'autres cartes gratuitement).
    if (targetingMode === "selection") return null;
    if (!get().isMyTurn()) return null;

    const me = gameState.players[gameState.currentPlayerIndex];
    const level = me.epargne ?? 0;
    if (level < 1) return null;
    if (me.hand.length >= MAX_HAND_SIZE) return null;

    // Alignement dérivé de la faction du héros, comme pour un pouvoir de héros
    // à sélection. `exactCost` : on ne révèle QUE des cartes valant exactement
    // ce qui a été mis de côté.
    const heroSource = { faction: me.hero.heroDefinition?.faction ?? null };
    const choices = getSelectionCards(gameState, level, heroSource, undefined, true);
    // Aucune carte à ce coût : le clic ne fait rien et l'épargne est conservée.
    // On ne dispatche pas, donc rien ne part sur le réseau.
    if (choices.length === 0) return null;

    set({
      selectedCardInstanceId: null,
      selectedAttackerInstanceId: null,
      validTargets: [],
      targetingMode: "selection",
      selectionCards: choices,
      pendingEpargneSelection: true,
    });
    return null;
  },

  activateHeroPower: () => {
    const { gameState } = get();
    if (!gameState) return null;
    // Un sélecteur de sélection déjà ouvert est un choix obligatoire : on ne
    // ré-active pas le pouvoir (anti-réentrance, ex. raccourci clavier) tant
    // que le joueur n'a pas choisi — sinon il régénère de nouvelles cartes.
    if (get().targetingMode === "selection") return null;
    if (!canUseHeroPower(gameState)) return null;

    const player = gameState.players[gameState.currentPlayerIndex];
    const heroDef = player.hero.heroDefinition;
    if (!heroDef) return null;

    // Hero powers using selection / renfort_royal / selection_magique need
    // a card-picker overlay before they can resolve — without it the engine
    // receives no chosen card and the keyword no-ops. We open the same
    // selection overlay used by spells/creatures and remember (via
    // pendingHeroPowerSelection) that the upcoming dispatch is a hero
    // power, not a play_card.
    const effect = heroDef.powerEffect;
    if (effect && effect.mode === "spell_trigger") {
      const x = effect.params?.amount ?? 0;
      // Pour Sélection / Sélection magique, l'alignement est dérivé de la
      // faction du héros (les heroes définitions portent un faction id).
      const heroSource = { faction: heroDef.faction ?? null };
      let choices: Card[] | null = null;
      if (effect.keywordId === "selection") {
        choices = getSelectionCards(gameState, x, heroSource);
      } else if (effect.keywordId === "renfort_royal") {
        choices = getRenfortRoyalCards(gameState, x, heroSource);
      } else if (effect.keywordId === "selection_magique") {
        choices = getMagicalSelectionCards(gameState, x, heroSource);
      }
      if (choices !== null) {
        if (choices.length === 0) return null; // no candidates → power fizzles
        set({
          selectedCardInstanceId: null,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingHeroPowerSelection: true,
        });
        return null;
      }
    }

    // Pouvoir composé : si des cibles doivent être choisies, on entre en mode
    // hero_power en mémorisant le slot (uid + nombre) pour collecter N cibles.
    // Sinon (self / hero-only / random / automatic / draw / mana / …) → direct.
    if (effect && effect.mode === "composed") {
      const choice = heroPowerComposedChoice(heroDef);
      if (!choice) {
        return get().dispatchAction({ type: "hero_power" });
      }
      // Exhumation composée : picker cimetière (mode "graveyard") au lieu du
      // ciblage plateau/héros. La cible est dispatchée via pendingComposedGraveyard.
      if (choice.type === "friendly_graveyard_to_board") {
        const gravTargets = getHeroPowerTargets(gameState, heroDef);
        set({
          selectedCardInstanceId: null,
          selectedAttackerInstanceId: null,
          validTargets: gravTargets,
          targetingMode: "graveyard",
          creatureComposedCollected: [],
          pendingComposedGraveyard: {
            // Un pouvoir de héros n'expose qu'une capacité composée à la fois
            // (heroPowerComposedChoice) → file à un seul élément.
            caps: [{ uid: choice.uid, count: Math.min(choice.count, gravTargets.length) }],
            capIndex: 0,
            picked: {},
            context: "hero_power",
          },
        });
        return null;
      }
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: getHeroPowerTargets(gameState, heroDef),
        targetingMode: "hero_power",
        pendingHeroPowerComposed: { uid: choice.uid, count: choice.count },
        creatureComposedCollected: [],
      });
      return null;
    }

    if (heroPowerNeedsTarget(heroDef)) {
      const targets = getHeroPowerTargets(gameState, heroDef);
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: targets,
        targetingMode: "hero_power",
      });
      return null;
    } else {
      return get().dispatchAction({ type: "hero_power" });
    }
  },

  activateLearnedSpell: (creatureInstanceId) => {
    // APPRENTISSAGE — lancer le sort mémorisé. Rien de propre ici : on délègue à
    // `selectCardInHand`, qui enchaîne déjà paiement des coûts puis ciblage puis
    // envoi. C'est `carteJouable` qui rend le sort trouvable, et `dispatchAction`
    // qui estampille l'action de sa créature d'origine.
    const { gameState } = get();
    if (!gameState) return null;
    const player = gameState.players[gameState.currentPlayerIndex];
    const source = player.board.find((c) => c.instanceId === creatureInstanceId);
    if (!source?.apprentissageSpell) return null;
    if (!creatureCanCastLearnedSpell(gameState, creatureInstanceId)) return null;
    return get().selectCardInHand(source.apprentissageSpell.instanceId);
  },

  activateTap: (sourceInstanceId, instanceIdx) => {
    // Resolve a creature's tap-mode keyword instance. If the keyword
    // needs a target (e.g. Vampirisme → enemy creature), open the
    // targeting picker; otherwise dispatch immediately. The engine
    // re-checks eligibility (own turn, untapped, no summoning sickness,
    // keyword present in tap mode) so race conditions can't slip a bad
    // action through.
    const { gameState } = get();
    if (!gameState) return null;
    const player = gameState.players[gameState.currentPlayerIndex];
    const source = player.board.find(c => c.instanceId === sourceInstanceId);
    if (!source) return null;
    const instance = source.card.keyword_instances?.[instanceIdx];
    if (!instance || instance.mode !== "tap") return null;

    // Sélection / Sélection magique / Renfort Royal au tap : ouvre la modale
    // « 1 parmi 3 » (même flux qu'à l'invocation). Le choix est renvoyé via
    // selectTarget → tap_activate { selectionCardId }.
    if (instance.id === "selection" || instance.id === "selection_magique" || instance.id === "renfort_royal") {
      const x = instance.x ?? 0;
      const choices = instance.id === "selection_magique" ? getMagicalSelectionCards(gameState, x, source.card)
        : instance.id === "renfort_royal" ? getRenfortRoyalCards(gameState, x, source.card)
          : getSelectionCards(gameState, x, source.card);
      if (choices.length === 0) {
        // Aucune carte éligible → on engage quand même la créature (fizzle).
        return get().dispatchAction({ type: "tap_activate", sourceInstanceId, instanceIdx });
      }
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: [],
        targetingMode: "selection",
        selectionCards: choices,
        pendingTapSourceId: sourceInstanceId,
        pendingTapInstanceIdx: instanceIdx,
        pendingHeroPowerSelection: false,
  pendingEpargneSelection: false,
        pendingTriggerId: null,
      });
      return null;
    }

    // Divination au tap : ouvre la modale « 3 cartes » (même flux qu'à
    // l'invocation). Sans elle le pouvoir se résolvait au hasard et sans aucun
    // retour visuel — indiscernable d'un pouvoir inerte.
    if (instance.id === "apprentissage") {
      const sorts = handSpellsFor(player);
      if (sorts.length === 0) {
        // Aucun sort en main → on engage quand même la créature (fizzle),
        // comme Sélection et Divination.
        return get().dispatchAction({ type: "tap_activate", sourceInstanceId, instanceIdx });
      }
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: [],
        targetingMode: "divination",
        divinationCards: sorts,
        deckPickerOrder: null,
        learnPickerFor: sourceInstanceId,
        pendingTapSourceId: sourceInstanceId,
        pendingTapInstanceIdx: instanceIdx,
      });
      return null;
    }
    if (instance.id === "presage") {
      const picker = presagePickerState(player.deck);
      if (!picker) {
        // Deck vide → on engage quand même la créature (fizzle), comme Divination.
        return get().dispatchAction({ type: "tap_activate", sourceInstanceId, instanceIdx });
      }
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: [],
        targetingMode: "divination",
        ...picker,
        pendingTapSourceId: sourceInstanceId,
        pendingTapInstanceIdx: instanceIdx,
      });
      return null;
    }
    if (instance.id === "divination") {
      const deckCards = player.deck.slice(0, Math.min(3, player.deck.length));
      if (deckCards.length === 0) {
        // Deck vide → on engage quand même la créature (fizzle), comme Sélection.
        return get().dispatchAction({ type: "tap_activate", sourceInstanceId, instanceIdx });
      }
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: [],
        targetingMode: "divination",
        divinationCards: deckCards,
        deckPickerOrder: null,
        learnPickerFor: null,
        pendingTapSourceId: sourceInstanceId,
        pendingTapInstanceIdx: instanceIdx,
      });
      return null;
    }

    const targets = getTapActivateTargets(gameState, instance.id, sourceInstanceId);
    if (targets && targets.length > 0) {
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: targets,
        targetingMode: "tap",
        pendingTapSourceId: sourceInstanceId,
        pendingTapInstanceIdx: instanceIdx,
      });
      return null;
    }

    return get().dispatchAction({
      type: "tap_activate",
      sourceInstanceId,
      instanceIdx,
    });
  },

  activateTapComposed: (sourceInstanceId, capUid) => {
    // Active un effet composé on_activation. Si la cible est "au choix" (1 unité
    // plateau), ouvre le sélecteur ; sinon dispatch immédiat (hasard/toutes/héros).
    const { gameState } = get();
    if (!gameState) return null;
    const player = gameState.players[gameState.currentPlayerIndex];
    const source = player.board.find(c => c.instanceId === sourceInstanceId);
    if (!source) return null;
    const targets = getComposedTapTargets(gameState, source.card, capUid);
    if (targets && targets.length > 0) {
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: targets,
        targetingMode: "tap",
        pendingTapSourceId: sourceInstanceId,
        pendingTapInstanceIdx: null,
        pendingTapComposedUid: capUid,
      });
      return null;
    }
    return get().dispatchAction({
      type: "tap_activate",
      sourceInstanceId,
      instanceIdx: -1,
      composedUid: capUid,
    });
  },

  confirmMulligan: (selectedInstanceIds) => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId || gameState.phase !== "mulligan") return null;

    const playerIndex = gameState.players.findIndex((p) => p.id === localPlayerId);
    if (playerIndex === -1) return null;

    // Dispatch the mulligan action with replaced card IDs
    // The engine handles the swap deterministically so both clients stay in sync
    return get().dispatchAction({
      type: "mulligan",
      playerId: localPlayerId,
      replacedInstanceIds: selectedInstanceIds,
    });
  },

  isMyTurn: () => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId) return false;
    return gameState.players[gameState.currentPlayerIndex].id === localPlayerId;
  },

  getMyPlayerState: () => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId) return null;
    return getPlayerState(gameState, localPlayerId);
  },

  getOpponentPlayerState: () => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId) return null;
    const opponentId = gameState.players.find(
      (p) => p.id !== localPlayerId
    )?.id;
    if (!opponentId) return null;
    return getPlayerState(gameState, opponentId);
  },
  });
});
