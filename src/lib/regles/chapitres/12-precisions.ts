import { PRECISIONS } from "../precisions";
import type { Chapitre } from "../livret";

export const precisionsParCapacite: Chapitre = {
  id: "precisions",
  titre: "Précisions par capacité",
  texte: () =>
    `Cas particuliers, exceptions et arbitrages. Ils complètent le lexique : en cas de doute sur une capacité, ce qui est écrit ici fait foi.

${PRECISIONS.map((p) => `**${p.theme}**\n${p.regles.map((r) => `- ${r}`).join("\n")}`).join("\n\n")}`,
};
