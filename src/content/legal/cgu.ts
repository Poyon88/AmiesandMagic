import type { LegalDocument } from "./types";
import { DATE_MISE_A_JOUR, EDITEUR, MEDIATEUR, SERVICE, SITE } from "./editeur";

// ⚠️ PROJET — relecture par un avocat indispensable avant mise en ligne. Texte
// rédigé de bonne foi à partir du fonctionnement réel de l'application (vérifié
// dans le code et dans le livret de règles), pour une société de droit
// luxembourgeois. Il n'a AUCUNE valeur juridique tant qu'il n'a pas été validé.
//
// Les dotations de tournoi en EUROS sont volontairement HORS de ce texte
// (arbitrage du 2026-11-24) : elles appellent un règlement distinct et une
// instruction juridique propre (qualification de jeu de hasard, versement,
// fiscalité). Une seule phrase de réserve y renvoie, section « Tournois ».
//
// Toute valeur chiffrée citée ici (durées, tailles) existe dans le code : la
// changer là-bas oblige à la changer ici.

export const CGU: LegalDocument = {
  title: "Conditions générales d'utilisation",
  updated: DATE_MISE_A_JOUR,
  intro: [
    `Les présentes conditions générales d'utilisation (les « Conditions ») régissent ` +
      `l'accès au jeu de cartes à collectionner en ligne ${SERVICE} et son utilisation, ` +
      `sur le site ${SITE} (le « Service »). Le Service est édité par ` +
      `${EDITEUR.denomination}, dont le siège est établi ${EDITEUR.siege} ` +
      `(l'« Éditeur », « nous »).`,
    `Elles forment, avec les conditions générales de vente, la politique de ` +
      `confidentialité, la page sur les cookies et, le cas échéant, le règlement propre à ` +
      `un tournoi, le contrat conclu entre vous et l'Éditeur. En cas de contradiction, ` +
      `les conditions générales de vente l'emportent pour ce qui concerne un achat en ` +
      `euros, et le règlement d'un tournoi l'emporte pour ce tournoi.`,
  ],
  sections: [
    {
      title: "Définitions",
      body: [],
      items: [
        `« Compte » : l'espace personnel créé lors de l'inscription.`,
        `« Joueur », « vous » : toute personne titulaire d'un Compte.`,
        `« Biens virtuels » : les cartes, exemplaires numérotés, héros, plateaux, dos de ` +
          `cartes, pièces d'or, essence, crédits marché et tickets de tournoi, ainsi que ` +
          `tout autre élément numérique attaché à un Compte.`,
        `« Or » : la monnaie de jeu, obtenue par attribution de l'Éditeur ou par achat en ` +
          `euros.`,
        `« Essence » : une ressource de jeu distincte de l'or, qui ne s'achète pas et ne ` +
          `sert qu'à la forge d'essence.`,
        `« Crédits marché » : une ressource attribuée par l'Éditeur, utilisable ` +
          `uniquement aux enchères proposées par l'Éditeur.`,
        `« Ticket » : un droit d'entrée dans un tournoi à ticket.`,
      ],
    },
    {
      title: "Objet et acceptation",
      body: [
        `Le Service est un jeu vidéo de cartes à collectionner jouable dans un navigateur, ` +
          `gratuit d'accès. Il propose des parties en ligne contre d'autres joueurs, une ` +
          `collection de cartes, la construction de decks, une boutique, un hôtel des ` +
          `ventes et des tournois. Il est fourni à des fins de divertissement.`,
        `Vous acceptez les Conditions en cochant la case prévue à cet effet lors de votre ` +
          `inscription. La date et l'heure de cette acceptation sont enregistrées. Si vous ` +
          `n'acceptez pas les Conditions, vous ne pouvez pas créer de Compte.`,
        `Les Conditions sont rédigées en français. Si une traduction est mise à ` +
          `disposition, elle l'est pour votre confort : seule la version française fait foi.`,
      ],
    },
    {
      title: "Création et sécurité du Compte",
      body: [
        `La création d'un Compte se fait par adresse email et mot de passe, ou par ` +
          `l'intermédiaire d'un compte Google ou Discord. Une inscription par email doit ` +
          `être confirmée au moyen du lien que nous vous envoyons. Vous vous engagez à ` +
          `fournir une adresse email valide, dont vous avez l'usage, et à la tenir à jour.`,
        `Vous choisissez un nom de joueur de 3 à 20 caractères (lettres, chiffres, tiret ` +
          `et tiret bas), unique. Ce nom est public : les autres joueurs le voient, ` +
          `notamment en partie, aux enchères et dans les tournois. Il ne doit ni usurper ` +
          `l'identité d'un tiers, ni laisser croire que vous appartenez à l'équipe du jeu, ` +
          `ni contrevenir aux règles de conduite. Nous pouvons le refuser ou vous demander ` +
          `d'en changer.`,
        `Le Compte est personnel. Vous ne pouvez ni le céder, ni le vendre, ni le prêter, ` +
          `ni en partager l'accès. Une même personne ne peut détenir qu'un seul Compte ; ` +
          `en ouvrir plusieurs pour contourner une sanction, cumuler des avantages ` +
          `réservés à un compte ou fausser un tournoi est interdit.`,
        `Vous êtes responsable de la confidentialité de vos identifiants et de l'usage qui ` +
          `est fait de votre Compte. Si vous soupçonnez un accès non autorisé, changez ` +
          `votre mot de passe et prévenez-nous sans attendre à l'adresse indiquée à la ` +
          `dernière section.`,
      ],
    },
    {
      title: "Âge requis",
      body: [
        `Le Service s'adresse aux personnes âgées d'au moins 16 ans. Si vous avez moins de ` +
          `18 ans, vous déclarez utiliser le Service avec l'accord de la personne qui ` +
          `exerce l'autorité parentale, qui a pris connaissance des présentes Conditions.`,
        `Les achats en euros sont réservés aux personnes majeures : 18 ans, ou l'âge plus ` +
          `élevé indiqué au moment de l'achat lorsque le droit de votre pays de connexion ` +
          `l'exige. Avant votre premier achat, vous certifiez sur l'honneur avoir cet âge ; ` +
          `cette déclaration est enregistrée avec sa date, l'âge demandé et votre pays de ` +
          `connexion. Un achat obtenu par une fausse déclaration peut être annulé et le ` +
          `Compte suspendu.`,
      ],
      todo:
        "À VALIDER : seuil de 16 ans (âge du consentement numérique au Luxembourg) appliqué à " +
        "tous les pays, sans recueil de l'accord parental en dessous. Variante possible : " +
        "ouvrir le jeu gratuit dès 13 ans avec accord parental vérifié — ce qui demanderait " +
        "un mécanisme qui n'existe pas aujourd'hui.",
    },
    {
      title: "Le jeu gratuit",
      body: [
        `À l'inscription, vous choisissez une faction de départ et recevez gratuitement ` +
          `l'ensemble de ses cartes communes, ainsi que les cartes communes ouvertes à ` +
          `toutes les factions. Ce choix est définitif : il ne peut pas être modifié par ` +
          `la suite. Les autres factions peuvent être débloquées en pièces d'or dans la ` +
          `boutique.`,
        `Jouer des parties, construire des decks et consulter votre collection ne ` +
          `demandent aucun achat.`,
      ],
    },
    {
      title: "Biens virtuels",
      body: [
        `Les Biens virtuels n'existent qu'à l'intérieur du Service. Ils n'ont aucune ` +
          `valeur monétaire, ne constituent ni une monnaie, ni un moyen de paiement, ni un ` +
          `instrument financier, et ne peuvent en aucun cas être convertis en euros ou ` +
          `remboursés en dehors des cas prévus par les conditions générales de vente et ` +
          `par la loi.`,
        `Nous vous concédons sur les Biens virtuels attachés à votre Compte une licence ` +
          `d'utilisation personnelle, non exclusive et non cessible, pour la durée de ` +
          `votre Compte. Cette licence ne vous transfère aucun droit de propriété, y ` +
          `compris sur les cartes en édition limitée dont vous détenez un exemplaire ` +
          `numéroté.`,
        `Il est interdit de vendre, d'acheter, d'échanger ou de céder des Biens virtuels ` +
          `ou un Compte contre de l'argent ou tout autre avantage en dehors du Service. La ` +
          `revente de cartes entre joueurs n'est pas proposée. Les tickets ne sont ni ` +
          `transférables ni revendables.`,
        `Certains Biens virtuels ont une durée de validité : un ticket est valable 365 ` +
          `jours à compter de son obtention, un lot de crédits marché 30 jours à compter de ` +
          `son attribution. Passé ce délai, ils sont perdus sans contrepartie. La date ` +
          `d'expiration est affichée dans votre Compte.`,
      ],
    },
    {
      title: "Boutique, hôtel des ventes et forge d'essence",
      body: [
        `La boutique permet de débloquer en pièces d'or les cartes communes d'une faction ` +
          `ou de toutes les factions. Le prix en or est affiché avant la confirmation et ` +
          `peut évoluer ; celui qui s'applique est celui affiché au moment où vous ` +
          `confirmez.`,
        `L'hôtel des ventes propose des cartes mises en vente par l'Éditeur, aux enchères ` +
          `ou à prix fixe, payables en pièces d'or et, lorsque la vente l'accepte, en ` +
          `crédits marché. Une enchère vous engage : son montant est aussitôt prélevé sur ` +
          `votre solde, et vous est rendu en totalité si un autre joueur surenchérit. Une ` +
          `enchère placée dans les derniers instants peut prolonger la vente. L'enchère la ` +
          `plus élevée à la clôture emporte la carte. Une enchère ne peut pas être retirée.`,
        `La forge d'essence échange une quantité fixe d'essence contre une carte en ` +
          `édition limitée tirée au hasard parmi les exemplaires qui n'appartiennent ` +
          `encore à personne. Les chances d'obtenir chaque rareté sont affichées avant la ` +
          `forge. L'essence ne peut pas être achetée, ni en euros ni en pièces d'or.`,
        `Sauf erreur technique de notre part, une dépense en or, en crédits marché ou en ` +
          `essence est définitive.`,
      ],
    },
    {
      title: "Tournois",
      body: [
        `Le Service organise des tournois, gratuits ou accessibles au moyen d'un ticket. ` +
          `Le format, les conditions d'entrée, le calendrier et les récompenses de chaque ` +
          `tournoi sont indiqués sur sa page avant l'inscription et en constituent le ` +
          `règlement.`,
        `Le résultat d'une partie est établi par nos serveurs à partir des actions ` +
          `enregistrées. Un joueur absent à l'heure d'un match, ou qui abandonne, perd ce ` +
          `match. Si un tournoi est annulé avant d'avoir commencé, le ticket utilisé pour ` +
          `s'y inscrire vous est rendu, sans que sa date d'expiration soit repoussée.`,
        `Les récompenses décrites par les présentes Conditions sont des Biens virtuels. ` +
          `Toute dotation d'une autre nature fait l'objet d'un règlement distinct, qui ` +
          `prévaut sur les présentes, et n'est proposée que dans les pays où elle est ` +
          `autorisée.`,
      ],
      todo:
        "À VALIDER PAR UN AVOCAT AVANT TOUTE OUVERTURE : le régime des tournois à ticket " +
        "payant et, surtout, des dotations en euros (qualification de jeu de hasard ou " +
        "d'adresse, autorisations, versement, fiscalité). Ces dotations sont hors du " +
        "présent texte et demandent un règlement dédié.",
    },
    {
      title: "Disponibilité selon le pays",
      body: [
        `Le jeu gratuit est accessible depuis tous les pays. Certaines fonctions — l'achat ` +
          `de pièces d'or, les tickets de tournoi, les enchères et certaines récompenses — ` +
          `ne sont ouvertes que dans certains pays, déterminés d'après votre pays de ` +
          `connexion. La liste de ces pays peut évoluer.`,
        `Lorsqu'une fonction n'est pas ouverte dans votre pays, il est interdit de ` +
          `contourner cette restriction, notamment en masquant votre localisation au moyen ` +
          `d'un VPN ou d'un serveur mandataire.`,
        `Il vous appartient de vérifier que l'usage que vous faites du Service est permis ` +
          `par la loi du pays où vous vous trouvez.`,
      ],
    },
    {
      title: "Règles de conduite",
      body: [`Vous vous engagez à utiliser le Service loyalement. Il est notamment interdit :`],
      items: [
        `de tricher, d'exploiter un bogue ou une faille au lieu de le signaler, ou de ` +
          `modifier le fonctionnement du jeu ;`,
        `d'utiliser un programme, un script ou un robot qui joue ou agit à votre place, ` +
          `ou qui collecte automatiquement des données du Service ;`,
        `de vous entendre avec un autre joueur pour fausser le résultat d'une partie, ` +
          `d'un tournoi ou d'une enchère, ou de perdre volontairement dans ce but ;`,
        `d'abandonner de façon répétée des parties pour nuire à vos adversaires ;`,
        `de harceler, menacer ou insulter d'autres joueurs ou l'équipe du jeu, et de ` +
          `diffuser des propos haineux, discriminatoires, violents, à caractère sexuel ou ` +
          `contraires à la loi, y compris dans un nom de joueur ou un nom de deck ;`,
        `d'usurper l'identité d'un tiers ou de vous faire passer pour un membre de ` +
          `l'équipe du jeu ;`,
        `de tenter d'accéder au Compte d'un autre joueur, à nos systèmes ou à des données ` +
          `qui ne vous sont pas destinées, ou de perturber le Service ;`,
        `d'utiliser un moyen de paiement dont vous n'êtes pas le titulaire légitime, ou ` +
          `de contester de mauvaise foi un paiement dont vous avez reçu la contrepartie.`,
      ],
    },
    {
      title: "Manquements et sanctions",
      body: [
        `En cas de manquement aux Conditions, nous pouvons, selon sa gravité et son ` +
          `caractère répété : vous adresser un avertissement ; modifier un nom ; annuler ` +
          `le résultat d'une partie ou d'un tournoi et retirer les récompenses qui en ` +
          `découlent ; retirer des Biens virtuels obtenus de façon irrégulière ; ` +
          `restreindre l'accès à certaines fonctions ; suspendre le Compte pour une durée ` +
          `déterminée ; le fermer définitivement.`,
        `Sauf lorsque la loi ou la sécurité du Service s'y opposent, nous vous informons ` +
          `de la mesure prise et de ses motifs. Vous pouvez la contester en nous écrivant ` +
          `à l'adresse indiquée à la dernière section ; votre demande est examinée par ` +
          `une personne, et non de façon uniquement automatisée.`,
        `La fermeture d'un Compte pour manquement grave n'ouvre droit à aucune ` +
          `indemnité au titre des Biens virtuels qui y étaient attachés, sans préjudice ` +
          `des droits que la loi vous reconnaît.`,
      ],
    },
    {
      title: "Retours et contenus que vous nous adressez",
      body: [
        `Le Service vous permet de nous adresser des retours (signalement de bogue, idée, ` +
          `avis sur l'équilibrage, question), accompagnés le cas échéant de captures ` +
          `d'écran. Ne nous transmettez que des contenus que vous avez le droit de ` +
          `partager, et n'y faites figurer aucune donnée personnelle d'un tiers.`,
        `Vous nous autorisez à utiliser gratuitement ces retours, sans limite de durée ni ` +
          `de territoire, pour corriger, faire évoluer et améliorer le Service, sans que ` +
          `cela vous ouvre un droit à rémunération. Une première lecture de vos retours ` +
          `peut être assistée par un outil d'intelligence artificielle, dans les ` +
          `conditions décrites par la politique de confidentialité.`,
      ],
    },
    {
      title: "Propriété intellectuelle",
      body: [
        `Le Service et tout ce qui le compose — logiciel, interface, règles, illustrations, ` +
          `textes et noms des cartes, héros, univers, musiques, sons, marques et logos — ` +
          `sont protégés par le droit de la propriété intellectuelle et appartiennent à ` +
          `l'Éditeur ou à ses concédants. L'utilisation du Service ne vous en transfère ` +
          `aucun droit.`,
        `Nous vous concédons, pour la durée de votre Compte, un droit personnel, non ` +
          `exclusif, non cessible et révocable d'accéder au Service et de l'utiliser pour ` +
          `votre usage privé. Toute reproduction, extraction, adaptation ou exploitation ` +
          `commerciale non autorisée est interdite.`,
        `Vous pouvez partager des captures d'écran et des vidéos de vos parties à titre ` +
          `non commercial, ou dans le cadre de la monétisation ordinaire d'une chaîne de ` +
          `diffusion, à condition de ne pas laisser croire à un partenariat avec l'Éditeur ` +
          `et de respecter les règles de conduite.`,
      ],
    },
    {
      title: "Évolution du jeu",
      body: [
        `Un jeu de cartes en ligne vit de son équilibrage. Nous pouvons à tout moment ` +
          `ajouter, modifier ou retirer des cartes, des capacités, des héros, des règles, ` +
          `des formats ou des fonctions, y compris modifier le texte, le coût ou les ` +
          `caractéristiques d'une carte que vous possédez déjà, ou la retirer des formats ` +
          `de jeu. Ces évolutions font partie de la nature du Service et n'ouvrent droit à ` +
          `aucune compensation.`,
        `Lorsqu'une évolution réduit de façon notable un avantage acquis au moyen d'un ` +
          `achat en euros récent, nous vous en informons à l'avance dans la mesure du ` +
          `possible, et vos droits légaux de consommateur demeurent.`,
      ],
    },
    {
      title: "Disponibilité du Service",
      body: [
        `Nous nous efforçons de maintenir le Service accessible et en bon état de ` +
          `fonctionnement, sans garantir une disponibilité continue ni l'absence de ` +
          `toute erreur. Le Service peut être interrompu pour maintenance, mise à jour ou ` +
          `en raison d'un incident, y compris chez l'un de nos prestataires techniques.`,
        `Le Service est conçu pour un navigateur récent et une connexion stable ; la ` +
          `qualité de votre matériel et de votre connexion relève de votre responsabilité. ` +
          `Une déconnexion en cours de partie peut entraîner la perte de celle-ci.`,
      ],
    },
    {
      title: "Responsabilité",
      body: [
        `Nous répondons des dommages directs et prévisibles causés par un manquement à ` +
          `nos obligations. Dans les limites permises par la loi, nous ne répondons pas ` +
          `des dommages indirects, ni des conséquences d'un usage du Service contraire aux ` +
          `Conditions, d'une défaillance de votre matériel ou de votre connexion, du fait ` +
          `d'un tiers ou d'un cas de force majeure.`,
        `En cas de perte de Biens virtuels due à une erreur technique de notre part, notre ` +
          `obligation consiste à les rétablir dans la mesure du possible.`,
        `Aucune stipulation des Conditions n'exclut ni ne limite notre responsabilité ` +
          `lorsque la loi l'interdit, notamment en cas de faute lourde ou de dol, de ` +
          `dommage corporel, ou au détriment des droits que la loi reconnaît aux ` +
          `consommateurs.`,
      ],
    },
    {
      title: "Durée, suppression du Compte et fin du Service",
      body: [
        `Le contrat est conclu pour une durée indéterminée à compter de la création du ` +
          `Compte. Vous pouvez y mettre fin à tout moment, sans motif, en demandant la ` +
          `suppression de votre Compte par email à ${EDITEUR.emailContact}, depuis ` +
          `l'adresse associée au Compte. Nous y donnons suite dans un délai de 30 jours.`,
        `La suppression est définitive : elle entraîne la perte de votre progression, de ` +
          `vos decks et de tous vos Biens virtuels, y compris ceux acquis au moyen d'un ` +
          `achat, sans contrepartie. Le sort de vos données personnelles est décrit par la ` +
          `politique de confidentialité.`,
        `Nous pouvons fermer un Compte resté inactif pendant une longue période, après ` +
          `vous en avoir averti par email dans les conditions prévues par la politique de ` +
          `confidentialité.`,
        `Si nous décidons de mettre fin au Service, nous vous en informons au moins 60 ` +
          `jours à l'avance, par email ou par une annonce dans le Service, et la vente de ` +
          `pièces d'or et de tickets cesse dès cette annonce.`,
      ],
      todo:
        "À VALIDER : la suppression se fait aujourd'hui sur demande par email (aucun bouton " +
        "dans le compte). Préavis de 60 jours en cas d'arrêt du Service et sort de l'or et des " +
        "tickets achetés mais non utilisés à cette date : à arrêter avec l'avocat.",
    },
    {
      title: "Modification des Conditions",
      body: [
        `Nous pouvons modifier les Conditions, notamment pour tenir compte d'une évolution ` +
          `du Service ou de la loi. Toute modification substantielle vous est annoncée au ` +
          `moins 30 jours avant son entrée en vigueur, par email ou par une annonce dans ` +
          `le Service. Si vous la refusez, vous pouvez supprimer votre Compte avant cette ` +
          `date ; continuer à utiliser le Service après celle-ci vaut acceptation.`,
        `Si une stipulation des Conditions est déclarée nulle ou inapplicable, les autres ` +
          `demeurent en vigueur.`,
      ],
    },
    {
      title: "Droit applicable, médiation et juridiction",
      body: [
        `Les Conditions sont régies par le droit luxembourgeois. Si vous êtes un ` +
          `consommateur résidant dans un autre État membre de l'Union européenne, ce choix ` +
          `ne vous prive pas de la protection que vous assurent les dispositions ` +
          `impératives de la loi de votre pays de résidence.`,
        `En cas de différend, écrivez-nous d'abord à ${EDITEUR.emailContact} : nous nous ` +
          `engageons à vous répondre dans un délai de 30 jours. À défaut de solution, ` +
          `vous pouvez saisir gratuitement le ${MEDIATEUR}.`,
        `À défaut d'accord amiable, les tribunaux de Luxembourg-Ville sont compétents, ` +
          `sans préjudice du droit d'un consommateur de saisir le tribunal de son lieu de ` +
          `résidence.`,
      ],
    },
    {
      title: "Contact",
      body: [
        `${EDITEUR.denomination} — ${EDITEUR.siege}.`,
        `Email : ${EDITEUR.emailContact}. Vous pouvez aussi nous écrire depuis votre ` +
          `Compte, par la fonction de retours.`,
      ],
    },
  ],
};
