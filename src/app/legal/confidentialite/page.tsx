import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { CONFIDENTIALITE } from "@/content/legal/confidentialite";

export const metadata = {
  title: "Politique de confidentialité | Armies & Magic",
  // Brouillon non validé : ne pas indexer tant que le texte porte encore des
  // mentions [À COMPLÉTER] et n'a pas été relu.
  robots: { index: false, follow: false },
};

// Contenu FRANÇAIS faisant foi, rendu depuis src/content/legal/confidentialite.ts.
export default function ConfidentialitePage() {
  return <LegalDocumentView doc={CONFIDENTIALITE} />;
}
