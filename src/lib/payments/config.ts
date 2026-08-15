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

/** Prix Stripe de l'entrée en tournoi payant (2,50 €). Un seul produit pour
 *  tous les tournois : le tarif est uniforme, et le tournoi visé voyage dans
 *  les metadata. */
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
