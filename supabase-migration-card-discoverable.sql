-- ============================================
-- Armies & Magic — Carte « non découvrable »
-- Execute this in Supabase SQL Editor
-- ============================================

-- Une carte non découvrable est écartée des TIRAGES : offres de Sélection,
-- Invocation X, Invocations multiples, Déchainement, Concentration, Épargne.
-- Elle reste collectionnable, deck-able, piochable et jouable — seules les
-- offres que le joueur n'a pas construites lui-même l'ignorent. Même règle que
-- les sets « spéciaux » (cf. excludeSpecialSets), mais à la carte.
--
-- DÉFAUT `true` : les 699 cartes existantes restent découvrables, et une carte
-- créée sans y penser l'est aussi. NOT NULL pour qu'aucune ligne ne porte un
-- `null` dont le sens se discuterait ensuite.
ALTER TABLE cards ADD COLUMN discoverable BOOLEAN NOT NULL DEFAULT true;

-- Index partiel : seules les cartes EXCLUES sont indexées. Elles sont une
-- poignée face à des centaines de cartes, et c'est le seul cas que le filtre
-- interroge.
CREATE INDEX idx_cards_non_discoverable ON cards (id) WHERE discoverable = false;
