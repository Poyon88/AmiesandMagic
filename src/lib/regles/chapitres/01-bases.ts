import { HERO_MAX_HP } from "@/lib/game/constants";
import { HERO_HP_MAX, HERO_HP_MIN } from "@/lib/game/hero-hp";
import type { Chapitre } from "../livret";

export const bases: Chapitre = {
  id: "bases",
  titre: "Le but du jeu et les cartes",
  texte: () => `
**But.** Chaque joueur incarne un héros. On gagne en amenant les points de vie (PV) du héros adverse à 0. Pour cela, on invoque des unités et on joue des actions.

**Points de vie du héros.** Chaque héros démarre avec ses propres PV, de ${HERO_HP_MIN} à ${HERO_HP_MAX} (${HERO_MAX_HP} le plus souvent) : un pouvoir puissant se paie de quelques PV en moins. Ces PV de départ sont aussi son maximum : aucun soin ne le fait remonter au-delà.

**Trois types de cartes.**
- **Unité** (aussi appelée créature) : elle reste sur le terrain, attaque et défend. Elle a une attaque (ATK) et des points de vie (PV).
- **Action** (appelée « sort » dans d'anciennes versions) : elle produit son effet puis part au cimetière.
- **Objet** : il se pose sur le terrain puis s'équipe sur une unité alliée. Les objets ne se mettent pas dans un deck.

**Quatre zones par joueur.** Le deck (la pioche), la main, le terrain et le cimetière.

**Lire une carte.** Les chiffres ont une place fixe, en main comme sur le terrain :
- écu bleu en haut à gauche : le coût en mana (bleu clair = coût réduit) ;
- écus du bas à droite : l'ATK (rouge) et les PV (vert) d'une unité. Un chiffre vert signale un bonus, un chiffre rouge une valeur diminuée ;
- jetons en haut à droite : les coûts additionnels et l'éveil ;
- barre du bas : une icône par capacité, teintée selon le moment où elle agit.
Le texte exact des capacités d'une carte se lit dans sa bulle de détail (survol, ou appui long sur tablette).

**Appartenance.** Une carte appartient à une faction, souvent à un clan de cette faction, et une unité a une race. Les Mercenaires n'ont ni clan ni allégeance. Chaque faction a un alignement : bon, neutre ou maléfique.

**Rareté.** Commune, Peu Commune, Rare, Épique, Unique (appelée « Légendaire » dans d'anciennes versions).
`,
};
