import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import LandingPage from "@/components/landing/LandingPage";
import { localizeCardsInPlace } from "@/lib/cards/localizeCard";
import { normalizeLocale } from "@/i18n/config";
import type { Card } from "@/lib/game/types";
import { FACTIONS, getFactionForRace } from "@/lib/card-engine/constants";
import type { Affiche, RangeeDuMur } from "@/components/vitrine/types";

export const metadata = {
  title: "Armies of Legends — Jeu de cartes à collectionner fantasy",
  description: "Neuf factions, la première offerte en entier : plus de 300 cartes dès l'inscription. Les tirages limités rendent chaque deck Expert unique.",
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

/** Carte du bloc « Lisibles d'un coup d'œil » : Morcant, Cavalier du Dernier
 *  Nom, choisi par l'auteur. Absente ⇒ le bloc disparaît, sans erreur. */
const CARTE_LISIBILITE_ID = 1407;

/** Ordre des rangées du mur : les trois alignements du jeu. */
const RANGEES_DU_MUR = ["bon", "neutre", "maléfique"] as const;
/** Affiches par rangée. Le rail en affiche deux copies pour boucler sans
 *  couture : au-delà, on charge des images que personne ne verra passer. */
const AFFICHES_PAR_RANGEE = 14;
const RANG_RARETE: Record<string, number> = { "Légendaire": 0, "Épique": 1, "Rare": 2 };

type LigneAffiche = {
  id: number; name: string | null; flavor_text: string | null; faction: string | null;
  race: string | null; clan: string | null; rarity: string | null; card_type: string | null;
  image_url: string | null;
};

/** Tour de table : une carte de chaque faction à la fois, pour qu'une rangée
 *  ne soit pas un bloc de Humains suivi d'un bloc de Nains. */
function entrelacer<T>(groupes: T[][], max: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < max; i++) {
    let pris = false;
    for (const g of groupes) {
      if (g[i] !== undefined && out.length < max) { out.push(g[i]); pris = true; }
    }
    if (!pris) break;
  }
  return out;
}

export default async function Landing() {
  const supabase = await createClient();

  const [{ data: showcaseData }, { data: heroesData }, { data: carteLisibilite }, { data: murData }, { data: limiteesData }] = await Promise.all([
    supabase
      .from("showcase_cards")
      .select("card_id, sort_order, card:cards(*)")
      .order("sort_order"),
    supabase
      .from("heroes")
      // PAS de filtre : on PRÉFÈRE, mais on se rabat. L'Empire du Milieu a
      // trois héros et aucun par défaut — la vignette manquait, et la carte
      // tombait sur le blason générique alors que l'illustration existait.
      .select("race, faction, thumbnail_url, is_default, is_default_faction")
      .not("thumbnail_url", "is", null)
      // Ordre EXPLICITE : deux factions ont plusieurs héros par défaut (Les
      // Légions du Chaos en ont deux). Sans tri, laquelle s'affiche dépend de
      // l'ordre que rend la base — la page de garde changerait de visage sans
      // qu'on y touche.
      .order("race"),
    supabase.from("cards").select("*").eq("id", CARTE_LISIBILITE_ID).maybeSingle(),
    // Le mur : les cartes jouables illustrées des trois raretés hautes, une
    // centaine de lignes. Colonnes comptées — la carte entière (capacités,
    // effets) ne sert à rien ici et pèserait dans la page.
    supabase
      .from("cards")
      .select("id, name, flavor_text, faction, race, clan, rarity, card_type, image_url")
      .eq("status", "playable")
      .eq("card_type", "creature")
      .in("rarity", ["Légendaire", "Épique", "Rare"])
      .not("image_url", "is", null)
      .order("id"),
    // Les cartes en TIRAGE LIMITÉ : hors set, millésimées — c'est exactement
    // le test que fait GameCard pour afficher « /N ». Cartes entières, car
    // elles sont rendues par le vrai composant du jeu.
    supabase
      .from("cards")
      .select("*")
      .eq("status", "playable")
      .eq("card_type", "creature")
      .is("set_id", null)
      .not("card_year", "is", null)
      .in("rarity", ["Peu Commune", "Rare", "Épique", "Légendaire"])
      .not("image_url", "is", null)
      // Les plus récentes d'abord : les toutes premières cartes du jeu portent
      // encore des noms de travail en anglais.
      .order("id", { ascending: false })
      .limit(120),
  ]);

  const showcaseCardsFr: Card[] = (showcaseData ?? [])
    .map(s => s.card as unknown as Card)
    .filter(Boolean);

  // Localise nom + ambiance des cartes vitrine pour la locale active (repli FR).
  // Surface d'affichage pur : `effect_text` reste canonique (rendu via le
  // système de mots-clés vocab). En FR, court-circuit sans requête.
  const locale = normalizeLocale(await getLocale());
  const showcaseCards = await localizeCardsInPlace(supabase, showcaseCardsFr, locale);
  const [iconCard] = carteLisibilite
    ? await localizeCardsInPlace(supabase, [carteLisibilite as unknown as Card], locale)
    : [null];

  // Portrait par faction, par ordre de préférence :
  //   1. le héros désigné DÉFAUT DE FACTION — c'est exactement ce que la case
  //      de l'admin veut dire, et elle prime sur tout ;
  //   2. sinon le défaut de sa race, faute de mieux ;
  //   3. sinon le premier héros venu, pour ne pas retomber sur le blason.
  // Trois passes plutôt qu'un tri, pour que l'ordre renvoyé par la base reste
  // sans importance.
  const factionHeroUrls: Record<string, string> = {};
  const rangs = [
    (h: { is_default: boolean; is_default_faction: boolean }) => !!h.is_default_faction,
    (h: { is_default: boolean; is_default_faction: boolean }) => !h.is_default_faction && !!h.is_default,
    (h: { is_default: boolean; is_default_faction: boolean }) => !h.is_default_faction && !h.is_default,
  ];
  for (const retient of rangs) {
    for (const h of heroesData ?? []) {
      if (!retient(h) || !h.thumbnail_url) continue;
      const id = factionDuHeros(h.faction, h.race);
      if (!id || factionHeroUrls[id]) continue;
      factionHeroUrls[id] = h.thumbnail_url;
    }
  }

  // ── Le mur ────────────────────────────────────────────────────────────
  const lignesMur = await localizeCardsInPlace(supabase, (murData ?? []) as LigneAffiche[], locale);
  const parFaction = new Map<string, Affiche[]>();
  for (const c of lignesMur) {
    if (!c.faction || !c.image_url || !c.name || !c.rarity) continue;
    if (!FACTIONS[c.faction] || FACTIONS[c.faction].alignment === "spéciale") continue;
    const liste = parFaction.get(c.faction) ?? [];
    liste.push({ id: c.id, name: c.name, faction: c.faction, race: c.race, clan: c.clan, rarity: c.rarity, image: c.image_url, flavor: c.flavor_text });
    parFaction.set(c.faction, liste);
  }
  for (const liste of parFaction.values()) {
    liste.sort((a, b) => (RANG_RARETE[a.rarity] ?? 9) - (RANG_RARETE[b.rarity] ?? 9) || a.id - b.id);
  }
  const rangees: RangeeDuMur[] = RANGEES_DU_MUR.map((alignement) => ({
    id: alignement,
    affiches: entrelacer(
      [...parFaction.entries()].filter(([f]) => FACTIONS[f].alignment === alignement).map(([, l]) => l),
      AFFICHES_PAR_RANGEE,
    ),
  })).filter((r) => r.affiches.length >= 6);

  // Les vedettes : la plus rare de chaque faction PRÉSENTE sur le mur, pour
  // que l'affiche visée soit toujours une de celles qu'on voit dériver.
  const surLeMur = new Set(rangees.flatMap((r) => r.affiches.map((a) => a.id)));
  const vedettes: Affiche[] = [];
  const factionArt: Record<string, string> = {};
  // Ce que le mur ne montre pas sert ailleurs : la page promet un catalogue,
  // elle ne doit pas resservir les mêmes quarante images à chaque section.
  const horsMur: Affiche[][] = [];
  for (const [faction, liste] of parFaction) {
    const reste = liste.filter((a) => !surLeMur.has(a.id));
    factionArt[faction] = (reste[0] ?? liste[0]).image;
    horsMur.push(reste.slice(1));
    const v = liste.find((a) => surLeMur.has(a.id));
    if (v) vedettes.push(v);
  }
  // Les Uniques ouvrent la ronde : c'est la première carte que voit le visiteur.
  vedettes.sort((a, b) => (RANG_RARETE[a.rarity] ?? 9) - (RANG_RARETE[b.rarity] ?? 9));
  const frise = entrelacer(horsMur, AFFICHES_PAR_RANGEE);

  // Les tirages limités montrés en vrai : deux par rareté, à tour de rôle,
  // pour que les numéros de tirage (« /N ») soient variés.
  const limitees = await localizeCardsInPlace(supabase, (limiteesData ?? []) as unknown as Card[], locale);
  const parRarete = ["Rare", "Épique", "Peu Commune", "Légendaire"].map((r) => limitees.filter((c) => c.rarity === r));
  const cartesLimitees = entrelacer(parRarete, 8);

  return (
    <LandingPage
      showcaseCards={showcaseCards}
      factionHeroUrls={factionHeroUrls}
      iconCard={iconCard}
      rangees={rangees}
      vedettes={vedettes}
      factionArt={factionArt}
      frise={frise}
      cartesLimitees={cartesLimitees}
    />
  );
}
