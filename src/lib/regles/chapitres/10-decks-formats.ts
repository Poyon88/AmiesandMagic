import { ABILITIES } from "@/lib/game/abilities";
import { CAPABILITY_LIMIT_EXEMPT, CAPABILITY_LIMIT_OVERRIDES, DECK_SIZE, MAX_SAME_CAPABILITY } from "@/lib/game/constants";
import type { Chapitre } from "../livret";

const nom = (id: string) => ABILITIES[id]?.creature?.label ?? ABILITIES[id]?.label ?? null;

/** Capacités dispensées du plafond, par leur nom affiché (sans doublon : `vol`
 *  et `ranged` désignent la même capacité). */
function exemptees(): string {
  const noms = [...new Set([...CAPABILITY_LIMIT_EXEMPT].map(nom).filter((n): n is string => !!n))];
  return noms.join(", ");
}

function derogations(): string {
  const d = [...CAPABILITY_LIMIT_OVERRIDES].map(([id, max]) => `${nom(id) ?? id} : ${max}`);
  return d.length ? ` Plafonds particuliers : ${d.join(", ")}.` : "";
}

export const decksEtFormats: Chapitre = {
  id: "decks-formats",
  titre: "Construire un deck, formats et Singulier",
  texte: () => `
**Un deck contient exactement ${DECK_SIZE} cartes.**
- Une seule faction principale par deck.
- Un seul clan : c'est lui qui définit le style de jeu.
- Jusqu'à 4 cartes Mercenaires (sans clan ni allégeance, elles s'ajoutent à n'importe quel deck).
- On ne mélange pas une faction bonne et une faction maléfique.
- Répartition par rareté (mode Expert) : 2 Uniques, 4 Épiques, 6 Rares, 8 Peu Communes, 30 Communes.
- Copies : 1 exemplaire par carte non commune, 3 exemplaires par Commune.
- Une même capacité nommée ne peut pas figurer plus de ${MAX_SAME_CAPABILITY} fois dans le deck. Dispensées de ce plafond : ${exemptees()}.${derogations()}
- Les objets ne se mettent pas dans un deck.

**Formats.** Deux réglages se combinent :
- le mode — **Classique** (Communes seulement, ${DECK_SIZE} cartes à égalité de puissance) ou **Expert** (répartition par rareté ci-dessus) ;
- l'étendue — **Standard** (cartes des deux dernières années) ou **Étendu** (toute la collection).

**Singulier.** Un deck sans aucune carte en double est dit singulier. Certaines capacités portent la condition Singulier (icône bicolore) : elles n'agissent que si le **deck de départ** de leur contrôleur ne contenait aucun doublon.
- Cet état est fixé au lancement de la partie et ne change plus : les cartes conquises, générées ou copiées en cours de partie n'y changent rien.
- Une carte gagnée en partie profite de l'état de son nouveau contrôleur, pas de celui de son ancien propriétaire.
- Aucune règle de construction ne l'impose : c'est une prime facultative.
- L'adversaire ne découvre qu'un deck est singulier qu'à la première capacité Singulier qu'il voit jouer.
`,
};
