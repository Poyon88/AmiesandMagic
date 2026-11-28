// FAMILLES DE SORTS — la signature visuelle d'un sort, déduite de la carte.
//
// Les cartes n'ont pas de champ « élément ». On le déduit, du plus parlant au
// plus général :
//   1. le NOM du sort (« Projection de Lave », « Morsure du Givre »…) ;
//   2. ce qu'il FAIT quand la mécanique impose une lecture (poison, soin) ;
//   3. le clan élémentaire (les quatre clans des Élémentaires) ;
//   4. les mécaniques d'outre-tombe (malédiction, exhumation…) ;
//   5. la FACTION, qui donne une signature par défaut à tout le reste.
//
// Module pur (aucune dépendance au DOM) : purement cosmétique, il ne lit que la
// carte et ne touche jamais à l'état de partie.

import type { Card } from "@/lib/game/types";
import { composedAbilityIds } from "@/lib/game/ability-filter";

export type FamilleSort =
  | "feu" | "givre" | "foudre" | "terre" | "poison"
  | "sacre" | "ombre" | "nature" | "soin" | "acier" | "arcane";

export interface StyleFamille {
  /** Triplet « r, g, b » pour les rgba() de l'overlay. */
  rgb: string;
  /** Couleur pleine (flèches, étincelles). */
  hex: string;
  /** Variante claire (reflets, titres). */
  clair: string;
}

export const STYLES_FAMILLE: Record<FamilleSort, StyleFamille> = {
  feu:    { rgb: "249, 115, 22",  hex: "#f97316", clair: "#fdba74" },
  givre:  { rgb: "56, 189, 248",  hex: "#38bdf8", clair: "#bae6fd" },
  foudre: { rgb: "250, 204, 21",  hex: "#facc15", clair: "#fef08a" },
  terre:  { rgb: "180, 134, 70",  hex: "#b48646", clair: "#e2c08d" },
  poison: { rgb: "132, 204, 22",  hex: "#84cc16", clair: "#d9f99d" },
  sacre:  { rgb: "253, 224, 120", hex: "#fde078", clair: "#fff7d6" },
  ombre:  { rgb: "139, 92, 246",  hex: "#8b5cf6", clair: "#c4b5fd" },
  nature: { rgb: "52, 211, 153",  hex: "#34d399", clair: "#a7f3d0" },
  soin:   { rgb: "74, 222, 128",  hex: "#4ade80", clair: "#dcfce7" },
  acier:  { rgb: "203, 213, 225", hex: "#cbd5e1", clair: "#f8fafc" },
  // La signature d'origine, gardée pour tout ce qui ne se classe pas.
  arcane: { rgb: "168, 85, 247",  hex: "#a855f7", clair: "#c084fc" },
};

/** Minuscules sans accents, pour des motifs lisibles et tolérants. */
function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Motifs sur le NOM, ancrés en début de mot. Ordre = priorité.
const MOTIFS_NOM: Array<[FamilleSort, RegExp]> = [
  ["feu", /\b(feu|feux|flamm|brasier|incend|braise|lave|volcan|ardent|brul|embras|fournaise|magma|incandescen|surchauffe|cendre)/],
  ["givre", /\b(givre|glac|gel\b|gele|neige|blizzard|froid|hiver|frimas|vague|maree|deluge d'eau|ecume|torrent)/],
  ["foudre", /\b(foudre|eclair|tonnerre|orage|tempete|bourrasque|ouragan|rafale)/],
  ["poison", /\b(poison|empoison|venin|toxi|peste|miasme|pourri|corro|acide|infect|spore)/],
  ["terre", /\b(avalanche|eboul|seisme|roche|rocher|pierre|geode|faille|colosse|montagne|tremblement)/],
  ["soin", /\b(soin|gueri|baume|remede|panse|regener|reparation)/],
  ["sacre", /\b(sacre|saint|bened|divin|lumiere|celeste|priere|aube|soleil|purif|consacr|serment)/],
  ["ombre", /\b(ombre|teneb|mort\b|morts\b|necro|maled|maudi|funebre|funer|sang\b|ame\b|ames\b|spectr|cauchemar|tombe|crypt|rituel)/],
  ["nature", /\b(foret|racine|ronce|seve|feuill|sylv|canopee|sous-bois|epine|fleur|printemps|chene|arbre|croc|serre|meute)/],
  ["acier", /\b(lame|epee|fleche|javelot|charge|volee|arc\b|arcs\b|fer\b|acier|hache|lance|bouclier|rempart|percee|canon)/],
];

const CLANS_ELEMENTAIRES: Record<string, FamilleSort> = {
  "La Colère des Flammes": "feu",
  "La Vague Sans Fin": "givre",
  "Le Souffle des Cimes": "foudre",
  "Le Socle du Monde": "terre",
};

const PAR_FACTION: Record<string, FamilleSort> = {
  Elfes: "nature",
  "Hommes-Bêtes": "nature",
  Nains: "acier",
  Humains: "acier",
  EmpireDuMilieu: "acier",
  "Morts-Vivants": "ombre",
  "Elfes Noirs": "ombre",
  RoyaumesDuSoleil: "sacre",
};

const MECANIQUES_POISON = new Set(["poison", "peste", "corruption"]);
const MECANIQUES_SOIN = new Set(["guerison", "benediction", "regeneration"]);
const MECANIQUES_OMBRE = new Set(["malediction", "exhumation", "siphon", "seconde_vie", "touche_mortel"]);

/** Tous les pouvoirs que porte la carte, quelle que soit la structure. */
function pouvoirsDe(card: Card): Set<string> {
  const ids = new Set<string>();
  for (const k of card.keywords ?? []) ids.add(k);
  for (const sk of card.spell_keywords ?? []) if (sk?.id) ids.add(sk.id);
  for (const cap of card.capabilities ?? []) if (cap?.abilityId) ids.add(cap.abilityId);
  for (const id of composedAbilityIds(card.capabilities)) ids.add(id);
  return ids;
}

export function familleDuSort(card: Card | null | undefined): FamilleSort {
  if (!card) return "arcane";
  const nom = normaliser(card.name ?? "");
  for (const [famille, motif] of MOTIFS_NOM) if (motif.test(nom)) return famille;

  const pouvoirs = pouvoirsDe(card);
  const porte = (ensemble: Set<string>) => [...ensemble].some((id) => pouvoirs.has(id));
  if (porte(MECANIQUES_POISON)) return "poison";
  if (porte(MECANIQUES_SOIN)) return "soin";

  const elementaire = card.clan ? CLANS_ELEMENTAIRES[card.clan] : undefined;
  if (elementaire) return elementaire;

  if (porte(MECANIQUES_OMBRE)) return "ombre";
  return (card.faction && PAR_FACTION[card.faction]) || "arcane";
}
