import { ABILITIES } from "@/lib/game/abilities";
import type { Chapitre } from "../livret";

const propre = (t: string) => t.replace(/\s+/g, " ").trim();

/** Généré depuis le registre des capacités : une capacité ajoutée au jeu
 *  apparaît ici sans que personne n'y touche. */
export const lexique: Chapitre = {
  id: "lexique",
  titre: "Lexique des capacités",
  texte: () => {
    const lignes = Object.values(ABILITIES).map((a) => {
      const surUnite = a.applicable_to.includes("creature");
      const surAction = a.applicable_to.includes("spell");
      const ou = surUnite && surAction ? "unité et action" : surAction ? "action" : "unité";
      const base = `- **${a.creature?.label ?? a.label}** (${ou}) — ${propre(a.creature?.desc ?? a.desc)}`;
      const action = a.spell?.desc && propre(a.spell.desc) !== propre(a.creature?.desc ?? a.desc)
        ? `\n  - sur une action${a.spell.label && a.spell.label !== (a.creature?.label ?? a.label) ? ` (« ${a.spell.label} »)` : ""} : ${propre(a.spell.desc)}`
        : "";
      return base + action;
    });
    return `Nom de la capacité, type de carte qui peut la porter, effet. X et Y sont les valeurs portées par la carte. Les mentions entre accolades (par exemple {race}) sont remplacées sur la carte par ce qu'elles désignent.

${lignes.join("\n")}`;
  },
};
