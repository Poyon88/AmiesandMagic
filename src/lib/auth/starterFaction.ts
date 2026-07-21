import { FACTIONS } from "@/lib/card-engine/constants";
import { NEUTRAL_FACTION } from "@/lib/game/collection";

// Factions proposées au choix de départ — partagé par l'écran d'onboarding et
// la route qui l'enregistre, pour qu'aucun des deux ne puisse dériver.
//
// « Mercenaires » en est EXCLUE : c'est la faction neutre, déjà offerte à tout
// le monde et exemptée de la règle mono-faction du deck builder. La proposer
// reviendrait à vendre du vide et à priver le joueur de son vrai choix.

export const STARTER_FACTION_IDS: readonly string[] = Object.keys(FACTIONS)
  .filter((id) => id !== NEUTRAL_FACTION)
  .sort((a, b) => a.localeCompare(b, "fr"));

export function isValidStarterFaction(id: unknown): id is string {
  return typeof id === "string" && STARTER_FACTION_IDS.includes(id);
}
