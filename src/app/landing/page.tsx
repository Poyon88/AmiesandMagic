import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import LandingPage from "@/components/landing/LandingPage";
import { localizeCardsInPlace } from "@/lib/cards/localizeCard";
import { normalizeLocale } from "@/i18n/config";
import type { Card } from "@/lib/game/types";

export const metadata = {
  title: "Armies & Magic — A Fantasy Collectible Card Game",
  description: "Collectionnez, combattez, échangez. Le jeu de cartes à collectionner fantasy qui réinvente le genre.",
};

// Map race/faction values stored on heroes rows to the landing-page
// faction key. The heroes table holds historical naming inconsistencies
// (English lowercase legacy entries vs newer French faction labels), so
// we accept both variants for the same landing slot.
const FACTION_LOOKUP: Record<string, string> = {
  "Humains": "humans",
  "humans": "humans",
  "Elfes": "elves",
  "Fées": "elves",
  "elves": "elves",
  "Nains": "dwarves",
  "dwarves": "dwarves",
  "Hobbits": "halflings",
  "halflings": "halflings",
  "Hommes-bêtes": "beastmen",
  "beastmen": "beastmen",
  "Géants": "giants",
  "giants": "giants",
  "Élémentaires": "giants",
  "Elémentaires": "giants",
  "Elementaires": "giants",
  "Élémentaire": "giants",
  "Elementals": "giants",
  "elementals": "giants",
  "Elfes Noirs": "dark_elves",
  "Elfes Corrompus": "dark_elves",
  "dark_elves": "dark_elves",
  "Orcs": "orcs_goblins",
  "Orcs et Gobelins": "orcs_goblins",
  "orcs_goblins": "orcs_goblins",
  "Morts-Vivants": "undead",
  "Vampires": "undead",
  "undead": "undead",
};

export default async function Landing() {
  const supabase = await createClient();

  const [{ data: showcaseData }, { data: heroesData }] = await Promise.all([
    supabase
      .from("showcase_cards")
      .select("card_id, sort_order, card:cards(*)")
      .order("sort_order"),
    supabase
      .from("heroes")
      .select("race, faction, thumbnail_url")
      .eq("is_default", true)
      .not("thumbnail_url", "is", null),
  ]);

  const showcaseCardsFr: Card[] = (showcaseData ?? [])
    .map(s => s.card as unknown as Card)
    .filter(Boolean);

  // Localise nom + ambiance des cartes vitrine pour la locale active (repli FR).
  // Surface d'affichage pur : `effect_text` reste canonique (rendu via le
  // système de mots-clés vocab). En FR, court-circuit sans requête.
  const locale = normalizeLocale(await getLocale());
  const showcaseCards = await localizeCardsInPlace(supabase, showcaseCardsFr, locale);

  const factionHeroUrls: Record<string, string> = {};
  for (const h of heroesData ?? []) {
    const key = FACTION_LOOKUP[h.faction ?? ""] || FACTION_LOOKUP[h.race ?? ""];
    if (!key || !h.thumbnail_url) continue;
    if (!factionHeroUrls[key]) factionHeroUrls[key] = h.thumbnail_url;
  }

  return <LandingPage showcaseCards={showcaseCards} factionHeroUrls={factionHeroUrls} />;
}
