// Configuration i18n centrale. Source de vérité pour la liste des langues.
// La langue source (et le fallback garanti partout) est le français.
// 8 langues (l'ancien système maison fr/en localStorage a été retiré) :
// FR source + EN/ES/DE/IT/PT/JA/ZH. L'arabe (RTL) est différé (miroir des
// layouts = chantier séparé). ja/zh = LTR, aucun réglage `dir` nécessaire.

export const SUPPORTED_LOCALES = ["fr", "en", "es", "de", "it", "pt", "ja", "zh"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

// Nom du cookie porteur du choix de langue. Lisible côté serveur (SSR
// correct) et côté client. maxAge posé par la Server Action `setLocale`.
export const LOCALE_COOKIE = "am-locale";

// Libellés natifs pour le sélecteur de langue.
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  ja: "日本語",
  zh: "中文",
};

// Traducteur « sûr » : renvoie la chaîne traduite si la clé existe, sinon
// `undefined` (jamais d'erreur / warning MISSING_MESSAGE). Les helpers de
// vocabulaire (getKeywordDisplayLabel, getFactionDisplayName, …) l'acceptent
// en paramètre OPTIONNEL : sans traducteur (code moteur / SSR sans provider)
// ils retombent sur le français source. Le hook client `useVocab` fabrique
// un SafeT à partir de next-intl (`t.has` + `t.raw` — chaîne brute, pas de
// formatage ICU : les helpers substituent eux-mêmes les {marqueurs}).
export type SafeT = (key: string) => string | undefined;

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

// Normalise une valeur arbitraire (cookie, param, header) vers une locale
// supportée, avec repli sur le français.
export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
