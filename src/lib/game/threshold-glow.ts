// Halo des capacités CONDITIONNELLES : celles qui ne font rien tant qu'une
// condition de partie n'est pas remplie, puis s'activent d'un coup.
//
// Rien à l'écran ne le signalait — il fallait compter son deck ou son cimetière
// pour savoir si une carte était renforcée, et le bonus se découvrait au moment
// de jouer. Un halo coloré rend cet état lisible d'un coup d'œil, sur le plateau
// comme en main.
//
// ⚠️ Ce module N'ÉVALUE PAS de règle : il RÉUTILISE les prédicats et les seuils
// du moteur. Un halo qui s'allume quand la capacité ne s'active pas — ou
// l'inverse — serait pire que pas de halo du tout, et c'est exactement ce que
// produirait une condition recopiée puis laissée dériver.

import type { Card, GameState, PlayerState } from "./types";
import { getCapabilities } from "./capability-adapter";
import { SEUIL_DECK_THRESHOLD } from "./constants";
import { FORCE_ANCETRES_GRAVEYARD_THRESHOLD, boardHasChanter, boardIsDisciplined, effectiveManaCost } from "./engine";

export interface ThresholdGlow {
  /** Id de l'ability du registre — sert de clé de rendu. */
  abilityId: string;
  /** Face de la carte qui reçoit RÉELLEMENT le bonus (cf. GLOW_PALETTE).
   *  "both" pour une capacité dont les DEUX faces profitent du bonus. */
  benefitsOn: "creature" | "spell" | "both";
  /** Composantes `r, g, b` (pour composer des rgba() à l'opacité voulue). */
  rgb: string;
  /** Libellé court, pour l'infobulle. */
  label: string;
}

/** Palette et ORDRE de priorité. L'ordre compte : deux capacités peuvent être
 *  actives sur la même unité (Seuil Sacrificiel + Force des ancêtres est un cas
 *  réel), et l'anneau ne peut porter qu'une couleur — c'est la première de
 *  cette liste qui gagne.
 *
 *  `benefitsOn` dit QUI reçoit réellement le bonus, et n'est pas décoratif :
 *  **Chant est asymétrique**. Côté créature c'est un marqueur inerte — la
 *  chanteuse ne gagne rien, elle habilite les SORTS. La faire luire annonçait un
 *  renfort qui n'existe pas, et détournait le signal de la carte qui en profite
 *  vraiment. Les trois autres sont mono-face, mais on le déclare pour toutes :
 *  une capacité polymorphe ajoutée demain devra trancher ce point. */
const GLOW_PALETTE: ReadonlyArray<{
  abilityId: string;
  rgb: string;
  label: string;
  benefitsOn: "creature" | "spell" | "both";
}> = [
  { abilityId: "force_des_ancetres", rgb: "168, 85, 247", label: "Force des ancêtres", benefitsOn: "creature" }, // violet spectral (cimetière)
  { abilityId: "seuil_sacrificiel", rgb: "190, 49, 68", label: "Seuil Sacrificiel", benefitsOn: "creature" },     // rouge sombre (deck qui s'épuise)
  { abilityId: "purete", rgb: "236, 240, 245", label: "Pureté", benefitsOn: "creature" },                          // blanc nacré (cimetière intact)
  // Première capacité à luire sur ses DEUX faces, et à bon droit : la créature
  // se renforce elle-même, le sort renforce une alliée — l'une comme l'autre
  // profite de la condition. Le halo reste honnête en main, car une créature
  // qui arrive sur un plateau discipliné y ajoute sa PROPRE parité : la
  // condition vraie avant la pose l'est encore après.
  { abilityId: "discipline", rgb: "70, 118, 190", label: "Discipline", benefitsOn: "both" },                       // bleu acier (rang tenu)
  { abilityId: "seuil_colere", rgb: "232, 122, 24", label: "Seuil de colère", benefitsOn: "spell" },              // orange braise
  { abilityId: "chant", rgb: "23, 182, 196", label: "Chant", benefitsOn: "spell" },                               // cyan — teinte déjà associée à Chant
];

/** La condition de CHAQUE capacité, évaluée sur le contrôleur de la carte.
 *
 *  `owner` est le contrôleur, jamais le joueur local : une créature ADVERSE à
 *  seuil actif doit luire pour les deux joueurs, avec le deck et le cimetière de
 *  son propre camp. */
function conditionMet(
  abilityId: string,
  owner: PlayerState,
  // Discipline est la première condition à dépendre de la CARTE et pas
  // seulement du joueur : sa parité de référence est le coût de la carte
  // elle-même. `manaCostReduction` vient de l'instance quand l'appelant l'a
  // sous la main (Concentration grave sa remise dessus) — sans lui, le halo
  // annoncerait la parité du coût imprimé, donc parfois la mauvaise.
  card: Card,
  manaCostReduction: number,
): boolean {
  switch (abilityId) {
    // Deux capacités adossées au même seuil de deck (cf. recalculateAuras et
    // resolveSpellCard, qui lisent la même constante).
    case "seuil_sacrificiel":
    case "seuil_colere":
      return owner.deck.length <= SEUIL_DECK_THRESHOLD;
    // Même filtre que recalculateAuras : les SORTS au cimetière ne comptent pas.
    case "force_des_ancetres":
      return owner.graveyard.filter(g => g.card.card_type === "creature").length
        >= FORCE_ANCETRES_GRAVEYARD_THRESHOLD;
    // Prédicat du moteur, réutilisé tel quel (chanteuse vivante, côté lanceur).
    case "chant":
      return boardHasChanter(owner);
    // « Vide » au sens STRICT — sorts compris, pas seulement les créatures.
    // C'est ce qui distingue Pureté d'un seuil bas, et le halo doit dire la
    // même chose que le moteur (cf. recalculateAuras).
    case "purete":
      return owner.graveyard.length === 0;
    // Prédicat du moteur, réutilisé tel quel — coût RÉEL des deux côtés de la
    // comparaison, exactement comme au déclenchement (cf. boardIsDisciplined).
    case "discipline":
      return boardIsDisciplined(owner, effectiveManaCost({ card, manaCostReduction }, owner));
    default:
      return false;
  }
}

/** Halos ACTIFS d'une carte, dans l'ordre de priorité de la palette.
 *
 *  Les capacités sont lues via `getCapabilities`, jamais via `card.keywords` :
 *  c'est la règle du projet, et une capacité conférée à l'exécution serait
 *  sinon manquée. */
export function activeThresholdGlows(
  card: Card,
  state: GameState | null | undefined,
  ownerId: string | null | undefined,
  /** Remise de Concentration gravée sur l'INSTANCE, quand l'appelant en a une.
   *  Ne sert qu'à Discipline, dont la condition se lit sur le coût réel. */
  manaCostReduction = 0,
): ThresholdGlow[] {
  if (!state || !ownerId) return [];
  const owner = state.players.find(p => p.id === ownerId);
  if (!owner) return [];

  const carried = new Set(getCapabilities(card).map(c => c.abilityId));
  return GLOW_PALETTE.filter(g =>
    carried.has(g.abilityId)
    && (g.benefitsOn === "both" || g.benefitsOn === card.card_type)
    && conditionMet(g.abilityId, owner, card, manaCostReduction));
}

/** Halo à peindre, ou `null`. L'anneau ne portant qu'une couleur, c'est la
 *  première capacité active qui la donne — mais la liste complète reste
 *  disponible pour l'infobulle et le halo externe. */
export function primaryThresholdGlow(
  card: Card,
  state: GameState | null | undefined,
  ownerId: string | null | undefined,
  manaCostReduction = 0,
): ThresholdGlow | null {
  return activeThresholdGlows(card, state, ownerId, manaCostReduction)[0] ?? null;
}
