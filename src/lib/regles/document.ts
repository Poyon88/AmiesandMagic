// Mise en forme du livret pour docs/livret-de-regles.md. Séparée du script pour
// que le test puisse comparer le fichier commité à ce que le code produit.
import { CHAPITRES, livret } from "./livret";

const ancre = (i: number, titre: string) =>
  `${i + 1}-${titre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-")}`;

export function documentLivret(): string {
  const sommaire = CHAPITRES.map((c, i) => `${i + 1}. [${c.titre}](#${ancre(i, c.titre)})`).join("\n");
  return `# Armies of Legends — Livret de règles

> **Fichier généré — ne pas le modifier à la main.** Source : \`src/lib/regles/\`
> (prose dans \`chapitres/\`, cas particuliers dans \`precisions.ts\`). Après toute
> modification : \`npm run livret\`. Les chiffres viennent des constantes du jeu,
> le lexique et les factions du registre.
>
> Ce livret est la référence des agents : l'agent de tri des retours joueurs
> répond aux questions de règles à partir de lui, et rien que de lui.

## Sommaire

${sommaire}

${livret({ decouverte: "doc" })}
`;
}
