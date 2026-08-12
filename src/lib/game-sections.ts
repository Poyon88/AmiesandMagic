// Sections du jeu vers lesquelles un contenu éditorial peut pointer : liens
// insérés dans le corps Markdown d'une news, et bouton d'action en pied de page.
//
// SOURCE UNIQUE de ces trois informations, qui vivaient jusqu'ici éparpillées :
// la route (connue de MainMenu), la clé de libellé traduite (idem), et le
// libellé français (que l'admin doit voir et qui part dans le Markdown).
//
// Pourquoi une liste écrite à la main : les routes de l'App Router ne sont pas
// énumérables à l'exécution, et toutes les pages ne sont pas des destinations
// éditoriales sensées (/login, /onboarding/pseudo, /game/[matchId]…). Le risque
// habituel du dépôt — une liste dupliquée qui dérive en silence — est couvert
// par `game-sections.test.ts`, qui vérifie pour CHAQUE entrée que la route
// existe vraiment, qu'elle est bien celle de MainMenu, et que `frLabel` est
// exactement la valeur de `labelKey` dans messages/fr.json.

export interface GameSection {
  /** Identifiant stable, persisté en base (news.cta_section). JAMAIS la route :
   *  renommer une URL ne doit pas invalider les news déjà publiées. */
  key: string;
  /** Route interne. `renderMarkdown` en fait un <Link> Next (navigation client). */
  href: string;
  /** Clé du libellé dans le namespace `home` de messages/<locale>.json. C'est
   *  elle qui donne le texte du bouton côté joueur, donc traduit dans les 8
   *  langues sans passe de traduction supplémentaire. */
  labelKey: string;
  /** Libellé français, pour l'admin (thème clair, libellés en dur) et pour le
   *  texte du lien inséré dans le Markdown — dont la source est le français. */
  frLabel: string;
}

export const GAME_SECTIONS: readonly GameSection[] = [
  { key: "play", href: "/play", labelKey: "play_label", frLabel: "Jouez" },
  { key: "auction", href: "/auction", labelKey: "market_label", frLabel: "Marché" },
  { key: "collection", href: "/collection-hub", labelKey: "collection_label", frLabel: "Ma collection" },
  { key: "decks", href: "/decks", labelKey: "decks_label", frLabel: "Mes decks" },
  { key: "tutoriel", href: "/tutoriel", labelKey: "tutorial_label", frLabel: "Comment jouer" },
];

/** Section par identifiant persisté. `undefined` si la clé est inconnue — cas
 *  réel après suppression d'une section : la news garde une valeur orpheline, et
 *  l'affichage doit simplement omettre le bouton plutôt que casser la page. */
export function findGameSection(key: string | null | undefined): GameSection | undefined {
  if (!key) return undefined;
  return GAME_SECTIONS.find((s) => s.key === key);
}

/** Lien Markdown prêt à insérer dans le corps d'une news. Le libellé est en
 *  français (source de vérité) ; /api/news/translate traduit le texte du lien et
 *  laisse l'URL intacte, cf. la consigne « NEVER translate the URL ». */
export function gameSectionMarkdownLink(section: GameSection): string {
  return `[${section.frLabel}](${section.href})`;
}
