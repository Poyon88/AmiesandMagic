// Identité de l'éditeur et constantes partagées par TOUS les textes légaux :
// chaque document les reprend d'ici. L'éditeur est une société de droit
// luxembourgeois (arbitrage du 2026-11-24) — d'où le droit applicable, la CNPD,
// le RCS Luxembourg et le Médiateur de la consommation.
//
// Valeurs reprises des pièces de la société (statuts du 25 juillet 2018, fiche
// du RCS, courrier TVA du 7 janvier 2019, autorisation d'établissement du
// 15 mai 2023). Le siège est l'adresse actuelle indiquée par la société le
// 2026-11-26 ; les pièces portent encore l'ancienne. Pas de téléphone public.

export const EDITEUR = {
  /** Dénomination sociale et forme (S.à r.l., S.A., S.à r.l.-S…). */
  denomination: "Totem HR, S.à r.l. (société à responsabilité limitée)",
  capital: "12 500 euros",
  /** Adresse complète : exigée dans les mentions légales, les CGV et la
   *  politique de confidentialité. */
  siege: "9, rue Pierre Notting, L-2243 Luxembourg",
  /** Forme courte, pour les textes qui renvoient aux mentions légales. */
  siegeVille: "Luxembourg",
  rcs: "B227165",
  /** Exigée par la loi sur le commerce électronique quand l'activité y est soumise. */
  autorisation: "10096960 / 1",
  tva: "LU30812810",
  /** Adresse générale : questions, réclamations, signalements. */
  emailContact: "contacts@totem.lu",
  /** Adresse dédiée aux demandes sur les données personnelles (peut être la même). */
  emailDonnees: "personaldata@totem.lu",
} as const;

export const SITE = "armiesoflegends.com";
export const SERVICE = "Armies of Legends";

/** Date affichée en tête de chaque document. À fixer le jour de la mise en ligne. */
export const DATE_MISE_A_JOUR = "24 novembre 2026 (projet, non encore en vigueur)";

/** Autorité de contrôle et médiateur : conséquences directes du siège luxembourgeois. */
export const CNPD =
  "Commission nationale pour la protection des données (CNPD), 15, boulevard du Jazz, " +
  "L-4370 Belvaux, www.cnpd.lu";
export const MEDIATEUR =
  "Service national du Médiateur de la consommation, Ancien Hôtel de la Monnaie, " +
  "6, rue du Palais de Justice, L-1841 Luxembourg, www.mediateurconsommation.lu";

/** Les documents, dans l'ordre où le pied des pages légales les propose. */
export const DOCUMENTS_LEGAUX = [
  { href: "/legal/mentions-legales", titre: "Mentions légales" },
  { href: "/legal/cgu", titre: "Conditions générales d'utilisation" },
  { href: "/legal/cgv", titre: "Conditions générales de vente" },
  { href: "/legal/confidentialite", titre: "Politique de confidentialité" },
  { href: "/legal/cookies", titre: "Cookies et traceurs" },
] as const;
