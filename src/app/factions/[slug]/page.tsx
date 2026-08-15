// La page d'une FACTION : ses clans, et toutes leurs cartes communes.
//
// Atteinte depuis la page de garde, donc PUBLIQUE (cf. `PUBLIC_PATH_PREFIXES`
// dans proxy.ts) : un visiteur qui clique une faction avant de s'inscrire doit
// arriver sur la page, pas sur l'écran de connexion. C'est aussi ce qui la rend
// indexable — la vitrine du jeu, carte par carte.

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { localizeCardsInPlace } from "@/lib/cards/localizeCard";
import { normalizeLocale } from "@/i18n/config";
import { FACTIONS } from "@/lib/card-engine/constants";
import { factionFromSlug, showcaseFactionSlugs } from "@/lib/game/faction-slug";
import { clansOfFaction } from "@/lib/game/clan-profile";
import { signatureFromCards, type CarteComptable } from "@/lib/game/clan-signature";
import { additionalCostsFromCards } from "@/lib/game/clan-costs";
import { statProfileFromCards } from "@/lib/game/clan-stat-profile";
import FactionClansPage, { type HeroDeClan } from "@/components/factions/FactionClansPage";
import type { Card } from "@/lib/game/types";

/** Les neuf factions présentées sont connues à la compilation. */
export function generateStaticParams() {
  return showcaseFactionSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const id = factionFromSlug(slug);
  const faction = id ? FACTIONS[id] : null;
  if (!faction) return { title: "Armies & Magic" };
  return {
    title: `${faction.displayName} — Armies & Magic`,
    description: faction.description,
  };
}

const COLONNES_CARTE =
  "id, name, mana_cost, card_type, attack, health, effect_text, flavor_text, " +
  "keywords, keyword_instances, spell_keywords, spell_effects, capabilities, " +
  "image_url, faction, race, clan, rarity, card_alignment, convocation_token_id, " +
  "convocation_tokens, lycanthropie_token_id, entraide_race, set_id, card_year, " +
  "card_month, life_cost, discard_cost, sacrifice_cost, exile_cost";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const factionId = factionFromSlug(slug);
  // Mercenaires a bien un slug mais n'est pas une armée qu'on présente : la
  // page de garde ne le propose pas, son adresse ne doit pas exister non plus.
  if (!factionId || FACTIONS[factionId]?.alignment === "spéciale") notFound();

  const supabase = await createClient();

  // TROIS lectures, et c'est voulu.
  //
  // La page MONTRE les communes ; elle DÉCRIT le clan. Compter les capacités
  // sur les seules communes donnerait une signature amputée du quart le plus
  // caractérisé du clan — ses cartes rares. La seconde requête ne ramène donc
  // que ce qu'il faut pour compter : deux colonnes, toutes raretés.
  const [{ data }, { data: pourCompter }, { data: herosData }] = await Promise.all([
    supabase
    .from("cards")
    .select(COLONNES_CARTE)
    .eq("faction", factionId)
    .eq("rarity", "Commune")
    // Une carte écartée des tirages ne s'obtient pas : l'annoncer sur la page
    // qui promet « tout le commun de la faction » serait mentir.
    .eq("discoverable", true)
    .order("mana_cost")
    .order("name"),
    supabase
      .from("cards")
      // `capabilities` porte les effets COMPOSÉS, invisibles des deux autres
      // colonnes et pourtant bien des capacités du clan.
      // `attack`/`health` servent au profil de jeu, mesuré sur les créatures.
      .select("clan, keywords, spell_keywords, capabilities, keyword_instances, card_type, attack, health")
      .eq("faction", factionId)
      .not("clan", "is", null),
    // Les héros de la faction, pour donner un visage à chaque clan.
    supabase
      .from("heroes")
      .select("id, name, clan, thumbnail_url, power_name, power_cost, power_description, power_image_url, is_default_clan")
      .eq("faction", factionId)
      .eq("is_active", true)
      .not("clan", "is", null)
      // Ordre EXPLICITE : plusieurs héros peuvent partager un clan sans qu'aucun
      // ne soit désigné. Sans tri, celui qui s'affiche dépend de la base.
      .order("name"),
  ]);

  const locale = normalizeLocale(await getLocale());
  const cartes = await localizeCardsInPlace(supabase, (data ?? []) as unknown as Card[], locale);

  // Regroupement par clan, dans l'ordre où le moteur déclare les clans — pas
  // dans l'ordre de la base.
  const parClan = new Map<string, Card[]>();
  // Les cartes SANS clan n'en sont pas moins de la faction : le constructeur
  // ne les compte pas dans la limite d'un clan par deck (cf. DeckBuilder,
  // `if (card.clan && …)`), elles rejoignent donc n'importe quel deck.
  const sansClan: Card[] = [];
  for (const c of cartes) {
    if (!c.clan) { sansClan.push(c); continue; }
    const liste = parClan.get(c.clan);
    if (liste) liste.push(c);
    else parClan.set(c.clan, [c]);
  }

  // Capacités réellement portées, par clan, toutes raretés confondues.
  const aCompter = new Map<string, CarteComptable[]>();
  for (const c of (pourCompter ?? []) as unknown as (CarteComptable & { clan: string | null })[]) {
    if (!c.clan) continue;
    const liste = aCompter.get(c.clan);
    if (liste) liste.push(c);
    else aCompter.set(c.clan, [c]);
  }

  // Un visage par clan : le héros DÉSIGNÉ d'abord (case « défaut pour le clan »
  // de l'administration), sinon le premier venu de ce clan. Sans ce repli, la
  // vignette manquerait partout où personne n'a encore coché la case.
  const herosParClan = new Map<string, HeroDeClan>();
  for (const prefere of [true, false]) {
    for (const h of (herosData ?? []) as unknown as (HeroDeClan & { clan: string | null; is_default_clan: boolean })[]) {
      if (!!h.is_default_clan !== prefere || !h.clan || herosParClan.has(h.clan)) continue;
      herosParClan.set(h.clan, h);
    }
  }

  const sections = clansOfFaction(factionId)
    .map((profil) => ({
      profil,
      cartes: parClan.get(profil.nom) ?? [],
      signature: signatureFromCards(aCompter.get(profil.nom) ?? []),
      // Les coûts se comptent sur le pool COMMUN — celui que la page montre —
      // et non sur toutes les raretés comme la signature : c'est une promesse
      // faite au joueur sur les cartes qu'il reçoit.
      couts: additionalCostsFromCards(parClan.get(profil.nom) ?? []),
      // Le penchant se mesure sur TOUTES les créatures du clan, comme la
      // signature : il décrit le clan, pas seulement ce que la page montre.
      stats: statProfileFromCards(aCompter.get(profil.nom) ?? []),
      hero: herosParClan.get(profil.nom) ?? null,
    }))
    // Choix retenu : un clan SANS AUCUNE carte n'apparaît pas. La Sublime Porte
    // et La Garde Noire n'en ont pas encore — mieux vaut ne rien montrer qu'un
    // trou dans la vitrine. Un clan à une seule carte, lui, reste affiché.
    .filter((s) => s.cartes.length > 0);

  return <FactionClansPage factionId={factionId} sections={sections} sansClan={sansClan} />;
}
