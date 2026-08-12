// Types et helpers du système de news (bandeau joueur, page /news/<slug>,
// onglet admin de la forge). Le contenu FRANÇAIS porté par les colonnes
// title/teaser/body_md est la source de vérité ; `translations` porte les
// 7 autres locales, produites par /api/news/translate.
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/i18n/config";

/** Locales cibles de la traduction automatique (toutes sauf le français). */
export const NEWS_TARGET_LOCALES: readonly Locale[] = SUPPORTED_LOCALES.filter(
  (l) => l !== DEFAULT_LOCALE,
);

export interface NewsTranslation {
  title?: string;
  teaser?: string;
  body_md?: string;
}

/** Ligne de la table `news` (cf. supabase-migration-news.sql). */
export interface NewsItem {
  id: number;
  slug: string;
  title: string;
  teaser: string;
  body_md: string;
  image_url: string | null;
  image_style: string | null;
  image_prompt: string | null;
  translations: Partial<Record<Locale, NewsTranslation>>;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Contenu localisé résolu, prêt à afficher. */
export interface LocalizedNews {
  title: string;
  teaser: string;
  bodyMd: string;
}

/** Résout le contenu d'une news pour une locale, avec repli CHAMP PAR CHAMP
 *  sur le français : une traduction partielle (échec en cours de route, champ
 *  vide) ne doit jamais afficher une chaîne vide là où le français existe. */
export function resolveNewsLocale(
  item: Pick<NewsItem, "title" | "teaser" | "body_md" | "translations">,
  locale: Locale,
): LocalizedNews {
  const tr = locale === DEFAULT_LOCALE ? undefined : item.translations?.[locale];
  return {
    title: tr?.title || item.title,
    teaser: tr?.teaser || item.teaser,
    bodyMd: tr?.body_md || item.body_md,
  };
}

/** Slug d'URL depuis un titre : accents → ASCII, tout le reste → tirets.
 *  Même esprit que les noms de fichiers Storage de la forge — déterministe,
 *  jamais vide (repli "news"). */
export function slugifyNewsTitle(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "news";
}

/** Format attendu du slug côté API (validation serveur). */
export const NEWS_SLUG_RE = /^[a-z0-9-]+$/;
