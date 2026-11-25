import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { MENTIONS_LEGALES } from "@/content/legal/mentions-legales";

export const metadata = {
  title: "Mentions légales | Armies of Legends",
  // Brouillon non validé : ne pas indexer tant que le texte porte encore des
  // mentions [À COMPLÉTER] et n'a pas été relu juridiquement.
  robots: { index: false, follow: false },
};

// Contenu FRANÇAIS faisant foi, rendu depuis src/content/legal/mentions-legales.ts.
// Volontairement hors du pipeline de traduction : cf. src/content/legal/types.ts.
export default function Page() {
  return <LegalDocumentView doc={MENTIONS_LEGALES} />;
}
