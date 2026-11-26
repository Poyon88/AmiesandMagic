import type { LegalDocument } from "./types";
import { DATE_MISE_A_JOUR, EDITEUR, MEDIATEUR, SERVICE } from "./editeur";
import { TICKET_VALIDITY_DAYS } from "@/lib/payments/config";

// ⚠️ PROJET — relecture par un avocat indispensable avant mise en ligne.
//
// Conditions de vente des SEULS achats en euros : bourses de pièces d'or et
// carnets de tickets, réglés par Stripe Checkout. Les dépenses en or, en
// crédits marché ou en essence relèvent des CGU, pas d'ici.
//
// Aucun montant ici (arbitrage du 2026-11-26) : le texte décrit les types de
// produits et renvoie aux prix de la boutique, pour ne pas changer à chaque
// évolution du catalogue. Le prix est affiché avant l'achat, dans la boutique
// puis sur la page de paiement ; le montant débité est celui du Price Stripe.
//
// Politique retenue (arbitrage du 2026-11-24) : RENONCIATION EXPRESSE au droit
// de rétractation, le contenu numérique étant fourni immédiatement. La case à
// cocher avant le paiement et l'email de confirmation existent : cf.
// src/lib/payments/retractation.ts.

export const CGV: LegalDocument = {
  title: "Conditions générales de vente",
  updated: DATE_MISE_A_JOUR,
  intro: [
    `Les présentes conditions générales de vente (les « Conditions de vente ») ` +
      `s'appliquent à tout achat payé en euros dans le jeu ${SERVICE}, conclu entre ` +
      `${EDITEUR.denomination}, ${EDITEUR.siege}, immatriculée au Registre de commerce ` +
      `et des sociétés de Luxembourg sous le numéro ${EDITEUR.rcs}, TVA ${EDITEUR.tva} ` +
      `(le « Vendeur », « nous »), et un joueur agissant en qualité de consommateur ` +
      `(« vous »).`,
    `Elles complètent les conditions générales d'utilisation, dont les définitions ` +
      `s'appliquent ici. Elles ne concernent pas les dépenses faites en pièces d'or, en ` +
      `crédits marché ou en essence, qui relèvent des seules conditions générales ` +
      `d'utilisation.`,
  ],
  sections: [
    {
      title: "Produits vendus",
      body: [
        `Nous vendons des contenus numériques, fournis sans support matériel et utilisables ` +
          `uniquement dans le Service :`,
      ],
      items: [
        `des pièces d'or, vendues par bourses de tailles différentes ;`,
        `des tickets de tournoi, vendus à l'unité ou par carnets.`,
      ],
      after: [
        `Les pièces d'or servent à débloquer des factions dans la boutique et à enchérir ` +
          `à l'hôtel des ventes. Un ticket donne droit à une inscription à un tournoi à ` +
          `ticket ; il est valable ${TICKET_VALIDITY_DAYS} jours à compter de l'achat et ` +
          `chaque ticket porte sa propre date d'expiration, affichée dans la boutique.`,
        `Le contenu et le prix de chaque produit sont ceux affichés dans la boutique au ` +
          `moment de la commande. L'offre et les prix peuvent évoluer.`,
      ],
    },
    {
      title: "Conditions pour acheter",
      body: [`Pour acheter, vous devez :`],
      items: [
        `être titulaire d'un Compte ;`,
        `être majeur — 18 ans, ou l'âge plus élevé indiqué lorsque le droit de votre pays ` +
          `de connexion l'exige — et l'avoir certifié sur l'honneur avant votre premier ` +
          `achat ;`,
        `vous connecter depuis un pays où la vente du produit concerné est ouverte ;`,
        `utiliser un moyen de paiement dont vous êtes le titulaire légitime.`,
      ],
      after: [
        `Les achats sont réservés à un usage personnel. Nous pouvons refuser ou annuler une ` +
          `commande en cas de fraude avérée ou soupçonnée, de fausse déclaration d'âge, ` +
          `de contournement d'une restriction de pays ou de litige de paiement en cours.`,
      ],
    },
    {
      title: "Prix",
      body: [
        `Les prix sont indiqués en euros, toutes taxes comprises. La taxe sur la valeur ` +
          `ajoutée est celle du pays de l'acheteur, déterminé notamment d'après l'adresse ` +
          `de facturation que vous indiquez. Aucun frais de livraison ne s'ajoute.`,
        `Votre banque ou l'émetteur de votre moyen de paiement peut appliquer des frais ` +
          `qui lui sont propres, notamment de change : ils restent à votre charge.`,
      ],
      todo:
        "À VALIDER AVEC LE COMPTABLE : prix affichés TTC et TVA du pays du consommateur " +
        "(guichet unique OSS). Stripe n'est pas configuré pour calculer la taxe aujourd'hui ; " +
        "seul le pays de facturation est enregistré.",
    },
    {
      title: "Commande",
      body: [`La commande se déroule ainsi :`],
      items: [
        `vous choisissez un produit dans la boutique, qui en rappelle le contenu et le ` +
          `prix ;`,
        `lors de votre premier achat, vous certifiez avoir l'âge requis ;`,
        `vous demandez l'exécution immédiate du contrat et reconnaissez perdre votre droit ` +
          `de rétractation, au moyen de la case prévue à cet effet ;`,
        `vous êtes redirigé vers la page de paiement sécurisée de notre prestataire ` +
          `Stripe, où vous indiquez votre adresse de facturation et votre moyen de ` +
          `paiement, pouvez vérifier votre commande et corriger d'éventuelles erreurs, ` +
          `puis la validez avec obligation de paiement ;`,
        `le contrat est conclu lorsque le paiement est confirmé.`,
      ],
      after: [
        `Une page de paiement ouverte et non validée expire au bout de 30 minutes, sans ` +
          `aucun débit. Tant que le paiement n'est pas confirmé, vous pouvez abandonner la ` +
          `commande librement.`,
        `Le contrat est conclu en français. Nous conservons la trace de chaque commande ; ` +
          `vous la retrouvez dans votre Compte, page « Mes paiements », avec sa date, son ` +
          `objet, son montant et son état.`,
      ],
    },
    {
      title: "Paiement",
      body: [
        `Le paiement est exigible en totalité à la commande. Il est traité par Stripe ` +
          `Payments Europe, Limited (Irlande), au moyen des modes de paiement proposés ` +
          `sur la page de paiement. Nous n'avons jamais accès au numéro complet de votre ` +
          `carte et ne le conservons pas.`,
        `Une confirmation de paiement vous est adressée par email. Une facture peut vous ` +
          `être délivrée sur simple demande à ${EDITEUR.emailContact}.`,
      ],
    },
    {
      title: "Fourniture",
      body: [
        `Les pièces d'or ou les tickets sont crédités sur votre Compte dès que le paiement ` +
          `est confirmé par le prestataire de paiement, en général en quelques secondes. ` +
          `La page de retour attend cette confirmation avant d'annoncer que le paiement ` +
          `est confirmé.`,
        `Si votre achat n'est pas crédité dans les 24 heures alors que vous avez été ` +
          `débité, écrivez-nous à ${EDITEUR.emailContact} en indiquant la date et le ` +
          `montant du paiement : nous créditons votre Compte ou vous remboursons.`,
      ],
    },
    {
      title: "Droit de rétractation",
      body: [
        `En principe, un consommateur dispose de 14 jours à compter de la conclusion d'un ` +
          `contrat à distance pour se rétracter, sans donner de motif.`,
        `Ce droit ne peut toutefois plus être exercé pour un contenu numérique fourni sans ` +
          `support matériel lorsque l'exécution a commencé avec votre accord préalable ` +
          `exprès et que vous avez reconnu perdre ainsi votre droit de rétractation. ` +
          `C'est le cas de nos produits : en validant votre commande, vous demandez que ` +
          `les pièces d'or ou les tickets soient crédités immédiatement et reconnaissez ` +
          `qu'une fois crédités, vous ne pouvez plus vous rétracter. Cet accord vous est ` +
          `confirmé par email.`,
        `Si, par exception, vos pièces d'or ou vos tickets n'ont pas été crédités, vous ` +
          `conservez votre droit de rétractation pendant 14 jours. Pour l'exercer, ` +
          `adressez-nous une déclaration dénuée d'ambiguïté à ${EDITEUR.emailContact}, par ` +
          `exemple au moyen du modèle suivant : « Je vous notifie par la présente ma ` +
          `rétractation du contrat portant sur l'achat de [produit], commandé le [date]. ` +
          `Nom du joueur : […]. Adresse email du Compte : […]. Date : […]. » Nous vous ` +
          `remboursons dans les 14 jours, par le moyen de paiement utilisé pour l'achat.`,
      ],
      todo:
        "À ACTIVER AVANT LA MISE EN VENTE : l'email de confirmation ne part que si les " +
        "variables RESEND_API_KEY et PAYMENT_EMAIL_FROM sont renseignées sur le serveur. La " +
        "case à cocher, elle, est en place et exigée à chaque achat.",
    },
    {
      title: "Remboursements",
      body: [
        `En dehors du droit de rétractation, nous remboursons un achat lorsqu'il résulte ` +
          `d'une erreur technique ou d'un double débit, lorsque le produit n'a pas pu être ` +
          `fourni, ou lorsque la loi l'impose. Un remboursement est toujours effectué vers ` +
          `le moyen de paiement utilisé pour l'achat, jamais sous une autre forme.`,
        `Le remboursement d'un achat entraîne la reprise de ce qu'il avait procuré :`,
      ],
      items: [
        `pour une bourse d'or, les pièces sont retirées de votre solde. Si vous en avez ` +
          `déjà dépensé une partie, la partie manquante devient une dette d'or : tant ` +
          `qu'elle n'est pas résorbée, vous ne pouvez plus dépenser d'or, tout or reçu ` +
          `ensuite la résorbe en priorité, et une faction débloquée avec cet or peut ` +
          `être retirée de votre collection ;`,
        `pour un carnet de tickets, les tickets encore détenus sont annulés, puis, s'il ` +
          `en manque, vos inscriptions aux tournois qui n'ont pas commencé ; un ticket ` +
          `utilisé dans un tournoi déjà joué devient une dette de tickets, qui bloque ` +
          `l'inscription aux tournois à ticket jusqu'à ce qu'un nouvel achat la solde.`,
      ],
      after: [
        `Les mêmes conséquences s'appliquent lorsqu'un paiement est contesté auprès de ` +
          `votre banque. Une contestation de mauvaise foi, portant sur un achat dont vous ` +
          `avez reçu la contrepartie, constitue un manquement aux conditions générales ` +
          `d'utilisation.`,
        `Les pièces d'or et les tickets ne sont, pour le reste, ni repris ni échangés. Un ` +
          `ticket arrivé à expiration n'est pas remboursé.`,
      ],
    },
    {
      title: "Garantie légale de conformité",
      body: [
        `Vous bénéficiez de la garantie légale de conformité applicable aux contenus et ` +
          `services numériques, prévue par le Code de la consommation luxembourgeois. Si ` +
          `le produit acheté n'est pas conforme à ce qui était annoncé — par exemple si la ` +
          `quantité créditée est inférieure à celle achetée —, vous pouvez en demander la ` +
          `mise en conformité sans frais, puis, si elle est impossible ou n'intervient pas ` +
          `dans un délai raisonnable, une réduction du prix ou la résolution du contrat. ` +
          `Cette garantie court pendant deux ans à compter de la fourniture.`,
        `L'évolution normale du jeu décrite par les conditions générales d'utilisation ` +
          `(équilibrage, modification des cartes, calendrier des tournois) ne constitue ` +
          `pas un défaut de conformité du produit acheté.`,
        `Pour faire jouer la garantie, écrivez-nous à ${EDITEUR.emailContact}.`,
      ],
    },
    {
      title: "Fin du Compte et fin du Service",
      body: [
        `La suppression de votre Compte à votre demande, ou sa fermeture pour manquement ` +
          `grave aux conditions générales d'utilisation, entraîne la perte des pièces d'or ` +
          `et des tickets non utilisés, sans remboursement, sous réserve de vos droits ` +
          `légaux.`,
      ],
      todo:
        "À ARRÊTER AVEC L'AVOCAT : sort des pièces d'or et des tickets achetés et non utilisés " +
        "si l'Éditeur met fin au Service (remboursement au prorata, délai d'utilisation, ou " +
        "rien au-delà du préavis).",
    },
    {
      title: "Réclamations, médiation et droit applicable",
      body: [
        `Pour toute réclamation relative à un achat, écrivez-nous à ` +
          `${EDITEUR.emailContact} en indiquant la date et le montant du paiement. Nous ` +
          `vous répondons dans un délai de 30 jours.`,
        `Si notre réponse ne vous satisfait pas, vous pouvez saisir gratuitement le ` +
          `${MEDIATEUR}.`,
        `Les Conditions de vente sont régies par le droit luxembourgeois. Si vous résidez ` +
          `dans un autre État membre de l'Union européenne, vous conservez la protection ` +
          `des dispositions impératives de la loi de votre pays de résidence et pouvez ` +
          `saisir le tribunal de votre lieu de résidence.`,
      ],
    },
  ],
};
