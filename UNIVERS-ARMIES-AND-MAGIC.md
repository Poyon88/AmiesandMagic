# Armies & Magic — Guide de l'univers et des règles

> Document de référence pour comprendre l'univers d'**Armies & Magic** : les factions, les races, les clans, les alignements, l'ensemble des capacités (pouvoirs), les règles de partie et de construction de deck, ainsi que **les pouvoirs le plus souvent associés à chaque faction / race / clan**.
>
> Source : extrait du code du jeu (`src/lib/card-engine/constants.ts`, `src/lib/game/abilities.ts`, `src/lib/game/constants.ts`, `deck-rules.ts`). C'est la source de vérité du design.

> ## 🔧 Statut de la refonte « factions & clans » — ✅ TERMINÉE (session du 2026-07-18)
>
> Refonte achevée sur le principe : chaque faction a un petit nombre de clans (souvent 3–4), et **chaque clan a un profil distinct** (poids de stats + table de pouvoirs propre), comme les clans élémentaires.
>
> **✅ Toutes les factions sont finalisées :**
> - **Royaumes Libres** (code `Humains`) → Le Royaume du Nord, L'Ordre de l'Aube, Les Guerrières du Vent, La Sublime Porte
> - **Empire du Milieu** (code `EmpireDuMilieu`) → Les Hordes des Steppes, L'Empire de Jade, Les Lames de l'Ombre, Les Défenseurs d'Ivoire
> - **Royaumes du Soleil** (code `RoyaumesDuSoleil`) → Les Enfants du Soleil, Les Seigneurs des Dunes, Le Royaume des Masques, Les Fils du Volcan
> - **Elfes / L'Alliance Céleste** → Les Sylvains, Les Hauts-Elfes, La Forêt d'Émeraude, **La Combe Verte** (la faction Hobbits est absorbée ici) ; Aigles Géants = race libre
> - **Nains / La Confrérie de la Forge** → Les Gardiens de la Montagne, La Forge Ardente, Les Sentinelles d'Airain (Golems), **La Guilde des Ingénieurs** (Gnomes — nouvelle race). *Les Marteaux des Collines sont dissous (2 clans nains max).*
> - **Hommes-Bêtes / La Meute** → Les Seigneurs Fauves, Les Enfants de la Lune, Le Pacte des Griffes, La Harde Sauvage, **La Forêt Enchantée** (Mimis)
> - **Les Légions du Chaos** (ex-Elfes Noirs, **absorbe la faction Orcs**) → Les Cohortes Sanglantes (Orcs/Gobelins/Trolls/Wargs), Les Princes des Abîmes (Démons), La Forêt Maudite (Elfes Corrompus + Araignées), La Garde Noire (Guerriers du Chaos — nouvelle race)
> - **Morts-Vivants / La Nécropole** → Les Rangs Silencieux, Le Voile Hurlant, La Cour Écarlate, Le Cénacle Nécromant
> - **Élémentaires** → La Colère des Flammes (Feu), Le Socle du Monde (Terre), La Vague Sans Fin (Eau), Le Souffle des Cimes (Air)
> - **Mercenaires** → sans clan (confirmé)
>
> **Nombre de factions : 10** (les 10 d'origine + Empire du Milieu + Royaumes du Soleil − Hobbits absorbée dans les Elfes − Orcs absorbée dans les Légions du Chaos).
>
> *Cette refonte décrit la cible de design ; le code (`constants.ts`) doit être mis à jour — voir §11.*

---

## 1. Le jeu en bref

Armies & Magic est un jeu de cartes à collectionner (TCG) tour par tour. Chaque joueur incarne un **héros** doté d'un pouvoir, et affronte l'adversaire avec un deck de créatures et de sorts.

| Constante | Valeur |
|---|---|
| Points de vie du héros | **30 PV** |
| Taille du deck | **50 cartes** |
| Main de départ | **4 cartes** |
| Taille max de la main | **8 cartes** |
| Créatures max sur le terrain | **8** |
| Mana de départ | **0** (puis +1/tour) |
| Mana maximum | **10** |
| Pioche par tour | **1 carte** |
| Timer de tour | **90 s** |
| Timer de mulligan | **45 s** |
| Copies max d'une même carte | **3** (Commune) / **1** (Rare et au-dessus) |
| Occurrences max d'une même capacité dans un deck | **12** (Vol exempté) |

**Boucle de jeu** : on gagne du mana chaque tour, on invoque des créatures et on lance des sorts, on attaque les créatures adverses ou directement le héros. Réduire le héros adverse à 0 PV = victoire.

**Zones importantes** : Terrain (jeu), Main, Cimetière (defausse/mortes), Pioche (deck). De nombreuses capacités interagissent avec le cimetière.

---

## 2. Les alignements

Chaque faction possède un alignement moral. **Un deck ne peut pas mélanger une faction Bonne et une faction Maléfique** (conflit d'alignement). Les factions Neutres et les Mercenaires cohabitent avec tout le monde.

| Alignement | Emoji | Factions concernées |
|---|---|---|
| **Bon** ✨ | 🌿⚒️ | Elfes (Alliance Céleste, inclut désormais les Hobbits), Nains |
| **Neutre** ⚖️ | ⚔️🏯☀️🐺🌀 | Royaumes Libres, Empire du Milieu, Royaumes du Soleil, Hommes-Bêtes, Élémentaires |
| **Maléfique** 💀 | 💀🔮 | Morts-Vivants, Les Légions du Chaos |
| **Spéciale** 💰 | 💰 | Mercenaires (jouables dans **tous** les decks) |

L'alignement pilote aussi certaines capacités comme **Sélection** (pioche parmi les factions du même alignement que la carte).

---

## 3. Les 10 factions

Chaque faction a un **nom de code interne** (utilisé en base et dans le moteur, ex. `Elfes`) et un **nom affiché** au joueur (ex. « L'Alliance Céleste »). Les *pouvoirs privilégiés* sont les capacités que le générateur attribue le plus souvent aux cartes de la faction ; les *pouvoirs interdits* n'apparaissent jamais sur ces cartes.

> **Note refonte** : tous les clans ont désormais un **profil distinct** ; les pouvoirs « niveau faction » ci-dessous servent d'**ombrelle / pool de repli**, et l'essentiel de l'identité de jeu vient du **profil de clan** (§5). En cas de conflit, le profil de clan prime (y compris pour élargir un pouvoir interdit — cf. Ancré/Provocation chez les Elfes, Provocation/Régénération dans les Légions du Chaos).

### 3.1 🌿 Elfes — « L'Alliance Céleste » — *Bon*
- **Races** : Elfes · Fées · **Aigles Géants** (race libre, disponible dans tous les clans) · **Hobbits** · **Hommes-Arbres**
- **Clans** : Les Sylvains, Les Hauts-Elfes (Elfes) · La Forêt d'Émeraude (Fées) · La Combe Verte (Hobbits + Hommes-Arbres) — profils distincts en §5.3
- **Philosophie** : L'alliance du bon peuple des bois — elfes agiles et furtifs, fées mages, et désormais les hobbits rusés et leurs colosses Hommes-Arbres. Poids stats faction (ombrelle) : 1.05 / 0.85.
- **Pouvoirs privilégiés (ombrelle)** : Traque (0.50), Esquive (0.50), Précision (0.45), Divination (0.45), Augure (0.40), Canalisation (0.40), Invisible (0.40), Contresort (0.35), Première Frappe (0.35), Loyauté (0.35), Bénédiction (0.30), Vol (0.20).
- **Pouvoirs interdits** : Armure, Gloire +X/+Y, Nécrophagie, Pillage X, Carnage X. *(Ancré et Provocation, autrefois interdits, sont désormais autorisés pour accueillir les Hommes-Arbres.)*

### 3.2 ⚒️ Nains — « La Confrérie de la Forge » — *Bon*
- **Races** : Nains · Golems · **Gnomes**
- **Clans** : Les Gardiens de la Montagne, La Forge Ardente (Nains) · Les Sentinelles d'Airain (Golems) · **La Guilde des Ingénieurs** (Gnomes) — profils distincts en §5.4. *Les Marteaux des Collines sont dissous (limite de 2 clans nains).*
- **Philosophie** : Solides et résistants. Défense et ténacité avant tout. Poids stats faction (ombrelle) : ATK faible, défense très élevée (0.85 / 1.40).
- **Pouvoirs privilégiés (ombrelle)** : Armure (0.70), Résistance X (0.65), Bouclier (0.50), Riposte X (0.50), Ancré (0.45), Provocation (0.40), Bravoure (0.40), Catalyse (0.40), Gloire +X/+Y (0.35), Tactique X (0.25).
- **Pouvoirs interdits** : Vol, Invisible, Esquive, Ombre, Traque, Pillage X.

### 3.3 ⚔️ Royaumes Libres — code interne `Humains` — *Neutre*
- **Races** : Humains · **Griffons** · **Faucons** *(nouvelles races ailées — profils en §4)*
- **Clans** : **Le Royaume du Nord** (ex-Nordiques), **L'Ordre de l'Aube** (ex-Templiers), **Les Guerrières du Vent** (ex-Amazones), **La Sublime Porte** (Empire ottoman — élite à poudre) — profils distincts en §5.2. Les clans étant transversaux (`appliesTo: "all"`), Griffons et Faucons sont jouables dans les quatre.
- **Philosophie** : Le vieux continent. Honneur, acier et champions héroïques, épaulés par leurs alliés ailés : le griffon héraldique, monture noble des chevaliers, et le faucon de chasse, éclaireur des armées libres. Équilibrés et polyvalents, synergies de groupe. Poids stats faction (ombrelle) : équilibré (1.00 / 1.00).
- **Pouvoirs privilégiés (ombrelle)** : Loyauté (0.55), Commandement (0.55), Bravoure (0.50), Bénédiction (0.45), Bouclier (0.45), Première Frappe (0.45), Tactique X (0.35), Héritage X (0.30), Provocation (0.30), Convocation X (0.30).
- **Pouvoirs interdits** : Poison, Corruption, Maléfice, Pacte de sang, Nécrophagie.

### 3.4 🏯 Empire du Milieu — code interne `EmpireDuMilieu` — *Neutre* *(nouvelle)*
- **Races** : Humains
- **Clans** : **Les Hordes des Steppes** (Mongols), **L'Empire de Jade** (Chine antique), **Les Lames de l'Ombre** (Japon féodal — samouraïs & ninjas), **Les Défenseurs d'Ivoire** (Khmer/Angkor — éléphants de guerre) — profils distincts en §5.2
- **Philosophie** : Stratégie et contrôle. Discipline, formations, mysticisme et furtivité — la faction qui joue au tour d'avance. Poids stats faction (ombrelle) : légèrement défensif (0.95 / 1.10).
- **Pouvoirs privilégiés (ombrelle)** : Tactique X (0.50), Divination (0.45), Contresort (0.40), Provocation (0.40), Première Frappe (0.40), Augure (0.35), Convocation X (0.35), Célérité (0.30), Traque (0.30).
- **Pouvoirs interdits** : Poison, Corruption, Maléfice, Pacte de sang, Nécrophagie.
- **Migration** : les anciennes cartes du clan **Orientaux** (ex-faction Humains) basculent vers **Les Lames de l'Ombre**.

### 3.5 ☀️ Royaumes du Soleil — code interne `RoyaumesDuSoleil` — *Neutre* *(nouvelle)*
- **Races** : Humains
- **Clans** : **Les Enfants du Soleil** (Incas — rituel/sacrifice), **Les Seigneurs des Dunes** (Touaregs — razzia/mobilité), **Le Royaume des Masques** (Yoruba/Bénin — esprits/soutien), **Les Fils du Volcan** (Polynésie — feu tribal) — profils distincts en §5.2
- **Philosophie** : Soleil, désert et esprits. Trois voies marquées : le brasier rituel qui sacrifie ses unités, le nomade qui harcèle et pille, l'invocateur qui appelle les esprits. Poids stats faction (ombrelle) : équilibré (1.02 / 1.03).
- **Pouvoirs privilégiés (ombrelle)** : Bénédiction (0.45), Convocation X (0.45), Bravoure (0.40), Sacrifice (0.35), Héritage X (0.35), Résistance X (0.35), Divination (0.30), Pillage X (0.30).
- **Pouvoirs interdits** : Poison, Corruption, Maléfice, Pacte de sang, Nécrophagie.

### 3.6 🐺 Hommes-Bêtes — « La Meute » — *Neutre*
- **Races** : Hommes-Loups · Hommes-Ours · Hommes-Félins · Centaures · Mimis · Hommes-Chiens · Hommes-Renards · Hommes-Cerfs
- **Clans** : Les Seigneurs Fauves (Félins), Les Enfants de la Lune (Ours + Loups), Le Pacte des Griffes (Chiens + Renards, ouvert à toutes races), La Harde Sauvage (Centaures + Cerfs), **La Forêt Enchantée** (Mimis) — profils distincts en §5.5
- **Philosophie** : Sauvages et féroces. Attaquent vite, régénèrent, entrent en rage. Poids stats faction (ombrelle) : ATK élevée (1.20 / 1.00).
- **Pouvoirs privilégiés (ombrelle)** : Traque (0.65), Gloire +X/+Y (0.55), Fureur (0.55), Première Frappe (0.45), Régénération (0.40), Bravoure (0.40), Combustion (0.35), Esquive (0.35), Persécution X (0.30), Augure (0.30), Vol (0.20).
- **Pouvoirs interdits** : Armure, Commandement, Invisible, Ancré, Canalisation, Contresort.

### 3.7 🌀 Élémentaires — « Les Primordiaux » — *Neutre*
- **Race** : Élémentaire (unique)
- **Clans** : **La Colère des Flammes** (Feu) · **Le Socle du Monde** (Terre) · **La Vague Sans Fin** (Eau) · **Le Souffle des Cimes** (Air) — clans à style de combat distinct (voir §5.1).
- **Philosophie** : Forces primordiales de la nature. Chaque élément a son propre style. Poids stats : équilibré (1.10 / 1.10).
- **Pouvoirs privilégiés (niveau faction)** : Canalisation (0.45), Fureur (0.40), Résistance X (0.40), Métamorphose (0.35), Régénération (0.35), Esquive (0.35), Permutation (0.30), Mimique (0.30), Carnage X (0.30).
- **Pouvoirs interdits** : Loyauté, Commandement, Bouclier, Pillage X.

### 3.8 💰 Mercenaires — *Spéciale (jouables partout)*
- **Races** : Géants · Ogres · Dragons · Chiens · Phoenix · Anges · Ours · Loups · Fauves
- **Clans** : aucun *(reste sans clan — à confirmer)*
- **Philosophie** : Soldats de fortune sans allégeance, disponibles pour **tous** les decks (dans la limite du quota Mercenaires). Chaque race a un profil marqué (voir §4). Poids stats : équilibré (1.05 / 1.05). L'alignement se choisit carte par carte (`card_alignment`).
- **Pouvoirs privilégiés (niveau faction)** : Mimique (0.40), Métamorphose (0.40), Traque (0.40), Première Frappe (0.40), Précision (0.35), Bravoure (0.30), Esquive (0.30), Gloire +X/+Y (0.30), Fureur (0.25), Bouclier (0.25), Combustion (0.25), Vol (0.15).
- **Pouvoirs interdits** : Commandement, Loyauté, Domination, Corruption.

### 3.9 💀 Morts-Vivants — « La Nécropole » — *Maléfique*
- **Races** : Squelettes · Zombies · Spectres · Vampires · Lich · Banshees
- **Clans** : **Les Rangs Silencieux** (Squelettes + Zombies), **Le Voile Hurlant** (Spectres + Banshees), **La Cour Écarlate** (Vampires), **Le Cénacle Nécromant** (Liches) — profils distincts en §5.6
- **Philosophie** : Insatiables et corrompus. Résurrection, drain de vie, exploitation du cimetière. Quatre voies : la nuée qui revient sans cesse, les intangibles qui terrorisent, les prédateurs qui drainent, les nécromanciens qui recyclent. Poids stats faction (ombrelle) : légèrement offensif (1.05 / 0.95).
- **Pouvoirs privilégiés (ombrelle)** : Poison (0.65), Drain de vie (0.60), Nécrophagie (0.55), Terreur (0.55), Rappel (0.55), Exhumation X (0.55), Maléfice (0.50), Ombre du passé (0.50), Profanation X (0.50), Vampirisme X (0.50), Régénération (0.45), Héritage du cimetière (0.45), Résurrection (0.40), Pacte de sang (0.40), Convocation X (0.40), Liaison de vie (0.35), Corruption (0.30), Domination (0.30), Vol (0.15).
- **Pouvoirs interdits** : Loyauté, Commandement, Bouclier, Bénédiction, Bravoure.

### 3.10 🔮 Les Légions du Chaos — *Maléfique* *(ex-Elfes Noirs « L'Engeance du Chaos », absorbe la faction Orcs)*
- **Races** : Orcs · Gobelins · Trolls · Wargs · Démons · Elfes Corrompus · Araignées Géantes · **Guerriers du Chaos** (nouvelle race)
- **Clans** : **Les Cohortes Sanglantes** (Orcs + Gobelins + Trolls + Wargs), **Les Princes des Abîmes** (Démons), **La Forêt Maudite** (Elfes Corrompus + Araignées Géantes), **La Garde Noire** (Guerriers du Chaos) — profils distincts en §5.7
- **Philosophie** : Toutes les forces du Chaos rassemblées sous une même bannière : la horde organisée qui déferle par vagues, la cour démoniaque du sacrifice et de la terreur, les corrompus du poison et de l'ombre, et l'élite lourde des champions déchus. Poids stats faction (ombrelle) : offensif (1.15 / 0.90).
- **Pouvoirs privilégiés (ombrelle)** : Fureur (0.50), Traque (0.50), Gloire +X/+Y (0.45), Poison (0.45), Sacrifice (0.45), Terreur (0.45), Invisible (0.40), Ombre (0.40), Malédiction (0.40), Pillage X (0.40), Persécution X (0.40), Carnage X (0.35), Maléfice (0.35), Pacte de sang (0.35), Drain de vie (0.35), Corruption (0.30), Convocation X (0.30), Domination (0.30), Vol (0.20).
- **Pouvoirs interdits** : Loyauté, Commandement, Bouclier, Bénédiction, Bravoure. *(Provocation et Régénération, autrefois interdites côté Elfes Noirs/Orcs, sont désormais **autorisées** — notamment pour les Trolls et la Garde Noire.)*
- **Migration** : les anciennes cartes de la faction **Orcs** basculent vers **Les Cohortes Sanglantes** ; les anciens clans transversaux (Abysses souterrains, Cités de cendres) sont dissous ; la Forêt maudite est recyclée comme clan des Elfes Corrompus.

---

## 4. Pouvoirs par **race** (profils de race)

Certaines factions différencient leurs races par un profil de pouvoirs propre (qui affine ou remplace le profil de la faction). Voici ces races et leurs pouvoirs signature.

| Faction | Race | Style (ATK/DEF) | Pouvoirs signature |
|---|---|---|---|
| Elfes | **Aigles Géants** *(race libre)* | 1.20 / 0.70 | Vol (0.90), Traque (0.60), Première Frappe (0.50), Augure (0.40) |
| Elfes | **Fées** | 0.75 / 0.65 | Vol (0.85), Invisible (0.70), Esquive (0.65), Canalisation (0.60), Augure (0.55), Divination (0.50), Drain de vie (0.45), Contresort (0.40), Héritage X (0.35) |
| Elfes | **Hommes-Arbres** | 0.90 / 1.50 | Provocation (0.60), Ancré (0.55), Régénération (0.40), Riposte X (0.35) |
| Nains | **Golems** | 0.90 / 1.60 | Ancré (0.80), Armure (0.75), Provocation (0.60), Riposte X (0.45), Indestructible (0.30) |
| Royaumes Libres | **Griffons** | 1.25 / 1.00 | Vol (0.90 — garanti par le générateur), Première Frappe (0.50), Bravoure (0.45), Loyauté (0.40), Célérité (0.35) |
| Royaumes Libres | **Faucons** | 1.15 / 0.65 | Vol (0.90 — garanti par le générateur), Célérité (0.60), Traque (0.55), Esquive (0.50), Précision (0.45), Augure (0.35) |
| Mercenaires | **Géants** | 1.15 / 1.30 | Provocation (0.65), Résistance X (0.60), Armure (0.55), Indestructible (0.45), Terreur (0.40), Carnage X (0.30) |
| Mercenaires | **Ogres** | 1.25 / 1.10 | Gloire +X/+Y (0.55), Fureur (0.50), Provocation (0.40), Résistance X (0.35), Pillage X (0.30) |
| Mercenaires | **Dragons** | 1.40 / 0.90 | Vol (0.90), Souffle de feu X (0.70), Terreur (0.60), Fureur (0.50), Indestructible (0.40), Transcendance (0.35), Vampirisme X (0.25) |
| Mercenaires | **Chiens** | 1.10 / 0.80 | Raid (0.70), Instinct de meute X (0.60), Traque (0.55), Loyauté (0.50), Esquive (0.40), Gloire +X/+Y (0.35), Première Frappe (0.30) |
| Mercenaires | **Phoenix** | 1.20 / 0.95 | Vol (0.80), Résurrection (0.70), Souffle de feu X (0.55), Régénération (0.50), Cycle éternel (0.45), Bouclier (0.40), Gloire +X/+Y (0.35), Fureur (0.30) |
| Mercenaires | **Anges** | 1.10 / 1.15 | Vol (0.85), Bouclier (0.60), Bénédiction (0.55), Commandement (0.50), Première Frappe (0.45), Drain de vie (0.40), Provocation (0.35), Résistance X (0.30) |
| Mercenaires | **Ours** | 1.20 / 1.25 | Provocation (0.55), Gloire +X/+Y (0.50), Résistance X (0.45), Lycanthropie X (0.45), Fureur (0.40), Régénération (0.35) |
| Mercenaires | **Loups** | 1.15 / 0.90 | Traque (0.60), Raid (0.55), Instinct de meute X (0.50), Lycanthropie X (0.45), Esquive (0.40), Gloire +X/+Y (0.35) |
| Mercenaires | **Fauves** | 1.20 / 0.95 | Traque (0.65), Esquive (0.55), Première Frappe (0.50), Précision (0.45), Bravoure (0.40), Gloire +X/+Y (0.35), Raid (0.30), Invisible (0.25) |
| Légions du Chaos | **Démons** | 1.35 / 0.80 | Fureur (0.65), Sacrifice (0.55), Terreur (0.50), Persécution X (0.45), Ombre (0.45), Carnage X (0.40), Vol (0.30) |
| Légions du Chaos | **Araignées Géantes** | 1.10 / 0.90 | Poison (0.75), Esquive (0.50), Invisible (0.45) |

> Les races non listées (Elfes « de base », Nains « de base », Gnomes, Hobbits, **Humains** — commun aux 3 factions humaines, les 8 races Hommes-Bêtes, Squelettes/Zombies/Spectres/Vampires/Lich/Banshees, Orcs/Gobelins/Trolls/Wargs, Elfes Corrompus, Guerriers du Chaos) **héritent du profil de leur clan** (§5) ou, à défaut, de leur faction (§3).

---

## 5. Pouvoirs par **clan**

✅ **Point de design (final)** : après la refonte, **tous les clans ont un profil distinct** (poids de stats + table de pouvoirs propre). Les synergies de clan (**Fierté du clan**, **Appel du clan**, **Appel Suprême**) et la règle « un seul clan par deck » (§6) s'appliquent à tous.

### 5.1 Clans élémentaires (profils distincts)

| Clan | Style (ATK/DEF) | Pouvoirs signature |
|---|---|---|
| 🔥 **La Colère des Flammes** *(Feu)* | 1.40 / 0.75 | Fureur (0.70), Souffle de feu X (0.60), Gloire +X/+Y (0.50), Combustion (0.50), Carnage X (0.40), Sacrifice (0.35) |
| 🪨 **Le Socle du Monde** *(Terre)* | 0.85 / 1.50 | Provocation (0.70), Armure (0.65), Ancré (0.60), Résistance X (0.55), Riposte X (0.45), Indestructible (0.30) |
| 💧 **La Vague Sans Fin** *(Eau)* | 0.90 / 1.10 | Régénération (0.65), Drain de vie (0.55), Paralysie (0.50), Esquive (0.50), Résistance X (0.40), Bénédiction (0.35) |
| 🌬️ **Le Souffle des Cimes** *(Air)* | 1.15 / 0.85 | Vol (0.80), Traque (0.65), Célérité (0.50), Esquive (0.45), Première Frappe (0.40), Augure (0.35) |

### 5.2 Factions humaines (profils distincts)

**⚔️ Royaumes Libres**

| Clan | Inspiration | Style | Identité | Pouvoirs signature |
|---|---|---|---|---|
| ❄️ **Le Royaume du Nord** | Nordiques/vikings | 1.15/0.90 | Bélier agressif, raids | Gloire +X/+Y (0.55), Bravoure (0.50), Raid (0.50), Première Frappe (0.45), Célérité (0.40), Pillage X (0.35), Combustion (0.30), Commandement (0.30) |
| ✝️ **L'Ordre de l'Aube** | Templiers | 0.90/1.20 | Pilier défensif, foi | Bouclier (0.60), Bénédiction (0.55), Provocation (0.50), Résistance X (0.50), Première Frappe (0.40), Commandement (0.40), Bravoure (0.35) |
| 🌬️ **Les Guerrières du Vent** | Amazones | 1.15/0.85 | Aile mobile, précision | Précision (0.55), Esquive (0.55), Traque (0.50), Première Frappe (0.45), Célérité (0.45), Bravoure (0.40) |
| 🕌 **La Sublime Porte** | Empire ottoman | 1.10/1.05 | Élite à poudre, ordre | Commandement (0.60), Première Frappe (0.50), Combustion (0.50), Précision (0.45), Bravoure (0.45), Tactique X (0.40), Bouclier (0.35) |

**🏯 Empire du Milieu**

| Clan | Inspiration | Style | Identité | Pouvoirs signature |
|---|---|---|---|---|
| 🐎 **Les Hordes des Steppes** | Mongols | 1.15/0.90 | Harcèlement mobile | Célérité (0.55), Traque (0.55), Raid (0.50), Première Frappe (0.45), Persécution X (0.40), Pillage X (0.35) |
| 🐉 **L'Empire de Jade** | Chine antique | 0.90/1.20 | Contrôle et stratégie | Tactique X (0.55), Divination (0.50), Contresort (0.45), Provocation (0.45), Commandement (0.40), Convocation X (0.40), Augure (0.35) |
| 🥷 **Les Lames de l'Ombre** | Japon (samouraïs/ninjas) | 1.20/0.80 | Tempo furtif, remontée | Ombre (0.60), Invisible (0.55), Traque (0.55), Esquive (0.50), Célérité (0.45), Première Frappe (0.45), Précision (0.40), Remontée (0.35) |
| 🐘 **Les Défenseurs d'Ivoire** | Khmer / Angkor | 1.15/1.15 | Colosses tank-trample | Piétinement (0.60), Provocation (0.55), Armure (0.50), Résistance X (0.50), Bravoure (0.40), Riposte X (0.40), Commandement (0.35), Indestructible (0.25) |

**☀️ Royaumes du Soleil**

| Clan | Inspiration | Style | Identité | Pouvoirs signature |
|---|---|---|---|---|
| 🌞 **Les Enfants du Soleil** | Incas | 1.10/0.95 | Moteur à sacrifice | Sacrifice (0.55), Héritage X (0.50), Martyr (0.45), Bravoure (0.45), Bénédiction (0.40), Convocation X (0.40) |
| 🏜️ **Les Seigneurs des Dunes** | Touaregs | 1.05/1.00 | Harceleur-pilleur | Pillage X (0.55), Traque (0.50), Esquive (0.50), Célérité (0.45), Résistance X (0.45), Persécution X (0.40) |
| 🎭 **Le Royaume des Masques** | Yoruba/Bénin | 0.90/1.15 | Invocateur-soutien | Convocation X (0.60), Divination (0.50), Prescience X (0.45), Augure (0.45), Bénédiction (0.40), Totem (0.40), Régénération (0.35) |
| 🌋 **Les Fils du Volcan** | Polynésie | 1.25/0.85 | Feu tribal agressif | Combustion (0.60), Fureur (0.55), Gloire +X/+Y (0.50), Souffle de feu X (0.45), Bravoure (0.45), Raid (0.40), Sacrifice (0.40), Célérité (0.35) |

### 5.3 Elfes — L'Alliance Céleste (profils distincts)

| Clan | Race(s) | Style | Identité | Pouvoirs signature |
|---|---|---|---|---|
| 🌳 **Les Sylvains** | Elfes | 1.15/0.80 | Escarmoucheurs furtifs des bois | Traque (0.55), Esquive (0.55), Invisible (0.45), Première Frappe (0.45), Précision (0.45), Combustion (0.30) |
| 📖 **Les Hauts-Elfes** | Elfes | 0.95/0.90 | Mages arcaniques, contrôle | Canalisation (0.55), Divination (0.50), Contresort (0.45), Augure (0.45), Prescience X (0.40), Précision (0.35), Suprématie (0.35) |
| 🧚 **La Forêt d'Émeraude** | Fées | 0.75/0.75 | Fées volantes, soutien | Vol (0.85), Invisible (0.60), Canalisation (0.55), Divination (0.50), Augure (0.50), Drain de vie (0.40), Contresort (0.40) |
| 🍃 **La Combe Verte** | Hobbits + Hommes-Arbres | 0.85/1.05 | Rusés insaisissables + colosses (≥6 mana → Hommes-Arbres) | Esquive (0.55), Loyauté (0.55), Bravoure (0.45), Invisible (0.40), Bénédiction (0.40), Régénération (0.35), Ancré (0.35), Provocation (0.35), Résistance X (0.35) |

> **Aigles Géants** = race libre : peut apparaître dans n'importe quel clan elfe (profil de race §4).

### 5.4 Nains — La Confrérie de la Forge (profils distincts)

| Clan | Race(s) | Style | Identité | Pouvoirs signature |
|---|---|---|---|---|
| ⛰️ **Les Gardiens de la Montagne** | Nains | 0.85/1.45 | Forteresse, contre-attaque | Armure (0.65), Résistance X (0.60), Provocation (0.55), Bouclier (0.50), Ancré (0.45), Riposte X (0.45) |
| 🌋 **La Forge Ardente** | Nains | 1.15/1.05 | Forgerons du magma, agression | Combustion (0.50), Gloire +X/+Y (0.50), Fureur (0.45), Riposte X (0.40), Catalyse (0.40), Bravoure (0.35) |
| 🗿 **Les Sentinelles d'Airain** | Golems | 0.90/1.60 | Colosses inébranlables | Ancré (0.80), Armure (0.75), Provocation (0.60), Résistance X (0.50), Riposte X (0.45), Indestructible (0.35) |
| ⚙️ **La Guilde des Ingénieurs** | Gnomes | 0.80/1.00 | Ingénieurs, machines et astuce | Convocation X (0.55 — tokens mécaniques), Catalyse (0.50), Divination (0.45), Tactique X (0.40), Inspiration X (0.40), Contresort (0.35), Riposte X (0.30) |

> **Les Marteaux des Collines** sont dissous (limite de 2 clans nains) : leurs cartes migrent vers les Gardiens de la Montagne ou la Forge Ardente selon leur profil. Les Gnomes gagnent par les machines (tokens) et l'avantage de cartes, pas par le combat direct.

### 5.5 Hommes-Bêtes — La Meute (profils distincts)

| Clan | Race(s) | Style | Identité / mécanique | Pouvoirs signature |
|---|---|---|---|---|
| 🐯 **Les Seigneurs Fauves** | Hommes-Félins | 1.30/0.85 | Splendeur maharadjah — *bonus à l'attaque* | Persécution X (0.55), Célérité (0.50), Traque (0.50), Bravoure (0.45), Première Frappe (0.45), Double Attaque (0.40) |
| 🌙 **Les Enfants de la Lune** | Hommes-Ours + Hommes-Loups | 1.25/1.00 | Lycanthropes — *transformation* | Lycanthropie X (0.55), Gloire +X/+Y (0.50), Fureur (0.50), Traque (0.45), Régénération (0.40), Résistance X (0.40) |
| 🐾 **Le Pacte des Griffes** | Hommes-Chiens + Hommes-Renards (ouvert à toutes races) | 1.15/0.95 | Alliance — *bonus si plusieurs races sur le board* | Sang mêlé (0.60), Solidarité X (0.50), Loyauté (0.45), Instinct de meute X (0.45), Bravoure (0.40), Traque (0.40) |
| 🐴 **La Harde Sauvage** | Centaures + Hommes-Cerfs | 1.20/0.95 | Charge & tir des plaines | Célérité (0.50), Raid (0.50), Piétinement (0.45), Précision (0.45), Traque (0.45), Bravoure (0.40) |
| 🧸 **La Forêt Enchantée** | Mimis | 0.85/0.90 | Nuée fidèle et increvable | Loyauté (0.55), Combustion (0.40), Régénération (0.40), Solidarité X (0.40), Bénédiction (0.35) |

> **La Forêt Enchantée** : ex-« Les Mignons ». Traité comme clan bonus caché lors de la refonte (donc inerte : non listé, non assignable, clan vidé en base), il est depuis le 2026-07-24 un **clan normal** réservé aux Mimis, jouable dans tous les formats.

### 5.6 Morts-Vivants — La Nécropole (profils distincts)

| Clan | Race(s) | Style | Identité | Pouvoirs signature |
|---|---|---|---|---|
| ⚰️ **Les Rangs Silencieux** | Squelettes + Zombies | 1.00/0.90 | Nuée increvable, recyclage | Nécrophagie (0.55), Exhumation X (0.55), Rappel (0.50), Convocation X (0.50), Poison (0.40), Sacrifice (0.35), Pacte de sang (0.35) |
| 👻 **Le Voile Hurlant** | Spectres + Banshees | 1.05/0.75 | Intangibles, terreur | Terreur (0.60), Ombre (0.55), Invisible (0.50), Esquive (0.50), Maléfice (0.45), Malédiction (0.40), Paralysie (0.35) |
| 🦇 **La Cour Écarlate** | Vampires | 1.25/0.90 | Prédateurs, drain agressif | Drain de vie (0.60), Vampirisme X (0.55), Célérité (0.45), Régénération (0.45), Pacte de sang (0.40), Terreur (0.35), Vol (0.30) |
| 📿 **Le Cénacle Nécromant** | Liches | 0.85/1.00 | Nécromanciens, magie du cimetière | Héritage du cimetière (0.55), Résurrection (0.50), Ombre du passé (0.50), Savant (0.45), Canalisation (0.45), Domination (0.40), Divination (0.35) |

### 5.7 Les Légions du Chaos (profils distincts)

| Clan | Race(s) | Style | Identité / mécanique | Pouvoirs signature |
|---|---|---|---|---|
| ⚔️ **Les Cohortes Sanglantes** | Orcs + Gobelins + Trolls + Wargs | 1.25/0.90 | Armée organisée — *vagues préparées en main* | Traque (0.55), Entrainement X (0.50), Gloire +X/+Y (0.50), Fureur (0.45), Catalyse (0.45), Convocation X (0.40), Entraide (Race) (0.40), Régénération (0.35 — Trolls), Provocation (0.35 — Trolls), Célérité (0.35 — Wargs), Sacrifice (0.30) |
| 👹 **Les Princes des Abîmes** | Démons | 1.35/0.80 | Sacrifice et terreur | Fureur (0.65), Sacrifice (0.55), Terreur (0.50), Persécution X (0.45), Pacte de sang (0.40), Carnage X (0.40), Vol (0.30) |
| 🕸️ **La Forêt Maudite** | Elfes Corrompus + Araignées Géantes | 1.10/0.90 | Poison et ombre | Poison (0.65), Invisible (0.55), Ombre (0.50), Malédiction (0.50), Esquive (0.45), Drain de vie (0.40) |
| 🛡️ **La Garde Noire** | Guerriers du Chaos | 1.10/1.15 | Élite lourde corrompue | Armure (0.60), Résistance X (0.55), Fureur (0.45), Provocation (0.45), Maléfice (0.40), Riposte X (0.40) |

> **Répartition par coût de mana dans les Cohortes Sanglantes** : <3 mana → **Gobelins**, 3–5 mana → **Orcs** ou **Wargs**, ≥6 mana → **Trolls** (même mécanique que les Hommes-Arbres chez les Hobbits). L'identité « armée bien organisée » repose sur les capacités qui boostent la **main** (Entrainement X, Catalyse, Entraide) : la horde prépare ses vagues avant de déferler.

---

## 6. Construction de deck et formats

**Règles de composition** (moteur `deck-rules.ts` + `DeckBuilder`) :
- **50 cartes** par deck.
- **Une seule faction** par deck (hors Mercenaires, toujours autorisés).
- **Un seul clan** par deck (les cartes sans clan et les Mercenaires sont toujours autorisés).
- **Pas de mélange d'alignements** : une carte Bonne et une carte Maléfique ne peuvent coexister.
- **Quota Mercenaires** limité (`maxMercenaires`).
- **Copies** : 3 max pour une Commune, 1 pour Rare et au-dessus.
- **12 max** d'une même capacité nommée dans le deck (Vol exempté).

**Modes de jeu** :
- **Classique** : uniquement des cartes **Communes** (50 slots Commune).
- **Expert** : système de *slots par rareté* (2 / 4 / 6 / 8 → 20 cartes non-communes maximum), le reste en Communes.
- **Amical** : autorise les clans bonus débloquables, interdits en tournoi. *(Aucun clan bonus n'existe actuellement — La Forêt Enchantée, le seul candidat, est devenue un clan normal le 2026-07-24.)*

**Étendue (rotation)** :
- **Standard** : rotation ~2 ans (cartes datées récentes ; les cartes non datées restent selon la règle du filtre).
- **Étendu** : toutes les cartes légales.

Codes de format = `mode-étendue`, ex. `classique-standard`, `expert-etendu`.

---

## 7. Les raretés

| Rareté | Code | Couleur | Multiplicateur de stats | Tirage limité (exemplaires) |
|---|---|---|---|---|
| Commune | C | gris | ×1.00 | illimité |
| Peu Commune | U | vert | ×1.05 | 1000 |
| Rare | R | bleu | ×1.10 | 100 |
| Épique | É | violet | ×1.15 | 10 |
| Légendaire | L | or | ×1.20 | 1 |

Les cartes **datées** (séries limitées / éditions forgées) existent en nombre fixe d'exemplaires selon leur rareté ; certaines capacités comme **Sélection Royale** exploitent ces éditions limitées.

---

## 8. Glossaire des capacités (98 au total)

> 72 capacités de créature, 10 de sort, 16 mixtes (créature **et** sort). Le suffixe **X** (ou X/Y) indique une valeur paramétrable. Le **Tier** (0→4) reflète la puissance/complexité.

### 8.1 Mots-clés passifs / de combat (créatures)

| Capacité | Tier | Effet |
|---|---|---|
| 🤝 Loyauté | 0 | Invocation : +1/+1 par allié de même **race** en jeu. |
| ⚓ Ancré | 0 | Ne peut être déplacé ni exilé. |
| 🛡️ Résistance X | 0 | Réduit les dégâts reçus de X (min. 1 dégât subi). |
| 🎯 Provocation | 0 | Les ennemis doivent l'attaquer en priorité. |
| ⚔️ Raid | 0 | Peut attaquer une **créature** ennemie dès l'invocation (pas le héros). |
| ⚡ Traque | 0 | Peut attaquer et utiliser son pouvoir dès l'invocation. |
| 🗡️ Première Frappe | 0 | Inflige ses dégâts en premier ; la cible ne riposte que si elle survit. |
| 🏅 Gloire +X/+Y | 0 | Chaque fois qu’elle survit à des dégâts de combat, gagne +X/+Y de façon permanente. |
| 🔰 Bouclier | 0 | Absorbe une première attaque sans dégâts. |
| 🦅 Vol | 1 | Ignore les Provocations adverses. |
| 🏹 Précision | 1 | Ignore Résistance, Armure et Bouclier. |
| 🩸 Drain de vie | 1 | Soigne votre héros des dégâts infligés. |
| 💨 Esquive | 1 | Évite automatiquement la 1ʳᵉ attaque reçue chaque tour. |
| ☠️ Poison *(mixte)* | 1 | Les unités blessées perdent 1 PV par tour. |
| 💫 Célérité | 1 | Peut attaquer deux fois par tour. |
| 🦁 Bravoure | 1 | Double ses dégâts contre les unités à ATK supérieure. |
| ↩️ Riposte X | 1 | Quand elle subit des dégâts, inflige X à la source. |
| 👁️ Terreur | 2 | Les unités adverses perdent 1 ATK en sa présence. |
| 📉 Pauvreté X | 1 | Perd autant de Force que la taille de la main adverse (X dynamique). |
| 🛡️ Armure | 2 | Réduit de moitié les dégâts de combat (pas les sorts). |
| 👑 Commandement | 2 | Les alliés de même **faction** gagnent +1/+1. |
| 💢 Fureur | 2 | Après avoir subi des dégâts, attaque immédiatement une unité adverse (1×/tour). |
| ⚔️ Double Attaque | 2 | En phase offensive : inflige deux fois son ATK. |
| 👻 Invisible | 2 | Ne peut être ciblée par sorts ni capacités adverses. |
| 🔮 Canalisation | 2 | Vos sorts coûtent 1 mana de moins (min. 1). |
| 🩻 Persécution X | 2 | À chaque attaque, inflige X dégâts au héros adverse. |
| 🐾 Piétinement | 2 | Les dégâts excédentaires vont au héros adverse. |
| 🔗 Liaison de vie | 3 | Partage les dégâts subis avec le héros adverse. |
| 🌑 Ombre | 3 | Inciblable/inattaquable tant qu'elle n'a pas agi. |
| ♾️ Indestructible | 3 | Ne subit aucun dégât de combat. |
| 💚 Régénération | 3 | Récupère 2 PV au début de votre tour. |
| ⛓️ Paralysie | 2 | Les unités qu'elle blesse ne peuvent plus attaquer/agir jusqu'à la fin du prochain tour adverse. |
| 🐲 Souffle de feu X | 4 | Inflige X dégâts à toutes les unités ennemies lors de l'attaque. |
| 🌟 Transcendance | 4 | Immunité totale aux sorts (même de zone). |
| ✨ Résurrection | 4 | Revient en jeu à 1 PV après sa mort (perd Résurrection). |

### 8.2 Déclenchées à l'invocation (« Invocation : … »)

| Capacité | Tier | Effet |
|---|---|---|
| 🔥 Combustion | 1 | Défaussez 1 carte, piochez 2. |
| ⚗️ Catalyse | 2 | −1 mana à toutes les unités de même race en main. |
| 🚫 Contresort | 2 | Annule le prochain sort adverse. |
| 📣 Convocation X *(mixte)* | 2 | Crée un token X/X de la race (et clan) indiqués. |
| 💀 Malédiction | 2 | Une unité ennemie ciblée est exilée à la fin du prochain tour adverse. |
| 🔀 Permutation | 2 | Échange les PV actuels d'une unité alliée et d'une ennemie. |
| 👊 Suprématie | 2 | +1/+1 par carte en main au moment de l'invocation. |
| 🔍 Divination | 2 | Réorganise les 3 premières cartes de la pioche. |
| 🃏 Prescience X | 2 | Pioche jusqu'à avoir X cartes en main. |
| 👤 Ombre du passé | 2 | +1/+1 par unité de même race dans votre cimetière. |
| 📚 Savant | 2 | +1/+1 par sort dans votre cimetière. |
| ⚰️ Profanation X | 2 | Exile X cartes du cimetière pour +X/+X. |
| 💔 Sacrifice | 3 | Détruit un allié pour gagner ses PV/ATK définitivement. |
| 🪞 Mimique | 3 | Copie toutes les capacités d'une unité ciblée (permanent). |
| 🦎 Métamorphose | 3 | Devient une copie exacte d'une unité ciblée. |
| 👯 Dédoublement | 3 | Crée en jeu une copie exacte de cette créature. **Multi-déclencheur** : configurable sur tous les modes (invocation, mort, activation, retour en main, fin de tour, attaque). Le clone entre frais à PV pleins et ne re-déclenche pas l'effet dans la même passe. |
| 📋 Tactique X | 3 | Attribue X capacité(s) choisie(s) à un allié (permanent). |
| 🏚️ Héritage du cimetière | 3 | Prend les capacités d'une unité du cimetière. |
| 🧛 Vampirisme X | 4 | Vole X PV à une unité ennemie et se les ajoute. |
| 👁️‍🗨️ Domination | 4 | Prend le contrôle d'une unité ennemie au hasard. |
| 🔮 Traque du destin X | — | Révèle X cartes du deck, en garde 1, réordonne le reste. |
| 🤜 Solidarité X | — | Pioche X cartes si vous contrôlez 2 autres unités de même race. |
| 📯 Appel du clan X | — | Met en jeu gratuitement la 1ʳᵉ unité de même clan à coût ≤ X du deck. |

### 8.3 Déclenchées à la mort (« Mort : … »)

| Capacité | Tier | Effet |
|---|---|---|
| 🕯️ Maléfice | 3 | Inflige X dégâts à toutes les unités, X = son ATK. |
| 💥 Carnage X | 3 | Inflige X dégâts à toutes les unités en jeu. |
| 📜 Héritage X | 3 | Chaque allié gagne +X/+X définitivement. |
| 🩸 Pacte de sang | 4 | Invoque deux tokens 1/1 de sa race. |
| 👹 Sacrifice démoniaque X | 3 | Répartit X réductions de coût (−1) parmi vos Démons en main. |
| ♻️ Cycle éternel | — | Ajoute une copie d'elle-même au deck ; si piochée, entre directement en jeu. |
| ⚱️ Martyr | — | Toutes vos unités de même race gagnent +1/+1 permanent. |

### 8.4 Synergies de race / clan / deck (auras et conditions)

| Capacité | Tier | Effet |
|---|---|---|
| 🦴 Nécrophagie | 2 | +1/+1 à chaque mort d'unité (alliée ou ennemie). |
| 🤑 Richesse X | 2 | +X/+X à chaque défausse (n'importe quel joueur). |
| 🤝 Entraide (Race) | — | En main : −1 mana par allié de la race choisie en jeu. |
| 🧬 Sang mêlé | — | +1/+1 par type de race différent parmi vos alliés. |
| 🗿 Totem | — | Gagne les capacités de toutes les unités de même race alliées en jeu. |
| 🏰 Fierté du clan | — | Les unités de même **clan** invoquées arrivent avec +1/+1. |
| 🐺 Instinct de meute X | — | Invocation : +X/+X si un allié de même faction est mort ce tour. |
| 🐺 Lycanthropie X | — | Début de tour : se transforme en token X/X avec Traque. |
| 🖤 Corruption | 3 | Convertit une unité ennemie à votre camp jusqu'à la fin du tour (gagne Traque). |
| 🤕 Douleur X *(mixte)* | 0 | Invocation/Lancement : inflige X dégâts à **votre** héros (coût / drawback). |

### 8.5 Capacités liées au cimetière / à la main

| Capacité | Tier | Effet |
|---|---|---|
| 🪦 Rappel *(mixte)* | 1 | Remet une carte du cimetière dans la main. |
| ⚰️ Exhumation X *(mixte)* | 3 | Ressuscite une unité (coût ≤ X) du cimetière. |
| 🏴 Rassemblement X *(mixte)* | — | Révèle X cartes du deck, garde les unités de même race, défausse le reste. |
| 💰 Pillage X *(mixte)* | 1 | L'adversaire défausse X cartes aléatoires. |
| 📖 Inspiration X *(mixte)* | 2 | Pioche X cartes. |
| 📣 Invocation X *(mixte)* | 2 | Invoque une créature aléatoire de coût exactement X de votre collection (même alignement, format en cours). |

### 8.6 Sorts purs (9)

| Sort | Effet |
|---|---|
| 💥 Impact X | Inflige X dégâts à une cible. |
| 🌊 Déferlement X | Inflige X dégâts à toutes les créatures ennemies. |
| 🩸 Siphon X | X dégâts à une cible + soigne votre héros d'autant. |
| ⛓️ Entrave | Paralyse une créature ennemie ciblée. |
| ☠️ Exécution | Détruit une créature ciblée. |
| 🤫 Silence | Retire tous les mots-clés d'une créature. |
| ⬆️ Renforcement +X/+Y | +X ATK / +Y PV à une créature alliée. |
| 💚 Guérison X | Restaure X PV à une cible. |
| 💎 Afflux X | Gagnez X mana ce tour. |

### 8.7 Capacités mixtes avancées (créature **et** sort)

| Capacité | Effet |
|---|---|
| 🔼 Remontée | Renvoie une unité ciblée dans la main de son propriétaire. |
| ⏫ Renforcement multiple | +X/+Y à toutes vos créatures d'une race/clan choisi (clan prioritaire). |
| 🏋️ Entrainement X | +X/+X à vos créatures **en main** de la même faction (tous déclencheurs). |
| 🎯 Concentration X | Remplace chaque sort en main par un sort aléatoire de coût +X (réduit de X). |
| 🌩️ Tempête X | X dégâts répartis aléatoirement entre les unités ennemies. |
| 📯📣 Convocations multiples | Crée plusieurs tokens selon la configuration. |
| 🎴 Sélection X | Choisit 1 carte parmi 3 communes (coût ≤ X) du même alignement. |
| 🪄 Sélection magique X | Idem, restreint aux sorts. |
| 👑 Sélection Royale X | Idem, parmi vos éditions limitées (≥30 requises). |
| 🔁 Relancer X | Rejoue les X derniers sorts avec des cibles aléatoires. |

### 8.8 Note sur les déclencheurs

Chaque capacité « à effet » peut, selon la configuration de la carte, se déclencher sur d'autres **modes** que l'invocation : à la **mort**, à l'**activation** (tap), au **retour en main**, en **fin de tour**, ou à l'**attaque**. C'est le système de « modes de mot-clé curés » du moteur.

---

## 9. Héros et pouvoirs héroïques

Chaque héros appartient à une faction et possède un **pouvoir activable** qui suit la même taxonomie que les capacités de carte :
- **conférer une capacité** (grant) — ex. donner Gloire à un allié ;
- **effet immédiat** (spell trigger) — ex. infliger des dégâts ;
- **aura** (automatique/passif).

Les pouvoirs héroïques réutilisent le registre de capacités unifié (`abilities.ts`).

---

## 10. Récapitulatif « faction → identité de jeu »

| Faction | Alignement | Identité en une phrase | Clans |
|---|---|---|---|
| 🌿 Elfes (Alliance Céleste) | Bon | Bon peuple des bois : elfes, fées, hobbits | Sylvains, Hauts-Elfes, Forêt d'Émeraude, Hobbits |
| ⚒️ Nains | Bon | Mur défensif, forge et ingénierie | Gardiens de la Montagne, Forge Ardente, Sentinelles d'Airain, Guilde des Ingénieurs |
| ⚔️ Royaumes Libres | Neutre | Le vieux continent, honneur et champions | Royaume du Nord, Ordre de l'Aube, Guerrières du Vent, Sublime Porte |
| 🏯 Empire du Milieu | Neutre | Stratégie, contrôle et furtivité | Hordes des Steppes, Empire de Jade, Lames de l'Ombre, Défenseurs d'Ivoire |
| ☀️ Royaumes du Soleil | Neutre | Soleil, désert et esprits | Enfants du Soleil, Seigneurs des Dunes, Royaume des Masques, Fils du Volcan |
| 🐺 Hommes-Bêtes | Neutre | Agression sauvage et bestiaire | Seigneurs Fauves, Enfants de la Lune, Pacte des Griffes, Harde Sauvage, La Forêt Enchantée |
| 🌀 Élémentaires | Neutre | 4 styles selon l'élément | La Colère des Flammes, Le Socle du Monde, La Vague Sans Fin, Le Souffle des Cimes |
| 💰 Mercenaires | Spéciale | Polyvalents, jouables partout | — |
| 💀 Morts-Vivants | Maléfique | Recyclage du cimetière, drain, terreur | Rangs Silencieux, Voile Hurlant, Cour Écarlate, Cénacle Nécromant |
| 🔮 Les Légions du Chaos | Maléfique | Toutes les forces du Chaos unies | Cohortes Sanglantes, Princes des Abîmes, Forêt Maudite, Garde Noire |

---

## 11. Annexe — Chantier d'implémentation de la refonte (à faire dans le code)

1. **Factions** : ajouter `EmpireDuMilieu` et `RoyaumesDuSoleil` (Neutres, race `Humains`). `Humains` garde son code mais s'affiche « Les Royaumes Libres ». **Supprimer la faction Hobbits** (absorbée dans `Elfes`) et **la faction Orcs** (absorbée dans l'ex-`ElfesNoirs`, renommée « Les Légions du Chaos »).
2. **Clans** : redéfinir les listes de clans de chaque faction refondue (cf. §5). Retirer les anciens clans dissous (Orientaux, Incas, Touaregs de `Humains` ; Cimes Éternelles / Elfes des Mers des `Elfes` ; **Les Marteaux des Collines** des `Nains` ; Abysses souterrains / Cités de cendres des ex-`ElfesNoirs` ; Brise-Crânes / Peaux-de-Pierre / Chevaucheurs — jamais implémentés).
3. **Profils de clan** : étendre le mécanisme des clans élémentaires (table de pouvoirs + poids de stats par clan) à **tous** les clans (cf. §5). Générateur : lire la table de clan en priorité, repli sur l'ombrelle de faction.
4. **Races** : intégrer Hobbits + Hommes-Arbres à `Elfes` ; faire des **Aigles Géants** une race libre de tous les clans elfes. Créer les nouvelles races **Gnomes** (`Nains`) et **Guerriers du Chaos** (Légions du Chaos). Rattacher Orcs/Gobelins/Trolls/Wargs aux Légions du Chaos avec répartition par mana dans les Cohortes Sanglantes (<3 → Gobelins, 3–5 → Orcs/Wargs, ≥6 → Trolls).
5. **Pouvoirs interdits** : assouplir `Elfes` (autoriser Ancré/Provocation) et **Légions du Chaos** (autoriser Provocation et Régénération ; liste finale des interdits : Loyauté, Commandement, Bouclier, Bénédiction, Bravoure).
6. **Alignements** : Elfes/Nains = Bon ; 3 factions humaines + Hommes-Bêtes + Élémentaires = Neutre ; Morts-Vivants + Légions du Chaos = Maléfique.
7. **Mode Amical & déblocage** : gérer les **clans bonus cachés** — déblocables par tournois/défis, autorisés en amical, interdits en tournoi. *(Chantier jamais entamé ; son unique candidat, ex-« Les Mignons », est devenu le clan normal La Forêt Enchantée le 2026-07-24.)*
8. **Migration de données** : réattribuer les cartes des ex-clans (Nordiques→Le Royaume du Nord, Templiers→L'Ordre de l'Aube, Amazones→Les Guerrières du Vent, **Orientaux→Les Lames de l'Ombre**, Incas→Les Enfants du Soleil, Touaregs→Les Seigneurs des Dunes ; Elfes des Mers→Les Sylvains ; **Marteaux des Collines→Gardiens de la Montagne ou Forge Ardente selon profil** ; **toutes les cartes de l'ex-faction Orcs→Les Cohortes Sanglantes** ; anciennes cartes Elfes Noirs→La Forêt Maudite ou nouveau clan selon race ; anciens clans hommes-bêtes vers leurs nouveaux clans) et créer les cartes des nouveaux clans (Guilde des Ingénieurs, Garde Noire, les 4 clans de la Nécropole).

---

*Généré depuis le code source du jeu, puis révisé le 2026-07-18 (refonte des factions & clans **terminée** au niveau design). En cas de divergence, la source de vérité reste `src/lib/card-engine/constants.ts` et `src/lib/game/abilities.ts` — à mettre à jour selon §11.*
