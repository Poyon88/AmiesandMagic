-- Redénomination de l'or : tous les tarifs en or divisés par 10, à prix en euros
-- inchangé (arbitrage de l'auteur, 2026-11-06).
--
-- Les packs (src/lib/payments/config.ts) et les planchers de mise
-- (src/lib/auction/pricing.ts) vivent dans le code ; seuls les tarifs stockés en
-- base sont repris ici.
--
-- NE TOUCHE PAS aux soldes `wallets.balance`, ni à l'historique
-- (wallet_transactions, payments, auctions) : choix explicite de l'auteur.
--
-- Rejouable : chaque UPDATE ne s'applique qu'à l'ancienne valeur, un second
-- passage ne redivise donc rien, et un tarif déjà ajusté à la main est respecté.

BEGIN;

ALTER TABLE faction_shop_settings ALTER COLUMN faction_price SET DEFAULT 120;
ALTER TABLE faction_shop_settings ALTER COLUMN bundle_price  SET DEFAULT 230;

UPDATE faction_shop_settings SET faction_price = 120, updated_at = now()
 WHERE id = 1 AND faction_price = 1200;
UPDATE faction_shop_settings SET bundle_price = 230, updated_at = now()
 WHERE id = 1 AND bundle_price = 2300;
UPDATE auction_settings SET min_bid_increment = 1, updated_at = now()
 WHERE id = 1 AND min_bid_increment = 10;

COMMIT;
