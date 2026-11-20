import { FACTIONS, getAllClanNames, getFactionDisplayName } from "@/lib/card-engine/constants";
import type { Chapitre } from "../livret";

/** Généré depuis le registre des factions. */
export const factions: Chapitre = {
  id: "factions",
  titre: "Factions, clans et races",
  texte: () =>
    Object.entries(FACTIONS)
      .map(([id, f]) => {
        const clans = getAllClanNames(id);
        const alignement = (f as { alignment?: string }).alignment;
        return `- **${getFactionDisplayName(id)}**${alignement ? ` (${alignement})` : ""} — races : ${(f.races ?? []).join(", ") || "aucune"}${clans.length ? ` — clans : ${clans.join(", ")}` : ""}`;
      })
      .join("\n"),
};
