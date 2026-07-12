import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CARD_TARGET_LOCALES,
  translateCardBatch,
  type CardTargetLocale,
} from "./translateCards";

// Génère (IA) et upsert les traductions nom + ambiance d'UNE carte vers les 5
// langues cibles. Ne touche jamais une ligne éditée à la main (source='manual').
// Renvoie le nombre de lignes écrites. Ne lève pas — journalise et continue,
// pour ne jamais faire échouer la sauvegarde d'une carte à cause d'un aléa IA.
export async function upsertCardTranslations(
  supabaseAdmin: SupabaseClient,
  card: { id: number; name: string | null; flavor_text: string | null },
): Promise<number> {
  // Locales déjà verrouillées à la main pour cette carte → on les saute.
  const { data: existing } = await supabaseAdmin
    .from("card_translations")
    .select("locale, source")
    .eq("card_id", card.id);
  const manual = new Set(
    (existing ?? [])
      .filter((r: { source: string }) => r.source === "manual")
      .map((r: { locale: string }) => r.locale),
  );

  const targets = CARD_TARGET_LOCALES.filter((l) => !manual.has(l));
  let written = 0;

  for (const locale of targets) {
    try {
      const map = await translateCardBatch([card], locale as CardTargetLocale);
      const t = map.get(card.id);
      if (!t) continue;
      const { error } = await supabaseAdmin.from("card_translations").upsert(
        {
          card_id: card.id,
          locale,
          name: t.name,
          flavor_text: t.flavor_text,
          source: "ai",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "card_id,locale" },
      );
      if (error) {
        console.error(`[card-translate] upsert ${card.id}/${locale}:`, error.message);
      } else {
        written++;
      }
    } catch (err) {
      console.error(
        `[card-translate] ${card.id}/${locale}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return written;
}
