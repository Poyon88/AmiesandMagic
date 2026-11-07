-- Impact ne vise plus que les ennemis : textes des 2 pouvoirs de héros concernés.
-- À appliquer après le déploiement du code. Rejouable : ne porte que sur l'ancien texte.
UPDATE heroes SET power_description = 'Inflige 1 dégât à une cible ennemie'
 WHERE id = 24 AND power_description = 'Inflige 1 dégât à une cible';
UPDATE heroes SET power_description = 'Inflige 2 points de dégâts à une cible ennemie'
 WHERE id = 28 AND power_description = 'Inflige 2 points de dégâts à une cible';
