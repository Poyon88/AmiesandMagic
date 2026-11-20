// Configuration i18n centrale. Source de vérité pour la liste des langues.
// La langue source (et le fallback garanti partout) est le français.
// 14 langues (l'ancien système maison fr/en localStorage a été retiré) :
// FR source + EN/ES/DE/IT/PT/JA/ZH/RU/AR/KO/ZH-TW/TR/PL (`zh` = chinois
// simplifié, `zh-TW` = traditionnel). L'arabe s'écrit de droite à gauche :
// seul le TEXTE est retourné (cf. `:lang(ar)` dans globals.css), la mise en
// page reste celle des autres langues — la mettre en miroir (plateau, effets)
// est un chantier séparé.

// L'ORDRE est celui des sélecteurs de langue : l'anglais en tête (langue par
// défaut des visiteurs dont on ne connaît pas le pays), puis le français.
export const SUPPORTED_LOCALES = ["en", "fr", "es", "de", "it", "pt", "ja", "zh", "ru", "ar", "ko", "zh-TW", "tr", "pl"] as const;

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
  zh: "简体中文",
  ru: "Русский",
  ar: "العربية",
  ko: "한국어",
  "zh-TW": "繁體中文",
  tr: "Türkçe",
  pl: "Polski",
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
