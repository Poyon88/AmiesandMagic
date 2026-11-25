// Identité de l'éditeur et constantes partagées par TOUS les textes légaux.
//
// C'est le seul fichier à renseigner pour faire disparaître la plupart des
// mentions [À COMPLÉTER : …] : chaque document les reprend d'ici. L'éditeur est
// une société de droit luxembourgeois (arbitrage du 2026-11-24) — d'où le droit
// applicable, la CNPD, le RCS Luxembourg et le Médiateur de la consommation.
//
// ⚠️ Rien ici n'est inventé : tant qu'une valeur n'est pas connue, elle reste
// entre crochets et s'affiche telle quelle, pour qu'une page incomplète ne
// puisse pas passer pour un texte valide.

const aCompleter = (quoi: string) => `[À COMPLÉTER : ${quoi}]`;

export const EDITEUR = {
  /** Dénomination sociale et forme (S.à r.l., S.A., S.à r.l.-S…). */
  denomination: aCompleter("dénomination sociale et forme juridique de la société"),
  capital: aCompleter("montant du capital social"),
  siege: aCompleter("adresse du siège social au Luxembourg"),
  rcs: aCompleter("numéro d'immatriculation au RCS Luxembourg, de la forme B000000"),
  /** Exigée par la loi sur le commerce électronique quand l'activité y est soumise. */
  autorisation: aCompleter(
    "numéro de l'autorisation d'établissement délivrée par le ministère de l'Économie",
  ),
  tva: aCompleter("numéro d'identification à la TVA, de la forme LU00000000"),
  directeurPublication: aCompleter("nom et qualité du directeur de la publication"),
  /** Adresse générale : questions, réclamations, signalements. */
  emailContact: aCompleter("adresse email de contact"),
  /** Adresse dédiée aux demandes sur les données personnelles (peut être la même). */
  emailDonnees: aCompleter("adresse email dédiée aux données personnelles"),
  telephone: aCompleter("numéro de téléphone, s'il en existe un pour le public"),
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
