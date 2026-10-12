// SCORE D'UNE CARTE selon le barème (bareme.ts) — fonction PURE, partagée par
// la jauge de la forge, l'éditeur et le calibrage.
//
// Le score se décompose en TERMES linéaires : chaque terme désigne un paramètre
// en points du barème (`cle`) et le coefficient qui le multiplie (`coef`, où
// sont déjà appliqués déclencheur, portée, filtre, hasard…). Le calibrage
// ajuste les paramètres en points par moindres carrés sur ces mêmes termes, et
// les multiplicateurs par recherche coordonnée : la jauge ne peut donc pas
// diverger du modèle qui a produit ses chiffres.
import type { Capability, Card, CardType, ComposedEffect, TargetSpec } from "@/lib/game/types";
import { getCapabilities } from "@/lib/game/capability-adapter";
import { ABILITIES, COUT_OPTIONNEL, KEYWORD_DEFAULT_X, xEquivalentCoutLibre } from "@/lib/game/abilities";
import type { Bareme, CoutLineaire } from "./bareme";

export interface Terme {
  /** Paramètre en points : « stat.atk », « socle.creature », « add.life »,
   *  « cap.<id>.base|perX|perY », « comp.<contenu>.base|perX|perY ». */
  cle: string;
  coef: number;
  /** Ligne du détail à laquelle le terme appartient. */
  ligne: string;
}

export interface LigneScore { libelle: string; points: number }

export interface ScoreCarte {
  budget: number;
  utilise: number;
  ratio: number;
  /** Rabais des coûts additionnels APRÈS plafond (≤ 0). */
  rabaisAdditionnel: number;
  lignes: LigneScore[];
}

/** Champs de carte lus par le score (une ligne `cards` suffit). */
export type CarteNotee = Pick<Card, "card_type" | "mana_cost" | "attack" | "health"> &
  Partial<Pick<Card, "rarity" | "keywords" | "keyword_instances" | "spell_keywords" | "spell_effects" | "capabilities"
    | "convocation_token_id" | "convocation_tokens" | "lycanthropie_token_id" | "entraide_race" | "effect_text"
    | "life_cost" | "discard_cost" | "sacrifice_cost" | "exile_cost" | "topdeck_cost" | "eveil_cost" | "equip_cost">>;

const NOM_DECLENCHEUR: Record<string, string> = {
  on_play: "entrée", on_death: "mort", on_return: "retour", on_activation: "activation",
  on_attack: "attaque", on_end_of_turn: "fin de tour", on_end_of_turn_in_hand: "fin de tour (main)",
  on_start_of_turn: "début de tour", on_start_of_turn_in_hand: "début de tour (main)", on_draw: "pioche",
  on_low_hp: "PV bas", on_wound: "blessure", automatic: "passif", spell_resolution: "résolution",
};

export function libelleDeclencheur(t: string): string {
  return NOM_DECLENCHEUR[t] ?? t;
}

// ─── Multiplicateurs ────────────────────────────────────────────────────────

function multDeclencheur(b: Bareme, t: string | undefined): number {
  return (t ? b.declencheur[t as keyof Bareme["declencheur"]] : undefined) ?? 1;
}

/** Part du catalogue d'une liste de valeurs ALTERNATIVES (race A OU race B). */
function partListe(b: Bareme, prefixe: string, valeurs: (string | undefined | null)[] | undefined): number {
  const v = (valeurs ?? []).filter((x): x is string => !!x);
  if (v.length === 0) return 1;
  return Math.min(1, v.reduce((s, x) => s + (b.parts[`${prefixe}:${x}`] ?? 1), 0));
}

/** Multiplicateur d'un filtre : `a + (1 − a) × part`, la part combinant les
 *  critères CUMULÉS par produit. Aucun filtre ⇒ 1. */
function multFiltre(b: Bareme, f: {
  race?: (string | undefined | null)[]; clan?: (string | undefined | null)[]; faction?: (string | undefined | null)[];
  keywordId?: string; maxCost?: number;
}): number {
  let part = partListe(b, "race", f.race) * partListe(b, "clan", f.clan) * partListe(b, "faction", f.faction);
  if (f.keywordId) part *= b.parts[`kw:${f.keywordId}`] ?? 1;
  if (f.maxCost !== undefined) part *= b.parts[`cout<=${Math.max(0, Math.min(10, f.maxCost))}`] ?? 1;
  if (part >= 1) return 1;
  return b.filtre.a + (1 - b.filtre.a) * part;
}

function multCible(b: Bareme, t: TargetSpec | undefined, ignoreCount: boolean): number {
  if (!t) return 1;
  if (t.entity === "self") return b.cible.self;
  if (t.entity === "damage_source") return 1;
  let m = t.entity === "hero" ? b.cible.hero : t.entity === "both" ? b.cible.both : 1;
  if (t.entity === "hero") return m;
  if (t.count === "all") {
    m *= t.side === "enemy" ? b.portee.all_enemies : t.side === "ally" ? b.portee.all_allies : b.portee.all;
  } else if (!ignoreCount && typeof t.count === "number" && t.count > 1) {
    m *= 1 + b.cible.parCible * (t.count - 1);
  }
  return m;
}

// ─── Termes ─────────────────────────────────────────────────────────────────

function termesLineaires(prefixe: string, ligne: string, mult: number, x: number | undefined, y: number | undefined): Terme[] {
  const out: Terme[] = [{ cle: `${prefixe}.base`, coef: mult, ligne }];
  if (x !== undefined && x > 1) out.push({ cle: `${prefixe}.perX`, coef: mult * (x - 1), ligne });
  if (y !== undefined && y > 1) out.push({ cle: `${prefixe}.perY`, coef: mult * (y - 1), ligne });
  return out;
}

/** X effectif : un « ? » (tirage entre A et X) vaut la moyenne. */
function xEffectif(x: number | undefined, random: boolean | undefined, minX: number | undefined): number | undefined {
  if (x === undefined) return undefined;
  return random ? ((minX ?? 1) + x) / 2 : x;
}

function libelleCapacite(id: string): string {
  const a = ABILITIES[id];
  return a?.creature?.label ?? a?.label ?? id;
}

function termesNommes(b: Bareme, cap: Capability, ligneForcee?: string, multExterne = 1): Terme[] {
  const id = cap.abilityId;
  const p = cap.params ?? {};
  let x: number | undefined = p.x ?? p.attack
    ?? (cap.linkedCardIds?.length || undefined)
    ?? (cap.tokens?.length || undefined)
    ?? (cap.costs?.length || undefined);
  if (x === undefined && COUT_OPTIONNEL[id]) x = xEquivalentCoutLibre(id);
  if (x === undefined) x = KEYWORD_DEFAULT_X[id];
  const y = p.y ?? p.health;
  const random = p.randomX === true;
  const scope = cap.targetScope ?? (cap.grantScope === "all_allies" ? "all_allies" : undefined);
  const mult = multExterne
    * multDeclencheur(b, cap.trigger)
    * (scope ? b.portee[scope] : 1)
    * multFiltre(b, { race: [cap.race], clan: [cap.clan], faction: [cap.faction] })
    * (cap.singulier ? b.singulier : 1)
    * (random ? b.hasard : 1);
  const ligne = ligneForcee ?? `${libelleCapacite(id)}${x !== undefined && x > 1 ? ` ${Math.round(x * 10) / 10}` : ""} · ${libelleDeclencheur(cap.trigger)}`;
  return termesLineaires(`cap.${id}`, ligne, mult, xEffectif(x, random, p.minX), y);
}

const DEGATS_REPARTIS = new Set(["deal_damage", "heal"]);

function termesComposes(b: Bareme, cap: Capability, c: ComposedEffect): Terme[] {
  const m = c.magnitude ?? {};
  const random = m.randomX === true;
  const t = c.target;
  const reparti = t?.designation === "scatter" && DEGATS_REPARTIS.has(c.content);
  const hasard = random || t?.designation === "random" || t?.designation === "scatter";
  const pool = c.pool;
  const mult = multDeclencheur(b, cap.trigger)
    * multCible(b, t, reparti)
    * multFiltre(b, {
      race: [...(t?.membership?.race ?? []), pool?.race],
      clan: [...(t?.membership?.clan ?? []), pool?.clan],
      faction: [...(t?.membership?.faction ?? []), pool?.faction],
      keywordId: t?.keywordId ?? pool?.keywordId,
      maxCost: t?.maxCost,
    })
    * (hasard ? b.hasard : 1)
    * (cap.singulier ? b.singulier : 1)
    * Math.max(1, c.occurrences ?? 1);
  const ligne = `${c.content}${m.x ? ` ${m.x}` : ""}${t?.count === "all" ? " (toutes)" : ""} · ${libelleDeclencheur(cap.trigger)}`;
  const out = termesLineaires(`comp.${c.content}`, ligne, mult, xEffectif(m.x, random, m.minX), m.y);
  // Don d'une capacité : le contenu a son socle, plus une part de la valeur de
  // la capacité conférée — sous le déclencheur qu'elle portera chez son hôte.
  if (c.content === "grant_keyword" && c.grantAbilityId) {
    const conferee: Capability = {
      uid: "don", effectKind: "immediate", abilityId: c.grantAbilityId,
      trigger: c.grantTrigger ?? "automatic", params: { x: m.x, y: m.y },
    };
    out.push(...termesNommes(b, conferee, ligne, b.don * multCible(b, t, false) * multDeclencheur(b, cap.trigger)));
  }
  return out;
}

function valeurTermes(b: Bareme, termes: Terme[]): number {
  return termes.reduce((s, t) => s + t.coef * valeurParametre(b, t.cle), 0);
}

/** Termes des capacités d'une carte. Les branches « OU » d'un même
 *  déclencheur ne comptent que pour la plus chère (une seule se résout). */
export function termesCapacites(b: Bareme, card: CarteNotee): Terme[] {
  let caps: Capability[] = [];
  try { caps = getCapabilities(card as Card); } catch { caps = []; }
  const ordinaires: Terme[] = [];
  const branches = new Map<string, Terme[][]>();
  for (const cap of caps) {
    const termes = cap.composed ? termesComposes(b, cap, cap.composed) : termesNommes(b, cap);
    if (cap.alternative) {
      const l = branches.get(cap.trigger) ?? [];
      l.push(termes);
      branches.set(cap.trigger, l);
    } else ordinaires.push(...termes);
  }
  for (const l of branches.values()) {
    if (l.length === 1) { ordinaires.push(...l[0]); continue; }
    let best = l[0];
    for (const t of l) if (valeurTermes(b, t) > valeurTermes(b, best)) best = t;
    ordinaires.push(...best);
  }
  return ordinaires;
}

function typeDe(card: CarteNotee): "creature" | "spell" | "item" {
  return (card.card_type as CardType) === "spell" ? "spell" : card.card_type === "item" ? "item" : "creature";
}

/** Termes de la carte, coûts additionnels compris (avant plafond). */
export function termesCarte(b: Bareme, card: CarteNotee): { termes: Terme[]; additionnels: Terme[] } {
  const type = typeDe(card);
  const termes: Terme[] = [{ cle: `socle.${type}`, coef: 1, ligne: "Socle du type" }];
  if (type !== "spell") {
    if (card.attack) termes.push({ cle: "stat.atk", coef: card.attack, ligne: "Statistiques" });
    if (card.health) termes.push({ cle: "stat.def", coef: card.health, ligne: "Statistiques" });
  }
  termes.push(...termesCapacites(b, card));
  const additionnels: Terme[] = [];
  const add = (cle: string, v: number | null | undefined, ligne: string) => {
    if (v && v > 0) additionnels.push({ cle: `add.${cle}`, coef: v, ligne });
  };
  add("life", card.life_cost, "Coût en vie");
  add("discard", card.discard_cost, "Coût de défausse");
  add("sacrifice", card.sacrifice_cost, "Coût de sacrifice");
  add("exile", card.exile_cost, "Coût d'exil");
  add("topdeck", card.topdeck_cost, "Coût de repli");
  if (type === "item") add("equip", card.equip_cost, "Coût d'équipement");
  return { termes, additionnels };
}

/** Diviseur du budget : (points / diviseur) = mana équivalent. */
export function facteurBudget(b: Bareme, card: CarteNotee): number {
  return b.pointsParMana * (b.rarete[card.rarity ?? "Commune"] ?? 1) * b.type[typeDe(card)];
}

export function budgetCarte(b: Bareme, card: CarteNotee): number {
  return (card.mana_cost + b.eveil * (card.eveil_cost ?? 0)) * facteurBudget(b, card);
}

// ─── Lecture des paramètres en points ───────────────────────────────────────

function cout(map: Record<string, CoutLineaire | undefined>, id: string, champ: string): number {
  const c = map[id];
  if (!c) return 0;
  return champ === "base" ? c.base : champ === "perX" ? c.perX : c.perY;
}

export function valeurParametre(b: Bareme, cle: string): number {
  const [fam, a, champ] = cle.split(".");
  switch (fam) {
    case "stat": return a === "atk" ? b.stat.atk : b.stat.def;
    case "socle": return b.socle[a as keyof Bareme["socle"]] ?? 0;
    case "add": return b.additionnel[a as keyof Bareme["additionnel"]] ?? 0;
    case "cap": return cout(b.capacites, a, champ);
    case "comp": return cout(b.composes as Record<string, CoutLineaire>, a, champ);
    default: return 0;
  }
}

export function scoreCarte(b: Bareme, card: CarteNotee): ScoreCarte {
  const { termes, additionnels } = termesCarte(b, card);
  const budget = budgetCarte(b, card);
  const brut = valeurTermes(b, additionnels);
  const rabais = Math.max(brut, -b.plafondAdditionnel * Math.max(0, budget));
  const parLigne = new Map<string, number>();
  for (const t of termes) parLigne.set(t.ligne, (parLigne.get(t.ligne) ?? 0) + t.coef * valeurParametre(b, t.cle));
  for (const t of additionnels) {
    const part = brut !== 0 ? (t.coef * valeurParametre(b, t.cle)) * (rabais / brut) : 0;
    parLigne.set(t.ligne, (parLigne.get(t.ligne) ?? 0) + part);
  }
  const lignes = [...parLigne.entries()]
    .map(([libelle, points]) => ({ libelle, points: Math.round(points * 10) / 10 }))
    .filter((l) => Math.abs(l.points) >= 0.05);
  const utilise = [...parLigne.values()].reduce((s, v) => s + v, 0);
  return {
    budget: Math.round(budget * 10) / 10,
    utilise: Math.round(utilise * 10) / 10,
    ratio: budget > 0 ? utilise / budget : 0,
    rabaisAdditionnel: Math.round(rabais * 10) / 10,
    lignes,
  };
}
