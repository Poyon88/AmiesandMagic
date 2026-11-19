// Ce que l'admin peut régler sur la page d'accueil : les sections de cartes
// et les textes. Partagé par la page serveur, les routes d'API et l'écran
// d'admin, pour qu'une clé ou une section ne puisse pas exister d'un seul côté.

import { FACTIONS } from "@/lib/card-engine/constants";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

export const SECTIONS_VITRINE = ["mur", "faction", "tirages", "frise"] as const;
export type SectionVitrine = (typeof SECTIONS_VITRINE)[number];

export function estSectionVitrine(v: unknown): v is SectionVitrine {
  return typeof v === "string" && (SECTIONS_VITRINE as readonly string[]).includes(v);
}

/** En dessous, une rangée du mur ou la frise ne boucle pas proprement : la
 *  sélection à la main est ignorée et l'automatique reprend la main. */
export const MIN_AFFICHES_PAR_RANGEE = 6;

/** Factions présentées sur la page : toutes sauf le vivier partagé. */
export const FACTIONS_VITRINE: string[] = Object.entries(FACTIONS)
  .filter(([, def]) => def.alignment !== "spéciale")
  .map(([id]) => id);

export interface TexteEditable {
  /** Clé dans `messages.landing`, en notation pointée. */
  key: string;
  /** Nom du champ dans l'admin. */
  label: string;
  /** Partie de la page, pour grouper les champs. */
  groupe: string;
  /** Champ long : zone de texte plutôt que ligne. */
  long?: boolean;
}

/** Les textes réglables, dans l'ordre de la page. Les libellés de navigation,
 *  les étiquettes d'accessibilité et les textes à variable (« {count} ») n'y
 *  sont pas : une faute de saisie y casserait la page. */
export const TEXTES_EDITABLES: TexteEditable[] = [
  { key: "hero_claim", label: "Accroche (2e ligne du titre)", groupe: "Premier écran" },
  { key: "hero_sub", label: "Sous-titre", groupe: "Premier écran", long: true },
  { key: "hero_cta", label: "Bouton principal", groupe: "Premier écran" },
  { key: "hero_cta_secondary", label: "Lien secondaire", groupe: "Premier écran" },
  { key: "factions_title", label: "Titre", groupe: "Factions" },
  { key: "factions_sub", label: "Texte", groupe: "Factions", long: true },
  ...FACTIONS_VITRINE.map((id) => ({
    key: `factions.${id}.tagline`,
    label: `Accroche — ${FACTIONS[id].displayName ?? id}`,
    groupe: "Factions",
  })),
  { key: "limited_title", label: "Titre", groupe: "Tirages limités (decks Expert)" },
  { key: "limited_desc", label: "Texte", groupe: "Tirages limités (decks Expert)", long: true },
  { key: "f_icons_title", label: "Titre « lisibilité »", groupe: "Tirages limités (decks Expert)" },
  { key: "f_icons_desc", label: "Texte « lisibilité »", groupe: "Tirages limités (decks Expert)", long: true },
  { key: "trailer_title", label: "Titre", groupe: "Bande-annonce" },
  { key: "f4_title", label: "Titre", groupe: "Tournois" },
  { key: "f4_desc", label: "Texte", groupe: "Tournois", long: true },
  { key: "f4_example", label: "Légende du tableau", groupe: "Tournois", long: true },
  { key: "cta_title", label: "Titre", groupe: "Clôture" },
  { key: "cta_sub", label: "Texte", groupe: "Clôture", long: true },
  { key: "cta_btn", label: "Bouton", groupe: "Clôture" },
];

const CLES_EDITABLES = new Set(TEXTES_EDITABLES.map((t) => t.key));
export function estCleEditable(v: unknown): v is string {
  return typeof v === "string" && CLES_EDITABLES.has(v);
}

/** Longueur maximale d'un texte : une accroche, pas un article. */
export const LONGUEUR_MAX_TEXTE = 600;

/** Valeur d'une clé pointée dans un dictionnaire de messages. */
export function lireCle(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export interface LigneTexte {
  key: string;
  fr: string;
  translations: Record<string, unknown> | null;
}

/**
 * Les textes à substituer pour une langue. En français, le texte saisi. Dans
 * une autre langue, sa traduction — et, tant qu'elle manque, RIEN : le visiteur
 * garde le texte par défaut dans sa langue plutôt qu'une phrase en français.
 */
export function textesPourLocale(lignes: LigneTexte[], locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of lignes) {
    if (!estCleEditable(l.key)) continue;
    const v = locale === DEFAULT_LOCALE ? l.fr : l.translations?.[locale];
    if (typeof v === "string" && v.trim()) out[l.key] = v;
  }
  return out;
}

/** Copie du dictionnaire avec les textes substitués. Une clé qui ne mène pas
 *  à un texte existant est ignorée : on ne crée pas de branche. */
export function appliquerTextes<T>(dict: T, textes: Record<string, string>): T {
  if (Object.keys(textes).length === 0) return dict;
  const copie = structuredClone(dict) as unknown;
  for (const [key, valeur] of Object.entries(textes)) {
    const parts = key.split(".");
    let cur = copie as Record<string, unknown>;
    let ok = true;
    for (const part of parts.slice(0, -1)) {
      const next = cur[part];
      if (next === null || typeof next !== "object") { ok = false; break; }
      cur = next as Record<string, unknown>;
    }
    const feuille = parts[parts.length - 1];
    if (ok && typeof cur[feuille] === "string") cur[feuille] = valeur;
  }
  return copie as T;
}
