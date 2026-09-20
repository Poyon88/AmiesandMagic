// Identité visuelle des OBJETS et de leur coût d'ÉQUIPEMENT.
//
// Six coûts se disputent désormais la même pastille et la même modale : mana
// (bleu roi), points de vie (rouge), défausse (gris), sacrifice (violet), exil
// (acier), repli (bleu glacier). L'équipement prend donc une teinte qu'aucun
// n'occupe — un BRONZE chaud, celui du métal ouvragé, qui se distingue au
// premier coup d'œil des deux bleus et ne se confond pas avec le violet du
// sacrifice.
//
// Centralisé pour la raison habituelle : la forge, la carte, la pastille de
// coût et le plateau doivent s'accorder, et une teinte recopiée quatre fois
// finit toujours par diverger.

/** Couleur des objets et du coût d'équipement. */
export const OBJET_TEINTE = "#c8873c";
/** Même teinte, en composantes — pour les halos en rgba(). */
export const OBJET_RGB = "200, 135, 60";
/** Glyphe de l'équipement : le lien qui attache l'objet à son porteur.
 *  Se reconnaît sans texte, sur la pastille comme sur le plateau. */
export const OBJET_GLYPHE = "⚒";
