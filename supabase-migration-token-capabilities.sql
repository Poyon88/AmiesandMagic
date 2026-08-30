-- Tokens : effets COMPOSÉS, comme sur une carte classique.
--
-- Un template de token ne pouvait porter que des mots-clés du registre
-- (`keywords` + le sidecar `keyword_instances`). Tout ce que l'éditeur composé
-- sait exprimer — infliger X dégâts à toutes les créatures adverses, conférer
-- une capacité, invoquer, renvoyer en main — lui était fermé. Un jeton ne
-- pouvait donc jamais faire autre chose que ce qu'un mot-clé existant nommait.
--
-- Même contrat que `cards.capabilities` : un tableau de Capability, dont les
-- entrées composées portent `composed: { content, magnitude, target }`.
-- `applyTokenTemplate` le recopie sur la carte de l'instance invoquée, et
-- `getCapabilities` le lit sans faire aucune différence avec une créature —
-- c'est déjà le cas pour `keyword_instances`, rien de neuf côté moteur.
--
-- POURQUOI PAS DANS `cards` : un token n'est jamais possédé, pioché,
-- collectionné ni vendu. `cards` est la table de la POSSESSION — vingt-quatre
-- surfaces l'interrogent (collection, decks, enchères, boutique, vitrine,
-- boosters, analytics, prints). Y ranger les tokens obligerait chacune à les
-- exclure, et en oublier une mettrait un jeton dans un booster ou aux enchères,
-- sans rien pour le signaler. Même raisonnement que les sets « spéciaux », qui
-- filtrent à la construction du pool plutôt que dans les huit résolveurs.
--
-- CONTRAINTE DU MODÈLE : un token n'entre jamais en jeu par `playCard`. Le
-- déclencheur « à l'entrée » ne partira donc JAMAIS, et l'éditeur ne le propose
-- pas (cf. TOKEN_FIRING_MODES : mort, activation, retour, fin de tour, attaque,
-- bas PV). Une capacité composée on-play sur un jeton serait muette.
--
-- Colonne NULLABLE et additive : les templates existants restent valides.
-- Idempotent : réexécutable sans risque.

ALTER TABLE token_templates
  ADD COLUMN IF NOT EXISTS capabilities jsonb;

COMMENT ON COLUMN token_templates.capabilities IS
  'Effets composés du token : tableau de Capability, même contrat que cards.capabilities. Le déclencheur « à l''entrée » y est sans effet — un token ne passe pas par playCard. Null = aucun effet composé.';
