"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Écrans qui gardent l'ancien habit doré : le plateau dépend des jetons
 *  `--am-*` d'origine, et l'admin comme les bancs d'essai n'ont pas à suivre
 *  la vitrine. Tout le reste du site est rendu sous `.vt`. */
const HORS_VITRINE = ["/game", "/admin", "/card-lab", "/figurine-test"];

export function estHorsVitrine(chemin: string): boolean {
  return HORS_VITRINE.some((p) => chemin === p || chemin.startsWith(`${p}/`));
}

/** Le `<body>` du site. La classe `.vt` est posée ICI, et non sur chaque page,
 *  pour que les fenêtres rendues par portail (réglages, détail d'une carte)
 *  prennent le même habit que la page qui les ouvre. */
export default function CorpsDuSite({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const chemin = usePathname() ?? "/";
  return (
    <body
      className={`${className}${estHorsVitrine(chemin) ? "" : " vt"}`}
      // Des extensions de navigateur (Grammarly, ColorZilla…) injectent des
      // attributs sur <body> avant l'hydratation : on tait ce faux écart, pour
      // cet élément seulement.
      suppressHydrationWarning
    >
      {children}
    </body>
  );
}
