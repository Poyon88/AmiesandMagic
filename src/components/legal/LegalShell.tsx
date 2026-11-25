import Link from "next/link";
import { bricolage } from "@/components/vitrine/font";
import "@/components/vitrine/vitrine.css";
import Marque from "@/components/shared/Marque";
import { DOCUMENTS_LEGAUX } from "@/content/legal/editeur";

// Chrome commune aux pages légales (/legal/*).
// Volontairement sobre et sans illustration : ces pages doivent rester lisibles,
// imprimables, et rapides — elles sont consultées depuis le formulaire
// d'inscription, souvent dans un onglet ouvert au vol avant de cocher la case.
//
// Elles sont PUBLIQUES : le préfixe /legal figure dans PUBLIC_PATH_PREFIXES de
// src/proxy.ts. Sans cela, la garde d'authentification les renverrait vers
// /login — c'est-à-dire qu'on demanderait de se connecter pour lire les
// conditions qu'il faut accepter pour s'inscrire.
export default function LegalShell({
  title,
  updatedLabel,
  backLabel,
  children,
}: {
  title: string;
  updatedLabel: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`vt ${bricolage.variable}`}>
      <header className="vt-entete">
        <Link href="/landing" className="vt-brand" translate="no"><Marque /></Link>
      </header>
      <main className="vt-lecture">
        <h1 className="vt-lecture-titre">{title}</h1>
        <p className="vt-lecture-date">{updatedLabel}</p>

        <div className="legal-prose vt-prose">{children}</div>

        {/* Chaque document renvoie aux autres : les mentions d'identification
            doivent rester à un clic depuis n'importe quelle page légale. */}
        <div className="vt-lecture-pied">
          <nav aria-label="Documents légaux" className="mb-4 flex flex-wrap gap-x-6 gap-y-1">
            {DOCUMENTS_LEGAUX.map(({ href, titre }) => (
              <Link key={href} href={href} className="vt-link">{titre}</Link>
            ))}
          </nav>
          <Link href="/landing" className="vt-link">{backLabel}</Link>
        </div>
      </main>
    </div>
  );
}

/** Section numérotée. `todo` marque un contenu qui reste à rédiger : il
 *  s'affiche en encadré d'avertissement bien visible, pour qu'une page
 *  incomplète ne puisse pas passer pour un texte valide. */
export function LegalSection({
  n,
  title,
  todo,
  children,
}: {
  n: number;
  title: string;
  todo?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg md:text-xl font-extrabold text-am-ink mb-2">
        {n}. {title}
      </h2>
      {children}
      {todo && (
        <div
          className="mt-2 p-3 rounded-[var(--am-r-md)] text-sm"
          style={{
            background: "rgba(224,83,60,0.10)",
            border: "1px dashed rgba(224,83,60,0.45)",
            color: "var(--am-ember)",
          }}
        >
          {todo}
        </div>
      )}
    </section>
  );
}
