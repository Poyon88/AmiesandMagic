-- Tokens : sidecar de capacités, même forme que `cards.keyword_instances`.
--
-- Jusqu'ici un template de token ne pouvait porter que `keywords text[]` : pas
-- de valeur X, donc toutes les capacités scalables (Résistance X, Riposte X,
-- Carnage X…) retombaient sur le défaut du moteur, dérivé du coût en mana —
-- lequel vaut 0 pour un jeton, d'où un X écrasé à 1 quoi qu'il arrive.
--
-- Chaque entrée reprend le contrat de `cards.keyword_instances` :
--   { "id": "<keyword-id>", "x": <int>, "y": <int>, "mode": "<déclencheur>" }
-- `mode` n'est pas encore écrit par l'éditeur de tokens (lot « déclencheurs »),
-- mais la colonne l'accepte déjà : le moteur ne fait aucune différence entre le
-- sidecar d'une carte et celui d'un token, `applyTokenTemplate` le recopie tel
-- quel sur la carte de l'instance invoquée et `getCapabilities` en dérive les
-- capacités comme pour n'importe quelle créature.
--
-- Colonne NULLABLE et additive : les 32 templates existants restent valides,
-- leurs mots-clés gardent leur déclencheur naturel et leur X par défaut.

ALTER TABLE token_templates
  ADD COLUMN IF NOT EXISTS keyword_instances jsonb;

COMMENT ON COLUMN token_templates.keyword_instances IS
  'Sidecar des capacités du token : tableau de { id, x?, y?, mode? }, même contrat que cards.keyword_instances. Null = aucune valeur explicite (déclencheur naturel, X par défaut).';
