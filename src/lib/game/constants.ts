// Game constants from PRD
export const HERO_MAX_HP = 30;
export const DECK_SIZE = 50;
// Une même capacité nommée ne peut apparaître plus de 12 fois dans un deck.
export const MAX_SAME_CAPABILITY = 12;
// Capacités exemptées de cette limite (Vol — `ranged` en est le doublon legacy
// effectivement stocké sur les cartes).
export const CAPABILITY_LIMIT_EXEMPT: ReadonlySet<string> = new Set(["vol", "ranged"]);
/** Plafonds PROPRES à certaines capacités, en dérogation à MAX_SAME_CAPABILITY.
 *
 *  Chant : c'est la mécanique identitaire des Fils du Volcan, et elle a besoin
 *  d'une créature chanteuse EN JEU pour que les sorts du deck se renforcent.
 *  Le plafond commun étouffait donc le clan qu'il était censé équilibrer : il
 *  faut assez d'exemplaires pour en tirer une de façon fiable. */
export const CAPABILITY_LIMIT_OVERRIDES: ReadonlyMap<string, number> = new Map([
  ["chant", 24],
]);
/** Plafond applicable à une capacité nommée : sa dérogation si elle en a une,
 *  le plafond commun sinon. Point de passage UNIQUE — la validation live, la
 *  validation de sauvegarde et le badge de décompte doivent lire la même
 *  valeur, sinon l'un des trois annonce une limite que les autres n'appliquent
 *  pas. */
export function capabilityLimitFor(abilityId: string): number {
  return CAPABILITY_LIMIT_OVERRIDES.get(abilityId) ?? MAX_SAME_CAPABILITY;
}
/** Main de départ du joueur qui commence EN SECOND. */
export const STARTING_HAND_SIZE = 4;

/** Main de départ du joueur qui commence EN PREMIER — une carte de moins.
 *
 *  L'initiative vaut cher : le premier joueur pose sa créature avant l'autre,
 *  attaque un tour plus tôt, et pioche dès son premier tour. Le jeu compensait
 *  déjà ce déséquilibre côté MANA, en donnant une Étincelle de mana au second
 *  joueur (cf. applyMulligan) ; il le compense désormais aussi côté CARTES.
 *
 *  Deux constantes plutôt qu'un `- 1` au point de distribution : le chiffre est
 *  un réglage d'équilibrage, il doit être visible et modifiable ici, à côté de
 *  son jumeau. */
export const FIRST_PLAYER_HAND_SIZE = 3;

/** Taille de la main de départ d'un joueur, selon qu'il commence ou non.
 *
 *  Source UNIQUE : le moteur distribue avec, et le tutoriel annonce avec. Un
 *  écran qui recopierait le chiffre finirait par mentir au premier
 *  rééquilibrage. */
export function startingHandSizeFor(playerIndex: 0 | 1, firstPlayerIndex: 0 | 1): number {
  return playerIndex === firstPlayerIndex ? FIRST_PLAYER_HAND_SIZE : STARTING_HAND_SIZE;
}
export const MAX_HAND_SIZE = 8;
export const MAX_BOARD_SIZE = 8;
export const MAX_MANA = 10;
export const STARTING_MANA = 0;
/** Plafond du compteur d'Épargne. Le surplus est écrêté en silence : une
 *  Épargne 3 sur un compteur à 7 le porte à 8, pas à 10. */
export const MAX_EPARGNE = 8;
/** Nombre maximal de cartes qu'un joueur peut tenir en ÉVEIL simultanément.
 *
 *  Sans plafond, un joueur pourrait vider sa main dans la zone d'éveil et s'en
 *  servir de coffre-fort : les cartes y sont intouchables, et il les
 *  ressortirait au rythme de son mana. Trois, c'est assez pour tramer un plan
 *  sur plusieurs tours, et assez peu pour que la tuile reste lisible à l'écran
 *  des deux côtés. */
export const MAX_EVEIL = 3;
/** Seuil de deck des capacités « Seuil » : elles s'activent quand le deck du
 *  contrôleur tombe à CE NOMBRE de cartes ou moins. Partagé par Seuil
 *  Sacrificiel (créature) et Seuil de colère (sort) — une seule valeur à
 *  rééquilibrer, et une règle qui se raconte en une phrase au joueur. */
export const SEUIL_DECK_THRESHOLD = 25;
/** Seuil de PV du déclencheur « Sous 15 PV » (on_low_hp) : la capacité part
 *  quand le CONTRÔLEUR de la carte passe STRICTEMENT sous ce nombre de PV
 *  (la moitié de HERO_MAX_HP). Une seule valeur à rééquilibrer. */
export const LOW_HP_TRIGGER_THRESHOLD = 15;
export const CARDS_DRAWN_PER_TURN = 1;
export const TURN_TIMER_SECONDS = 90;
/** Fenêtre accordée pour trancher UN choix interactif en attente (déclencheur
 *  « fin de tour », Remontée à la mort…). Volontairement DÉTACHÉE du chrono de
 *  tour : la pause se produit souvent parce que le chrono vient d'expirer, et
 *  se rabattre sur son reliquat laissait alors ~0 seconde — la modale
 *  s'affichait puis le repli aléatoire tranchait à la place du joueur. Repart
 *  de zéro à chaque nouveau choix. */
export const CHOICE_TIMER_SECONDS = 15;
// Compte à rebours du mulligan (par client). À 0 → confirmation automatique de
// la sélection courante (garder tout si rien n'est sélectionné).
export const MULLIGAN_TIMER_SECONDS = 45;
