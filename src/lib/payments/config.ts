// Catalogue payant — CONFIGURATION SERVEUR.
//
// ⚠️ Règle non négociable : le client n'envoie JAMAIS un montant, seulement un
// identifiant. Le prix vit dans Stripe (Products + Prices) et n'est référencé
// ici que par son `price_id`. Ce module est donc la seule passerelle entre « ce
// que le joueur a cliqué » et « ce que Stripe va facturer ».
//
// Corollaire : ne jamais exporter d'ici quoi que ce soit qui serve à CALCULER
// un montant à facturer. Les prix en euros ci-dessous sont de l'AFFICHAGE, et
// le montant réellement encaissé est relu depuis l'événement Stripe au moment
// de créditer (cf. apply_checkout_completed).

/** Paliers de packs de pièces d'or. Placeholders configurables : ajuster les
 *  montants d'or et les prix Stripe une fois le modèle économique arrêté. */
export interface GoldPack {
  /** Code stable, stocké dans `payments.reference` et dans les metadata Stripe. */
  code: string;
  label: string;
  /** Pièces créditées à la réception du webhook. Source unique du crédit. */
  gold: number;
  /** Prix affiché, en centimes. INDICATIF — Stripe fait foi sur le débit. */
  displayPriceCents: number;
  /** Variable d'environnement portant le `price_id` Stripe. */
  priceEnvVar: string;
}

export const GOLD_PACKS: readonly GoldPack[] = [
  { code: "gold_pack_s", label: "Petite bourse",  gold: 200,  displayPriceCents: 199,  priceEnvVar: "STRIPE_PRICE_GOLD_PACK_S" },
  { code: "gold_pack_m", label: "Bourse",         gold: 550,  displayPriceCents: 499,  priceEnvVar: "STRIPE_PRICE_GOLD_PACK_M" },
  { code: "gold_pack_l", label: "Grande bourse",  gold: 1200, displayPriceCents: 999,  priceEnvVar: "STRIPE_PRICE_GOLD_PACK_L" },
];

export function findGoldPack(code: string): GoldPack | undefined {
  return GOLD_PACKS.find((p) => p.code === code);
}

/** Packs de TICKETS DE TOURNOI.
 *
 *  Un ticket est un bien détenu : on l'achète, on le garde jusqu'à un an, et on
 *  le dépense dans le tournoi de son choix. L'inscription elle-même ne passe
 *  donc plus jamais par Stripe.
 *
 *  Le tarif dégressif est ici pour l'AFFICHAGE ; c'est le Price Stripe qui
 *  facture. Les deux doivent rester d'accord à la main. */
export interface TicketPack {
  code: string;
  label: string;
  /** Nombre de tickets crédités à la réception du webhook. */
  tickets: number;
  displayPriceCents: number;
  priceEnvVar: string;
}

export const TICKET_PACKS: readonly TicketPack[] = [
  { code: "ticket_pack_s", label: "Ticket unique",   tickets: 1,  displayPriceCents: 250,  priceEnvVar: "STRIPE_PRICE_TICKET_PACK_S" },
  { code: "ticket_pack_m", label: "Carnet de 5",     tickets: 5,  displayPriceCents: 1150, priceEnvVar: "STRIPE_PRICE_TICKET_PACK_M" },
  { code: "ticket_pack_l", label: "Carnet de 12",    tickets: 12, displayPriceCents: 2500, priceEnvVar: "STRIPE_PRICE_TICKET_PACK_L" },
];

export function findTicketPack(code: string): TicketPack | undefined {
  return TICKET_PACKS.find((p) => p.code === code);
}

export function publicTicketPacks() {
  return TICKET_PACKS.map(({ code, label, tickets, displayPriceCents }) => ({
    code, label, tickets, displayPriceCents,
  }));
}

/** Durée de validité d'un ticket, en jours. La base porte la même valeur en
 *  défaut de `grant_tournament_tickets` ; elle est passée explicitement à
 *  chaque octroi pour que la règle se lise ici, du côté du catalogue. */
export const TICKET_VALIDITY_DAYS = 365;

/** Prix Stripe de l'entrée en tournoi — CHEMIN HISTORIQUE.
 *
 *  Plus aucun code n'ouvre de session avec ce prix : on n'achète plus une place,
 *  on achète des tickets. Conservé pour que le Price Stripe existant reste
 *  identifiable, et parce que des paiements passés le référencent. */
export const TOURNAMENT_ENTRY_PRICE_ENV = "STRIPE_PRICE_TOURNAMENT_ENTRY";

/** Durée de vie d'une session Checkout. Courte volontairement : au-delà, la
 *  place réservée en tournoi n'aurait plus de sens, et un `checkout.session.expired`
 *  vient nettoyer le paiement en attente. Stripe impose un minimum de 30 min. */
export const CHECKOUT_EXPIRY_MINUTES = 30;

/** Lit un `price_id` d'environnement, en échouant BRUYAMMENT s'il manque.
 *  Une session créée avec un price vide partirait en erreur Stripe opaque ;
 *  autant nommer la variable absente. */
export function requirePriceId(envVar: string): string {
  const v = process.env[envVar];
  if (!v) throw new Error(`Prix Stripe non configuré : ${envVar} est absent de l'environnement.`);
  return v;
}

/** Le catalogue tel qu'il peut être envoyé au NAVIGATEUR : aucun `price_id`,
 *  aucune variable d'environnement. */
export function publicGoldPacks() {
  return GOLD_PACKS.map(({ code, label, gold, displayPriceCents }) => ({
    code, label, gold, displayPriceCents,
  }));
}
