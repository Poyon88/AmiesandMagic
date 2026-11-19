import Image from "next/image";
import Link from "next/link";
import { bricolage } from "@/components/vitrine/font";
import "@/components/vitrine/vitrine.css";

// Habillage commun des pages d'authentification hors jeu (/login,
// /auth/reset-password, choix du pseudo et de la faction). Même monde que la
// page d'accueil : le formulaire à droite, trois affiches du mur à gauche.
// Les pages ne fournissent que leur formulaire via `children`.
//
// Les formulaires sont écrits avec les utilitaires `am-*` du jeu ; rendus sous
// `.vt`, ils prennent les couleurs de la vitrine (voir le « pont » en bas de
// vitrine.css) sans qu'on ait à les réécrire.

// Champs partagés, pour que /login et /auth/reset-password aient un seul look.
export const authFieldClass =
  "w-full px-4 py-3 text-base rounded-[var(--am-r-md)] bg-am-bg-1 text-am-ink " +
  "placeholder:text-am-ink-faint border border-[color:var(--am-line-strong)] " +
  "focus:border-[color:var(--am-gold)] focus:outline-none transition-colors " +
  "disabled:opacity-50";

export const authLabelClass = "block text-sm font-semibold text-am-ink-soft mb-1.5";

/** Illustrations de cartes du jeu, copiées dans `public/` : la page de
 *  connexion doit s'afficher sans attendre la base. */
const AFFICHES = ["volva", "eleonara", "hippolyte"];

interface AuthShellProps {
  /** Titre propre à la page. */
  heading?: string;
  /** Ligne d'appui sous le titre. */
  sub?: string;
  children: React.ReactNode;
  /** Contenu épinglé sous le formulaire (un lien de retour, par exemple). */
  footer?: React.ReactNode;
}

export default function AuthShell({ heading, sub, children, footer }: AuthShellProps) {
  return (
    <div className={`vt vt-auth ${bricolage.variable}`}>
      <div className="vt-auth-mur" aria-hidden="true">
        {AFFICHES.map((nom, i) => (
          <div key={nom} className="vt-auth-affiche">
            <Image
              src={`/images/vitrine/${nom}.webp`}
              alt=""
              fill
              priority={i === 1}
              sizes="(max-width: 899px) 1px, 22vw"
            />
          </div>
        ))}
      </div>

      <main className="vt-auth-panneau">
        <div>
          {/* Retour à la page d'accueil publique. */}
          <Link href="/landing" className="vt-auth-marque" translate="no">Armies of Legends</Link>
          {heading && <h1 className="vt-auth-titre">{heading}</h1>}
          {sub && <p className="vt-auth-sous">{sub}</p>}
          <div className="vt-auth-corps">{children}</div>
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
