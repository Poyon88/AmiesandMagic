import type { LegalDocument } from "./types";

// ⚠️ PROJET — relecture par un professionnel du droit / DPO indispensable avant
// mise en ligne. Brouillon rédigé à partir des traitements réellement mis en
// œuvre par l'application (vérifiés dans le code), mais sans valeur tant qu'il
// n'a pas été validé et que les mentions [À COMPLÉTER : …] n'ont pas été
// renseignées.

const P_RESPONSABLE =
  "[À COMPLÉTER : identité et coordonnées du responsable du traitement — " +
  "éditeur, adresse, et le cas échéant représentant ou DPO]";
const P_CONTACT = "[À COMPLÉTER : adresse email dédiée aux demandes relatives aux données]";
const P_AUTORITE =
  "[À COMPLÉTER : autorité de contrôle compétente — CNIL (France) ou CNPD " +
  "(Luxembourg), selon la juridiction retenue]";

export const CONFIDENTIALITE: LegalDocument = {
  title: "Politique de confidentialité",
  updated: "[À COMPLÉTER : date de mise en ligne]",
  intro: [
    `La présente politique décrit comment vos données personnelles sont traitées dans le ` +
      `cadre du jeu Armies & Magic (le « Service »), conformément au Règlement général sur ` +
      `la protection des données (RGPD).`,
  ],
  sections: [
    {
      title: "Responsable du traitement",
      body: [
        `Le responsable du traitement des données collectées via le Service est ${P_RESPONSABLE}.`,
      ],
    },
    {
      title: "Données collectées",
      body: [
        `Données de compte : votre adresse email et votre mot de passe (stocké sous forme ` +
          `chiffrée par notre prestataire d'authentification, jamais en clair), ainsi que ` +
          `votre nom d'utilisateur, qui est public.`,
        `Si vous vous connectez via Google ou Discord, le fournisseur choisi nous transmet ` +
          `les données d'identification nécessaires à la création du compte (identifiant et, ` +
          `selon le fournisseur, adresse email et nom affiché).`,
        `Données de jeu : votre progression, vos decks, votre collection de cartes, votre ` +
          `solde de monnaie de jeu et l'historique des transactions associées, vos parties ` +
          `et, le cas échéant, vos échanges avec d'autres joueurs.`,
        `Données techniques : les informations strictement nécessaires au fonctionnement et ` +
          `à la sécurité (par exemple lors de la vérification anti-robot à la connexion). ` +
          `La preuve d'acceptation des conditions générales est également conservée, ` +
          `horodatée.`,
      ],
    },
    {
      title: "Finalités et bases légales",
      body: [
        `Fournir le Service et gérer votre compte : traitement nécessaire à l'exécution du ` +
          `contrat qui nous lie.`,
        `Assurer la sécurité, prévenir la fraude et les abus (dont la protection anti-robot) ` +
          `et améliorer le Service : traitement fondé sur notre intérêt légitime.`,
        `Respecter nos obligations légales, notamment comptables en cas d'achat : traitement ` +
          `fondé sur une obligation légale.`,
        `Toute communication non essentielle éventuelle ne serait envoyée que sur la base de ` +
          `votre consentement, révocable à tout moment.`,
      ],
    },
    {
      title: "Sous-traitants et hébergement",
      body: [
        `Nous faisons appel à des prestataires techniques agissant en qualité de ` +
          `sous-traitants, pour notre compte et selon nos instructions : Supabase ` +
          `(authentification, base de données et stockage), Netlify (hébergement de ` +
          `l'application), Cloudflare (protection anti-robot Turnstile), ainsi qu'un ` +
          `prestataire d'envoi d'emails transactionnels.`,
        `Ces prestataires peuvent héberger ou traiter des données en dehors de votre pays. ` +
          `Lorsque des données sont transférées hors de l'Espace économique européen, ce ` +
          `transfert est encadré par les garanties appropriées prévues par le RGPD.`,
      ],
      todo:
        "À COMPLÉTER : nommer le prestataire d'emails retenu, préciser les régions " +
        "d'hébergement Supabase / Netlify, et vérifier les garanties de transfert de chaque " +
        "sous-traitant.",
    },
    {
      title: "Durées de conservation",
      body: [
        `Vos données de compte et de jeu sont conservées tant que votre compte est actif. ` +
          `Après suppression du compte, elles sont effacées ou anonymisées dans un délai ` +
          `raisonnable, sous réserve des durées de conservation imposées par la loi ` +
          `(notamment pour les pièces comptables liées à un achat).`,
      ],
      todo:
        "À COMPLÉTER : fixer les durées de conservation précises par catégorie de données " +
        "(compte, journaux techniques, pièces comptables) et le délai d'effacement après " +
        "suppression.",
    },
    {
      title: "Cookies et traceurs",
      body: [
        `Le Service utilise les cookies et technologies strictement nécessaires à son ` +
          `fonctionnement, notamment pour maintenir votre session une fois connecté et pour ` +
          `la vérification anti-robot. Ces éléments essentiels ne requièrent pas de ` +
          `consentement préalable.`,
      ],
      todo:
        "À COMPLÉTER : si des traceurs non essentiels (mesure d'audience, publicité) sont " +
        "ajoutés, mettre en place un bandeau de consentement et compléter cette section.",
    },
    {
      title: "Vos droits (RGPD)",
      body: [
        `Vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité ` +
          `de vos données, ainsi que d'un droit de limitation et d'opposition au traitement, ` +
          `dans les conditions prévues par le RGPD.`,
        `Vous pouvez exercer ces droits en nous contactant à l'adresse indiquée ci-dessous. ` +
          `Nous pourrons être amenés à vérifier votre identité avant de donner suite.`,
      ],
    },
    {
      title: "Sécurité",
      body: [
        `Nous mettons en œuvre des mesures techniques et organisationnelles adaptées pour ` +
          `protéger vos données : chiffrement des mots de passe, contrôle des accès aux ` +
          `données, et protection contre les usages automatisés abusifs. Aucun système ` +
          `n'étant infaillible, nous ne pouvons garantir une sécurité absolue.`,
      ],
    },
    {
      title: "Contact et réclamation",
      body: [
        `Pour toute question relative à vos données ou pour exercer vos droits, vous pouvez ` +
          `nous écrire à : ${P_CONTACT}.`,
        `Si vous estimez que le traitement de vos données n'est pas conforme, vous avez le ` +
          `droit d'introduire une réclamation auprès de l'autorité de contrôle compétente : ` +
          `${P_AUTORITE}.`,
      ],
    },
  ],
};
