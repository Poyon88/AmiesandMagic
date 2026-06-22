// Feature flags for the auction house / marketplace.

// Vente de cartes par les joueurs (revente). Désactivée par défaut pour éviter
// l'assimilation à un jeu d'argent ; la fonctionnalité reste dans le code et se
// réactive en posant NEXT_PUBLIC_MARKETPLACE_SELLING_ENABLED="true" (préfixe
// NEXT_PUBLIC_ => lisible côté client ET serveur). L'achat/les enchères et la
// mise en vente par un admin (seller_type='admin') ne sont pas concernés.
export function isPlayerSellingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MARKETPLACE_SELLING_ENABLED === "true";
}
