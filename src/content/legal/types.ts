// Contenu des pages légales — FRANÇAIS FAISANT FOI.
//
// Volontairement hors du pipeline i18n (scripts/translate-messages.mjs) : une
// clause juridique traduite automatiquement, sans relecture, est plus dangereuse
// que pas de clause. Le texte de référence reste le français ; d'éventuelles
// traductions officielles seront faites à part, par un traducteur juridique.

export interface LegalSection {
  title: string;
  /** Paragraphes. Une chaîne = un <p>. */
  body: string[];
  /** Signale un passage encore incomplet : rendu en encadré d'avertissement. */
  todo?: string;
}

export interface LegalDocument {
  title: string;
  /** Date de dernière mise à jour, ou marqueur tant qu'elle n'est pas fixée. */
  updated: string;
  /** Paragraphe(s) d'introduction, avant les sections numérotées. */
  intro?: string[];
  sections: LegalSection[];
}
