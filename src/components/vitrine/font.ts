import { Bricolage_Grotesque } from "next/font/google";

// Police du site hors plateau. Chargée par le layout racine depuis que tout
// le site, sauf le jeu et l'admin, est rendu sous `.vt`.
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-bricolage",
  display: "swap",
});
