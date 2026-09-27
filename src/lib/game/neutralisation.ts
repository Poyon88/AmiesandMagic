// NEUTRALISATION — tant qu'une créature porteuse est en jeu, une capacité
// choisie par l'auteur est MUETTE chez l'unité ennemie ciblée, ou chez toutes
// les unités ennemies (portée « toutes », aura continue : une ennemie posée
// après y passe aussi).
//
// MISE EN ŒUVRE PAR RETRAIT, comme Singulier (cf. singulier.ts) et pour la même
// raison : le moteur lit les capacités par des dizaines de chemins (`hasKw`,
// boucles sur `keyword_instances` par déclencheur, auras…). Retirer la capacité
// des trois listes de la vue `card` — `keywords`, `keyword_instances`,
// `capabilities` — la rend muette partout, déclencheurs compris : une victime
// qui meurt neutralisée ne déclenche pas ce râle-là. Les éléments retirés vont
// dans `neutralisationStash` (un stash À PART : Singulier retire et rend selon
// sa propre règle, les deux ne doivent jamais se rendre l'un l'autre).
//
// ÉTATS ARMÉS. Trois capacités laissent un état qui se lit SANS passer par la
// capacité : Bouclier (`hasDivineShield`), Contresort et Exclusion (charges).
// Ils sont suspendus dans le stash et rendus tels quels — un bouclier levé le
// reste. Traque décide du mal d'invocation à l'arrivée : neutralisée le tour
// même, elle impose le mal (rendu levé si la levée tombe le même tour).
//
// CYCLE. `leverNeutralisations` rend tout, `poserNeutralisations` recalcule qui
// est visé et retire à nouveau. Le recalcul d'auras fait lever → Singulier →
// poser, puis pose encore à la fin (un objet ou un emblème peut avoir redonné
// la capacité). Une porteuse qui quitte le plateau cesse donc d'agir au recalcul
// suivant, sans code de nettoyage dédié. Tout est déterministe (ids triés,
// rangs d'origine) : l'état est haché.

import type { Capability, Card, CardInstance, Keyword, KeywordInstance, NeutralisationStash, PlayerState } from "./types";
import { porteeValide } from "./target-scope";
import { ABILITIES, creatureEngineId } from "./abilities";

export const NEUTRALISATION_ID = "neutralisation";

/** Id moteur de la capacité visée. `vol` est l'id de registre, `ranged` celui
 *  que portent les cartes (cf. idMoteurDuDon dans le moteur). */
export function idNeutralise(id: string | undefined | null): string | null {
  if (!id || id === NEUTRALISATION_ID) return null;
  return id === "vol" ? "ranged" : id;
}

/** Instance Neutralisation d'une carte (une seule lue : la première). */
export function instanceNeutralisation(card: Card): KeywordInstance | undefined {
  return (card.keyword_instances ?? []).find((k) => k.id === NEUTRALISATION_ID);
}

/** Portée « toutes les ennemies » de la porteuse ? */
export function neutraliseToutes(inst: KeywordInstance | undefined): boolean {
  return porteeValide(inst?.targetScope, ["all_enemies"]) === "all_enemies";
}

/** Capacités neutralisées chez `victime`, d'après les porteuses EN JEU de
 *  `camp` (le camp adverse). Triées : l'ordre entre dans l'état haché. */
export function neutralisationsSubies(victime: CardInstance, camp: PlayerState): string[] {
  const ids = new Set<string>();
  for (const src of camp.board) {
    if (!(src.card.keywords ?? []).includes(NEUTRALISATION_ID as Keyword)) continue;
    const inst = instanceNeutralisation(src.card);
    const id = idNeutralise(inst?.grantAbilityId);
    if (!id) continue;
    if (neutraliseToutes(inst) || src.neutralisationTargetId === victime.instanceId) ids.add(id);
  }
  return [...ids].sort();
}

function insererAuRang<T>(base: T[], items: { item: T; index: number }[], dejaLa?: (t: T) => boolean): T[] {
  const out = [...base];
  for (const { item, index } of [...items].sort((a, b) => a.index - b.index)) {
    if (dejaLa && dejaLa(item)) continue;
    out.splice(Math.min(index, out.length), 0, item);
  }
  return out;
}

/** Retire de la vue `card` tout élément dont l'id est dans `ids`, quel que soit
 *  son déclencheur. Nouvelle carte (mémo de getCapabilities par identité). */
function retirer(card: Card, ids: Set<string>): { card: Card; stash: Omit<NeutralisationStash, "ids" | "etats"> } {
  const stash: Omit<NeutralisationStash, "ids" | "etats"> = { keywords: [], keyword_instances: [], capabilities: [] };
  const keywords: Keyword[] = [];
  (card.keywords ?? []).forEach((id, i) => {
    if (ids.has(id)) stash.keywords.push({ id, index: i }); else keywords.push(id);
  });
  const insts: KeywordInstance[] = [];
  (card.keyword_instances ?? []).forEach((k, i) => {
    if (ids.has(k.id)) stash.keyword_instances.push({ item: k, index: i }); else insts.push(k);
  });
  const caps: Capability[] = [];
  (card.capabilities ?? []).forEach((c, i) => {
    if (!c.composed && ids.has(c.abilityId)) stash.capabilities.push({ item: c, index: i }); else caps.push(c);
  });
  return {
    card: {
      ...card,
      keywords,
      keyword_instances: card.keyword_instances ? insts : card.keyword_instances,
      capabilities: card.capabilities ? caps : card.capabilities,
    },
    stash,
  };
}

/** Remet les éléments retirés à leur rang d'origine, sans dédoubler un
 *  mot-clé revenu entre-temps par un autre chemin (don, aura). */
function rendre(card: Card, stash: NeutralisationStash): Card {
  return {
    ...card,
    keywords: insererAuRang(
      card.keywords ?? [],
      stash.keywords.map((k) => ({ item: k.id, index: k.index })),
      (id) => (card.keywords ?? []).includes(id),
    ),
    keyword_instances: stash.keyword_instances.length
      ? insererAuRang(card.keyword_instances ?? [], stash.keyword_instances)
      : card.keyword_instances,
    capabilities: stash.capabilities.length
      ? insererAuRang(card.capabilities ?? [], stash.capabilities)
      : card.capabilities,
  };
}

/** Rend TOUT ce qu'une instance a perdu, états compris. Mutation en place. */
export function leverNeutralisationInstance(inst: CardInstance, tour: number): void {
  const st = inst.neutralisationStash;
  if (!st) return;
  inst.card = rendre(inst.card, st);
  const e = st.etats;
  if (e?.hasDivineShield) inst.hasDivineShield = true;
  if (e?.contresortCharges) { inst.contresortActive = true; inst.contresortCharges = e.contresortCharges; }
  if (e?.exclusionCharges) inst.exclusionCharges = e.exclusionCharges;
  // Traque rendue le tour même de l'arrivée : l'attaque redevient possible.
  if (e?.malImpose && inst.entreeTour === tour) inst.hasSummoningSickness = false;
  delete inst.neutralisationStash;
}

/** Neutralise `ids` chez une instance (qui ne doit plus avoir de stash).
 *  Mutation en place. */
export function poserNeutralisationInstance(inst: CardInstance, ids: string[], tour: number): void {
  if (ids.length === 0) return;
  const set = new Set(ids);
  const { card, stash } = retirer(inst.card, set);
  const etats: NonNullable<NeutralisationStash["etats"]> = {};
  if (set.has("divine_shield") && inst.hasDivineShield) {
    etats.hasDivineShield = true;
    inst.hasDivineShield = false;
  }
  if (set.has("contresort") && inst.contresortActive) {
    etats.contresortCharges = Math.max(1, inst.contresortCharges ?? 1);
    inst.contresortActive = false;
    inst.contresortCharges = 0;
  }
  if (set.has("exclusion") && (inst.exclusionCharges ?? 0) > 0) {
    etats.exclusionCharges = inst.exclusionCharges;
    inst.exclusionCharges = 0;
  }
  // Traque neutralisée le tour d'arrivée : l'unité n'aurait pu attaquer que
  // grâce à elle. Seulement si elle l'avait vraiment (retirée à l'instant).
  if (set.has("charge") && stash.keywords.some((k) => k.id === "charge")
    && inst.entreeTour === tour && !inst.hasSummoningSickness) {
    etats.malImpose = true;
    inst.hasSummoningSickness = true;
  }
  inst.card = card;
  inst.neutralisationStash = {
    ids,
    ...stash,
    ...(Object.keys(etats).length ? { etats } : {}),
  };
}

function zonesDe(p: PlayerState): CardInstance[][] {
  return [p.hand, p.board, p.deck, p.graveyard, (p.eveil ?? []).map((e) => e.instance)];
}

/** Rend tout, dans toutes les zones des deux joueurs. */
export function leverNeutralisations(a: PlayerState, b: PlayerState, tour: number): void {
  for (const p of [a, b]) for (const zone of zonesDe(p)) for (const inst of zone) leverNeutralisationInstance(inst, tour);
}

/** Recalcule qui est visé et retire. Idempotent : lève d'abord ce qui était
 *  posé. Seules les unités EN JEU peuvent être neutralisées ; les autres zones
 *  sont simplement rendues. Estampille aussi le tour d'arrivée des unités. */
export function poserNeutralisations(a: PlayerState, b: PlayerState, tour: number): void {
  leverNeutralisations(a, b, tour);
  for (const p of [a, b]) {
    for (const zone of zonesDe(p)) {
      if (zone === p.board) continue;
      for (const inst of zone) if (inst.entreeTour != null) delete inst.entreeTour;
    }
    for (const inst of p.board) if (inst.entreeTour == null) inst.entreeTour = tour;
  }
  // Calcul AVANT toute pose : une porteuse neutralisée d'autre chose agit
  // toujours (Neutralisation ne peut pas viser Neutralisation).
  const plan = [a, b].map((p, i) => {
    const adverse = i === 0 ? b : a;
    return p.board.map((inst) => [inst, neutralisationsSubies(inst, adverse)] as const);
  });
  for (const lignes of plan) for (const [inst, ids] of lignes) poserNeutralisationInstance(inst, ids, tour);
}

/** Vue d'AFFICHAGE : la carte avec ses capacités neutralisées remises (elles
 *  s'affichent barrées, cf. `neutralisedIds`). */
export function displayNeutralisee(inst: Pick<CardInstance, "card" | "neutralisationStash">, card: Card = inst.card): Card {
  return inst.neutralisationStash ? rendre(card, inst.neutralisationStash) : card;
}

/** Ids actuellement neutralisés chez une instance (pour barrer leurs icônes). */
export function neutralisedIds(inst: Pick<CardInstance, "neutralisationStash"> | null | undefined): Set<string> {
  return new Set(inst?.neutralisationStash?.ids ?? []);
}

/** Capacités qu'un auteur peut neutraliser : toutes les capacités de créature,
 *  sauf Neutralisation elle-même (deux porteuses se neutralisant l'une l'autre
 *  n'auraient pas d'ordre de résolution défini). Triées par libellé. */
export function capacitesNeutralisables(): { id: string; label: string }[] {
  return Object.values(ABILITIES)
    .filter((a) => a.applicable_to.includes("creature"))
    .map((a) => ({ id: creatureEngineId(a), label: a.creature?.label ?? a.label }))
    .filter((a) => a.id !== NEUTRALISATION_ID)
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}
