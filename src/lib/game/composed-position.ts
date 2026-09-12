// ORDRE D'AUTEUR entre mots-clés et effets COMPOSÉS.
//
// Jusqu'ici un effet composé était toujours rangé en QUEUE : trié après les
// mots-clés à la lecture (`orderCreatureCapsByKeywords`), résolu après la
// cascade des mots-clés curés, affiché après eux. L'auteur ne pouvait donc
// jamais dire « d'abord l'effet composé, puis le mot-clé ».
//
// Le modèle : chaque effet composé porte `Capability.position`, l'index — dans
// la liste d'auteur des mots-clés de la carte — du mot-clé DEVANT lequel il se
// place. Liste d'auteur : `keywords[]` pour une créature, `spell_keywords[]`
// pour un sort. Absent ⇒ en queue, exactement l'ancien comportement : aucune
// carte existante ne bouge, aucune migration.
//
// Une seule fonction de tri sert le moteur (getCapabilities), l'affichage (les
// icônes et le détail des cartes, via `order` CSS) et les éditeurs — sans quoi
// les trois divergeraient un à un, comme keywords[] et keyword_instances
// avaient divergé avant `orderedKeywordSlots`.
import type { Capability, Card } from "./types";

/** Rang d'auteur d'une capacité. Fini pour un mot-clé déclaré et pour un
 *  composé positionné ; `Infinity` pour tout le reste (mot-clé conféré au
 *  runtime, don d'un sort, composé sans position), qui reste en queue. */
export function authorRankOfCap(card: Pick<Card, "card_type" | "keywords">, cap: Capability): number {
  if (cap.composed) return cap.position ?? Number.POSITIVE_INFINITY;
  if (card.card_type === "spell") {
    const m = /^sk_(\d+)$/.exec(cap.uid);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  }
  const i = ((card.keywords ?? []) as unknown as string[]).indexOf(cap.abilityId);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

/** Clé de tri : un composé positionné en `p` passe AVANT le mot-clé de rang
 *  `p` (clé paire), le mot-clé prend la clé impaire suivante. `Infinity` reste
 *  `Infinity` : les capacités hors liste se départagent par leur index
 *  d'origine (tri stable). */
export function orderKey(rank: number, composed: boolean): number {
  if (!Number.isFinite(rank)) return Number.POSITIVE_INFINITY;
  return rank * 2 + (composed ? 0 : 1);
}

/** Tri STABLE des capacités d'une carte dans l'ordre d'auteur. Vaut pour les
 *  créatures (mots-clés selon `keywords[]`) comme pour les sorts (mécaniques
 *  selon `spell_keywords[]`, dons en queue). */
export function orderCapabilitiesByAuthor(card: Pick<Card, "card_type" | "keywords">, caps: Capability[]): Capability[] {
  if (caps.length < 2) return caps;
  return caps
    .map((c, i) => ({ c, i, k: orderKey(authorRankOfCap(card, c), !!c.composed) }))
    // Comparaison et non soustraction : `Infinity - Infinity` vaut NaN.
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k < b.k ? -1 : 1))
    .map((x) => x.c);
}

// ─── Affichage ──────────────────────────────────────────────────────────────
// Les rangées de cartes sont des conteneurs flex : chaque pastille reçoit un
// `order` CSS calculé ici, ce qui intercale les composés sans réécrire les
// boucles de rendu. Valeurs FINIES (le CSS ne connaît pas Infinity) et bornées
// sous `POWER_ORDER_LAST`, réservé aux éléments qui doivent rester derrière
// (les stats, poussées à droite).

const RANK_CAP = 9_999;
/** `order` des éléments qui suivent tous les pouvoirs (stats…). */
export const POWER_ORDER_LAST = 99_999;

function finiteKey(rank: number, composed: boolean): number {
  return orderKey(Math.min(Number.isFinite(rank) ? rank : RANK_CAP, RANK_CAP), composed);
}

/** `order` d'un mot-clé de CRÉATURE (rang dans `keywords[]`). */
export function keywordDisplayOrder(card: Pick<Card, "keywords">, kw: string): number {
  const i = ((card.keywords ?? []) as unknown as string[]).indexOf(kw);
  return finiteKey(i === -1 ? RANK_CAP : i, false);
}

/** `order` d'une mécanique de SORT (index dans `spell_keywords[]`). */
export function spellKeywordDisplayOrder(index: number): number {
  return finiteKey(index, false);
}

/** `order` d'un mot-clé CONFÉRÉ par un sort : après toutes les mécaniques du
 *  sort, dans l'ordre de `keywords[]` — la place qu'il a toujours eue. */
export function grantedKeywordDisplayOrder(card: Pick<Card, "keywords" | "spell_keywords">, kw: string): number {
  const i = ((card.keywords ?? []) as unknown as string[]).indexOf(kw);
  return finiteKey((card.spell_keywords?.length ?? 0) + (i === -1 ? RANK_CAP : i), false);
}

/** `order` d'un effet composé (sa `position`, en queue sans elle). */
export function composedDisplayOrder(cap: Capability): number {
  return finiteKey(cap.position ?? RANK_CAP, true);
}

/** Position à donner à un composé AJOUTÉ maintenant pour qu'il reste APRÈS les
 *  mots-clés déjà saisis et AVANT ceux qui viendront : « ajouté en premier ⇒
 *  résolu en premier », c'est le contrat de la forge. */
export function positionAfterExisting(keywordCount: number): number {
  return Math.max(0, keywordCount);
}
