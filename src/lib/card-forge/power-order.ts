// Réordonnancement des pouvoirs d'une créature.
//
// L'ordre qui compte est celui de `keywords[]` : c'est de lui que
// `capability-adapter` dérive les `capabilities`, donc l'ordre dans lequel le
// moteur enchaîne les effets (cf. capability-order.test.ts). Le panneau
// « Déclenchement des pouvoirs » de l'éditeur n'affiche cependant que les
// mots-clés CURÉS — ceux qui se déclenchent — alors que `keywords[]` contient
// aussi les passifs (Armure, Vol, Ombre…).
//
// D'où cette fonction : elle échange deux ids dans le tableau COMPLET au lieu de
// réordonner la sous-liste affichée. Les passifs intercalés gardent leur place et
// aucun mot-clé n'est perdu — ce qui serait arrivé en reconstruisant le tableau
// depuis la seule liste visible.

/** Déplace `kw` d'un rang parmi ses `voisins` (les pouvoirs affichés), en
 *  échangeant sa position avec celle du voisin visé dans `keywords`.
 *
 *  Rend un NOUVEAU tableau, ou le tableau d'origine inchangé si le déplacement
 *  est impossible (bout de liste, id introuvable).
 *
 *  @param keywords Tableau complet `keywords[]` de la carte.
 *  @param kw       Id du pouvoir à déplacer.
 *  @param sens     -1 pour résoudre plus tôt, +1 pour plus tard.
 *  @param voisins  Pouvoirs affichés, dans leur ordre d'affichage. */
export function movePowerInKeywords(
  keywords: readonly string[],
  kw: string,
  sens: -1 | 1,
  voisins: readonly string[],
): string[] {
  const rang = voisins.indexOf(kw);
  if (rang === -1) return [...keywords];
  const cible = voisins[rang + sens];
  if (cible === undefined) return [...keywords]; // déjà en bout de liste

  const suivant = [...keywords];
  const i = suivant.indexOf(kw);
  const j = suivant.indexOf(cible);
  if (i === -1 || j === -1) return [...keywords];
  [suivant[i], suivant[j]] = [suivant[j], suivant[i]];
  return suivant;
}

// ─── Liste UNIFIÉE mots-clés + effets composés ──────────────────────────────
//
// Depuis l'ordre d'auteur (lib/game/composed-position.ts), un effet composé
// porte `position` : l'index, dans `keywords`, du mot-clé devant lequel il se
// place. Les deux fonctions ci-dessous servent aux panneaux qui affichent
// mots-clés et composés dans UNE liste avec des flèches ▲▼ — éditeur admin
// (créatures et sorts) et forge. Pures, testées, sans état React.

import type { Capability } from "@/lib/game/types";
import { orderKey } from "@/lib/game/composed-position";

export type UnifiedPower =
  | { kind: "keyword"; id: string }
  | { kind: "composed"; uid: string; cap: Capability };

/** Liste affichée, dans l'ordre de résolution : les mots-clés VISIBLES (ceux
 *  que le panneau montre — les passifs intercalés restent hors liste mais
 *  comptent dans les rangs) et les composés à leur position. */
export function unifiedPowerList(
  keywords: readonly string[],
  visible: readonly string[],
  composed: readonly Capability[],
): UnifiedPower[] {
  const items: { p: UnifiedPower; k: number; i: number }[] = [];
  visible.forEach((id, i) => {
    const r = keywords.indexOf(id);
    items.push({ p: { kind: "keyword", id }, k: orderKey(r === -1 ? Number.POSITIVE_INFINITY : r, false), i });
  });
  composed.forEach((cap, i) => {
    items.push({ p: { kind: "composed", uid: cap.uid, cap }, k: orderKey(cap.position ?? Number.POSITIVE_INFINITY, true), i: visible.length + i });
  });
  return items
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k < b.k ? -1 : 1))
    .map((x) => x.p);
}

/** Déplace un pouvoir (mot-clé ou composé) d'un rang dans la liste unifiée.
 *
 *  Rend de NOUVEAUX tableaux — `keywords` (ids, passifs préservés) et
 *  `composed` (positions mises à jour) — ou les entrées inchangées si le
 *  déplacement est impossible.
 *
 *  Règles :
 *   · mot-clé ↔ mot-clé : échange dans `keywords`, comme movePowerInKeywords ;
 *   · composé ↔ mot-clé K : le composé passe devant K (`position =
 *     indexOf(K)`) ou derrière (`indexOf(K) + 1`) ;
 *   · composé ↔ composé : échange de leurs positions ET de leur ordre dans le
 *     tableau, pour que deux composés de même position restent départagés. */
export function movePowerUnified(
  keywords: readonly string[],
  visible: readonly string[],
  composed: readonly Capability[],
  cible: { kind: "keyword"; id: string } | { kind: "composed"; uid: string },
  sens: -1 | 1,
): { keywords: string[]; composed: Capability[] } {
  const inchange = { keywords: [...keywords], composed: [...composed] };
  const liste = unifiedPowerList(keywords, visible, composed);
  const memeItem = (p: UnifiedPower) =>
    p.kind === cible.kind && (p.kind === "keyword" ? p.id === (cible as { id: string }).id : p.uid === (cible as { uid: string }).uid);
  const rang = liste.findIndex(memeItem);
  if (rang === -1) return inchange;
  const voisin = liste[rang + sens];
  if (!voisin) return inchange;
  const moi = liste[rang];

  if (moi.kind === "keyword" && voisin.kind === "keyword") {
    return { keywords: movePowerInKeywords(keywords, moi.id, sens, visible), composed: [...composed] };
  }
  if (moi.kind === "composed" && voisin.kind === "composed") {
    const a = composed.findIndex((c) => c.uid === moi.uid);
    const b = composed.findIndex((c) => c.uid === voisin.uid);
    if (a === -1 || b === -1) return inchange;
    const suivant = [...composed];
    const pa = composed[a].position, pb = composed[b].position;
    suivant[a] = { ...composed[b], ...(pa != null ? { position: pa } : {}) };
    suivant[b] = { ...composed[a], ...(pb != null ? { position: pb } : {}) };
    if (pa == null) delete suivant[a].position;
    if (pb == null) delete suivant[b].position;
    return { keywords: [...keywords], composed: suivant };
  }
  // Un composé et un mot-clé : seule la position du composé bouge. Quand c'est
  // le mot-clé qui est déplacé, le composé fait le trajet inverse.
  const composeUid = moi.kind === "composed" ? moi.uid : (voisin as { uid: string }).uid;
  const kwId = moi.kind === "keyword" ? moi.id : (voisin as { id: string }).id;
  const composeMonte = moi.kind === "composed" ? sens === -1 : sens === 1;
  const idxK = keywords.indexOf(kwId);
  if (idxK === -1) return inchange;
  const position = composeMonte ? idxK : idxK + 1;
  return {
    keywords: [...keywords],
    composed: composed.map((c) => (c.uid === composeUid ? { ...c, position } : c)),
  };
}
