// INVENTION — construction progressive d'une MACHINE.
//
// Chaque joueur a au plus une machine en construction (`PlayerState.machine`).
// Une Invention lui ajoute +X/+Y et, au choix, une capacité avec son
// déclencheur ; un clic sur le compteur la met en main sous forme de carte, et
// la construction suivante repart d'une machine vierge.
//
// Module PUR, sans dépendance au moteur : l'UI s'en sert pour l'aperçu au
// survol (même carte que celle que le moteur mettra en main), et les tests le
// couvrent directement.
import { AUTOMATIC_ABILITY_IDS, TOKEN_UNSUPPORTED_IDS, XY_ABILITY_IDS } from "./abilities";
import { KEYWORD_LABELS } from "./keyword-labels";
import { MACHINE_BASE_ATTACK, MACHINE_BASE_HEALTH, MAX_INVENTIONS_MACHINE } from "./constants";
import type { Card, Keyword, KeywordInstance, KeywordMode, MachineState } from "./types";

/** Ce qu'UNE Invention apporte à la machine. */
export interface InventionPart {
  attack: number;
  health: number;
  grantAbilityId?: string;
  grantX?: number;
  grantY?: number;
  grantMode?: KeywordMode;
}

/** Capacités qu'une Invention ne peut PAS ajouter à une machine : celles dont
 *  la donnée annexe (jeton, cartes liées, capacité visée…) n'a pas de place
 *  dans une Invention — même liste que pour les jetons — plus Invention
 *  elle-même (une machine qui invente une machine) et Transformation (carte
 *  cible liée). */
const EXCLUES: ReadonlySet<string> = new Set([...TOKEN_UNSUPPORTED_IDS, "invention", "transformation"]);

export function estCapaciteDeMachine(abilityId: string): boolean {
  return !EXCLUES.has(abilityId);
}

/** Une capacité PERMANENTE (Vol, Armure…) n'a pas de déclencheur : le mode
 *  saisi est ignoré, et deux apports se fondent en une seule capacité. */
export function estPermanente(abilityId: string): boolean {
  return AUTOMATIC_ABILITY_IDS.has(abilityId);
}

export function machineVierge(): MachineState {
  return { attack: MACHINE_BASE_ATTACK, health: MACHINE_BASE_HEALTH, inventions: 0, keywords: [], keyword_instances: [] };
}

/** Applique une Invention à une machine et rend la NOUVELLE machine (l'entrée
 *  n'est pas modifiée). Machine complète (MAX_INVENTIONS_MACHINE) : rendue
 *  telle quelle, l'Invention est ignorée en entier.
 *
 *  Cumul : une capacité est identifiée par (id, déclencheur). Le même couple
 *  additionne ses X (et ses Y pour une capacité à couple) ; un déclencheur
 *  différent donne une capacité distincte ; une capacité sans X n'apparaît
 *  qu'une fois. */
export function appliquerInvention(actuelle: MachineState | null | undefined, part: InventionPart): MachineState {
  const base = actuelle ?? machineVierge();
  if (base.inventions >= MAX_INVENTIONS_MACHINE) return base;

  const m: MachineState = {
    attack: base.attack + Math.max(0, part.attack),
    health: base.health + Math.max(0, part.health),
    inventions: base.inventions + 1,
    keywords: [...base.keywords],
    keyword_instances: base.keyword_instances.map((k) => ({ ...k })),
  };

  const id = part.grantAbilityId;
  if (!id || !estCapaciteDeMachine(id)) return m;
  const kw = id as Keyword;
  if (!m.keywords.includes(kw)) m.keywords.push(kw);

  const mode = estPermanente(id) ? undefined : part.grantMode;
  const couple = XY_ABILITY_IDS.has(id);
  // Une capacité sans amplitude (Vol) ignore un X saisi par mégarde.
  const avecX = /X/.test(KEYWORD_LABELS[kw] ?? "");
  const x = avecX && part.grantX != null && part.grantX > 0 ? part.grantX : undefined;
  const y = couple && part.grantY != null && part.grantY > 0 ? part.grantY : undefined;

  const existante = m.keyword_instances.find((k) => k.id === kw && k.mode === mode);
  if (existante) {
    if (x != null) existante.x = (existante.x ?? 0) + x;
    if (y != null) existante.y = (existante.y ?? 0) + y;
    return m;
  }
  // Une capacité permanente sans X n'a besoin d'aucune instance : sa présence
  // dans `keywords` suffit, comme sur une carte de la forge.
  if (mode == null && x == null && y == null) return m;
  const inst: KeywordInstance = { id: kw, ...(mode ? { mode } : {}), ...(x != null ? { x } : {}) };
  if (couple) inst.y = y ?? 0;
  m.keyword_instances.push(inst);
  return m;
}

/** La CARTE correspondant à une machine : ce que le joueur reçoit en main, et
 *  ce que l'UI montre au survol du compteur. Toujours un objet NEUF —
 *  `getCapabilities` met en cache par objet carte.
 *
 *  `capabilities: null` : tout est dérivé de `keywords` + `keyword_instances`,
 *  exactement comme pour une carte de la forge sans effet composé. */
export function buildMachineCard(machine: MachineState, faction: string | null): Card {
  return {
    id: -1,
    name: "Machine",
    mana_cost: machine.inventions,
    card_type: "creature",
    attack: machine.attack,
    health: machine.health,
    effect_text: "",
    keywords: [...machine.keywords],
    keyword_instances: machine.keyword_instances.map((k) => ({ ...k })),
    spell_keywords: null,
    spell_effects: null,
    capabilities: null,
    image_url: null,
    race: "Machines",
    rarity: "Commune",
    faction,
    machine: true,
  } as Card;
}
