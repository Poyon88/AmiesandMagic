import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

// Champs d'affichage traduits, exposés en PLUS des champs canoniques.
// ⚠️ Les champs canoniques (`name`, `effect_text`, `flavor_text`) restent en FR
// pour le moteur (parsing X / brackets sur effect_text). On n'écrase jamais en
// place — on ajoute `*_display` que l'UI consomme.
export interface LocalizedCardFields {
  name_display: string | null;
  flavor_text_display: string | null;
  effect_text_display: string | null;
}

interface TranslatableCard {
  id: number;
  name?: string | null;
  flavor_text?: string | null;
  effect_text?: string | null;
}

type TranslationRow = {
  card_id: number;
  name: string | null;
  flavor_text: string | null;
  effect_text: string | null;
};

// Fusionne les traductions (champ par champ, null → repli FR) sur une liste de
// cartes. Ajoute les champs `*_display`. En locale FR (ou sans traduction), les
// `*_display` valent simplement les champs FR canoniques.
export function localizeCards<T extends TranslatableCard>(
  cards: T[],
  translations: TranslationRow[],
  locale: Locale,
): (T & LocalizedCardFields)[] {
  const byId = new Map<number, TranslationRow>();
  if (locale !== DEFAULT_LOCALE) {
    for (const tr of translations) byId.set(tr.card_id, tr);
  }
  return cards.map((c) => {
    const tr = byId.get(c.id);
    return {
      ...c,
      name_display: tr?.name ?? c.name ?? null,
      flavor_text_display: tr?.flavor_text ?? c.flavor_text ?? null,
      effect_text_display: tr?.effect_text ?? c.effect_text ?? null,
    };
  });
}

// Récupère et fusionne en une passe : charge les traductions des `cards`
// visibles pour la locale donnée, puis applique localizeCards. En FR, court-
// circuite sans requête DB.
export async function withLocalizedCards<T extends TranslatableCard>(
  supabase: SupabaseClient,
  cards: T[],
  locale: Locale,
): Promise<(T & LocalizedCardFields)[]> {
  if (locale === DEFAULT_LOCALE || cards.length === 0) {
    return localizeCards(cards, [], locale);
  }
  const ids = cards.map((c) => c.id);
  const { data } = await supabase
    .from("card_translations")
    .select("card_id, name, flavor_text, effect_text")
    .eq("locale", locale)
    .in("card_id", ids);
  return localizeCards(cards, (data as TranslationRow[]) ?? [], locale);
}

// Variante pour surfaces d'AFFICHAGE PUR (collection, deck builder) : remplace
// `name` et `flavor_text` EN PLACE par leur traduction (fallback FR). ⚠️ Ne
// PAS utiliser là où le moteur consomme les cartes (partie) — il lit
// `effect_text` FR ; ici `effect_text` reste canonique (jamais écrasé), donc
// le parsing X/brackets et la reconstruction d'effet restent corrects.
export async function localizeCardsInPlace<T extends TranslatableCard>(
  supabase: SupabaseClient,
  cards: T[],
  locale: Locale,
): Promise<T[]> {
  if (locale === DEFAULT_LOCALE || cards.length === 0) return cards;
  const localized = await withLocalizedCards(supabase, cards, locale);
  return localized.map((c) => ({
    ...c,
    name: c.name_display ?? c.name ?? null,
    flavor_text: c.flavor_text_display ?? c.flavor_text ?? null,
  }));
}
