-- DURCISSEMENT de la boutique de factions — à passer UNE fois sur une base où
-- `supabase-migration-faction-shop.sql` a déjà été appliquée (prod, 2026-08-16).
--
-- Le correctif est intégré au fichier de migration principal pour les futurs
-- déploiements ; celui-ci n'existe que pour rattraper la base déjà migrée.
--
-- Ce qu'il corrige : `sync_starter_faction_unlock` est une fonction de TRIGGER,
-- mais Supabase accorde EXECUTE à `anon` et `authenticated` par défaut, ce qui
-- l'expose sur /rest/v1/rpc/. Sans danger réel — appelée hors trigger elle
-- échoue faute de NEW — mais c'est de la surface offerte pour rien, et l'audit
-- de sécurité la signale (lints 0028 et 0029).
--
-- Ce qu'il NE change PAS : aucune donnée, aucun droit de joueur, aucun tarif.
-- Le trigger appelle la fonction en interne et n'est pas concerné par la
-- révocation.

ALTER FUNCTION sync_starter_faction_unlock() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION sync_starter_faction_unlock() FROM anon, authenticated;

-- Vérification : les deux colonnes doivent renvoyer `false`.
SELECT
  has_function_privilege('anon',          'sync_starter_faction_unlock()', 'EXECUTE') AS anon_peut_encore,
  has_function_privilege('authenticated', 'sync_starter_faction_unlock()', 'EXECUTE') AS connecte_peut_encore;
