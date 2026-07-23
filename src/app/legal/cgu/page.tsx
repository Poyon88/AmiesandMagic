import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { CGU } from "@/content/legal/cgu";

export const metadata = {
  title: "Conditions Générales d'Utilisation | Armies & Magic",
  // Brouillon non validé : ne pas indexer tant que le texte porte encore des
  // mentions [À COMPLÉTER] et n'a pas été relu juridiquement.
  robots: { index: false, follow: false },
};

// Contenu FRANÇAIS faisant foi, rendu depuis src/content/legal/cgu.ts.
// Volontairement hors du pipeline de traduction : cf. src/content/legal/types.ts.
export default function CguPage() {
  return <LegalDocumentView doc={CGU} />;
}
