import type { Locale } from "./useLocale";

// Copy used by the authenticated home, the collection hub and the
// heroes page. Kept separate from the landing dict so the landing
// bundle stays narrow.
export interface HomeDict {
  // Home (main menu)
  home_subtitle: string;
  play_label: string;
  play_desc: string;
  market_label: string;
  market_desc: string;
  market_desc_buy: string;
  collection_label: string;
  collection_desc: string;
  decks_label: string;
  decks_desc: string;
  tutorial_label: string;
  tutorial_desc: string;
  tutorial_back: string;

  // Header
  welcome: string;
  logout: string;
  settings: string;
  skip_to_content: string;

  // Collection hub
  collection_title: string;
  collection_back: string;
  my_cards: string;
  my_cards_desc: string;
  my_heroes: string;
  my_heroes_desc: string;
  my_card_backs: string;
  my_card_backs_desc: string;
  my_boards: string;
  my_boards_desc: string;

  // Heroes page
  heroes_title: string;
  heroes_empty: string;
  heroes_filter_all: string;
  heroes_label_faction: string;
  heroes_label_clan: string;
  heroes_label_rarity: string;
  heroes_loading: string;
  heroes_load_error: string;
  hero_power: string;
}

export const homeDict: Record<Locale, HomeDict> = {
  fr: {
    home_subtitle: "Une carte. Une légende. À toi de jouer.",
    play_label: "Jouez",
    play_desc: "Trouvez un adversaire et lancez une partie",
    market_label: "Marché",
    market_desc: "Achetez et vendez aux enchères",
    market_desc_buy: "Achetez aux enchères",
    collection_label: "Ma collection",
    collection_desc: "Cartes, héros, dos, plateaux",
    decks_label: "Mes decks",
    decks_desc: "Composez et ajustez vos decks",
    tutorial_label: "Comment jouer",
    tutorial_desc: "Apprenez les règles et les capacités",
    tutorial_back: "Retour à l'accueil",

    welcome: "Bienvenue,",
    logout: "Déconnexion",
    settings: "Réglages",
    skip_to_content: "Aller au contenu",

    collection_title: "Ma collection",
    collection_back: "Retour à l'accueil",
    my_cards: "Mes cartes",
    my_cards_desc: "Votre catalogue de cartes possédées",
    my_heroes: "Mes héros",
    my_heroes_desc: "Champions débloqués",
    my_card_backs: "Mes dos",
    my_card_backs_desc: "Dos de cartes possédés",
    my_boards: "Mes plateaux",
    my_boards_desc: "Plateaux de jeu possédés",

    heroes_title: "Mes héros",
    heroes_empty: "Aucun héros débloqué pour l'instant.",
    heroes_filter_all: "Tous",
    heroes_label_faction: "Faction",
    heroes_label_clan: "Clan",
    heroes_label_rarity: "Rareté",
    heroes_loading: "Chargement…",
    heroes_load_error: "Impossible de charger vos héros.",
    hero_power: "Pouvoir",
  },
  en: {
    home_subtitle: "One card. One legend. Your move.",
    play_label: "Play",
    play_desc: "Find an opponent and battle",
    market_label: "Market",
    market_desc: "Buy and sell at auction",
    market_desc_buy: "Buy at auction",
    collection_label: "My Collection",
    collection_desc: "Cards, heroes, backs, boards",
    decks_label: "My Decks",
    decks_desc: "Build and tune your decks",
    tutorial_label: "How to Play",
    tutorial_desc: "Learn the rules and abilities",
    tutorial_back: "Back to home",

    welcome: "Welcome,",
    logout: "Log out",
    settings: "Settings",
    skip_to_content: "Skip to content",

    collection_title: "My Collection",
    collection_back: "Back to home",
    my_cards: "My Cards",
    my_cards_desc: "Your owned card catalog",
    my_heroes: "My Heroes",
    my_heroes_desc: "Unlocked champions",
    my_card_backs: "My Card Backs",
    my_card_backs_desc: "Owned card backs",
    my_boards: "My Boards",
    my_boards_desc: "Owned game boards",

    heroes_title: "My Heroes",
    heroes_empty: "No heroes unlocked yet.",
    heroes_filter_all: "All",
    heroes_label_faction: "Faction",
    heroes_label_clan: "Clan",
    heroes_label_rarity: "Rarity",
    heroes_loading: "Loading…",
    heroes_load_error: "Could not load your heroes.",
    hero_power: "Power",
  },
};
