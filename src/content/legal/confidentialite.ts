import type { LegalDocument } from "./types";
import { CNPD, DATE_MISE_A_JOUR, EDITEUR, SERVICE } from "./editeur";

// ⚠️ PROJET — relecture par un avocat ou un DPO indispensable avant mise en
// ligne. Chaque traitement décrit ici a été relevé dans le code le 2026-11-24 :
//   - compte : Supabase Auth (email + mot de passe, Google, Discord), pseudo
//     public, profiles.cgu_accepted_at, profiles.adult_declared_* ;
//   - pays de connexion : en-tête x-vercel-ip-country (l'adresse IP n'est pas
//     enregistrée par l'application), payments.request_country ;
//   - paiements : Stripe Checkout hébergé, adresse de facturation exigée,
//     payments.customer_country ; aucune donnée de carte chez nous ;
//   - jeu : decks, collection, portefeuilles et journaux (or, essence, crédits,
//     tickets), enchères, parties (match_actions, match_mulligans, résultats) ;
//   - retours joueurs : fils, messages, captures (bucket privé), triés par
//     l'API d'Anthropic (src/lib/feedback/agent.ts) ;
//   - anti-robot : Cloudflare Turnstile sur inscription, connexion et
//     réinitialisation ; emails : Supabase Auth via le SMTP de Resend ;
//   - AUCUN outil de mesure d'audience ni de publicité.
//
// Les DURÉES de conservation sont des PROPOSITIONS : aucune purge automatique
// n'existe dans le code. Les écrire ici engage à les appliquer.

export const CONFIDENTIALITE: LegalDocument = {
  title: "Politique de confidentialité",
  updated: DATE_MISE_A_JOUR,
  intro: [
    `La présente politique explique quelles données personnelles sont traitées lorsque ` +
      `vous utilisez le jeu ${SERVICE} (le « Service »), pourquoi, pendant combien de ` +
      `temps, et quels sont vos droits. Elle s'applique conformément au règlement (UE) ` +
      `2016/679 (« RGPD ») et à la loi luxembourgeoise du 1er août 2018 sur la protection ` +
      `des données.`,
  ],
  sections: [
    {
      title: "Responsable du traitement",
      body: [
        `Le responsable du traitement est ${EDITEUR.denomination}, ${EDITEUR.siege}, ` +
          `immatriculée au Registre de commerce et des sociétés de Luxembourg sous le ` +
          `numéro ${EDITEUR.rcs}.`,
        `Pour toute question sur vos données ou pour exercer vos droits : ` +
          `${EDITEUR.emailDonnees}. Nous n'avons pas désigné de délégué à la protection ` +
          `des données.`,
      ],
      todo:
        "À VÉRIFIER : absence d'obligation de désigner un délégué à la protection des données " +
        "(à réexaminer si le nombre de joueurs devient important).",
    },
    {
      title: "Données que nous traitons",
      body: [`Nous traitons uniquement les données nécessaires au fonctionnement du Service :`],
      items: [
        `Données de compte : votre adresse email, votre mot de passe (conservé sous une ` +
          `forme hachée, que nous ne pouvons pas lire), votre nom de joueur, la langue ` +
          `choisie, la date de création du Compte et de vos connexions.`,
        `Connexion par Google ou Discord : si vous choisissez ce mode, le fournisseur nous ` +
          `transmet l'identifiant de votre compte chez lui, votre adresse email et, selon ` +
          `le fournisseur, votre nom affiché et votre image de profil. Nous n'avons jamais ` +
          `accès à votre mot de passe chez ce fournisseur.`,
        `Preuves de consentement : la date et l'heure de votre acceptation des conditions ` +
          `générales ; votre déclaration de majorité avant le premier achat, avec sa date, ` +
          `l'âge demandé et votre pays de connexion à ce moment.`,
        `Données de jeu : votre faction de départ et les factions débloquées, votre ` +
          `collection, vos decks, vos soldes et l'historique de vos mouvements d'or, ` +
          `d'essence, de crédits marché et de tickets, vos enchères, vos inscriptions aux ` +
          `tournois, vos parties (adversaire, decks joués, actions, résultat) et vos ` +
          `notifications.`,
        `Données d'achat : la date, l'objet, le montant et l'état de chaque paiement, un ` +
          `identifiant client et un identifiant de transaction chez notre prestataire de ` +
          `paiement, le pays de votre adresse de facturation et votre pays de connexion ` +
          `au moment de l'achat. Votre moyen de paiement et votre adresse de facturation ` +
          `complète sont saisis chez le prestataire de paiement : nous ne recevons ni ne ` +
          `conservons le numéro de votre carte.`,
        `Retours que vous nous adressez : le texte de vos messages, les captures d'écran ` +
          `jointes, la page et le contexte de jeu depuis lesquels le retour a été envoyé, ` +
          `ainsi que nos réponses.`,
        `Données techniques : votre adresse IP, le type de navigateur et les journaux ` +
          `techniques de connexion sont traités par nos hébergeurs pour acheminer les ` +
          `pages et assurer la sécurité. Votre pays de connexion est déduit de votre ` +
          `adresse IP à chaque requête ; l'adresse IP elle-même n'est pas enregistrée dans ` +
          `notre base de données.`,
      ],
      after: [
        `Votre nom de joueur est public : il est visible des autres joueurs, notamment en ` +
          `partie, aux enchères et dans les tournois. Votre adresse email ne l'est jamais.`,
        `Nous ne collectons aucune donnée sensible au sens de l'article 9 du RGPD et vous ` +
          `demandons de ne pas en faire figurer dans votre nom de joueur ou dans vos ` +
          `retours. La fourniture de l'adresse email et du nom de joueur conditionne la ` +
          `création du Compte ; les autres données résultent de votre utilisation du ` +
          `Service.`,
      ],
    },
    {
      title: "Pourquoi nous les traitons",
      body: [`Chaque traitement repose sur l'une des bases prévues par l'article 6 du RGPD :`],
      items: [
        `Exécution du contrat qui nous lie : créer et gérer votre Compte, vous permettre ` +
          `de jouer, tenir votre collection et vos soldes, organiser les enchères et les ` +
          `tournois, traiter vos achats, vous envoyer les emails indispensables ` +
          `(confirmation d'adresse, réinitialisation du mot de passe), répondre à vos ` +
          `demandes.`,
        `Obligation légale : tenir notre comptabilité et établir nos déclarations ` +
          `fiscales, répondre aux demandes des autorités habilitées, vérifier que vous ` +
          `avez l'âge requis pour acheter et que la vente est ouverte dans votre pays.`,
        `Intérêt légitime : protéger le Service contre les robots, la fraude, la triche ` +
          `et les abus ; établir de façon fiable le résultat des parties ; appliquer les ` +
          `restrictions par pays ; corriger les bogues ; équilibrer le jeu à partir de ` +
          `statistiques de parties ; conserver la preuve de votre acceptation des ` +
          `conditions ; défendre nos droits en cas de litige.`,
        `Consentement : uniquement pour d'éventuelles communications non indispensables ` +
          `(lettre d'information, annonces), que nous n'envoyons pas à ce jour. Si nous ` +
          `en proposions, vous pourriez retirer votre consentement à tout moment.`,
      ],
      after: [
        `Nous ne vendons pas vos données, ne les utilisons pas à des fins publicitaires et ` +
          `n'établissons aucun profil commercial.`,
      ],
    },
    {
      title: "Traitements automatisés et intelligence artificielle",
      body: [
        `Les retours que vous nous adressez font l'objet d'un premier tri assisté par un ` +
          `modèle d'intelligence artificielle fourni par Anthropic : il classe le retour, ` +
          `en rédige un résumé pour notre équipe et peut répondre directement à une ` +
          `question sur les règles du jeu. Le texte de votre retour et les captures ` +
          `jointes lui sont transmis à cette seule fin. Les réponses qui concernent votre ` +
          `Compte, un paiement, une réclamation, la modération ou une question juridique ` +
          `sont relues par une personne avant de vous être envoyées.`,
        `Aucune décision produisant des effets juridiques ou vous affectant de manière ` +
          `significative — sanction, fermeture de Compte, refus de remboursement — n'est ` +
          `prise sur le seul fondement d'un traitement automatisé.`,
      ],
    },
    {
      title: "Destinataires et sous-traitants",
      body: [
        `Vos données sont accessibles aux seules personnes de notre équipe qui en ont ` +
          `besoin. Nous faisons appel aux prestataires suivants, qui agissent pour notre ` +
          `compte et selon nos instructions :`,
      ],
      items: [
        `Supabase (Supabase, Inc.) : authentification, base de données et stockage des ` +
          `fichiers.`,
        `Vercel (Vercel Inc.) : hébergement de l'application et acheminement des pages, ` +
          `détermination du pays de connexion.`,
        `Stripe (Stripe Payments Europe, Limited, Irlande) : paiement en ligne. Stripe ` +
          `agit aussi comme responsable de traitement distinct pour ses propres ` +
          `obligations, notamment la lutte contre la fraude et le blanchiment.`,
        `Cloudflare (Cloudflare, Inc.) : vérification anti-robot Turnstile lors de ` +
          `l'inscription, de la connexion et de la réinitialisation du mot de passe.`,
        `Resend (Resend, Inc.) : envoi des emails du Service.`,
        `Anthropic : tri assisté des retours des joueurs, décrit à la section précédente.`,
      ],
      after: [
        `Google et Discord n'interviennent que si vous choisissez de vous connecter par ` +
          `leur intermédiaire ; ils traitent alors vos données sous leur propre ` +
          `responsabilité.`,
        `Nous pouvons en outre communiquer des données à nos conseils (comptable, avocat), ` +
          `aux autorités administratives ou judiciaires lorsque la loi l'exige, et, en cas ` +
          `de cession de notre activité, à son repreneur, qui serait tenu par la présente ` +
          `politique.`,
      ],
      todo:
        "À VÉRIFIER : dénomination de l'entité contractante de chaque prestataire, accord de " +
        "sous-traitance (DPA) signé avec chacun, et région d'hébergement du projet Supabase " +
        "et des fonctions Vercel.",
    },
    {
      title: "Transferts hors de l'Espace économique européen",
      body: [
        `Plusieurs de ces prestataires sont établis aux États-Unis ou y recourent à des ` +
          `sous-traitants : vos données peuvent donc être traitées en dehors de l'Espace ` +
          `économique européen. Ces transferts sont encadrés par une décision d'adéquation ` +
          `de la Commission européenne lorsque le prestataire est certifié au titre du ` +
          `cadre de protection des données UE–États-Unis, et, à défaut, par les clauses ` +
          `contractuelles types adoptées par la Commission européenne.`,
        `Vous pouvez obtenir une copie des garanties applicables en nous écrivant à ` +
          `${EDITEUR.emailDonnees}.`,
      ],
      todo:
        "À VÉRIFIER pour chaque prestataire : certification au Data Privacy Framework ou " +
        "clauses contractuelles types effectivement en place.",
    },
    {
      title: "Durées de conservation",
      body: [`Nous conservons vos données pendant les durées suivantes :`],
      items: [
        `Données de compte et de jeu : tant que votre Compte existe. Après une demande de ` +
          `suppression, elles sont effacées ou rendues anonymes dans un délai de 30 jours.`,
        `Compte inactif : un Compte auquel personne ne s'est connecté depuis trois ans est ` +
          `supprimé, après un avertissement envoyé par email au moins 30 jours avant.`,
        `Parties : après la suppression du Compte, l'historique des parties est conservé ` +
          `sans lien avec votre identité, pour les statistiques d'équilibrage et pour ne ` +
          `pas effacer l'historique de vos adversaires.`,
        `Données d'achat et pièces comptables : dix ans à compter de la clôture de ` +
          `l'exercice comptable concerné, y compris après la suppression du Compte.`,
        `Preuves de consentement et déclaration de majorité : pendant la durée du Compte, ` +
          `puis cinq ans.`,
        `Retours et échanges avec le support : trois ans après la clôture du fil.`,
        `Journaux techniques de nos hébergeurs : quelques semaines au plus, selon leurs ` +
          `propres règles.`,
        `Compte fermé pour manquement grave : l'adresse email et le motif peuvent être ` +
          `conservés trois ans pour empêcher une réinscription.`,
      ],
      after: [
        `Au-delà, les données sont supprimées ou rendues anonymes, sauf si leur ` +
          `conservation reste nécessaire à la constatation, à l'exercice ou à la défense ` +
          `d'un droit en justice.`,
      ],
      todo:
        "PROPOSITIONS À VALIDER : aucune de ces durées n'est appliquée automatiquement " +
        "aujourd'hui (pas de purge des comptes inactifs ni des retours, pas d'anonymisation " +
        "des parties à la suppression). Les publier engage à les mettre en œuvre.",
    },
    {
      title: "Vos droits",
      body: [`Vous disposez, dans les conditions prévues par le RGPD, des droits suivants :`],
      items: [
        `accéder à vos données et en obtenir une copie ;`,
        `faire rectifier des données inexactes ;`,
        `obtenir l'effacement de vos données, notamment par la suppression de votre ` +
          `Compte ;`,
        `obtenir la limitation d'un traitement ;`,
        `vous opposer, pour des raisons tenant à votre situation particulière, à un ` +
          `traitement fondé sur notre intérêt légitime ;`,
        `recevoir, dans un format structuré et couramment utilisé, les données que vous ` +
          `nous avez fournies (portabilité) ;`,
        `retirer votre consentement à tout moment, lorsqu'un traitement repose sur lui.`,
      ],
      after: [
        `Pour exercer ces droits, écrivez-nous à ${EDITEUR.emailDonnees} depuis l'adresse ` +
          `email de votre Compte. Nous vous répondons dans un délai d'un mois, qui peut ` +
          `être prolongé de deux mois si la demande est complexe. Si un doute subsiste ` +
          `sur votre identité, nous pouvons vous demander un élément complémentaire.`,
        `Vous pouvez introduire une réclamation auprès de la ${CNPD}, ou auprès de ` +
          `l'autorité de protection des données de votre pays de résidence.`,
      ],
    },
    {
      title: "Mineurs",
      body: [
        `Le Service s'adresse aux personnes d'au moins 16 ans. Nous ne collectons pas ` +
          `sciemment de données concernant un enfant plus jeune. Si vous êtes parent et ` +
          `pensez que votre enfant de moins de 16 ans a créé un Compte, écrivez-nous à ` +
          `${EDITEUR.emailDonnees} : nous le supprimerons.`,
      ],
    },
    {
      title: "Sécurité",
      body: [
        `Nous mettons en œuvre des mesures techniques et organisationnelles adaptées : ` +
          `connexions chiffrées, mots de passe hachés, cloisonnement des accès à la base ` +
          `de données de sorte que chaque joueur ne puisse lire que ce qui le concerne, ` +
          `écritures sensibles réservées à nos serveurs, protection anti-robot, ` +
          `vérification de l'authenticité des notifications de paiement.`,
        `Aucun système n'étant infaillible, nous ne pouvons garantir une sécurité absolue. ` +
          `En cas de violation de données susceptible d'engendrer un risque élevé pour ` +
          `vos droits, nous vous en informerons, ainsi que la CNPD, dans les conditions ` +
          `prévues par le RGPD.`,
      ],
    },
    {
      title: "Cookies",
      body: [
        `Le Service n'utilise que des cookies et des éléments de stockage strictement ` +
          `nécessaires à son fonctionnement ; il ne comporte ni mesure d'audience ni ` +
          `traceur publicitaire. Le détail figure sur la page « Cookies et traceurs ».`,
      ],
    },
    {
      title: "Modification de la présente politique",
      body: [
        `Nous pouvons modifier la présente politique, notamment si nous faisons appel à un ` +
          `nouveau prestataire ou ajoutons une fonction. La date de mise à jour figure en ` +
          `tête de page ; toute modification substantielle vous est annoncée par email ou ` +
          `par une annonce dans le Service.`,
      ],
    },
  ],
};
