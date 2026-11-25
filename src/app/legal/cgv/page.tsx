import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { CGV } from "@/content/legal/cgv";

export const metadata = {
  title: "Conditions générales de vente | Armies of Legends",
  // Brouillon non validé : ne pas indexer tant que le texte porte encore des
  // mentions [À COMPLÉTER] et n'a pas été relu juridiquement.
  robots: { index: false, follow: false },
};

// Contenu FRANÇAIS faisant foi, rendu depuis src/content/legal/cgv.ts.
// Volontairement hors du pipeline de traduction : cf. src/content/legal/types.ts.
export default function Page() {
  return <LegalDocumentView doc={CGV} />;
}
