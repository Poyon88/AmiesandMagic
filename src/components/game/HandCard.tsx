"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import { titleFontScale } from "@/lib/game/card-title";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import { useGameStore } from "@/lib/store/gameStore";
import { primaryThresholdGlow } from "@/lib/game/threshold-glow";
import { REPLI_TEINTE } from "@/lib/game/repli-theme";
import { KEYWORD_SYMBOLS, cleanEffectText, buildKeywordDisplayEntries, keywordModeColor, keywordBadgeValue, applyKeywordValueToLabel, TEXT_CONTRAST_HALO } from "@/lib/game/keyword-labels";
import { SPELL_KEYWORDS, SPELL_KEYWORD_SYMBOLS, getSpellKeywordBadgeValue } from "@/lib/game/spell-keywords";
import { isCreatureKwShadowedBySpell, getTokenManaCost } from "@/lib/game/abilities";
import { persistentStats, effectiveManaCost as engineEffectiveManaCost, espritDeCorpsPoints } from "@/lib/game/engine";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";
import { composedCapsOf, composedIcon, composedTriggerMode, composedValueText } from "@/lib/game/composed-display";
import ComposedMarker from "@/components/cards/ComposedMarker";
import CostBadges from "@/components/cards/CostBadges";
import RarityFrame from "@/components/cards/RarityFrame";
import useLongPress, { LONG_PRESS_RESET_STYLE } from "@/hooks/useLongPress";
import useCoarsePointer from "@/hooks/useCoarsePointer";
import { SPRINGS } from "@/lib/fx/overlayMotion";
import { useCardText } from "./CardTextProvider";
import { useVocab } from "@/i18n/useVocab";
import CompagnonsNames from "@/components/cards/CompagnonsNames";
import TokenNames from "@/components/cards/TokenNames";
import { tokenCardsForKeyword, tokenCardsForComposed } from "@/lib/game/token-preview";
import { EVEIL_TEINTE, EVEIL_GLYPHE } from "@/lib/game/eveil-theme";

interface HandCardProps {
  cardInstance: CardInstance;
  canPlay: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  /** SORT À CIBLE — ouvre le ciblage au SIMPLE clic.
   *
   *  Jouer une carte demande un double-clic (cf. `onDoubleClick`) parce que
   *  c'est irréversible. Armer un ciblage ne l'est pas : le sort ne part qu'au
   *  clic SUIVANT, sur la cible, et le ciblage s'annule entre-temps. C'est donc
   *  une DÉSIGNATION, exactement comme le paiement de coût — qui est déjà au
   *  simple clic pour la même raison.
   *
   *  N'est passée que par les sorts qui réclament réellement une cible, et le
   *  store est appelé en `ciblageSeulement` : ce clic ne peut pas se muer en
   *  lancer, même quand la cascade de ciblage retombe sur un lancer direct
   *  (aucun slot sélectionnable, plus aucune cible éligible). */
  onSelectForTargeting?: () => void;
  /** ÉVEIL — clic sur la pastille de mise en éveil. Prop séparée d'`onClick`
   *  parce que la carte a désormais DEUX gestes distincts : la jouer, ou la
   *  mettre en éveil. Absente ⇒ la pastille n'est pas rendue. */
  onSuspendEveil?: () => void;
  // Boost récent sur cette carte EN MAIN (ex. Entrainement) → flash doré +
  // halo (mêmes couleurs que BoardCreature). "empower" (violet) réservé si un
  // jour un buff de capacité vise la main ; sinon "buff" (or).
  boost?: "buff" | "empower" | null;
}

function HandCard({
  cardInstance,
  canPlay,
  isSelected = false,
  onClick,
  onSelectForTargeting,
  onSuspendEveil,
  boost = null,
}: HandCardProps) {
  const card = cardInstance.card;
  const t = useTranslations("game");
  const { localizeName, localizeFlavor } = useCardText();
  const vocab = useVocab();
  const gameState = useGameStore(s => s.gameState);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const tokenTemplates = useGameStore(s => s.tokenTemplates);
  const targetingMode = useGameStore(s => s.targetingMode);
  const pendingCostCard = useGameStore(s => s.pendingCostCard);
  const selectedDiscardIds = useGameStore(s => s.selectedDiscardIds);
  const selectedTopdeckIds = useGameStore(s => s.selectedTopdeckIds);
  const toggleDiscardSelection = useGameStore(s => s.toggleDiscardSelection);
  const toggleTopdeckSelection = useGameStore(s => s.toggleTopdeckSelection);

  // Halo des capacités à SEUIL. C'est en main qu'il porte l'essentiel de sa
  // valeur : Seuil de colère et Chant sont des capacités de SORT — ils ne vont
  // jamais sur le plateau, et sans ce halo rien n'indiquerait que le sort est
  // renforcé au moment de décider de le jouer.
  const thresholdGlow = useMemo(
    // La remise de Concentration vit sur l'INSTANCE : sans elle, le halo de
    // Discipline lirait la parité du coût imprimé au lieu du coût à payer.
    () => primaryThresholdGlow(card, gameState, localPlayerId, cardInstance.manaCostReduction ?? 0),
    [card, gameState, localPlayerId, cardInstance.manaCostReduction],
  );

  // Esprit de corps : combien de points cette carte gagnerait en arrivant.
  // En main elle n'est pas encore comptée, donc le nombre affiché est le total
  // complet — exactement ce qu'elle vaudra une fois posée.
  const espritCount = useMemo(() => {
    const owner = gameState?.players.find(p => p.id === localPlayerId);
    return owner ? espritDeCorpsPoints(owner, card, cardInstance) : null;
  }, [gameState, localPlayerId, card, cardInstance]);

  const isCostPaymentMode = targetingMode === "cost_payment";
  const isPendingCostSource = pendingCostCard?.instanceId === cardInstance.instanceId;
  const isSelectedForDiscard = selectedDiscardIds.includes(cardInstance.instanceId);
  const rangRepli = selectedTopdeckIds.indexOf(cardInstance.instanceId);
  const isSelectedForTopdeck = rangRepli !== -1;

  /** Un clic en mode paiement, quand la carte réclame DEUX coûts de main
   *  (défausse ET repli). Un même clic ne peut pas payer les deux, et laisser
   *  le joueur basculer d'un mode à l'autre demanderait un sélecteur de plus
   *  au-dessus d'une modale déjà chargée. Règle retenue, annoncée par la
   *  modale : on REMPLIT LA DÉFAUSSE D'ABORD, puis le repli. Décocher marche
   *  toujours, quelle que soit la liste qui tient la carte — c'est le seul
   *  moyen de corriger une désignation. */
  const payerParClic = () => {
    if (!pendingCostCard) return;
    if (isSelectedForDiscard) { toggleDiscardSelection(cardInstance.instanceId); return; }
    if (isSelectedForTopdeck) { toggleTopdeckSelection(cardInstance.instanceId); return; }
    if (selectedDiscardIds.length < pendingCostCard.discardNeeded) {
      toggleDiscardSelection(cardInstance.instanceId);
    } else if (selectedTopdeckIds.length < pendingCostCard.topdeckNeeded) {
      toggleTopdeckSelection(cardInstance.instanceId);
    }
  };

  // Flash de boost (mêmes réglages que BoardCreature) : or pour un buff de
  // stats, violet pour une capacité acquise.
  const isBoost = boost != null;
  const isEmpower = boost === "empower";
  const boostDur = isEmpower ? 0.75 : 0.6;
  const haloRgb = isEmpower ? "168,85,247" : "234,179,8";
  const haloPeak = isEmpower ? 1.5 : 1.35;

  // Compute effective mana cost (accounting for Canalisation on spells and
  // Entraide on creatures — cumulable ; plancher 1 pour les sorts via
  // Canalisation, plancher 0 pour les créatures). Reductions must be
  // computed against the OWNER of the hand (the local player), not the
  // active turn — otherwise during the opponent's turn we'd be reading
  // the opponent's board and the cost shown in our hand would silently
  // ignore our own Entraide / Canalisation creatures.
  // Concentration X bakes a persistent reduction directly on the instance —
  // applied first, before Canalisation/Entraide stack on top.
  // Baseline: tokens in hand cost floor((attack+health)/2) — see
  // getTokenManaCost — not the on-board 0.
  const baseManaCost = getTokenManaCost(card);
  // Coût affiché = coût RÉELLEMENT payé : on passe par le helper du moteur pour
  // que la carte, la jauge de mana et la déduction ne puissent pas diverger.
  const effectiveManaCost = gameState
    ? engineEffectiveManaCost(
        cardInstance,
        gameState.players.find(p => p.id === localPlayerId) ?? gameState.players[gameState.currentPlayerIndex],
      )
    : Math.max(0, baseManaCost - (cardInstance.manaCostReduction ?? 0));
  const isCostReduced = effectiveManaCost < baseManaCost;
  const tokenTemplate = card.id === -1 && !card.image_url
    ? (card.token_id
        ? tokenTemplates.find(t => t.id === card.token_id)
        : (card.race ? tokenTemplates.find(t => t.race === card.race) : null))
    : null;
  const resolvedImageUrl = card.image_url ?? tokenTemplate?.image_url ?? null;
  const isCreature = card.card_type === "creature";
  // Stats EFFECTIVES affichées : base + bonus conservés (loyauté, summon,
  // nécrophagie…). Pertinent pour une créature renvoyée en main (rebond) qui
  // garde son bonus de Loyauté — aligne la main sur le cimetière. Pour une
  // carte fraîche, les bonus valent 0 → stats de base inchangées.
  const { attack: displayAttack, health: displayHealth } = isCreature
    ? persistentStats(cardInstance)
    : { attack: card.attack ?? 0, health: card.health ?? 0 };
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the description was opened by a long-press (touch). Used so
  // that the next tap dismisses the description instead of playing the
  // card — without affecting desktop hover→click flow.
  const detailsOpenedByTouch = useRef(false);
  // Mobile double-tap-to-cast state for spells. First tap arms + shows the
  // description; second tap (within ARM_TIMEOUT_MS) fires the cast. Drag
  // and desktop click bypass this.
  const armedForCast = useRef(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the most recent gesture was a touch — set in handleTouchStart
  // and read by onClick to know whether to apply the double-tap rule.
  const lastTapWasTouch = useRef(false);
  const ARM_TIMEOUT_MS = 5000;

  // ── GLISSER SOURIS, piloté par les évènements POINTEUR ────────────────────
  //
  // Le glisser natif HTML5 est abandonné pour les cartes de main. Sur Firefox,
  // il annonçait `dragstart` puis abandonnait la session : plus aucun
  // `dragover`, aucun `dragend`, et un `mouseup` délivré à la page — signe
  // qu'aucune session n'avait pris. Les créatures, qui ne se posent QUE par
  // glisser, en devenaient injouables. Douze montages pilotés dans un vrai
  // Firefox (image cross-origin chargée, `zoom`, `transform: scale`, nœud source
  // remplacé, `draggable` retiré en cours de route…) n'ont pas permis d'isoler
  // la cause : plutôt que de continuer à chercher, on cesse de dépendre d'un
  // mécanisme que le navigateur peut refuser sans motif observable.
  //
  // Ce chemin n'invente rien : il rejoue le glisser manuel DÉJÀ écrit pour le
  // tactile — même seuil, même fantôme, mêmes évènements `hand-touch-move` /
  // `hand-touch-drop` / `hand-touch-end`, que GameBoard écoute déjà pour
  // l'aperçu de dépôt et pour la pose. Le tactile garde ses propres
  // gestionnaires ; les évènements pointeur y feraient double emploi, d'où le
  // filtre sur `pointerType`.
  const pointerDragRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const detachePointeurRef = useRef<(() => void) | null>(null);

  // Mouvements et relâchement écoutés sur WINDOW, et non sur la carte.
  //
  // Première tentative : `setPointerCapture` sur la carte. Mauvaise idée — si la
  // capture échoue (elle peut, sans lever d'erreur exploitable), les mouvements
  // cessent d'arriver dès que le curseur quitte la carte : le fantôme se fige à
  // mi-chemin et le relâchement n'atteint jamais le plateau. Observé sur Chrome.
  //
  // Écouter la fenêtre ne peut pas échouer : les évènements y remontent toujours,
  // quels que soient le re-rendu de la carte, son changement de positionnement au
  // survol, ou l'élément survolé.
  // Démontage de sûreté : la carte QUITTE LA MAIN dès qu'elle est jouée, donc
  // en plein glisser. Sans ce nettoyage, ses écouteurs de fenêtre survivraient à
  // son démontage et continueraient d'émettre des évènements de glisser pour une
  // carte qui n'est plus là.
  useEffect(() => () => { detachePointeurRef.current?.(); }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !canPlay) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    pointerDragRef.current = false;
    pointerIdRef.current = e.pointerId;

    const surMouvement = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerIdRef.current || !pointerStartRef.current) return;
      if (!pointerDragRef.current) {
        const dx = ev.clientX - pointerStartRef.current.x;
        const dy = ev.clientY - pointerStartRef.current.y;
        if (dx * dx + dy * dy <= TOUCH_DRAG_THRESHOLD * TOUCH_DRAG_THRESHOLD) return;
        pointerDragRef.current = true;
        setIsDragging(true);
        setIsHovered(false);
        setShowDetails(false);
      }
      setTouchGhostPos({ x: ev.clientX, y: ev.clientY });
      window.dispatchEvent(new CustomEvent("hand-touch-move", {
        detail: { clientX: ev.clientX, cardType: card.card_type },
      }));
    };

    const terminer = (ev: PointerEvent, depose: boolean) => {
      if (ev.pointerId !== pointerIdRef.current) return;
      detachePointeurRef.current?.();
      const glissait = pointerDragRef.current;
      pointerDragRef.current = false;
      pointerStartRef.current = null;
      pointerIdRef.current = null;
      if (!glissait) return;
      setIsDragging(false);
      setTouchGhostPos(null);

      // Le fantôme est en `pointerEvents: "none"` : elementFromPoint rend donc
      // ce qui se trouve DESSOUS, et non le fantôme lui-même.
      const sous = depose ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
      if (sous?.closest('[data-droptarget="my-board"]')) {
        window.dispatchEvent(new CustomEvent("hand-touch-drop", {
          detail: {
            cardInstanceId: cardInstance.instanceId,
            cardType: card.card_type,
            clientX: ev.clientX,
          },
        }));
      } else {
        window.dispatchEvent(new CustomEvent("hand-touch-end"));
      }
    };

    const surRelache = (ev: PointerEvent) => terminer(ev, true);
    const surAnnule = (ev: PointerEvent) => terminer(ev, false);

    // Un glisser déjà en cours (double appui, évènement manqué) est démonté avant
    // d'en armer un autre : deux jeux d'écouteurs se marcheraient dessus.
    detachePointeurRef.current?.();
    window.addEventListener("pointermove", surMouvement);
    window.addEventListener("pointerup", surRelache);
    window.addEventListener("pointercancel", surAnnule);
    detachePointeurRef.current = () => {
      window.removeEventListener("pointermove", surMouvement);
      window.removeEventListener("pointerup", surRelache);
      window.removeEventListener("pointercancel", surAnnule);
      detachePointeurRef.current = null;
    };
  };

  const isZoomed = !isDragging && isHovered && !isSelected;
  const showOverlay = isZoomed && showDetails;
  const W = 120;
  const H = 168;
  // Touch devices have no hover-zoom to read the tiny detail-overlay text, so
  // bump its font sizes. `d` multiplies the overlay text only — the always-on
  // card body is left untouched so the hand layout is unchanged.
  const coarse = useCoarsePointer();
  const d = coarse ? 1.5 : 1;
  const accentColor = isCreature ? "#74b9ff" : "#ce93d8";
  // Cost-payment visuals override the normal selection styling: red border
  // when picked for discard, gold glow on the source card being played.
  // Le cadre porte la couleur du SEUIL quand une capacité conditionnelle est
  // active : c'est ce que l'œil lit en premier, et un halo diffus derrière la
  // carte se perdait derrière le vert « jouable » qui domine toute la main.
  // Les états d'ACTION en cours (défausse, paiement, sélection) restent
  // prioritaires — ils disent ce qui se passe maintenant, pas un état de fond.
  const borderColor = isSelectedForDiscard ? "#e74c3c"
    : isSelectedForTopdeck ? REPLI_TEINTE
    : (isCostPaymentMode && isPendingCostSource) ? "#c8a84e"
    : isSelected ? "#c8a84e"
    : thresholdGlow ? `rgb(${thresholdGlow.rgb})`
    : (canPlay && !isCostPaymentMode) ? "#2ecc71"
    : isCreature ? "#3d3d5c" : "#6c3483";
  const iconOverrides = useKeywordIconStore((st) => st.overrides);

  const armForCast = () => {
    armedForCast.current = true;
    setShowDetails(true);
    setIsHovered(true);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => {
      armedForCast.current = false;
      setShowDetails(false);
      setIsHovered(false);
    }, ARM_TIMEOUT_MS);
  };

  const disarmCast = () => {
    armedForCast.current = false;
    setShowDetails(false);
    setIsHovered(false);
    if (armTimer.current) clearTimeout(armTimer.current);
  };

  // Touch UX: a tap anywhere outside the hand (empty board, a creature, the
  // hero…) dismisses an open detail overlay and disarms a primed spell, so a
  // zoomed card snaps back to its normal on-board look. GameBoard fires the
  // "dismiss-card-detail" window event on those taps. Desktop hover-zoom is
  // untouched — it isn't opened via touch, so neither ref is set.
  useEffect(() => {
    const dismiss = () => {
      if (!detailsOpenedByTouch.current && !armedForCast.current) return;
      detailsOpenedByTouch.current = false;
      armedForCast.current = false;
      setShowDetails(false);
      setIsHovered(false);
      if (detailTimer.current) clearTimeout(detailTimer.current);
      if (armTimer.current) clearTimeout(armTimer.current);
    };
    window.addEventListener("dismiss-card-detail", dismiss);
    return () => window.removeEventListener("dismiss-card-detail", dismiss);
  }, []);

  const longPress = useLongPress(() => {
    if (detailTimer.current) clearTimeout(detailTimer.current);
    // Spells follow the double-tap UX on touch — long-press arms them so
    // a single follow-up tap fires the cast (instead of dismissing the
    // overlay like creatures do).
    if (card.card_type === "spell") {
      if (armedForCast.current) disarmCast();
      else armForCast();
      return;
    }
    // Creatures / tokens keep the original preview-then-dismiss flow.
    // On mobile, the card is never `isHovered` (no mouseenter), so force
    // isHovered alongside showDetails so the overlay actually renders.
    setShowDetails(prev => {
      const next = !prev;
      setIsHovered(next);
      detailsOpenedByTouch.current = next;
      return next;
    });
  });

  // ─── Touch drag (HTML5 drag is mouse-only) ───────────────────────────────
  // Same gesture as the mouse path: a finger held still triggers long-press
  // (handled by useLongPress); a finger that moves past the threshold turns
  // into a drag. The two are composed in the touch handlers below.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDraggingRef = useRef(false);
  const [touchGhostPos, setTouchGhostPos] = useState<{ x: number; y: number } | null>(null);
  const TOUCH_DRAG_THRESHOLD = 12;

  const handleTouchStart = (e: React.TouchEvent) => {
    longPress.handlers.onTouchStart(e);
    lastTapWasTouch.current = true;
    if (!canPlay) return;
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    touchDraggingRef.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    longPress.handlers.onTouchMove(e);
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    if (!touchDraggingRef.current) {
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      if (dx * dx + dy * dy > TOUCH_DRAG_THRESHOLD * TOUCH_DRAG_THRESHOLD) {
        touchDraggingRef.current = true;
        setIsDragging(true);
        setIsHovered(false);
        setShowDetails(false);
        detailsOpenedByTouch.current = false;
        // Drag bypasses the double-tap rule — clear the arm so the drop
        // fires its own cast without waiting for a second tap.
        armedForCast.current = false;
        if (armTimer.current) clearTimeout(armTimer.current);
      }
    }
    if (touchDraggingRef.current) {
      setTouchGhostPos({ x: t.clientX, y: t.clientY });
      window.dispatchEvent(
        new CustomEvent("hand-touch-move", {
          detail: { clientX: t.clientX, cardType: card.card_type },
        })
      );
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    longPress.handlers.onTouchEnd(e);
    if (touchDraggingRef.current) {
      const t = e.changedTouches[0];
      let droppedOnBoard = false;
      let clientX = 0;
      if (t) {
        clientX = t.clientX;
        const elem = document.elementFromPoint(t.clientX, t.clientY);
        const board = elem?.closest('[data-droptarget="my-board"]');
        droppedOnBoard = !!board;
      }
      if (droppedOnBoard) {
        window.dispatchEvent(
          new CustomEvent("hand-touch-drop", {
            detail: {
              cardInstanceId: cardInstance.instanceId,
              cardType: card.card_type,
              clientX,
            },
          })
        );
      } else {
        window.dispatchEvent(new CustomEvent("hand-touch-end"));
      }
      touchDraggingRef.current = false;
      setIsDragging(false);
      setTouchGhostPos(null);
      e.preventDefault();
    }
    touchStartRef.current = null;
  };
  const handleTouchCancel = () => {
    longPress.handlers.onTouchCancel();
    if (touchDraggingRef.current) {
      window.dispatchEvent(new CustomEvent("hand-touch-end"));
      touchDraggingRef.current = false;
      setIsDragging(false);
      setTouchGhostPos(null);
    }
    touchStartRef.current = null;
  };

  return (
    <motion.div
      initial={{ y: 60, opacity: 0, scale: 0.7 }}
      animate={
        isBoost
          ? {
              // Flash doux « power-up » : légère montée + éclat de luminosité,
              // retour au repos. Aligné sur BoardCreature (pas de resize).
              y: [0, isEmpower ? -6 : -8, 0],
              opacity: 1,
              scale: 1,
              filter: [
                "brightness(1) saturate(1)",
                `brightness(${isEmpower ? 1.6 : 1.45}) saturate(${isEmpower ? 1.5 : 1.35})`,
                "brightness(1) saturate(1)",
              ],
            }
          : { y: 0, opacity: 1, scale: 1 }
      }
      transition={
        isBoost
          ? { duration: boostDur, ease: "easeOut" }
          : { default: SPRINGS.handEntry, opacity: { duration: 0.25, ease: "easeOut" } }
      }
      data-instance-id={cardInstance.instanceId}
      data-hand-card="true"
      data-zoom={1.41}
      style={{ width: W, height: H, position: "relative", zoom: 1.41 }}
    >
      {/* Halo de SEUIL — état permanent, distinct du halo de boost ci-dessous
          qui est un évènement ponctuel. Les deux coexistent : un sort renforcé
          qui reçoit un buff ne doit pas perdre son halo le temps de l'animation.
          Auréole derrière la carte plutôt qu'un liseré — la carte de main est
          grande, un simple bord s'y perdrait. */}
      {thresholdGlow && (
        <div
          aria-hidden
          title={thresholdGlow.label}
          style={{
            position: "absolute", inset: "-14%", borderRadius: 24,
            pointerEvents: "none", zIndex: -2,
            background: `radial-gradient(closest-side, rgba(${thresholdGlow.rgb},0.85), rgba(${thresholdGlow.rgb},0) 72%)`,
            boxShadow: `0 0 30px 8px rgba(${thresholdGlow.rgb},0.4)`,
            animation: "threshold-glow-halo 2.4s ease-in-out infinite",
          }}
        />
      )}

      {/* Halo de boost — enfle puis s'estompe DERRIÈRE la carte (zIndex -1),
          auréole dorée qui déborde des bords. Miroir de BoardCreature. */}
      <motion.div
        aria-hidden
        style={{
          position: "absolute", inset: "-16%", borderRadius: 24,
          pointerEvents: "none", zIndex: -1,
          background: `radial-gradient(closest-side, rgba(${haloRgb},0.55), rgba(${haloRgb},0) 78%)`,
          boxShadow: `0 0 36px 10px rgba(${haloRgb},0.45)`,
        }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={isBoost ? { opacity: [0, 0.9, 0], scale: [0.85, haloPeak, haloPeak * 0.96] } : { opacity: 0, scale: 0.85 }}
        transition={{ duration: boostDur, ease: "easeOut", times: isBoost ? [0, 0.4, 1] : undefined }}
      />
      <div
        ref={cardRef}
        // Glisser natif DÉSACTIVÉ : le laisser actif ferait démarrer une session
        // HTML5 concurrente, qui volerait les évènements pointeur à l'instant
        // précis où le glisser commence.
        draggable={false}
        onPointerDown={handlePointerDown}
        onMouseEnter={() => {
          // iPad/Safari fire a synthetic mouseenter on tap (hover emulation)
          // but never a matching mouseleave, so a hover-opened overlay would
          // get stuck. On touch, only long-press opens the detail (it handles
          // its own tap-to-dismiss); desktop hover is unchanged.
          if (coarse) return;
          setIsHovered(true);
          detailTimer.current = setTimeout(() => setShowDetails(true), 600);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowDetails(false);
          if (detailTimer.current) clearTimeout(detailTimer.current);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowDetails(prev => !prev);
          if (detailTimer.current) clearTimeout(detailTimer.current);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onClick={() => {
          if (longPress.consume()) return;
          if (touchDraggingRef.current) return;
          const isSpell = card.card_type === "spell";
          const isFromTouch = lastTapWasTouch.current;
          lastTapWasTouch.current = false;

          // Mobile double-tap for spells: first tap arms + shows the
          // description, second tap fires the cast. Desktop clicks (no
          // preceding touchstart) and cost-payment / non-playable taps
          // skip this entirely. Drag-to-board already cleared the arm
          // in handleTouchMove, so dropped spells fire normally.
          if (isSpell && isFromTouch && !isCostPaymentMode && canPlay) {
            if (armedForCast.current) {
              disarmCast();
              onClick?.();
              return;
            }
            armForCast();
            return;
          }

          // Creatures (or non-touch spells): existing long-press preview
          // flow — a tap dismisses the description instead of firing.
          if (detailsOpenedByTouch.current) {
            detailsOpenedByTouch.current = false;
            setShowDetails(false);
            setIsHovered(false);
            if (detailTimer.current) clearTimeout(detailTimer.current);
            return;
          }
          if (isCostPaymentMode) {
            if (!isPendingCostSource) payerParClic();
            return;
          }
          // SORT À CIBLE : le simple clic ouvre le ciblage (cf. la prop). Placé
          // APRÈS le paiement de coût, qui garde la priorité — pendant un
          // créneau de paiement, une carte de main est une monnaie, pas un sort.
          // Hors de portée du tactile : la branche double-tap des sorts, plus
          // haut, a déjà rendu la main pour ce cas.
          if (onSelectForTargeting) {
            onSelectForTargeting();
            return;
          }
          // Le simple clic NE JOUE PLUS la carte : il faut un double-clic
          // (cf. onDoubleClick). Un clic isolé ne fait donc plus que ce qui
          // précède — consommer un appui long, refermer la description, ou
          // désigner une carte en mode paiement de coût.
        }}
        onDoubleClick={() => {
          // DOUBLE-CLIC = jouer la carte, sorts comme créatures.
          //
          // Une carte de main est une grande cible qu'on survole en permanence :
          // au simple clic, le geste le plus banal de l'interface était aussi le
          // plus irréversible.
          //
          // Le paiement de coût reste au simple clic : c'est une DÉSIGNATION et
          // non un déclenchement, et l'exiger en double gênerait la sélection de
          // plusieurs cartes.
          //
          // Pointeur grossier exclu : le tactile a déjà ses gestes propres — le
          // double-tap armé des sorts (armForCast) et le glisser pour les
          // créatures — que ce gestionnaire doublerait.
          if (coarse) return;
          if (longPress.consume()) return;
          if (pointerDragRef.current) return;
          if (isCostPaymentMode) return;
          if (!canPlay) return;
          onClick?.();
        }}
        style={{
          ...LONG_PRESS_RESET_STYLE,
          touchAction: "none",
          width: W, height: H, borderRadius: 8,
          position: isZoomed ? "absolute" : "relative",
          bottom: isZoomed ? 0 : undefined,
          left: isZoomed ? "50%" : undefined,
          transformOrigin: "bottom center",
          background: isCreature
            ? "linear-gradient(160deg, #1a1a2e, #0d0d1a)"
            : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
          border: `2px solid ${borderColor}`,
          boxShadow: isSelectedForDiscard ? "0 0 14px #e74c3c88"
            : isSelectedForTopdeck ? `0 0 14px ${REPLI_TEINTE}88`
            : (isCostPaymentMode && isPendingCostSource) ? "0 0 14px #c8a84e88"
            : isSelected ? "0 0 12px #c8a84e44"
            : thresholdGlow ? undefined // piloté par l'animation ci-dessous
            : (canPlay && !isCostPaymentMode) ? "0 0 12px #2ecc7166"
            : "none",
          // Battement lent : c'est un état permanent, pas un évènement. Sans
          // pulsation, la couleur de seuil passerait pour une simple variante
          // du cadre et ne se remarquerait pas.
          ...(thresholdGlow
            ? {
              ["--glow-rgb" as string]: thresholdGlow.rgb,
              animation: "threshold-glow-pulse 2.4s ease-in-out infinite",
            }
            : {}),
          // overflow: visible so the RarityFrame (inset: -4) can extend
          // past the card edges. The art div below now carries its own
          // border-radius + overflow: hidden to keep the image rounded.
          overflow: "visible",
          cursor: isCostPaymentMode
            ? (isPendingCostSource ? "default" : "pointer")
            : isDragging ? "grabbing" : canPlay ? "grab" : "not-allowed",
          // Non-playable cards (e.g. the whole hand during the opponent's turn)
          // stay readable at 0.9 — the desaturated border already signals
          // "can't play this now", so heavy dimming just made the hand hard to
          // read (was 0.75).
          opacity: isDragging ? 0.5 : (isCostPaymentMode || canPlay) ? 1 : 0.9,
          transition: "border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease",
          transform: isZoomed ? "translateX(-50%)" : "none",
          zoom: isZoomed ? 1.3 : 1,
          zIndex: isZoomed ? 50 : 1,
        }}
      >
        {/* Rarity frame — fades in only on hover-zoom for non-Commune
            creatures. Sits behind the art (DOM order = paint order) so its
            metallic gradient is only visible as the 4-px ring around the
            card, not over the card body. */}
        {/* Concentric corners with the card's borderRadius:8 + border:2px
            require inset = 4 + border = 6, and borderRadius = inset +
            (card_radius - border) = 6 + 6 = 12. Visible ring outside the
            card edge is 4px. */}
        <RarityFrame
          rarity={card.rarity}
          visible={isZoomed && isCreature}
          inset={3}
          borderRadius={9}
        />

        {/* Inner clip-wrapper — replaces the inner card's overflow:hidden
            (lifted to allow the rarity frame to escape past the card edge).
            All card content (art, badges, bar, overlay) lives inside and
            gets clipped to the card's rounded corners. borderRadius:6
            matches the inner edge of the card's 2px border (8 outer − 2). */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 6, overflow: "hidden" }}>

        {/* Full-bleed art */}
        <div style={{ position: "absolute", inset: 0 }}>
          {resolvedImageUrl ? (
            <Image
              src={resolvedImageUrl}
              alt={card.name}
              fill
              className="object-cover"
              sizes="(min-resolution: 2dppx) 600px, 300px"
              // Base brightness lift to match the brightened board (see
              // BoardCreature) — raw card art reads too dark otherwise.
              style={{ filter: "brightness(1.05)" }}
              // Une <img> est NATIVEMENT draggable, et Firefox lui donne la
              // priorité sur son ancêtre (mesuré : `dragstart` y a pour cible
              // l'IMG, là où Chromium prend la carte — la règle
              // `-webkit-user-drag: none` de globals.css ne vaut que pour
              // WebKit/Blink). Une session HTML5 démarrée ici volerait les
              // évènements pointeur dont dépend désormais le glisser.
              draggable={false}
              // Served directly from the Supabase CDN — card-art sources are
              // already small webp (≤800px) so the Next optimizer only added
              // dev-time queueing that left cards blank when many loaded at once.
              unoptimized
            />
          ) : (
            <div style={{
              width: "100%", height: "100%",
              background: isCreature
                ? "linear-gradient(135deg, #1a1a2e, #2a2a4599, #1a1a2e)"
                : "linear-gradient(135deg, #1a0a2a, #6c348333, #1a0a2a)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 36, opacity: 0.5 }}>{isCreature ? "⚔️" : "✨"}</span>
            </div>
          )}
        </div>


        {/* Cost badges (mana + life + discard + sacrifice) */}
        <CostBadges card={card} size={22} effectiveManaCost={effectiveManaCost} isCostReduced={isCostReduced} />

        {/* ÉVEIL — le SECOND geste de la carte.
            Cliquer la carte la joue normalement ; cliquer cette pastille la met
            en éveil. Un bouton explicite plutôt qu'un appui long : l'appui long
            sert déjà à l'aperçu, et un geste caché rendrait la moitié du
            mécanisme introuvable. Rendue seulement quand la mise en éveil est
            réellement possible (`onSuspendEveil` n'est passée que dans ce cas),
            pour qu'aucun clic ne reste sans effet. */}
        {onSuspendEveil && !isCostPaymentMode && (
          <button
            type="button"
            title={t('eveil_suspend', { count: card.eveil_cost ?? 0 })}
            onClick={(e) => {
              // Sans cet arrêt, le clic remonterait au conteneur et JOUERAIT la
              // carte — soit exactement l'inverse de ce qu'on demande.
              e.stopPropagation();
              onSuspendEveil();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 3, right: 3, zIndex: 6,
              width: 20, height: 20, borderRadius: 5,
              background: "radial-gradient(circle, #3d2a10, #1c1206)",
              border: `1.5px solid ${EVEIL_TEINTE}`,
              color: EVEIL_TEINTE, fontSize: 11, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
              boxShadow: `0 0 8px ${EVEIL_TEINTE}77`,
            }}
          >{EVEIL_GLYPHE}</button>
        )}

        {/* Name — top bar (nom en haut, taille réduite de 30% : 10 → 7). Centré
            avec padding horizontal pour dégager le badge de coût (coin) et les
            indicateurs de coin. Gradient descendant pour la lisibilité. */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 2,
          padding: "3px 26px 6px",
          background: "linear-gradient(180deg, #0d0d1add 0%, #0d0d1a88 45%, transparent 78%)",
        }}>
          {/* La boîte tronquée ne porte AUCUN padding : `overflow: hidden`
              découpe au bord de la BOÎTE, pas du contenu — un padding bas
              laissait passer le haut de la ligne suivante sous le « … ». */}
          <div style={{
            fontSize: (7 * d) * titleFontScale(localizeName(card)),
            color: "#d8b25a", fontWeight: 700, textAlign: "center",
            overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.15,
            display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2,
            fontFamily: "'Cinzel', serif",
            textShadow: "0 1px 2px #000, 0 0 3px #000, 0 0 5px #000",
          }}>{localizeName(card)}</div>
        </div>

        {/* Cost-payment selection overlays */}
        {isSelectedForDiscard && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #e74c3c33, #00000022)",
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 60, color: "#e74c3c", filter: "drop-shadow(0 0 6px #000)" }}>✕</span>
          </div>
        )}
        {isSelectedForTopdeck && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 4,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 2,
            background: `linear-gradient(135deg, ${REPLI_TEINTE}33, #00000022)`,
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 52, lineHeight: 1, color: REPLI_TEINTE, filter: "drop-shadow(0 0 6px #000)" }}>↥</span>
            {/* Le RANG, pas une simple coche : c'est lui qui dit quelle carte
                finira sur le dessus, donc laquelle sera repiochée en premier.
                Sans ce chiffre, deux replis seraient indiscernables. */}
            {selectedTopdeckIds.length > 1 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: "#0d0d1a",
                background: REPLI_TEINTE, borderRadius: 999, padding: "1px 7px",
                fontFamily: "'Cinzel', serif",
              }}>{rangRepli + 1}</span>
            )}
          </div>
        )}
        {isCostPaymentMode && isPendingCostSource && (
          <div style={{
            position: "absolute", top: 4, right: 4, zIndex: 4,
            background: "#c8a84e", color: "#0d0d1a",
            fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3,
            pointerEvents: "none",
          }}>EN JEU</div>
        )}

        {/* Bottom bar */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
          padding: "5px 6px 4px",
          background: "linear-gradient(0deg, #0d0d1add 0%, #0d0d1a88 40%, transparent 65%)",
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          {/* Keywords + Stats — single row */}
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
            {(card.keywords.length > 0 || (card.keyword_instances?.length ?? 0) > 0) && (() => {
              return buildKeywordDisplayEntries(card)
                .filter((e) => !isCreatureKwShadowedBySpell(e.kw, card.spell_keywords))
                .map((entry, idx) => {
                  const { kw, x, mode } = entry;
                  const hasImg = !!iconOverrides[kw];
                  const modeColor = keywordModeColor(mode);
                  // On a spell, keywords are CONFERRED — "all allies" gets a
                  // visible green chip behind the icon (a glow was clipped by
                  // overflow:hidden); single target keeps the default look.
                  const grantScope = card.card_type === "spell"
                    ? (card.keyword_instances?.find((k) => k.id === kw)?.grantScope ?? "target")
                    : null;
                  const isAllAllies = grantScope === "all_allies";
                  return (
                    <div key={`${kw}-${entry.instanceIdx ?? `legacy-${idx}`}`} style={{
                      minWidth: 32, height: 32, borderRadius: 3,
                      padding: x != null ? "0 2px" : 0,
                      background: isAllAllies ? "#27ae6055" : (hasImg ? "transparent" : `${accentColor}33`),
                      border: isAllAllies ? "1px solid #27ae60" : (hasImg ? "none" : `1px solid ${accentColor}66`),
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1,
                      fontSize: 8, overflow: "visible",
                    }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 0 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flexShrink: 0 }}>
                          <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={20} keyword={kw} fill mode={mode} />
                        </span>
                      </span>
                      {keywordBadgeValue(kw, x, entry.instance) != null && <span style={{ fontSize: 12, fontWeight: 900, color: modeColor ?? "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${modeColor ?? accentColor}, ${TEXT_CONTRAST_HALO}` }}>{keywordBadgeValue(kw, x, entry.instance)}</span>}
                    </div>
                  );
                });
            })()}

            {card.spell_keywords && card.spell_keywords.length > 0 && card.spell_keywords.map((spellKw, i) => {
              const def = SPELL_KEYWORDS[spellKw.id];
              if (!def) return null;
              const displayTitle = vocab.spellKeywordLabel(spellKw);
              // Format centralisé (cf. getSpellKeywordBadgeValue) — couvre la
              // paire neutre amount+health de Déchainement X/Y.
              const valueText = getSpellKeywordBadgeValue(spellKw);
              const hasValue = valueText != null;
              const spellKey = `spell_${spellKw.id}`;
              const hasImg = !!iconOverrides[spellKey];
              return (
              <div key={`sk_${i}`} title={displayTitle} style={{
                minWidth: 32, height: 32, borderRadius: 3,
                padding: hasValue ? "0 2px" : 0,
                background: hasImg ? "transparent" : `${accentColor}33`,
                border: hasImg ? "none" : `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1,
                fontSize: 8, overflow: "visible",
              }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flexShrink: 0 }}>
                  <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={20} keyword={spellKey} fill mode="spell" />
                </span>
                {valueText && <span style={{
                  fontSize: 12, fontWeight: 900, color: keywordModeColor("spell") ?? "#fff",
                  fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}, ${TEXT_CONTRAST_HALO}`,
                }}>{valueText}</span>}
              </div>
              );
            })}

            {/* Effets composés (sans cadre ; même gabarit icône+valeur que les keywords) */}
            {composedCapsOf(card.capabilities).map((cap, i) => {
              const ic = composedIcon(cap);
              const cmode = composedTriggerMode(cap);
              const val = composedValueText(cap);
              const tint = keywordModeColor(composedTriggerMode(cap)) ?? accentColor;
              const hasImg = !!iconOverrides[ic.keyword];
              return (
                <div key={`cx-${i}`} title={vocab.composedDesc(cap, tokenTemplates)} style={{
                  minWidth: 32, height: 32, padding: val ? "0 2px" : 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1, overflow: "visible",
                }}>
                  <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 0 }}>
                    <span style={{ display: "inline-flex", lineHeight: 0 }}>
                    {hasImg ? (
                      // 14×14 to match the keyword-chip icon size — was 24×24,
                      // which made composed-effect icons on hand cards render
                      // bigger than the same keyword shown as a chip in play.
                      <div style={{ width: 20, height: 20, flexShrink: 0 }}><KeywordIcon symbol={ic.symbol} size={20} keyword={ic.keyword} fill mode={cmode} /></div>
                    ) : (
                      <KeywordIcon symbol={ic.symbol} size={20} keyword={ic.keyword} mode={cmode} />
                    )}
                    </span>
                    <ComposedMarker mode={cmode} size={10} />
                  </span>
                  {val && <span style={{ fontSize: 12, fontWeight: 900, color: keywordModeColor(composedTriggerMode(cap)) ?? "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${tint}, ${TEXT_CONTRAST_HALO}`, marginLeft: 1 }}>{val}</span>}
                </div>
              );
            })}

            {isCreature && (
              <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "1px 5px", borderRadius: 4,
                  background: "#e74c3c18", border: "1px solid #e74c3c55",
                }}>
                  <span style={{ fontSize: 13, color: "#e74c3c", fontWeight: 700 }}>{displayAttack}</span>
                </div>
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "1px 5px", borderRadius: 4,
                  background: "#f1c40f18", border: "1px solid #f1c40f55",
                }}>
                  <span style={{ fontSize: 13, color: "#f1c40f", fontWeight: 700 }}>{displayHealth}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hover overlay */}
        <div className="no-scrollbar" style={{
          position: "absolute", inset: 0, zIndex: 3,
          background: "#0d0d1ab3",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          opacity: showOverlay ? 1 : 0,
          transition: "opacity 0.25s ease",
          pointerEvents: showOverlay ? "auto" : "none",
          display: "flex", flexDirection: "column", justifyContent: "flex-start",
          padding: "10px 7px",
          gap: 5,
          overflowY: "auto",
        }}>
          {/* Name */}
          <div style={{
            fontSize: 9 * d, color: accentColor, fontWeight: 700,
            textAlign: "center", fontFamily: "'Cinzel', serif",
            borderBottom: `1px solid ${accentColor}44`, paddingBottom: 4,
          }}>{localizeName(card)}</div>

          {/* Race / Clan */}
          {(card.race || card.clan) && (
            <div style={{ display: "flex", justifyContent: "center", gap: 4, fontSize: 6 * d, color: "#888", fontFamily: "'Crimson Text',serif" }}>
              {card.race && <span>{card.race}</span>}
              {card.race && card.clan && <span style={{ color: "#555" }}>·</span>}
              {card.clan && <span style={{ fontStyle: "italic" }}>{vocab.clanName(card.clan)}</span>}
            </div>
          )}

          {/* Year — affiché en bas-droit du popup, juste le nombre */}
          {card.card_year && (
            <div style={{
              position: "absolute", bottom: 4, right: 5, zIndex: 1,
              fontSize: 6, color: "#888", fontFamily: "'Crimson Text',serif",
              pointerEvents: "none",
            }}>
              {card.card_year}
            </div>
          )}

          {/* Capacités detail */}
          {(card.keywords.length > 0 || (card.keyword_instances?.length ?? 0) > 0) && (() => {
            const visible = buildKeywordDisplayEntries(card)
              .filter((e) => !isCreatureKwShadowedBySpell(e.kw, card.spell_keywords));
            if (visible.length === 0) return null;
            return (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {visible.map((entry, idx) => {
                const { kw, x, mode } = entry;
                const ctx = { card, instance: entry.instance, x, tokens: tokenTemplates, espritCount };
                const label = vocab.keywordLabelFor(kw, ctx);
                // Plus d'annotation de déclencheur : la couleur transmet le moment.
                const displayLabel = applyKeywordValueToLabel(kw, label, x, entry.instance);
                const desc = vocab.keywordDesc(kw, ctx);
                const modeColor = keywordModeColor(mode);
                return (
                <div key={`${kw}-${entry.instanceIdx ?? `legacy-${idx}`}`} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <span style={{ flexShrink: 0, lineHeight: 0 }}>
                    <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={9} keyword={kw} mode={mode} />
                  </span>
                  <div>
                    <div style={{ fontSize: 7 * d, color: modeColor ?? "#fff", fontWeight: 600 }}>{displayLabel}{(() => { const d = vocab.keywordTrigger(kw, entry.instance); return d ? <span style={{ color: d.color }}> ({d.label})</span> : null; })()}</div>
                    {desc && <div style={{ fontSize: 6 * d, color: "#999", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{desc}</div>}
                    {/* Compagnons : les cartes liées, nommées, avec leur verso au survol. */}
                    {kw === "compagnons" && <CompagnonsNames ids={entry.instance?.linkedCardIds} scale={d * 0.16} />}
                  {/* Tokens créés : leur nom seul dans la phrase, leur VERSO au survol. */}
                  <TokenNames cards={tokenCardsForKeyword(kw, card, tokenTemplates, x)} scale={d * 0.16} />
                  </div>
                </div>
                );
              })}
            </div>
            );
          })()}

          {/* Spell keyword details */}
          {card.spell_keywords && card.spell_keywords.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {card.spell_keywords.map((spellKw, i) => {
                const label = vocab.spellKeywordLabel(spellKw);
                const desc = vocab.spellKeywordDesc(spellKw, card, tokenTemplates);
                return (
                <div key={`sk_${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <span style={{ flexShrink: 0 }}><KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={9} keyword={`spell_${spellKw.id}`} mode="spell" /></span>
                  <div>
                    <div style={{ fontSize: 7 * d, color: keywordModeColor("spell") ?? accentColor, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 6 * d, color: "#999", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{desc}</div>
                    {/* Compagnons (sort) : les cartes liées, nommées. */}
                    {spellKw.id === "compagnons" && <CompagnonsNames ids={spellKw.linkedCardIds} scale={d * 0.16} />}
                  <TokenNames cards={tokenCardsForKeyword(spellKw.id, card, tokenTemplates)} scale={d * 0.16} />
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Effets composés — détail (icône + texte généré) */}
          {composedCapsOf(card.capabilities).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {composedCapsOf(card.capabilities).map((cap, i) => {
                const ic = composedIcon(cap);
                const cmode = composedTriggerMode(cap);
                const nm = vocab.composedName(cap);
                return (
                  <div key={`cxd-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                    <span style={{ position: "relative", flexShrink: 0, display: "inline-flex", lineHeight: 0 }}><span style={{ display: "inline-flex", lineHeight: 0 }}><KeywordIcon symbol={ic.symbol} size={9} keyword={ic.keyword} mode={cmode} /></span><ComposedMarker mode={cmode} size={6} /></span>
                    <div>
                      {nm && <div style={{ fontSize: 7 * d, color: keywordModeColor(cmode) ?? "#fff", fontWeight: 600 }}>{nm}{(() => { const d = vocab.composedBadge(cap); return d ? <span style={{ color: d.color }}> ({d.label})</span> : null; })()}</div>}
                      <div style={{ fontSize: 6 * d, color: "#999", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{vocab.composedDesc(cap, tokenTemplates)}</div>
                    <TokenNames cards={tokenCardsForComposed(cap.composed, tokenTemplates)} scale={d * 0.16} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Effect text */}
          {cleanEffectText(card.effect_text, card.spell_keywords) && (
          <div style={{
            padding: 4,
            background: `${accentColor}11`, borderRadius: 3,
            border: `1px solid ${accentColor}22`,
          }}>
            <p style={{
              margin: 0, fontSize: 7 * d, color: "#ccc",
              lineHeight: 1.4, fontFamily: "'Crimson Text', serif",
            }}>{cleanEffectText(card.effect_text, card.spell_keywords)}</p>
          </div>
          )}

          {localizeFlavor(card) && (
            <p style={{
              margin: 0, fontSize: 6 * d, color: "#74b9ff77",
              fontStyle: "italic", lineHeight: 1.3, fontFamily: "'Crimson Text', serif",
              textAlign: "center",
            }}>&ldquo;{localizeFlavor(card)}&rdquo;</p>
          )}

          {/* Stats recap */}
          <div style={{
            display: "flex", justifyContent: "center", gap: 6,
            fontSize: 7 * d, color: "#555",
          }}>
            <span style={isCostReduced ? { color: "#2ecc71" } : undefined}>💧 {effectiveManaCost}</span>
            {isCreature && <><span style={{ color: "#e74c3c" }}>⚔ {displayAttack}</span><span style={{ color: "#f1c40f" }}>❤ {displayHealth}</span></>}
          </div>
        </div>
        </div>{/* close clip-wrapper */}
      </div>
      {touchGhostPos && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: W,
            height: H,
            transform: `translate(${touchGhostPos.x - W / 2}px, ${touchGhostPos.y - H / 2}px)`,
            pointerEvents: "none",
            zIndex: 9999,
            borderRadius: 8,
            border: `2px solid ${borderColor}`,
            background: isCreature
              ? "linear-gradient(160deg, #1a1a2e, #0d0d1a)"
              : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
            overflow: "hidden",
            opacity: 0.85,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}
        >
          {resolvedImageUrl && (
            // Use a plain <img> in the portal — Next/Image inside a fixed
            // overlay would need explicit sizes; this is a transient drag
            // ghost so a regular image is simpler and good enough.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedImageUrl}
              alt={card.name}
              // Match the inline card art's brightness lift so the zoomed/drag
              // ghost doesn't look darker than the card it came from.
              style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.05)" }}
            />
          )}
        </div>,
        document.body
      )}
    </motion.div>
  );
}

// Mémoïsé : évite les re-renders déclenchés par le PARENT (GameBoard) quand
// rien ne change pour cette carte. HandCard s'abonne déjà finement au store
// (gameState/localPlayerId/…) pour son propre contenu. On ignore `onClick`
// (arrow inline recréée à chaque render du parent) : son comportement dépend
// de cardInstance (comparé) + selectCardInHand/broadcast, refs stables.
function propsEqual(a: HandCardProps, b: HandCardProps): boolean {
  return (
    a.cardInstance === b.cardInstance &&
    a.canPlay === b.canPlay &&
    a.isSelected === b.isSelected &&
    // `onSuspendEveil` n'est pas comparée par identité (arrow inline, comme
    // `onClick`) mais par PRÉSENCE : c'est elle qui décide si la pastille
    // d'éveil est rendue. La comparer par identité rendrait à chaque frame ;
    // ne pas la comparer du tout figerait la pastille quand le plafond
    // `MAX_EVEIL` se remplit ou se libère.
    Boolean(a.onSuspendEveil) === Boolean(b.onSuspendEveil) &&
    a.boost === b.boost
  );
}

export default memo(HandCard, propsEqual);
