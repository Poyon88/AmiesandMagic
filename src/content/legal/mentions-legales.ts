import type { LegalDocument } from "./types";
import { DATE_MISE_A_JOUR, EDITEUR, MEDIATEUR, SERVICE, SITE } from "./editeur";

// ⚠️ PROJET — à compléter et à relire avant mise en ligne.
//
// Mentions d'identification exigées d'un prestataire établi au Luxembourg (loi
// modifiée du 14 août 2000 relative au commerce électronique) : dénomination,
// adresse, coordonnées dont un email, numéro RCS, autorisation d'établissement,
// numéro de TVA. Toutes viennent de ./editeur.ts.
//
// Hébergement constaté : application sur Vercel, données et fichiers sur
// Supabase. Les adresses postales des hébergeurs sont à revérifier sur leurs
// propres mentions légales le jour de la mise en ligne.

export const MENTIONS_LEGALES: LegalDocument = {
  title: "Mentions légales",
  updated: DATE_MISE_A_JOUR,
  sections: [
    {
      title: "Éditeur du site",
      body: [`Le site ${SITE} et le jeu ${SERVICE} sont édités par :`],
      items: [
        `Dénomination : ${EDITEUR.denomination}`,
        `Capital social : ${EDITEUR.capital}`,
        `Siège social : ${EDITEUR.siege}`,
        `Registre de commerce et des sociétés de Luxembourg : ${EDITEUR.rcs}`,
        `Autorisation d'établissement : ${EDITEUR.autorisation}, délivrée par le ministère ` +
          `de l'Économie du Grand-Duché de Luxembourg`,
        `Numéro de TVA : ${EDITEUR.tva}`,
        `Email : ${EDITEUR.emailContact}`,
      ],
    },
    {
      title: "Hébergement",
      body: [],
      items: [
        `Application : Vercel Inc. — vercel.com`,
        `Base de données, authentification et fichiers : Supabase, Inc. — supabase.com`,
      ],
      todo: "À VÉRIFIER : région d'hébergement des données à la date de mise en ligne.",
    },
    {
      title: "Contact et signalement d'un contenu",
      body: [
        `Pour toute question, réclamation ou demande, écrivez-nous à ` +
          `${EDITEUR.emailContact}. Cette adresse est aussi notre point de contact unique ` +
          `pour les autorités et pour les utilisateurs au sens du règlement (UE) 2022/2065 ` +
          `sur les services numériques ; vous pouvez nous écrire en français ou en ` +
          `anglais.`,
        `Si vous estimez qu'un contenu visible dans le Service — par exemple le nom d'un ` +
          `joueur — est illicite ou contraire à nos règles de conduite, signalez-le à la ` +
          `même adresse en précisant où vous l'avez vu, pourquoi vous le jugez illicite, ` +
          `et vos coordonnées. Nous examinons chaque signalement et vous informons de la ` +
          `suite donnée.`,
      ],
    },
    {
      title: "Propriété intellectuelle",
      body: [
        `${SERVICE}, son nom, son logo, son univers, ses illustrations, les textes de ses ` +
          `cartes, ses musiques et son logiciel sont protégés par le droit d'auteur et le ` +
          `droit des marques. Toute reproduction ou réutilisation, totale ou partielle, ` +
          `sans autorisation écrite préalable est interdite, sous réserve des usages ` +
          `permis par les conditions générales d'utilisation.`,
        `La plupart des images, des musiques et des sons du Service ont été générés à ` +
          `l'aide d'outils d'intelligence artificielle, dans le cadre de licences qui en ` +
          `autorisent l'exploitation commerciale.`,
        `Les marques et logos de tiers cités sur le site appartiennent à leurs ` +
          `titulaires respectifs.`,
      ],
      todo:
        "À COMPLÉTER une fois le dépôt effectué : numéro et office d'enregistrement de la " +
        "marque « Armies of Legends ». À VALIDER PAR L'AVOCAT : portée de la protection par " +
        "le droit d'auteur des contenus générés par intelligence artificielle.",
    },
    {
      title: "Règlement des litiges de consommation",
      body: [
        `En cas de litige que nous n'aurions pas pu résoudre ensemble, vous pouvez saisir ` +
          `gratuitement le ${MEDIATEUR}.`,
      ],
    },
    {
      title: "Documents applicables",
      body: [
        `L'utilisation du Service est régie par les conditions générales d'utilisation ; ` +
          `les achats en euros, par les conditions générales de vente ; le traitement de ` +
          `vos données, par la politique de confidentialité et la page sur les cookies. ` +
          `Ces documents sont accessibles en bas de chaque page légale.`,
      ],
    },
  ],
};
