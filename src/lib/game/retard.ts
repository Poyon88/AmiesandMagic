// RETARD X — déclencheur différé.
//
// Une capacité « Retard X » part UNE seule fois, au début du X-ième tour suivant
// de son contrôleur, juste après les effets de début de tour déjà en jeu.
//
//   • CRÉATURE : mot-clé curé en mode "delay" ou capacité composée `on_delay`.
//     Armée quand la carte est JOUÉE (main, Éveil, Seconde vie — comme un effet
//     d'entrée en jeu), décomptée au début de chaque tour de son contrôleur
//     ACTUEL (elle suit l'unité si elle change de camp). Elle ne part que si
//     l'unité est encore en jeu et porte encore la capacité (un Silence
//     l'annule) ; toute remise en jeu efface le décompte (returnInstanceToPlay).
//
//   • SORT : un `spell_keyword` ou un effet composé `spell_resolution` portant
//     `delay` ne se résout pas au lancement. Il est rangé chez le lanceur
//     (`PlayerState.delayedSpells`) sous la forme d'une VUE du sort réduite à
//     cet effet seul, puis résolu par `resolveSpellCard` à terme — cibles
//     choisies à ce moment-là. Le reste du sort se résout normalement : c'est
//     `immediateSpellView`, que TOUT le ciblage de sort doit lire pour garder
//     les créneaux `kw_${i}` alignés sur la résolution.
import { getCapabilities } from "./capability-adapter";
import type { Card, CardInstance, DelayedSpell, KeywordInstance, RetardEntry } from "./types";

export const RETARD_MIN = 1;
export const RETARD_MAX = 3;

/** X de Retard borné à [1, 3] (1 par défaut). */
export function clampRetard(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < RETARD_MIN) return RETARD_MIN;
  return Math.min(RETARD_MAX, v);
}

// ─── Créatures ───────────────────────────────────────────────────────────────

/** Capacités Retard d'une créature, prêtes à être armées. */
export function retardEntriesFor(card: Card): RetardEntry[] {
  const out: RetardEntry[] = [];
  for (const inst of card.keyword_instances ?? []) {
    if (inst.mode === "delay") out.push({ key: `kw:${inst.id}`, turnsLeft: clampRetard(inst.delay) });
  }
  for (const cap of getCapabilities(card)) {
    if (cap.composed && cap.trigger === "on_delay") out.push({ key: `cap:${cap.uid}`, turnsLeft: clampRetard(cap.delay) });
  }
  return out;
}

/** Arme les Retards d'une créature qui vient d'être JOUÉE. Remplace tout
 *  décompte antérieur : une unité rejouée repart de zéro. */
export function armRetards(inst: CardInstance): void {
  const entries = retardEntriesFor(inst.card);
  inst.retards = entries.length > 0 ? entries : undefined;
}

/** Début de tour du contrôleur : décompte d'un tour, et rend les entrées
 *  arrivées à terme (retirées de l'instance — un Retard ne part qu'une fois). */
export function tickRetards(inst: CardInstance): RetardEntry[] {
  if (!inst.retards?.length) return [];
  const due: RetardEntry[] = [];
  const rest: RetardEntry[] = [];
  for (const e of inst.retards) {
    const left = e.turnsLeft - 1;
    if (left <= 0) due.push({ ...e, turnsLeft: 0 });
    else rest.push({ ...e, turnsLeft: left });
  }
  inst.retards = rest.length > 0 ? rest : undefined;
  return due;
}

/** Capacité désignée par une clé de Retard, si la carte la porte ENCORE (un
 *  Silence l'a retirée ⇒ null, et l'effet est perdu). */
export function resolveRetardKey(card: Card, key: string): { curated?: KeywordInstance; capUid?: string } | null {
  if (key.startsWith("kw:")) {
    const id = key.slice(3);
    const curated = (card.keyword_instances ?? []).find((i) => i.id === id && i.mode === "delay");
    return curated ? { curated } : null;
  }
  if (key.startsWith("cap:")) {
    const uid = key.slice(4);
    const cap = getCapabilities(card).find((c) => c.uid === uid && c.composed && c.trigger === "on_delay");
    return cap ? { capUid: uid } : null;
  }
  return null;
}

// ─── Sorts ───────────────────────────────────────────────────────────────────

const SK_UID = /^sk_(\d+)$/;

function isDelayedCap(card: Card, c: { uid: string; delay?: number }): boolean {
  if ((c.delay ?? 0) > 0) return true;
  // Capacité dérivée d'un spell_keyword retardé, persistée avant que
  // l'adaptateur ne recopie `delay` : le spell_keyword fait foi.
  const m = SK_UID.exec(c.uid);
  return !!m && (card.spell_keywords?.[Number(m[1])]?.delay ?? 0) > 0;
}

/** Le sort porte-t-il au moins un effet à Retard ? */
export function hasDelayedParts(card: Card): boolean {
  if (card.card_type !== "spell") return false;
  if ((card.spell_keywords ?? []).some((k) => (k.delay ?? 0) > 0)) return true;
  return getCapabilities(card).some((c) => c.trigger === "spell_resolution" && isDelayedCap(card, c));
}

const immediateMemo = new WeakMap<Card, Card>();

/** Le sort tel qu'il se résout AU LANCEMENT : sans ses effets à Retard. Rend la
 *  carte elle-même quand elle n'en a pas (identité préservée). */
export function immediateSpellView(card: Card): Card {
  if (!hasDelayedParts(card)) return card;
  const hit = immediateMemo.get(card);
  if (hit) return hit;
  const view: Card = {
    ...card,
    spell_keywords: card.spell_keywords ? card.spell_keywords.filter((k) => !((k.delay ?? 0) > 0)) : card.spell_keywords,
    capabilities: card.capabilities ? card.capabilities.filter((c) => !isDelayedCap(card, c)) : card.capabilities,
  };
  immediateMemo.set(card, view);
  return view;
}

/** Effets à Retard d'un sort, un par effet, chacun sous la forme d'une vue du
 *  sort réduite à cet effet (sans `delay`). `idPrefix` doit être unique pour ce
 *  lancement. */
export function delayedSpellParts(card: Card, idPrefix: string): DelayedSpell[] {
  const base: Card = { ...card, spell_keywords: [], spell_effects: null, keywords: [], keyword_instances: null, capabilities: null };
  const out: DelayedSpell[] = [];
  (card.spell_keywords ?? []).forEach((k) => {
    if (!((k.delay ?? 0) > 0)) return;
    const { delay, ...kw } = k;
    out.push({ id: `${idPrefix}#${out.length}`, turnsLeft: clampRetard(delay), card: { ...base, spell_keywords: [kw] } });
  });
  for (const c of getCapabilities(card)) {
    if (c.trigger !== "spell_resolution" || !c.composed || !((c.delay ?? 0) > 0)) continue;
    // `position` (ordre d'auteur) n'a plus de sens dans une vue à un effet.
    const cap = { ...c, delay: undefined, position: undefined };
    out.push({ id: `${idPrefix}#${out.length}`, turnsLeft: clampRetard(c.delay), card: { ...base, capabilities: [cap] } });
  }
  return out;
}
