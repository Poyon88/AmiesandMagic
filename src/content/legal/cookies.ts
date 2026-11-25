import type { LegalDocument } from "./types";
import { DATE_MISE_A_JOUR, EDITEUR, SERVICE } from "./editeur";

// ⚠️ PROJET — à relire avant mise en ligne.
//
// Inventaire relevé dans le code le 2026-11-24 :
//   - cookies de session Supabase (posés par @supabase/ssr dans src/proxy.ts) ;
//   - cookie `am-locale` (src/i18n/useLocale.ts), 365 jours ;
//   - Cloudflare Turnstile sur les formulaires d'authentification ;
//   - Stripe, uniquement sur SA page de paiement ;
//   - stockage local du navigateur pour quelques préférences d'interface.
// Aucune mesure d'audience, aucune publicité, aucun réseau social embarqué :
// d'où l'absence de bandeau de consentement. ⚠️ Ajouter un seul traceur non
// essentiel (statistiques, vidéo embarquée, pixel) oblige à recueillir le
// consentement AVANT de le déposer, et à réécrire cette page.

export const COOKIES: LegalDocument = {
  title: "Cookies et traceurs",
  updated: DATE_MISE_A_JOUR,
  intro: [
    `Un cookie est un petit fichier déposé par un site dans votre navigateur. ${SERVICE} ` +
      `n'utilise que ceux qui sont strictement nécessaires pour vous fournir le service ` +
      `que vous demandez. Il ne comporte aucun outil de mesure d'audience, aucun traceur ` +
      `publicitaire et aucun bouton de réseau social : c'est pourquoi aucun bandeau de ` +
      `consentement ne vous est présenté, la loi n'en exigeant pas pour ces éléments.`,
  ],
  sections: [
    {
      title: "Cookies que nous déposons",
      body: [],
      items: [
        `Cookies de session (noms commençant par « sb- ») : ils vous maintiennent ` +
          `connecté d'une page à l'autre. Déposés lors de la connexion, renouvelés tant ` +
          `que vous utilisez le Service, supprimés à la déconnexion. Durée maximale : ` +
          `environ 13 mois sans visite.`,
        `Cookie de langue (« am-locale ») : il retient la langue que vous avez choisie. ` +
          `Déposé seulement si vous changez de langue. Durée : 12 mois.`,
      ],
    },
    {
      title: "Éléments déposés par nos prestataires",
      body: [],
      items: [
        `Cloudflare Turnstile : sur les pages d'inscription, de connexion et de ` +
          `réinitialisation du mot de passe, ce service vérifie que la demande provient ` +
          `d'une personne et non d'un robot. Il analyse pour cela des caractéristiques ` +
          `techniques de votre navigateur et peut y déposer un élément technique de courte ` +
          `durée. Il ne sert pas à vous suivre à des fins publicitaires.`,
        `Stripe : lorsque vous effectuez un achat, vous êtes redirigé vers la page de ` +
          `paiement de Stripe, qui dépose ses propres cookies sur son domaine pour ` +
          `sécuriser le paiement et prévenir la fraude.`,
        `Google et Discord : si vous choisissez de vous connecter par leur intermédiaire, ` +
          `la page de connexion de ce fournisseur utilise ses propres cookies.`,
      ],
    },
    {
      title: "Stockage local du navigateur",
      body: [
        `Le Service enregistre dans le stockage local de votre navigateur quelques ` +
          `préférences d'interface — par exemple les annonces déjà vues ou les panneaux ` +
          `que vous avez repliés. Ces informations restent sur votre appareil, ne nous ` +
          `sont pas transmises et ne servent à aucun suivi.`,
      ],
    },
    {
      title: "Gérer les cookies",
      body: [
        `Vous pouvez supprimer ou bloquer les cookies depuis les réglages de votre ` +
          `navigateur. Si vous bloquez les cookies de session, vous ne pourrez pas rester ` +
          `connecté ni jouer.`,
        `Pour toute question : ${EDITEUR.emailDonnees}.`,
      ],
    },
  ],
};
