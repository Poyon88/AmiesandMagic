import { isCardOwned, type OwnershipContext } from "./collection";
import type { Card } from "./types";

/**
 * Ce qui manque à un deck pour être jouable.
 *
 * Le cas n'existe qu'après coup : un deck est TOUJOURS construit avec des
 * cartes possédées — le constructeur le vérifie à la sauvegarde. Il devient
 * injouable ensuite, quand une faction est reprise à la suite d'un
 * remboursement Stripe.
 *
 * D'où le choix de GARDER le deck plutôt que de le supprimer : le joueur y a
 * passé du temps, et racheter la faction suffit à le rendre jouable tel quel.
 * Le supprimer transformerait un incident de paiement en perte définitive de
 * travail.
 *
 * Fonction pure, séparée de l'écran : c'est la même règle de possession
 * (`isCardOwned`) que la collection et le constructeur, et elle doit rester
 * testable sans base ni rendu.
 */
export interface DeckPlayability {
  playable: boolean;
  /** Nombre de cartes du deck que le joueur ne possède plus. */
  missingCount: number;
  /** Factions à récupérer pour rendre le deck jouable, sans doublon et triées.
   *  C'est ce que la boutique doit proposer de racheter. */
  missingFactions: string[];
}

export function deckPlayability(
  cards: Pick<Card, "id" | "faction" | "rarity" | "set_id">[],
  ctx: OwnershipContext,
): DeckPlayability {
  const factions = new Set<string>();
  let missingCount = 0;

  for (const card of cards) {
    if (isCardOwned(card as Card, ctx)) continue;
    missingCount++;
    // Une carte sans faction ne se rachète pas en boutique : on la compte comme
    // manquante mais on ne promet pas un rachat qui n'existe pas.
    if (card.faction) factions.add(card.faction);
  }

  return {
    playable: missingCount === 0,
    missingCount,
    missingFactions: [...factions].sort((a, b) => a.localeCompare(b, "fr")),
  };
}
