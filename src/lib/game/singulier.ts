// SINGULIER — condition de déclenchement qui récompense les decks sans doublon.
//
// Une capacité marquée `singulier` (mot-clé, effet de sort ou capacité
// composée) ne se résout que si le CONTRÔLEUR de la carte a `singleton = true`,
// état figé au lancement du duel d'après le deck de départ.
//
// MISE EN ŒUVRE PAR RETRAIT, pas par garde : le moteur lit les capacités par
// des dizaines de chemins (`hasKw`, boucles sur `keyword_instances`, résolution
// des sorts, auras…), et poser une condition sur chacun garantissait d'en
// oublier. À la place, `syncSingulier` retire de la vue `card` de chaque
// instance les éléments Singulier quand son contrôleur n'est pas singleton, et
// les range dans `singulierStash` ; si la carte passe à un joueur singleton
// (Conquête, Corruption…), ils y sont remis au rang d'origine. Tous les lecteurs
// voient donc une carte SANS ces capacités, sans rien savoir de la règle.
//
// Appelé à l'initialisation, à la fin de chaque action et après chaque recalcul
// d'auras (donc après chaque mise en jeu). Idempotent : une carte déjà retirée
// n'a plus rien à retirer, une carte déjà restaurée n'a plus de stash.

import type { Card, CardInstance, GameState, Keyword, PlayerState, SingulierStash } from "./types";

/** Couleur RÉSERVÉE à Singulier dans le système d'icônes (moitié gauche de
 *  l'icône bicolore, texte du badge). À ne réutiliser nulle part ailleurs. */
export const SINGULIER_COLOR = "#0D9488";

/** Le deck de départ est-il singleton : aucune carte en deux exemplaires ? */
export function isSingletonDeck(entries: { card: { id: number }; quantity: number }[]): boolean {
  const vus = new Set<number>();
  for (const e of entries) {
    if (e.quantity > 1) return false;
    if (e.quantity < 1) continue;
    if (vus.has(e.card.id)) return false;
    vus.add(e.card.id);
  }
  return true;
}

/** La vue `card` porte-t-elle encore au moins un élément Singulier ACTIF ? */
export function cardHasSingulier(card: Card): boolean {
  return (card.keyword_instances ?? []).some((k) => k.singulier === true)
    || (card.capabilities ?? []).some((c) => c.singulier === true)
    || (card.spell_keywords ?? []).some((s) => s.singulier === true);
}

function insererAuRang<T>(base: T[], items: { item: T; index: number }[], dejaLa?: (t: T) => boolean): T[] {
  const out = [...base];
  for (const { item, index } of [...items].sort((a, b) => a.index - b.index)) {
    if (dejaLa && dejaLa(item)) continue;
    out.splice(Math.min(index, out.length), 0, item);
  }
  return out;
}

/** Retire les éléments Singulier de la carte. `null` s'il n'y a rien à retirer
 *  (carte sans Singulier, ou déjà retirée). La carte rendue est un NOUVEL objet :
 *  `getCapabilities` mémoïse par identité de `card`. */
export function stripSingulier(card: Card): { card: Card; stash: SingulierStash } | null {
  const insts = card.keyword_instances ?? [];
  const caps = card.capabilities ?? [];
  const sks = card.spell_keywords ?? [];
  const stash: SingulierStash = { keywords: [], keyword_instances: [], capabilities: [], spell_keywords: [] };
  insts.forEach((k, i) => { if (k.singulier === true) stash.keyword_instances.push({ item: k, index: i }); });
  caps.forEach((c, i) => { if (c.singulier === true) stash.capabilities.push({ item: c, index: i }); });
  sks.forEach((s, i) => { if (s.singulier === true) stash.spell_keywords.push({ item: s, index: i }); });
  if (!stash.keyword_instances.length && !stash.capabilities.length && !stash.spell_keywords.length) return null;

  // `keywords[]` (liste plate lue par les chemins legacy) : un id ne part que si
  // AUCUNE instance non-Singulier du même mot-clé ne reste — une carte peut
  // porter « Inspiration (Singulier · Mort) » ET « Inspiration » ordinaire.
  const keptInsts = insts.filter((k) => k.singulier !== true);
  const retires = new Set(stash.keyword_instances.map((s) => s.item.id));
  const encoreLa = new Set(keptInsts.map((k) => k.id));
  const keptKeywords: Keyword[] = [];
  (card.keywords ?? []).forEach((id, i) => {
    if (retires.has(id) && !encoreLa.has(id)) stash.keywords.push({ id, index: i });
    else keptKeywords.push(id);
  });

  return {
    card: {
      ...card,
      keywords: keptKeywords,
      keyword_instances: card.keyword_instances ? keptInsts : card.keyword_instances,
      capabilities: card.capabilities ? caps.filter((c) => c.singulier !== true) : card.capabilities,
      spell_keywords: card.spell_keywords ? sks.filter((s) => s.singulier !== true) : card.spell_keywords,
    },
    stash,
  };
}

/** Remet les éléments retirés à leur rang d'origine. Un mot-clé revenu entre
 *  temps par un autre chemin (don) n'est pas dédoublé. */
export function restoreSingulier(card: Card, stash: SingulierStash): Card {
  const keywords = insererAuRang(
    card.keywords ?? [],
    stash.keywords.map((k) => ({ item: k.id, index: k.index })),
    (id) => (card.keywords ?? []).includes(id),
  );
  return {
    ...card,
    keywords,
    keyword_instances: stash.keyword_instances.length
      ? insererAuRang(card.keyword_instances ?? [], stash.keyword_instances)
      : card.keyword_instances,
    capabilities: stash.capabilities.length
      ? insererAuRang(card.capabilities ?? [], stash.capabilities)
      : card.capabilities,
    spell_keywords: stash.spell_keywords.length
      ? insererAuRang(card.spell_keywords ?? [], stash.spell_keywords)
      : card.spell_keywords,
  };
}

function fusionnerStash(a: SingulierStash, b: SingulierStash): SingulierStash {
  return {
    keywords: [...a.keywords, ...b.keywords],
    keyword_instances: [...a.keyword_instances, ...b.keyword_instances],
    capabilities: [...a.capabilities, ...b.capabilities],
    spell_keywords: [...a.spell_keywords, ...b.spell_keywords],
  };
}

/** Aligne UNE instance sur l'état de son contrôleur. Mutation en place (l'appelant
 *  tient déjà un état cloné). */
export function syncSingulierInstance(inst: CardInstance, singleton: boolean): void {
  if (singleton) {
    if (inst.singulierStash) {
      inst.card = restoreSingulier(inst.card, inst.singulierStash);
      delete inst.singulierStash;
    }
    return;
  }
  const split = stripSingulier(inst.card);
  if (!split) return;
  inst.card = split.card;
  inst.singulierStash = inst.singulierStash ? fusionnerStash(inst.singulierStash, split.stash) : split.stash;
}

function zonesDe(p: PlayerState): CardInstance[][] {
  return [p.hand, p.board, p.deck, p.graveyard, (p.eveil ?? []).map((e) => e.instance)];
}

/** Aligne toutes les cartes des deux joueurs, et pose `singletonRevealed` dès
 *  qu'une capacité Singulier ACTIVE est visible (plateau, cimetière, éveil).
 *  Un joueur non singleton n'a rien d'actif : il n'est jamais révélé. */
export function syncSingulierPlayer(p: PlayerState): void {
  const singleton = p.singleton === true;
  for (const zone of zonesDe(p)) for (const inst of zone) syncSingulierInstance(inst, singleton);
  if (singleton && !p.singletonRevealed) {
    const visibles = [...p.board, ...p.graveyard, ...(p.eveil ?? []).map((e) => e.instance)];
    if (visibles.some((i) => cardHasSingulier(i.card))) p.singletonRevealed = true;
  }
}

export function syncSingulier(state: GameState): void {
  for (const p of state.players) syncSingulierPlayer(p);
}

/** Vue d'AFFICHAGE d'une instance : la carte avec ses éléments Singulier remis,
 *  actifs ou non. Une carte se lit toujours pareil des deux côtés de la table —
 *  c'est le badge du héros, pas l'icône, qui dit si la condition est remplie. */
export function displayCardOf(inst: Pick<CardInstance, "card" | "singulierStash">): Card {
  return inst.singulierStash ? restoreSingulier(inst.card, inst.singulierStash) : inst.card;
}

export type { SingulierStash };
