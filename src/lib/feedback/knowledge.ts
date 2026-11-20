// Ce que l'agent de tri sait du jeu pour répondre aux questions des joueurs :
// le LIVRET DE RÈGLES (src/lib/regles), et quelques repères sur le site.
//
// Rien n'est écrit ici sur les règles elles-mêmes : une règle qui manque à
// l'agent se complète dans le livret, pas dans ce fichier.
//
// Le résultat est STABLE d'un appel à l'autre (aucune date, aucun id) : il
// forme le préfixe mis en cache du prompt.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale } from "@/i18n/config";
import { sansValeur, type NomsCapacites } from "./noms";
import { contexteCourant, livret, type MontantsRegles } from "@/lib/regles/livret";

const CONSIGNE_SITE = `HORS DU LIVRET. Tu ne connais PAS : le solde, les achats ou l'état du compte d'un joueur, le pays d'où il se connecte, le calendrier des sorties, ni le texte précis d'une carte donnée. Ce que le site annonce comme prévu n'est pas une règle : ne le promets pas.`;

/** Montants réglés depuis l'admin (boutique, enchères). Une lecture ratée ne
 *  bloque rien : le livret renvoie alors le joueur à l'écran concerné. */
async function montantsRegles(supabase: SupabaseClient): Promise<MontantsRegles> {
  const [boutique, encheres] = await Promise.all([
    supabase.from("faction_shop_settings").select("faction_price, bundle_price").limit(1).maybeSingle(),
    supabase.from("auction_settings").select("min_bid_increment, anti_snipe_seconds, is_marketplace_open").limit(1).maybeSingle(),
  ]);
  if (boutique.error) console.warn("[feedback] prix de la boutique illisibles :", boutique.error.message);
  if (encheres.error) console.warn("[feedback] réglages des enchères illisibles :", encheres.error.message);
  return {
    prixFaction: boutique.data?.faction_price ?? null,
    prixForfait: boutique.data?.bundle_price ?? null,
    surenchereMin: encheres.data?.min_bid_increment ?? null,
    prolongationSecondes: encheres.data?.anti_snipe_seconds ?? null,
    marcheOuvert: encheres.data?.is_marketplace_open ?? null,
  };
}

// Les montants réglables sont relus de temps en temps, pas à chaque retour :
// le bloc doit rester identique d'un appel à l'autre pour profiter du cache du
// prompt, et un prix ne change pas à la minute.
const FRAICHEUR_MS = 10 * 60_000;
let cache: { texte: string; lu: number } | null = null;

/** Bloc de connaissances du jeu, en français : le livret du déploiement
 *  courant, avec les montants en vigueur. */
export async function connaissances(supabase: SupabaseClient): Promise<string> {
  if (cache && Date.now() - cache.lu < FRAICHEUR_MS) return cache.texte;
  const texte = `=== LIVRET DE RÈGLES D'ARMIES OF LEGENDS ===

${livret(contexteCourant(await montantsRegles(supabase)))}

=== ${CONSIGNE_SITE}`;
  cache = { texte, lu: Date.now() };
  return texte;
}

type Vocab = Record<string, { label?: string } | undefined>;

/** Noms officiels des capacités dans une langue (unités et actions), sans leur
 *  valeur. Vide si la langue n'est pas une de celles du jeu. */
export async function nomsCapacites(locale: string): Promise<NomsCapacites> {
  const noms = new Map<string, string>();
  if (!isLocale(locale)) return noms;
  try {
    const vocab = ((await import(`../../../messages/${locale}.json`)).default.vocab ?? {}) as Record<string, Vocab>;
    for (const bloc of ["keywords", "spell_keywords"] as const) {
      for (const [id, v] of Object.entries(vocab[bloc] ?? {})) {
        // Une capacité d'action homonyme d'une capacité d'unité garde le nom de l'unité.
        if (v?.label && !noms.has(id)) noms.set(id, sansValeur(v.label));
      }
    }
  } catch {
    // Fichier de langue illisible : pas de noms, donc pas de conversion.
  }
  return noms;
}

/**
 * Lexique « nom français → nom dans la langue de l'interface du joueur », donné
 * à l'agent : le livret est en français, et un joueur anglophone n'a jamais vu
 * « Traque » ou « Provocation » à l'écran. Vide pour le français.
 */
export async function lexique(locale: string): Promise<string> {
  if (locale === "fr") return "";
  const [fr, cible] = await Promise.all([nomsCapacites("fr"), nomsCapacites(locale)]);
  const paires = new Map<string, string>();
  for (const [id, de] of fr) {
    const vers = cible.get(id);
    if (vers && vers !== de) paires.set(de, vers);
  }
  return [...paires].map(([de, vers]) => `${de} → ${vers}`).join("\n");
}
