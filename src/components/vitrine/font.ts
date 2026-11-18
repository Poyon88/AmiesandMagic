import { Bricolage_Grotesque } from "next/font/google";

// Police de la vitrine publique. Déclarée ici, et non dans le layout racine,
// pour que le jeu ne la télécharge pas : seules les pages qui importent ce
// module la chargent.
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-bricolage",
  display: "swap",
});
