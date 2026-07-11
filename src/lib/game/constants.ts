// Game constants from PRD
export const HERO_MAX_HP = 30;
export const DECK_SIZE = 50;
// Une même capacité nommée ne peut apparaître plus de 12 fois dans un deck.
export const MAX_SAME_CAPABILITY = 12;
// Capacités exemptées de cette limite (Vol — `ranged` en est le doublon legacy
// effectivement stocké sur les cartes).
export const CAPABILITY_LIMIT_EXEMPT: ReadonlySet<string> = new Set(["vol", "ranged"]);
export const STARTING_HAND_SIZE = 4;
export const MAX_HAND_SIZE = 8;
export const MAX_BOARD_SIZE = 8;
export const MAX_MANA = 10;
export const STARTING_MANA = 0;
export const CARDS_DRAWN_PER_TURN = 1;
export const TURN_TIMER_SECONDS = 90;
// Compte à rebours du mulligan (par client). À 0 → confirmation automatique de
// la sélection courante (garder tout si rien n'est sélectionné).
export const MULLIGAN_TIMER_SECONDS = 45;
