// Identité visuelle du coût de REPLI.
//
// Cinq coûts additionnels cohabitent désormais sur la même pastille et dans la
// même modale de paiement : mana (bleu roi), points de vie (rouge), défausse
// (gris), sacrifice (violet), exil (acier). Le repli devait donc prendre une
// teinte qu'aucun des quatre autres n'occupe, sans quoi une main chargée
// deviendrait illisible — c'est un bleu GLACIER, plus clair et plus froid que
// le bleu du mana, dans la famille du deck vers lequel la carte repart.
//
// Centralisé ici parce que quatre composants doivent s'accorder : la pastille
// de coût, la carte en main quand elle est désignée, la modale de paiement et
// l'animation qui renvoie le dos de carte sur la pile. Une teinte recopiée à
// quatre endroits finit toujours par diverger.

/** Couleur du repli. */
export const REPLI_TEINTE = "#5fc9e8";
/** Même teinte, en composantes — pour les halos en rgba(). */
export const REPLI_RGB = "95, 201, 232";
/** Glyphe du repli : une carte qui remonte sur la pile. Utilisé partout où le
 *  coût doit se reconnaître sans texte (pastille, vignette de main). */
export const REPLI_GLYPHE = "↥";
