// VIVIERS d'un match simulé — miroir de la construction faite par la page de
// match (src/app/game/[matchId]/page.tsx, chargement des pools).
//
// La page n'est PAS branchée dessus : elle interroge la base au fil de l'eau et
// la moindre différence d'ordre entre deux clients désynchroniserait les
// tirages en ligne. Ici tout part d'un catalogue déjà en mémoire. Si la règle de
// la page change, la reporter ici (test : match-pools.test.ts).
import { FACTIONS } from "@/lib/card-engine/constants";
import { excludeNonDiscoverable, excludeSpecialSets, onlyPlayable } from "@/lib/game/deck-rules";
import { isManaSpark } from "@/lib/game/mana-spark";
import { designatedCardIds } from "@/lib/game/tuteur";
import type { Card, HeroDefinition } from "@/lib/game/types";
import { effetsDuPouvoir } from "@/lib/game/hero-power";

export interface Viviers { factionCardPool: Card[]; allSpellsPool: Card[] }

/** Factions dont la page charge les cartes pour ce match : celles des decks,
 *  les Mercenaires, toutes les factions du même ALIGNEMENT, et le renfort
 *  NEUTRE dès qu'un deck porte un alignement tranché. */
export function factionsDuMatch(decks: { card: Card }[][]): Set<string> {
  const deckFactions = new Set(decks.flat().map((c) => c.card.faction).filter(Boolean) as string[]);
  deckFactions.add("Mercenaires");
  const alignements = new Set<string>();
  for (const f of deckFactions) {
    const al = FACTIONS[f]?.alignment;
    if (al && al !== "spéciale") alignements.add(al);
  }
  const renfortNeutre = alignements.has("bon") || alignements.has("maléfique");
  const out = new Set(deckFactions);
  for (const [id, def] of Object.entries(FACTIONS)) {
    if (def.alignment === "spéciale") continue;
    if (alignements.has(def.alignment) || (renfortNeutre && def.alignment === "neutre")) out.add(id);
  }
  return out;
}

function idsLies(c: Card, out: Set<number>) {
  for (const inst of c.keyword_instances ?? []) {
    if (inst.id === "compagnons" || inst.id === "tuteur" || inst.id === "transformation") for (const id of inst.linkedCardIds ?? []) out.add(id);
  }
  for (const sk of c.spell_keywords ?? []) {
    if (sk.id === "compagnons" || sk.id === "tuteur") for (const id of sk.linkedCardIds ?? []) out.add(id);
  }
  for (const cap of c.capabilities ?? []) {
    if (cap.abilityId === "compagnons" || cap.abilityId === "tuteur" || cap.abilityId === "transformation") for (const id of cap.linkedCardIds ?? []) out.add(id);
    for (const id of designatedCardIds(cap.composed)) out.add(id);
  }
}

/**
 * @param catalogue TOUTES les cartes (tous statuts) : les cartes liées suivent
 *                  leur mère quel que soit leur statut, comme dans la page.
 */
export function viviersDuMatch(
  catalogue: Card[],
  specialSetIds: ReadonlySet<number>,
  decks: { card: Card; quantity: number }[][],
  heros: (HeroDefinition | null)[],
): Viviers {
  const factions = factionsDuMatch(decks);
  const parId = [...catalogue].sort((a, b) => a.id - b.id);
  const factionCards = onlyPlayable(excludeNonDiscoverable(excludeSpecialSets(
    parId.filter((c) => c.faction && factions.has(c.faction)), specialSetIds)));
  // L'Étincelle de mana est ajoutée si sa faction n'est pas dans le match.
  const etincelle = parId.find((c) => c.card_type === "spell" && isManaSpark(c));
  if (etincelle && !factionCards.some((c) => c.id === etincelle.id)) factionCards.push(etincelle);
  const allSpells = onlyPlayable(excludeNonDiscoverable(excludeSpecialSets(
    parId.filter((c) => c.card_type === "spell"), specialSetIds)));

  const lies = new Set<number>();
  decks.flat().forEach(({ card }) => idsLies(card, lies));
  factionCards.forEach((c) => idsLies(c, lies));
  allSpells.forEach((c) => idsLies(c, lies));
  for (const h of heros) {
    for (const e of effetsDuPouvoir(h)) {
      if (e.mode === "composed") for (const id of designatedCardIds(e.composed)) lies.add(id);
    }
  }
  const charges = new Set([...factionCards, ...allSpells].map((c) => c.id));
  const manquants = [...lies].filter((id) => !charges.has(id)).sort((a, b) => a - b);
  const parIdMap = new Map(parId.map((c) => [c.id, c]));
  for (const id of manquants) { const c = parIdMap.get(id); if (c) factionCards.push(c); }

  return { factionCardPool: factionCards, allSpellsPool: allSpells };
}
