// Identité visuelle du coût d'ÉVEIL.
//
// Six teintes de coût cohabitent déjà sur la même rangée de pastilles : mana
// (bleu roi), points de vie (rouge), défausse (gris), sacrifice (violet), exil
// (acier), repli (bleu glacier). L'éveil devait donc prendre la seule famille
// encore libre — un AMBRE chaud, couleur d'aube, qui dit ce que la capacité
// fait : une carte qui se réveille lentement.
//
// La teinte n'est pas qu'un choix esthétique, elle porte une distinction de
// RÈGLE : les six autres pastilles sont des coûts ADDITIONNELS, qui s'ajoutent
// au mana ; l'éveil le REMPLACE. Une couleur à part est ce qui empêche de lire
// « 8 mana ET 3 éveil » là où il faut lire « 8 mana OU 3 éveil ».
//
// Centralisé ici parce que cinq composants doivent s'accorder : la pastille de
// coût, le bouton de mise en éveil sur la carte en main, la tuile de zone, la
// modale de paiement et la carte de la forge. Une teinte recopiée cinq fois
// finit toujours par diverger.

/** Couleur de l'éveil. */
export const EVEIL_TEINTE = "#f2a03c";
/** Même teinte, en composantes — pour les halos en rgba(). */
export const EVEIL_RGB = "242, 160, 60";
/** Glyphe de l'éveil : un sablier. Le coût ne se paie pas en ressource mais en
 *  TEMPS, et c'est ce qu'il faut lire sans texte (pastille, tuile, bouton). */
export const EVEIL_GLYPHE = "⏳";
