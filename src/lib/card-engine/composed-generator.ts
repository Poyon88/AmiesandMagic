// EFFETS COMPOSÉS TIRÉS pour la génération en masse (Création assistée).
//
// Un effet composé = déclencheur + contenu + cible + amplitude (« à la mort,
// 2 dégâts à toutes les unités ennemies »). Le moteur, le barème
// (`termesComposes`) et l'affichage (`describeComposedCap`) savent déjà les
// traiter ; il ne manquait que leur TIRAGE. Ici, uniquement des contenus qui
// n'exigent aucune donnée annexe (token, carte désignée, compteur de faction) :
// tout effet produit est jouable tel quel. L'amplitude de départ est grossière,
// `equilibrer` l'ajuste au barème.
import type { Capability, CapabilityTrigger, ComposedEffect, ComposedEffectContent, TargetSpec } from "@/lib/game/types";

type Rng = () => number;

/** Part des cartes qui reçoivent un effet composé, selon le coût (arbitrage
 *  2026-10-17) : surtout les cartes chères, où il apporte le plus. */
export function partComposeParCout(mana: number): number {
  if (mana <= 3) return 0;
  if (mana <= 5) return 0.15;
  if (mana <= 7) return 0.4;
  return 0.6;
}

type Cible = "ennemi" | "allie" | "degats" | "soin" | "cimetiere" | "aucune";

interface Recette {
  content: ComposedEffectContent; poids: number; cible: Cible; minMana?: number;
  avecX?: boolean; xy?: boolean; touteSiCher?: boolean;
  /** X constant, non ajusté (le barème ne le valorise pas : Défausse 1). */
  xFixe?: number;
}

/** Contenus tirables. `avecX` : X a un sens (montant ou plafond de coût) et
 *  l'équilibrage l'ajuste ; sinon il est omis. */
export const RECETTES: readonly Recette[] = [
  { content: "deal_damage", poids: 20, cible: "degats", avecX: true, touteSiCher: true },
  { content: "buff", poids: 14, cible: "allie", avecX: true, xy: true, touteSiCher: true },
  { content: "draw_cards", poids: 10, cible: "aucune", avecX: true },
  { content: "heal", poids: 8, cible: "soin", avecX: true, touteSiCher: true },
  { content: "debuff", poids: 8, cible: "ennemi", avecX: true, xy: true, touteSiCher: true },
  { content: "grant_keyword", poids: 8, cible: "allie" },
  { content: "paralyze", poids: 5, cible: "ennemi", touteSiCher: true },
  { content: "poison", poids: 4, cible: "ennemi", touteSiCher: true },
  { content: "bounce", poids: 4, cible: "ennemi" },
  { content: "faveur", poids: 4, cible: "aucune", avecX: true },
  { content: "discard", poids: 3, cible: "aucune", xFixe: 1 },
  { content: "gain_mana", poids: 3, cible: "aucune", avecX: true },
  { content: "silence", poids: 3, cible: "ennemi" },
  { content: "selection", poids: 3, cible: "aucune", avecX: true },
  { content: "rappel", poids: 3, cible: "cimetiere" },
  { content: "destroy", poids: 4, cible: "ennemi", minMana: 6 },
  { content: "exhumation", poids: 3, cible: "cimetiere", minMana: 6, avecX: true },
  { content: "invocation", poids: 4, cible: "aucune", minMana: 6, avecX: true },
  { content: "retour_differe", poids: 2, cible: "ennemi", minMana: 6 },
];

const CONTENUS_AVEC_X = new Set(RECETTES.filter((r) => r.avecX).map((r) => r.content));
const CONTENUS_XY = new Set(RECETTES.filter((r) => r.xy).map((r) => r.content));
export const aUnX = (c: Capability) => !!c.composed && CONTENUS_AVEC_X.has(c.composed.content);

const DECLENCHEURS_UNITE: readonly { v: CapabilityTrigger; poids: number }[] = [
  { v: "on_play", poids: 35 }, { v: "on_death", poids: 20 }, { v: "on_attack", poids: 15 },
  { v: "on_end_of_turn", poids: 10 }, { v: "on_start_of_turn", poids: 8 }, { v: "on_wound", poids: 7 }, { v: "on_low_hp", poids: 5 },
];

function tirer<T>(items: readonly T[], poids: (t: T) => number, rng: Rng): T {
  const total = items.reduce((s, t) => s + poids(t), 0);
  let r = rng() * total;
  for (const t of items) { r -= poids(t); if (r <= 0) return t; }
  return items[items.length - 1];
}

/** Cible au plateau : une au choix, une au hasard, ou toutes (cartes ≥ 6 mana). */
function ciblePlateau(side: TargetSpec["side"], entity: TargetSpec["entity"], toutes: boolean, rng: Rng): TargetSpec {
  const r = rng();
  if (toutes && r < 0.25) return { entity: entity === "both" ? "unit" : entity, count: "all", side, location: "board", designation: "automatic" };
  return { entity, count: 1, side, location: "board", designation: r < 0.7 ? "choice" : "random" };
}

export interface CarteComposable { type: "Unité" | "Action"; mana: number }

/** Un effet composé pour cette carte. `donnables` : ids des capacités que
 *  `grant_keyword` peut conférer (profil de la race, hors interdits) ; vide ⇒
 *  ce contenu n'est pas tiré. */
export function tirerCompose(c: CarteComposable, rng: Rng, donnables: readonly string[] = []): Capability {
  const unite = c.type === "Unité";
  const recettes = RECETTES.filter((r) => (r.minMana ?? 0) <= c.mana && (r.content !== "grant_keyword" || donnables.length > 0));
  const r = tirer(recettes, (x) => x.poids, rng);
  const trigger: CapabilityTrigger = unite ? tirer(DECLENCHEURS_UNITE, (d) => d.poids, rng).v : "spell_resolution";
  const toutes = !!r.touteSiCher && c.mana >= 6;
  // « Soi-même » n'a de sens que si la source est encore en jeu.
  const soiPossible = unite && trigger !== "on_death";

  let target: TargetSpec | undefined;
  switch (r.cible) {
    case "ennemi": target = ciblePlateau("enemy", "unit", toutes, rng); break;
    case "degats": target = ciblePlateau("enemy", rng() < 0.3 ? "both" : "unit", toutes, rng); break;
    case "soin": target = ciblePlateau("ally", rng() < 0.3 ? "both" : "unit", toutes, rng); break;
    case "allie":
      target = soiPossible && rng() < 0.3
        ? { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" }
        : ciblePlateau("ally", "unit", toutes && r.content !== "grant_keyword", rng);
      break;
    case "cimetiere": target = { entity: "unit", count: 1, side: "ally", location: "graveyard", designation: "choice" }; break;
    case "aucune": target = undefined; break;
  }

  const x = Math.max(1, Math.floor(c.mana / 3));
  const composed: ComposedEffect = {
    content: r.content,
    ...(CONTENUS_AVEC_X.has(r.content) ? { magnitude: CONTENUS_XY.has(r.content) ? { x, y: x } : { x } }
      : r.xFixe ? { magnitude: { x: r.xFixe } } : {}),
    ...(target ? { target } : {}),
    ...(r.content === "grant_keyword" ? { grantAbilityId: donnables[Math.floor(rng() * donnables.length)] } : {}),
  };
  return { uid: "cx_0", trigger, effectKind: "immediate", abilityId: "_composed", composed };
}

/** L'effet avec son X (et Y pour +X/+Y) fixé à `x`. */
export function avecX(cap: Capability, x: number): Capability {
  if (!cap.composed || !aUnX(cap)) return cap;
  const xy = CONTENUS_XY.has(cap.composed.content);
  return { ...cap, composed: { ...cap.composed, magnitude: xy ? { x, y: x } : { x } } };
}
