import Link from "next/link";

// Chrome commune aux pages légales (/legal/cgu, /legal/confidentialite).
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
    <div className="min-h-screen bg-am-bg-0 px-5 py-10 md:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="am-foil-text font-[family-name:var(--font-cinzel),serif] text-2xl md:text-3xl font-bold mb-2">
          {title}
        </h1>
        <p className="text-xs text-am-ink-faint mb-10 font-[family-name:var(--font-crimson),serif]">
          {updatedLabel}
        </p>

        <div className="legal-prose text-am-ink-soft font-[family-name:var(--font-crimson),serif] leading-relaxed">
          {children}
        </div>

        <div className="mt-14 pt-6 border-t" style={{ borderColor: "var(--am-line-strong)" }}>
          <Link
            href="/landing"
            className="text-sm text-am-ink-faint hover:text-am-gold transition-colors"
          >
            {backLabel}
          </Link>
        </div>
      </div>
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
      <h2 className="font-[family-name:var(--font-cinzel),serif] text-base md:text-lg font-bold text-am-ink mb-2">
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
