// MUTATION X — capacité de créature activée EN MAIN, à son tour, gratuitement.
//
// Deux Découvertes successives de 3 créatures communes de coût EXACTEMENT X,
// toutes factions (vivier `GameState.mutationPool`), puis une capacité choisie
// sur chacune des deux élues. La carte en main est réécrite : elle garde son
// identité (coût, nom, race, clan, illustration) et ses autres capacités, prend
// l'ATK la plus haute et les PV les plus hauts des deux élues, et AJOUTE les
// deux capacités choisies. Mutation disparaît : une seule mutation par carte.
//
// Ce module est PUR (aucun état moteur) : l'interface s'en sert pour bâtir les
// modales, le moteur pour RE-VALIDER l'action reçue — les deux calculent donc
// exactement la même chose.
//
// Offres semées sur l'id de l'instance, et sur rien d'autre (ni tour, ni main,
// ni position de la RNG) : annuler puis relancer la mutation redonne les mêmes
// cartes. Pas de « reroll » gratuit en annulant. L'id d'instance vient de la RNG
// semée par partie : identique chez les deux clients, différent d'une partie à
// l'autre.
import type { Capability, Card, Keyword, KeywordInstance } from "./types";
import { getCapabilities, modeForCreatureTrigger } from "./capability-adapter";
import { DEATH_NATURE_IDS } from "./abilities";

export const MUTATION_ID = "mutation";
export const MUTATION_OFFER_COUNT = 3;

/** X de Mutation porté par la carte (0 = pas de Mutation). L'adaptateur a déjà
 *  replié le `[Mutation X]` du texte d'effet dans `params.x`. */
export function mutationX(card: Card): number {
  const cap = getCapabilities(card).find((c) => c.abilityId === MUTATION_ID);
  if (!cap) return 0;
  const inst = card.keyword_instances?.find((k) => k.id === (MUTATION_ID as Keyword));
  return Math.max(0, cap.params?.x ?? inst?.x ?? 0);
}

/** Capacités qu'une créature peut LÉGUER à une mutante : toutes, sauf Mutation. */
export function mutationCapacites(card: Card): Capability[] {
  return getCapabilities(card).filter((c) => c.abilityId !== MUTATION_ID);
}

function graine(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

/** Offre d'une étape (1 ou 2). L'étape 2 écarte la créature prise à l'étape 1.
 *  Ne propose que des créatures qui ont au moins une capacité à léguer. */
export function mutationOffer(
  pool: readonly Card[] | undefined,
  x: number,
  instanceId: string,
  etape: 1 | 2,
  exclureId?: number,
): Card[] {
  if (!pool || x < 1) return [];
  const candidats = pool
    .filter((c) => c.card_type === "creature" && c.mana_cost === x && c.id !== exclureId)
    .filter((c) => mutationCapacites(c).length > 0)
    .sort((a, b) => a.id - b.id);
  let h = graine(`${instanceId}|mutation|${etape}`) || 1;
  const rnd = () => {
    h = (h * 16807 + 12345) & 0x7fffffff;
    return (h & 0xfffffff) / 0x10000000;
  };
  const out = [...candidats];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, MUTATION_OFFER_COUNT);
}

/** Choix complet d'une mutation, tel que l'action le transporte. */
export interface MutationChoix {
  creatureIds: [number, number];
  capUids: [string, string];
}

/** Résout un choix contre les offres RECALCULÉES. `null` si quoi que ce soit
 *  sort de l'offre (créature non proposée, capacité absente ou Mutation). */
export function resoudreChoixMutation(
  pool: readonly Card[] | undefined,
  card: Card,
  instanceId: string,
  choix: MutationChoix,
): { a: Card; capA: Capability; b: Card; capB: Capability } | null {
  const x = mutationX(card);
  if (x < 1) return null;
  const a = mutationOffer(pool, x, instanceId, 1).find((c) => c.id === choix.creatureIds[0]);
  if (!a) return null;
  const b = mutationOffer(pool, x, instanceId, 2, a.id).find((c) => c.id === choix.creatureIds[1]);
  if (!b) return null;
  const capA = mutationCapacites(a).find((c) => c.uid === choix.capUids[0]);
  const capB = mutationCapacites(b).find((c) => c.uid === choix.capUids[1]);
  if (!capA || !capB) return null;
  return { a, capA, b, capB };
}

// Données de mot-clé portées par une COLONNE de la carte et non par la capacité
// (cartes anciennes). Copiées avec la capacité léguée, sauf si la mutante
// utilise déjà cette colonne pour son propre mot-clé.
const COLONNES_ANNEXES: Partial<Record<string, (keyof Card)[]>> = {
  convocation: ["convocation_token_id"],
  convocation_simple: ["convocation_token_id"],
  convocations_multiples: ["convocation_tokens"],
  lycanthropie: ["lycanthropie_token_id"],
  entraide: ["entraide_race"],
};

/** Ce que la capacité `cap` de `source` ajoute à la mutante. */
function legs(source: Card, cap: Capability, uid: string): { cap: Capability; kw?: Keyword; inst?: KeywordInstance } {
  // `position` (ordre d'auteur) n'a pas de sens sur la carte d'accueil : la
  // capacité léguée va en queue.
  const { position: _p, ...reste } = cap as Capability & { position?: number };
  void _p;
  const copie: Capability = { ...reste, uid };
  if (cap.composed) return { cap: copie };
  const kw = cap.abilityId as Keyword;
  // Un RÂLE D'AGONIE (Résurrection, Carnage…) se résout par `hasKw` à la mort :
  // son instance ne doit PAS porter `mode: "death"`, sinon la boucle des modes
  // le résoudrait une seconde fois (même règle que applyGrantedKeyword).
  const mode = DEATH_NATURE_IDS.has(kw) ? undefined : modeForCreatureTrigger(cap.trigger);
  const instSource = source.keyword_instances?.find((k) => k.id === kw && k.mode === mode);
  let inst: KeywordInstance | undefined = instSource ? { ...instSource } : undefined;
  if (!inst && (mode || cap.params?.x != null || cap.params?.y != null)) {
    inst = { id: kw, ...(mode ? { mode } : {}) };
    if (cap.params?.x != null) inst.x = cap.params.x;
    if (cap.params?.y != null) inst.y = cap.params.y;
  }
  return { cap: copie, kw, inst };
}

/** Retire le jeton `[Mutation X]` du texte d'effet (le reste est conservé : il
 *  porte encore le X des capacités anciennes de la carte). */
function sansMutationTexte(texte: string | null | undefined): string {
  return (texte ?? "").replace(/\s*\[\s*Mutation(?:\s+\d+)?\s*\]\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
}

/** Une capacité à léguer, avec la carte qui la porte (pour son instance de
 *  mot-clé et ses colonnes annexes). */
export interface Legs { source: Card; cap: Capability }

/** Ajoute à `card` les capacités léguées, copiées EN ENTIER (X, déclencheur,
 *  cibles, effet composé), chacune sous un nouvel uid. Renvoie un NOUVEL objet
 *  carte (le cache de `getCapabilities` est indexé par objet carte), sans
 *  toucher aux stats. Partagé par Mutation et Tactique.
 *
 *  `retirer` : ids retirés de la carte au passage (Mutation retire Mutation). */
export function leguerCapacites(card: Card, legsListe: Legs[], retirer: string[] = []): Card {
  const sansRetires = (k: string) => !retirer.includes(k);
  const kwsBase = ((card.keywords ?? []) as Keyword[]).filter(sansRetires);
  const instsBase = (card.keyword_instances ?? []).filter((k) => sansRetires(k.id));
  // Capacités de la carte MATÉRIALISÉES (le X d'un `[Mot-clé X]` du texte est
  // déjà dans `params.x`).
  const capsBase = getCapabilities({ ...card, keywords: kwsBase, keyword_instances: instsBase })
    .filter((c) => sansRetires(c.abilityId));

  const uids = new Set(capsBase.map((c) => c.uid));
  const uidLibre = (u: string) => {
    let cand = `mut_${u}`;
    let k = 0;
    while (uids.has(cand)) cand = `mut${k++}_${u}`;
    uids.add(cand);
    return cand;
  };

  const keywords = [...kwsBase];
  const keyword_instances = [...instsBase];
  const caps = [...capsBase];
  const annexes: Partial<Card> = {};
  for (const { source, cap } of legsListe) {
    const l = legs(source, cap, uidLibre(cap.uid));
    caps.push(l.cap);
    if (!l.kw) continue;
    const dejaPorte = keywords.includes(l.kw);
    if (!dejaPorte) keywords.push(l.kw);
    if (l.inst) keyword_instances.push(l.inst);
    for (const col of COLONNES_ANNEXES[l.kw] ?? []) {
      const actuel = (card as unknown as Record<string, unknown>)[col as string];
      if (!dejaPorte && (actuel == null || (Array.isArray(actuel) && actuel.length === 0))) {
        (annexes as Record<string, unknown>)[col as string] = (source as unknown as Record<string, unknown>)[col as string];
      }
    }
  }
  return { ...card, ...annexes, keywords: keywords as Card["keywords"], keyword_instances, capabilities: caps };
}

/** La carte mutante : un NOUVEL objet (le cache de `getCapabilities` est indexé
 *  par objet carte). */
export function carteMutante(card: Card, a: Card, capA: Capability, b: Card, capB: Capability): Card {
  const enrichie = leguerCapacites(card, [{ source: a, cap: capA }, { source: b, cap: capB }], [MUTATION_ID]);
  return {
    ...enrichie,
    attack: Math.max(a.attack ?? 0, b.attack ?? 0),
    health: Math.max(a.health ?? 1, b.health ?? 1),
    effect_text: sansMutationTexte(card.effect_text),
  };
}

// ─── TACTIQUE X ─────────────────────────────────────────────────────────────
// X capacités tirées au hasard parmi celles des créatures COMMUNES (vivier de
// Mutation) de MÊME COÛT que celle qui les reçoit, copiées en entier.

/** Déclencheurs qui ne peuvent plus partir chez une unité déjà sur le plateau :
 *  exclus du tirage (un « à l'entrée » donné en jeu serait un tirage perdu). */
const DECLENCHEURS_HORS_PLATEAU = new Set<string>([
  "on_play", "on_draw", "on_return", "on_end_of_turn_in_hand", "on_start_of_turn_in_hand", "spell_resolution",
]);
const JAMAIS_LEGUEES = new Set<string>(["tactique", MUTATION_ID]);

/** Clé de dédoublonnage : même capacité, même déclencheur, mêmes valeurs. */
export function cleCapacite(cap: Capability): string {
  return JSON.stringify([cap.abilityId, cap.trigger, cap.params ?? null, cap.composed ?? null, cap.race ?? null, cap.clan ?? null, cap.tokenId ?? null]);
}

/** Vivier de Tactique pour `recipient` : capacités DISTINCTES des communes de
 *  même coût, hors déclencheurs inutiles sur le plateau, hors Tactique /
 *  Mutation et hors capacités que la cible porte déjà. Ordre stable (id de
 *  carte puis ordre des capacités) pour un tirage reproductible. */
export function tactiqueVivier(pool: readonly Card[] | undefined, recipient: Card): Legs[] {
  if (!pool) return [];
  const deja = new Set(getCapabilities(recipient).map(cleCapacite));
  const vus = new Set<string>();
  const out: Legs[] = [];
  const meme = pool.filter((c) => c.card_type === "creature" && c.mana_cost === recipient.mana_cost)
    .sort((a, b) => a.id - b.id);
  for (const source of meme) {
    for (const cap of getCapabilities(source)) {
      if (JAMAIS_LEGUEES.has(cap.abilityId) || DECLENCHEURS_HORS_PLATEAU.has(cap.trigger)) continue;
      if (cap.effectKind === "grant") continue;
      const cle = cleCapacite(cap);
      if (deja.has(cle) || vus.has(cle)) continue;
      vus.add(cle);
      out.push({ source, cap });
    }
  }
  return out;
}
