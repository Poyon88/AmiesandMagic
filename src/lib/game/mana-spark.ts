import type { Card } from "./types";

// Carte de compensation donnée au joueur qui commence en deuxième (l'équivalent
// de la « pièce »). Elle n'est pas seedée par le repo : c'est une ligne `cards`
// créée à la main dans la forge (faction Humains), donc son libellé exact
// dépend de la saisie admin — en prod : « Etincelle de Mana ».
//
// Le lien code ↔ base se faisait par la chaîne littérale "Mana Spark",
// dupliquée dans engine.ts et la page de match. La ligne ayant été nommée en
// français, les deux lookups échouaient EN SILENCE et le repli codé en dur
// prenait le relais : carte sans illustration et au nom anglais.
//
// Tant qu'il n'y a pas de slug stable en base, on tolère les variantes
// d'écriture au lieu d'exiger une égalité stricte.

// Orthographes acceptées pour le filtre SQL (`.in(...)`), qui ne sait pas
// normaliser les accents. Doit couvrir la valeur réellement stockée.
export const MANA_SPARK_NAMES = [
  "Etincelle de Mana",
  "Étincelle de Mana",
  "Etincelle de mana",
  "Étincelle de mana",
  "Mana Spark",
] as const;

// Formes canoniques après normalisation (accents retirés, casse et espaces
// aplatis) — c'est sur celles-ci que porte la comparaison côté moteur.
const CANONICAL = new Set(["etincelle de mana", "mana spark"]);

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Vrai si cette carte est l'Étincelle de Mana, quelle que soit son écriture. */
export function isManaSpark(card: Pick<Card, "name" | "card_type">): boolean {
  return card.card_type === "spell" && CANONICAL.has(normalize(card.name));
}

// Repli utilisé si la ligne est absente du pool (base non peuplée, ou renommée
// hors des variantes ci-dessus). `id: -1` la rend introuvable dans
// `card_translations` et `image_url: null` la fait tomber sur le placeholder
// dégradé+emoji de GameCard : c'est un mode dégradé visible, pas un état
// normal. Le nom reste FR-canonique pour ne pas afficher d'anglais en jeu.
export const MANA_SPARK_FALLBACK: Card = {
  id: -1,
  name: "Etincelle de Mana",
  mana_cost: 0,
  card_type: "spell",
  attack: null,
  health: null,
  // Vide, pas de phrase en dur : la description vient du mot-clé de sort
  // (Afflux), comme pour la ligne en base dont `effect_text` est NULL.
  effect_text: "",
  keywords: [],
  spell_keywords: [{ id: "afflux", amount: 1 }],
  spell_effects: null,
  image_url: null,
};
