import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import LandingPage from "@/components/landing/LandingPage";
import { localizeCardsInPlace } from "@/lib/cards/localizeCard";
import { normalizeLocale } from "@/i18n/config";
import type { Card } from "@/lib/game/types";
import { FACTIONS, getFactionForRace } from "@/lib/card-engine/constants";

export const metadata = {
  title: "Armies & Magic — A Fantasy Collectible Card Game",
  description: "Collectionnez, combattez, échangez. Le jeu de cartes à collectionner fantasy qui réinvente le genre.",
};

/** Factions HISTORIQUES encore inscrites sur des lignes `heroes` : la table
 *  garde des valeurs d'avant la refonte (slugs anglais, et des factions
 *  absorbées depuis). On les rattache à leur faction actuelle pour que leur
 *  portrait continue de servir plutôt que de disparaître.
 *
 *  Tout le reste — race → faction — est DÉRIVÉ de `FACTIONS`, pas recopié. */
const FACTIONS_HERITEES: Record<string, string> = {
  humans: "Humains",
  elves: "Elfes",
  dwarves: "Nains",
  beastmen: "Hommes-Bêtes",
  dark_elves: "Elfes Noirs",
  undead: "Morts-Vivants",
  elementals: "Élémentaires",
  Elementaires: "Élémentaires",
  "Elémentaires": "Élémentaires",
  // Absorbées par la refonte : les Hobbits ont rejoint L'Alliance Céleste, les
  // Orcs Les Légions du Chaos.
  Hobbits: "Elfes",
  halflings: "Elfes",
  Orcs: "Elfes Noirs",
  "Orcs et Gobelins": "Elfes Noirs",
  orcs_goblins: "Elfes Noirs",
};

/** Faction canonique d'une ligne `heroes`, par son champ faction puis sa race. */
function factionDuHeros(faction: string | null, race: string | null): string | null {
  for (const v of [faction, race]) {
    if (!v) continue;
    if (FACTIONS[v]) return v;
    if (FACTIONS_HERITEES[v]) return FACTIONS_HERITEES[v];
    const parRace = getFactionForRace(v);
    if (parRace) return parRace;
  }
  return null;
}

export default async function Landing() {
  const supabase = await createClient();

  const [{ data: showcaseData }, { data: heroesData }] = await Promise.all([
    supabase
      .from("showcase_cards")
      .select("card_id, sort_order, card:cards(*)")
      .order("sort_order"),
    supabase
      .from("heroes")
      // PAS de filtre `is_default` : on le préfère, mais on se rabat sur
      // n'importe quel héros de la faction. L'Empire du Milieu a trois héros et
      // aucun par défaut — la vignette manquait, et la carte tombait sur le
      // blason générique alors que l'illustration existait.
      .select("race, faction, thumbnail_url, is_default")
      .not("thumbnail_url", "is", null)
      // Ordre EXPLICITE : deux factions ont plusieurs héros par défaut (Les
      // Légions du Chaos en ont deux). Sans tri, laquelle s'affiche dépend de
      // l'ordre que rend la base — la page de garde changerait de visage sans
      // qu'on y touche.
      .order("race"),
  ]);

  const showcaseCardsFr: Card[] = (showcaseData ?? [])
    .map(s => s.card as unknown as Card)
    .filter(Boolean);

  // Localise nom + ambiance des cartes vitrine pour la locale active (repli FR).
  // Surface d'affichage pur : `effect_text` reste canonique (rendu via le
  // système de mots-clés vocab). En FR, court-circuit sans requête.
  const locale = normalizeLocale(await getLocale());
  const showcaseCards = await localizeCardsInPlace(supabase, showcaseCardsFr, locale);

  // Portrait par faction : le héros PAR DÉFAUT d'abord — c'est le visage voulu
  // de la faction — puis, à défaut, le premier héros venu. Deux passes plutôt
  // qu'un tri, pour que l'ordre renvoyé par la base reste sans importance.
  const factionHeroUrls: Record<string, string> = {};
  for (const parDefaut of [true, false]) {
    for (const h of heroesData ?? []) {
      if (!!h.is_default !== parDefaut || !h.thumbnail_url) continue;
      const id = factionDuHeros(h.faction, h.race);
      if (!id || factionHeroUrls[id]) continue;
      factionHeroUrls[id] = h.thumbnail_url;
    }
  }

  return <LandingPage showcaseCards={showcaseCards} factionHeroUrls={factionHeroUrls} />;
}
