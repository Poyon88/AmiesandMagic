import type { LegalDocument } from "./types";

// ⚠️ PROJET — relecture par un professionnel du droit indispensable avant mise
// en ligne. Le texte ci-dessous est un brouillon de travail, rédigé de bonne foi
// à partir du fonctionnement réel de l'application, mais il n'a AUCUNE valeur
// juridique tant qu'il n'a pas été validé.
//
// Les mentions entre crochets [À COMPLÉTER : …] appellent des informations que
// seul l'éditeur connaît (identité légale, juridiction, coordonnées, durées).
// La juridiction est laissée ouverte : l'interface est en français mais l'éditeur
// peut relever du droit français OU luxembourgeois — ce choix conditionne
// l'autorité de contrôle, le droit applicable et le tribunal compétent.

const P_EDITEUR =
  "[À COMPLÉTER : dénomination de l'éditeur — personne physique ou société, " +
  "forme juridique, adresse du siège, numéro d'immatriculation le cas échéant]";
const P_CONTACT = "[À COMPLÉTER : adresse email de contact]";
const P_DROIT =
  "[À COMPLÉTER : droit applicable — français ou luxembourgeois — et juridiction compétente]";

export const CGU: LegalDocument = {
  title: "Conditions Générales d'Utilisation",
  updated: "[À COMPLÉTER : date de mise en ligne]",
  intro: [
    `Les présentes conditions générales d'utilisation (les « Conditions ») régissent ` +
      `l'accès et l'usage du jeu de cartes à collectionner en ligne Armies & Magic ` +
      `(le « Service »), édité par ${P_EDITEUR}.`,
    `En créant un compte ou en utilisant le Service, vous reconnaissez avoir pris ` +
      `connaissance des présentes Conditions et les accepter sans réserve. Si vous ` +
      `n'y consentez pas, vous ne devez pas utiliser le Service.`,
  ],
  sections: [
    {
      title: "Objet et acceptation",
      body: [
        `Le Service est un jeu vidéo de cartes à collectionner, gratuit d'accès, proposant ` +
          `des parties en ligne, une collection de cartes, la construction de decks et des ` +
          `fonctionnalités communautaires. Il est fourni à des fins de divertissement.`,
        `L'acceptation des Conditions est matérialisée, lors de l'inscription, par une case ` +
          `à cocher dédiée. Cette acceptation est horodatée et conservée. Les Conditions ` +
          `peuvent être modifiées ; toute modification substantielle sera portée à votre ` +
          `connaissance et votre usage continu du Service vaudra acceptation de la version ` +
          `à jour.`,
      ],
    },
    {
      title: "Accès au service et création de compte",
      body: [
        `L'accès au Service nécessite la création d'un compte, par adresse email et mot de ` +
          `passe, ou via un fournisseur d'identité tiers (Google ou Discord). Vous êtes ` +
          `responsable de l'exactitude des informations fournies et de la confidentialité ` +
          `de vos identifiants.`,
        `Vous choisissez un nom d'utilisateur public, visible des autres joueurs (notamment ` +
          `dans les échanges et les classements). Ce nom doit respecter les règles de ` +
          `conduite ci-après ; l'éditeur peut refuser ou modifier un nom trompeur, offensant ` +
          `ou usurpant une identité.`,
        `Une adresse email valide peut être requise pour confirmer le compte. Un même joueur ` +
          `ne peut ouvrir plusieurs comptes dans le but de contourner une sanction ou de ` +
          `fausser le jeu.`,
      ],
    },
    {
      title: "Âge minimum requis",
      body: [
        `Le Service n'est pas destiné aux enfants en dessous de l'âge à partir duquel le ` +
          `consentement au traitement de leurs données peut être donné seul (15 ans en ` +
          `France, 16 ans au Luxembourg, sauf abaissement légal). En deçà, l'accord d'un ` +
          `titulaire de l'autorité parentale est nécessaire.`,
      ],
      todo:
        "À COMPLÉTER : fixer l'âge minimum retenu et le mécanisme de recueil du " +
        "consentement parental, en cohérence avec la juridiction choisie.",
    },
    {
      title: "Monnaie de jeu, cartes et achats",
      body: [
        `Le Service utilise une monnaie de jeu (l'« or ») et des cartes virtuelles. L'or et ` +
          `les cartes n'ont AUCUNE valeur monétaire, ne sont pas convertibles en argent réel ` +
          `et ne constituent pas un moyen de paiement. Ils n'existent qu'au sein du Service ` +
          `et vous sont concédés sous forme d'une licence d'utilisation personnelle, sans ` +
          `transfert de propriété.`,
        `À l'inscription, vous choisissez gratuitement une faction dont vous recevez les ` +
          `cartes communes. Une option payante permet de débloquer, de façon permanente, les ` +
          `cartes communes de l'ensemble des factions. Le prix de cette option est indiqué ` +
          `avant l'achat et peut évoluer dans le temps.`,
        `La revente de cartes entre joueurs contre de l'argent réel n'est pas proposée. ` +
          `Les échanges internes éventuels s'effectuent exclusivement au moyen de la monnaie ` +
          `de jeu.`,
        `Pour tout achat payant, vous disposez des droits que la loi vous reconnaît en tant ` +
          `que consommateur. S'agissant d'un contenu numérique fourni immédiatement, ` +
          `l'exécution peut, avec votre accord exprès, commencer avant la fin du délai de ` +
          `rétractation, ce qui entraîne la renonciation à ce délai dans les conditions ` +
          `prévues par la loi.`,
      ],
      todo:
        "À COMPLÉTER : modalités précises des achats (prestataire de paiement, prix, TVA, " +
        "facturation, politique de remboursement, droit de rétractation) — à arrêter avec le " +
        "prestataire une fois le paiement intégré.",
    },
    {
      title: "Règles de conduite et sanctions",
      body: [
        `Vous vous engagez à un usage loyal du Service. Sont notamment interdits : la triche, ` +
          `l'exploitation de failles, l'usage de logiciels automatisés, le harcèlement, les ` +
          `propos haineux, illégaux ou offensants, l'usurpation d'identité, et toute ` +
          `tentative de perturbation du Service ou d'atteinte à la sécurité.`,
        `En cas de manquement, l'éditeur peut, selon la gravité et sans que cette liste soit ` +
          `limitative, adresser un avertissement, restreindre l'accès à certaines ` +
          `fonctionnalités, suspendre ou supprimer le compte, sans indemnité et sans ` +
          `préjudice d'éventuelles poursuites.`,
      ],
    },
    {
      title: "Propriété intellectuelle",
      body: [
        `L'ensemble des éléments du Service — code, interface, illustrations, textes de ` +
          `cartes, noms, univers, sons et marques — est protégé et demeure la propriété de ` +
          `l'éditeur ou de ses partenaires. Aucune cession n'est consentie du fait de ` +
          `l'utilisation du Service.`,
        `Il vous est concédé un droit d'usage personnel, non exclusif et non cessible, ` +
          `limité à l'utilisation du Service conformément aux présentes Conditions. Toute ` +
          `reproduction, extraction ou exploitation non autorisée est interdite.`,
      ],
    },
    {
      title: "Disponibilité, évolutions et fin du service",
      body: [
        `Le Service est fourni « en l'état » et « selon disponibilité ». L'éditeur s'efforce ` +
          `d'en assurer le bon fonctionnement mais ne garantit pas une disponibilité continue ` +
          `et sans erreur. Des interruptions peuvent survenir pour maintenance, mise à jour ` +
          `ou raison technique.`,
        `Le Service évolue : des cartes, des règles, des fonctionnalités ou l'équilibrage ` +
          `peuvent être ajoutés, modifiés ou retirés. L'éditeur peut faire évoluer ou cesser ` +
          `tout ou partie du Service ; dans la mesure du possible, une information préalable ` +
          `sera donnée pour les changements substantiels.`,
      ],
    },
    {
      title: "Responsabilité",
      body: [
        `Dans les limites permises par la loi, l'éditeur ne saurait être tenu responsable des ` +
          `dommages indirects, de la perte de données de jeu, d'or ou de cartes résultant ` +
          `d'un incident technique, d'une interruption du Service ou d'un usage non conforme.`,
        `Aucune stipulation des présentes Conditions n'a pour effet d'exclure ou de limiter ` +
          `la responsabilité de l'éditeur lorsque la loi l'interdit, notamment à l'égard des ` +
          `consommateurs.`,
      ],
    },
    {
      title: "Suppression du compte",
      body: [
        `Vous pouvez demander la suppression de votre compte à tout moment. La suppression ` +
          `entraîne la perte définitive de votre progression, de vos decks, de votre or et ` +
          `de vos cartes, sans contrepartie. Le traitement de vos données personnelles à ` +
          `cette occasion est décrit dans la politique de confidentialité.`,
      ],
      todo:
        "À COMPLÉTER : décrire le moyen concret de demander la suppression (paramètres du " +
        "compte, email de contact) une fois la procédure en place.",
    },
    {
      title: "Droit applicable et contact",
      body: [
        `Les présentes Conditions sont régies par ${P_DROIT}. Tout litige relatif à leur ` +
          `validité, leur interprétation ou leur exécution relève des juridictions ` +
          `compétentes, sous réserve des règles protectrices applicables aux consommateurs.`,
        `Pour toute question relative aux présentes Conditions ou au Service, vous pouvez ` +
          `contacter l'éditeur à l'adresse suivante : ${P_CONTACT}.`,
      ],
    },
  ],
};
