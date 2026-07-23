import LegalShell, { LegalSection } from "@/components/legal/LegalShell";
import type { LegalDocument } from "@/content/legal/types";

// En constante plutôt qu'en littéral JSX : évite l'échappement manuel des
// apostrophes (règle react/no-unescaped-entities).
const DRAFT_WARNING =
  "⚠ Document en cours de rédaction, soumis à relecture juridique. " +
  "Il n'a pas de valeur contractuelle en l'état.";

// Rendu d'un document légal (CGU, confidentialité) depuis son module de contenu
// français. Partagé par les deux pages. Le contenu fait foi en français et n'est
// pas traduit (cf. src/content/legal/types.ts).

export default function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <LegalShell
      title={doc.title}
      updatedLabel={`Dernière mise à jour : ${doc.updated}`}
      backLabel="← Retour au site"
    >
      {/* Avertissement « projet » — tant que le texte n'est pas validé et que
          les mentions [À COMPLÉTER] subsistent, la page ne doit pas pouvoir
          passer pour un document engageant. */}
      <div
        className="mb-8 p-3 rounded-[var(--am-r-md)] text-sm"
        style={{
          background: "rgba(224,83,60,0.14)",
          border: "1px solid rgba(224,83,60,0.4)",
          color: "var(--am-ember)",
        }}
      >
        {DRAFT_WARNING}
      </div>

      {doc.intro?.map((p, i) => (
        <p key={`intro-${i}`} className="mb-3 leading-relaxed">
          {p}
        </p>
      ))}

      <div className="mt-6">
        {doc.sections.map((section, i) => (
          <LegalSection key={section.title} n={i + 1} title={section.title} todo={section.todo}>
            {section.body.map((p, j) => (
              <p key={j} className="mb-3 leading-relaxed">
                {p}
              </p>
            ))}
          </LegalSection>
        ))}
      </div>
    </LegalShell>
  );
}
