import type { SafeT } from "@/i18n/config";
import { getClanName, getFactionDisplayName, getRaceName } from "./constants";

// Formes fléchies des races / clans / factions, pour que les descriptions de
// capacités nomment la valeur concrète de la carte plutôt qu'une périphrase
// (« Ajoute en main le Démon… » au lieu de « …la créature de la race choisie »).
//
// CHOIX STRUCTURANT : on stocke des FORMES DE SURFACE, pas des traits
// grammaticaux (genre + article recomposés à la volée). Un modèle grammatical
// ne survit pas aux 8 langues — l'allemand décline, le japonais n'a ni article
// ni genre. Trois chaînes déjà fléchies se traduisent en revanche telles
// quelles par le pipeline `translate-messages.mjs`, et le genre y devient
// implicite.
//
// L'élision NE PEUT PAS être dérivée de la première lettre : « l'Elfe » et
// « l'Homme-Loup » (h muet) mais « le Hobbit » (h aspiré). D'où des formes
// explicites plutôt qu'une règle.

export interface Inflected {
  /** Singulier défini — « le Démon », « l'Élémentaire », « la Banshee ». */
  def: string;
  /** Singulier nu, le gabarit fournit le déterminant — « par Démon allié ». */
  bare: string;
  /** Complément du nom — « du Démon », « de l'Élémentaire ». */
  de: string;
  /** Pluriel, UNIQUEMENT s'il diffère de l'id stocké (qui est déjà un pluriel
   *  pour toutes les races sauf « Élémentaire »). Sinon getRaceName suffit. */
  pl?: string;
  /** Groupes nominaux COMPTÉS, compléments d'Exhumation / Rappel limités à
   *  cette race : « une Machine », « toutes les Machines », « jusqu'à {n}
   *  Machines ». Formes de surface, comme le reste : l'article, le genre, le
   *  cas et le classificateur (japonais, chinois) y sont déjà fléchis. */
  one?: string;
  all?: string;
  upto?: string;
}

// Clé = id de race FR au PLURIEL, tel que stocké en base. Le pluriel n'est pas
// répété ici : il vit déjà dans `vocab.races.{id}` (cf. getRaceName).
export const RACE_FORMS_FR: Record<string, Inflected> = {
  "Elfes": { def: "l'Elfe", bare: "Elfe", de: "de l'Elfe", one: "un Elfe", all: "tous les Elfes", upto: "jusqu'à {n} Elfes" },
  "Fées": { def: "la Fée", bare: "Fée", de: "de la Fée", one: "une Fée", all: "toutes les Fées", upto: "jusqu'à {n} Fées" },
  "Farfadets": { def: "le Farfadet", bare: "Farfadet", de: "du Farfadet", one: "un Farfadet", all: "tous les Farfadets", upto: "jusqu'à {n} Farfadets" },
  "Korrigans": { def: "le Korrigan", bare: "Korrigan", de: "du Korrigan", one: "un Korrigan", all: "tous les Korrigans", upto: "jusqu'à {n} Korrigans" },
  "Faunes": { def: "le Faune", bare: "Faune", de: "du Faune", one: "un Faune", all: "tous les Faunes", upto: "jusqu'à {n} Faunes" },
  "Dryades": { def: "la Dryade", bare: "Dryade", de: "de la Dryade", one: "une Dryade", all: "toutes les Dryades", upto: "jusqu'à {n} Dryades" },
  "Aigles Géants": { def: "l'Aigle Géant", bare: "Aigle Géant", de: "de l'Aigle Géant", one: "un Aigle Géant", all: "tous les Aigles Géants", upto: "jusqu'à {n} Aigles Géants" },
  "Hobbits": { def: "le Hobbit", bare: "Hobbit", de: "du Hobbit", one: "un Hobbit", all: "tous les Hobbits", upto: "jusqu'à {n} Hobbits" },
  "Hommes-Arbres": { def: "l'Homme-Arbre", bare: "Homme-Arbre", de: "de l'Homme-Arbre", one: "un Homme-Arbre", all: "tous les Hommes-Arbres", upto: "jusqu'à {n} Hommes-Arbres" },
  "Nains": { def: "le Nain", bare: "Nain", de: "du Nain", one: "un Nain", all: "tous les Nains", upto: "jusqu'à {n} Nains" },
  "Golems": { def: "le Golem", bare: "Golem", de: "du Golem", one: "un Golem", all: "tous les Golems", upto: "jusqu'à {n} Golems" },
  // Race sans faction (cf. RACES_SANS_FACTION) : portes, murailles, tours…
  "Bâtiments": { def: "le Bâtiment", bare: "Bâtiment", de: "du Bâtiment", one: "un Bâtiment", all: "tous les Bâtiments", upto: "jusqu'à {n} Bâtiments" },
  "Gnomes": { def: "le Gnome", bare: "Gnome", de: "du Gnome", one: "un Gnome", all: "tous les Gnomes", upto: "jusqu'à {n} Gnomes" },
  "Machines": { def: "la Machine", bare: "Machine", de: "de la Machine", one: "une Machine", all: "toutes les Machines", upto: "jusqu'à {n} Machines" },
  "Kobolds": { def: "le Kobold", bare: "Kobold", de: "du Kobold", one: "un Kobold", all: "tous les Kobolds", upto: "jusqu'à {n} Kobolds" },
  "Humains": { def: "l'Humain", bare: "Humain", de: "de l'Humain", one: "un Humain", all: "tous les Humains", upto: "jusqu'à {n} Humains" },
  "Esprits": { def: "l'Esprit", bare: "Esprit", de: "de l'Esprit", one: "un Esprit", all: "tous les Esprits", upto: "jusqu'à {n} Esprits" },
  "Nagas": { def: "le Naga", bare: "Naga", de: "du Naga", one: "un Naga", all: "tous les Nagas", upto: "jusqu'à {n} Nagas" },
  // Mots japonais, invariables : la clé de race ne prend pas de « s ».
  "Tengu": { def: "le Tengu", bare: "Tengu", de: "du Tengu", one: "un Tengu", all: "tous les Tengu", upto: "jusqu'à {n} Tengu" },
  "Oni": { def: "l'Oni", bare: "Oni", de: "de l'Oni", one: "un Oni", all: "tous les Oni", upto: "jusqu'à {n} Oni" },
  "Qilins": { def: "le Qilin", bare: "Qilin", de: "du Qilin", one: "un Qilin", all: "tous les Qilins", upto: "jusqu'à {n} Qilins" },
  "Griffons": { def: "le Griffon", bare: "Griffon", de: "du Griffon", one: "un Griffon", all: "tous les Griffons", upto: "jusqu'à {n} Griffons" },
  "Faucons": { def: "le Faucon", bare: "Faucon", de: "du Faucon", one: "un Faucon", all: "tous les Faucons", upto: "jusqu'à {n} Faucons" },
  // « Sphinx » est invariable ; masculin en français, quoique la gardienne du
  // mythe grec soit une figure féminine.
  "Pégases": { def: "le Pégase", bare: "Pégase", de: "du Pégase", one: "un Pégase", all: "tous les Pégases", upto: "jusqu'à {n} Pégases" },
  "Sphinx": { def: "le Sphinx", bare: "Sphinx", de: "du Sphinx", one: "un Sphinx", all: "tous les Sphinx", upto: "jusqu'à {n} Sphinx" },
  "Hommes-Loups": { def: "l'Homme-Loup", bare: "Homme-Loup", de: "de l'Homme-Loup", one: "un Homme-Loup", all: "tous les Hommes-Loups", upto: "jusqu'à {n} Hommes-Loups" },
  "Hommes-Ours": { def: "l'Homme-Ours", bare: "Homme-Ours", de: "de l'Homme-Ours", one: "un Homme-Ours", all: "tous les Hommes-Ours", upto: "jusqu'à {n} Hommes-Ours" },
  "Hommes-Félins": { def: "l'Homme-Félin", bare: "Homme-Félin", de: "de l'Homme-Félin", one: "un Homme-Félin", all: "tous les Hommes-Félins", upto: "jusqu'à {n} Hommes-Félins" },
  "Centaures": { def: "le Centaure", bare: "Centaure", de: "du Centaure", one: "un Centaure", all: "tous les Centaures", upto: "jusqu'à {n} Centaures" },
  "Mimis": { def: "le Mimi", bare: "Mimi", de: "du Mimi", one: "un Mimi", all: "tous les Mimis", upto: "jusqu'à {n} Mimis" },
  "Hommes-Chiens": { def: "l'Homme-Chien", bare: "Homme-Chien", de: "de l'Homme-Chien", one: "un Homme-Chien", all: "tous les Hommes-Chiens", upto: "jusqu'à {n} Hommes-Chiens" },
  "Hommes-Renards": { def: "l'Homme-Renard", bare: "Homme-Renard", de: "de l'Homme-Renard", one: "un Homme-Renard", all: "tous les Hommes-Renards", upto: "jusqu'à {n} Hommes-Renards" },
  "Hommes-Cerfs": { def: "l'Homme-Cerf", bare: "Homme-Cerf", de: "de l'Homme-Cerf", one: "un Homme-Cerf", all: "tous les Hommes-Cerfs", upto: "jusqu'à {n} Hommes-Cerfs" },
  "Insectes": { def: "l'Insecte", bare: "Insecte", de: "de l'Insecte", one: "un Insecte", all: "tous les Insectes", upto: "jusqu'à {n} Insectes" },
  "Hommes-Singes": { def: "l'Homme-Singe", bare: "Homme-Singe", de: "de l'Homme-Singe", one: "un Homme-Singe", all: "tous les Hommes-Singes", upto: "jusqu'à {n} Hommes-Singes" },
  "Hommes-Poissons": { def: "l'Homme-Poisson", bare: "Homme-Poisson", de: "de l'Homme-Poisson", one: "un Homme-Poisson", all: "tous les Hommes-Poissons", upto: "jusqu'à {n} Hommes-Poissons" },
  "Hommes-Oiseaux": { def: "l'Homme-Oiseau", bare: "Homme-Oiseau", de: "de l'Homme-Oiseau", one: "un Homme-Oiseau", all: "tous les Hommes-Oiseaux", upto: "jusqu'à {n} Hommes-Oiseaux" },
  // Déjà au singulier en base — d'où le pluriel explicite, sans quoi on
  // afficherait « vos Élémentaire ».
  "Élémentaire": { def: "l'Élémentaire", bare: "Élémentaire", de: "de l'Élémentaire", pl: "Élémentaires", one: "un Élémentaire", all: "tous les Élémentaires", upto: "jusqu'à {n} Élémentaires" },
  "Géants": { def: "le Géant", bare: "Géant", de: "du Géant", one: "un Géant", all: "tous les Géants", upto: "jusqu'à {n} Géants" },
  "Mammouths": { def: "le Mammouth", bare: "Mammouth", de: "du Mammouth", one: "un Mammouth", all: "tous les Mammouths", upto: "jusqu'à {n} Mammouths" },
  "Ogres": { def: "l'Ogre", bare: "Ogre", de: "de l'Ogre", one: "un Ogre", all: "tous les Ogres", upto: "jusqu'à {n} Ogres" },
  "Dragons": { def: "le Dragon", bare: "Dragon", de: "du Dragon", one: "un Dragon", all: "tous les Dragons", upto: "jusqu'à {n} Dragons" },
  // Élision devant la voyelle : « l'Éléphant », « de l'Éléphant ».
  "Éléphants": { def: "l'Éléphant", bare: "Éléphant", de: "de l'Éléphant", one: "un Éléphant", all: "tous les Éléphants", upto: "jusqu'à {n} Éléphants" },
  "Chiens": { def: "le Chien", bare: "Chien", de: "du Chien", one: "un Chien", all: "tous les Chiens", upto: "jusqu'à {n} Chiens" },
  // Invariable.
  "Phoenix": { def: "le Phoenix", bare: "Phoenix", de: "du Phoenix", one: "un Phoenix", all: "tous les Phoenix", upto: "jusqu'à {n} Phoenix" },
  "Anges": { def: "l'Ange", bare: "Ange", de: "de l'Ange", one: "un Ange", all: "tous les Anges", upto: "jusqu'à {n} Anges" },
  "Ours": { def: "l'Ours", bare: "Ours", de: "de l'Ours", one: "un Ours", all: "tous les Ours", upto: "jusqu'à {n} Ours" },
  "Loups": { def: "le Loup", bare: "Loup", de: "du Loup", one: "un Loup", all: "tous les Loups", upto: "jusqu'à {n} Loups" },
  "Fauves": { def: "le Fauve", bare: "Fauve", de: "du Fauve", one: "un Fauve", all: "tous les Fauves", upto: "jusqu'à {n} Fauves" },
  "Squelettes": { def: "le Squelette", bare: "Squelette", de: "du Squelette", one: "un Squelette", all: "tous les Squelettes", upto: "jusqu'à {n} Squelettes" },
  "Zombies": { def: "le Zombie", bare: "Zombie", de: "du Zombie", one: "un Zombie", all: "tous les Zombies", upto: "jusqu'à {n} Zombies" },
  "Ghoules": { def: "la Ghoule", bare: "Ghoule", de: "de la Ghoule", one: "une Ghoule", all: "toutes les Ghoules", upto: "jusqu'à {n} Ghoules" },
  "Spectres": { def: "le Spectre", bare: "Spectre", de: "du Spectre", one: "un Spectre", all: "tous les Spectres", upto: "jusqu'à {n} Spectres" },
  "Vampires": { def: "le Vampire", bare: "Vampire", de: "du Vampire", one: "un Vampire", all: "tous les Vampires", upto: "jusqu'à {n} Vampires" },
  "Lich": { def: "la Liche", bare: "Liche", de: "de la Liche", one: "une Liche", all: "toutes les Liches", upto: "jusqu'à {n} Liches" },
  "Momies": { def: "la Momie", bare: "Momie", de: "de la Momie", one: "une Momie", all: "toutes les Momies", upto: "jusqu'à {n} Momies" },
  "Chimères nécrotiques": { def: "la Chimère nécrotique", bare: "Chimère nécrotique", de: "de la Chimère nécrotique", one: "une Chimère nécrotique", all: "toutes les Chimères nécrotiques", upto: "jusqu'à {n} Chimères nécrotiques" },
  "Vermines mortuaires": { def: "la Vermine mortuaire", bare: "Vermine mortuaire", de: "de la Vermine mortuaire", one: "une Vermine mortuaire", all: "toutes les Vermines mortuaires", upto: "jusqu'à {n} Vermines mortuaires" },
  "Poltergeists": { def: "le Poltergeist", bare: "Poltergeist", de: "du Poltergeist", one: "un Poltergeist", all: "tous les Poltergeists", upto: "jusqu'à {n} Poltergeists" },
  "Dullahans": { def: "le Dullahan", bare: "Dullahan", de: "du Dullahan", one: "un Dullahan", all: "tous les Dullahans", upto: "jusqu'à {n} Dullahans" },
  "Sluaghs": { def: "le Sluagh", bare: "Sluagh", de: "du Sluagh", one: "un Sluagh", all: "tous les Sluaghs", upto: "jusqu'à {n} Sluaghs" },
  "Ondins": { def: "l'Ondin", bare: "Ondin", de: "de l'Ondin", one: "un Ondin", all: "tous les Ondins", upto: "jusqu'à {n} Ondins" },
  "Sirènes": { def: "la Sirène", bare: "Sirène", de: "de la Sirène", one: "une Sirène", all: "toutes les Sirènes", upto: "jusqu'à {n} Sirènes" },
  "Léviathans": { def: "le Léviathan", bare: "Léviathan", de: "du Léviathan", one: "un Léviathan", all: "tous les Léviathans", upto: "jusqu'à {n} Léviathans" },
  "Cristallins": { def: "le Cristallin", bare: "Cristallin", de: "du Cristallin", one: "un Cristallin", all: "tous les Cristallins", upto: "jusqu'à {n} Cristallins" },
  "Troglodytes": { def: "le Troglodyte", bare: "Troglodyte", de: "du Troglodyte", one: "un Troglodyte", all: "tous les Troglodytes", upto: "jusqu'à {n} Troglodytes" },
  "Bêtes Chtoniennes": { def: "la Bête Chtonienne", bare: "Bête Chtonienne", de: "de la Bête Chtonienne", one: "une Bête Chtonienne", all: "toutes les Bêtes Chtoniennes", upto: "jusqu'à {n} Bêtes Chtoniennes" },
  "Salamandres": { def: "la Salamandre", bare: "Salamandre", de: "de la Salamandre", one: "une Salamandre", all: "toutes les Salamandres", upto: "jusqu'à {n} Salamandres" },
  "Sylphes": { def: "le Sylphe", bare: "Sylphe", de: "du Sylphe", one: "un Sylphe", all: "tous les Sylphes", upto: "jusqu'à {n} Sylphes" },
  "Néphélides": { def: "la Néphélide", bare: "Néphélide", de: "de la Néphélide", one: "une Néphélide", all: "toutes les Néphélides", upto: "jusqu'à {n} Néphélides" },
  "Banshees": { def: "la Banshee", bare: "Banshee", de: "de la Banshee", one: "une Banshee", all: "toutes les Banshees", upto: "jusqu'à {n} Banshees" },
  "Homuncules de Sang": { def: "l'Homuncule de Sang", bare: "Homuncule de Sang", de: "de l'Homuncule de Sang", one: "un Homuncule de Sang", all: "tous les Homuncules de Sang", upto: "jusqu'à {n} Homuncules de Sang" },
  "Gargouilles": { def: "la Gargouille", bare: "Gargouille", de: "de la Gargouille", one: "une Gargouille", all: "toutes les Gargouilles", upto: "jusqu'à {n} Gargouilles" },
  "Dhampirs": { def: "le Dhampir", bare: "Dhampir", de: "du Dhampir", one: "un Dhampir", all: "tous les Dhampirs", upto: "jusqu'à {n} Dhampirs" },
  "Chiroptères": { def: "le Chiroptère", bare: "Chiroptère", de: "du Chiroptère", one: "un Chiroptère", all: "tous les Chiroptères", upto: "jusqu'à {n} Chiroptères" },
  "Elfes Corrompus": { def: "l'Elfe Corrompu", bare: "Elfe Corrompu", de: "de l'Elfe Corrompu", one: "un Elfe Corrompu", all: "tous les Elfes Corrompus", upto: "jusqu'à {n} Elfes Corrompus" },
  "Araignées Géantes": { def: "l'Araignée Géante", bare: "Araignée Géante", de: "de l'Araignée Géante", one: "une Araignée Géante", all: "toutes les Araignées Géantes", upto: "jusqu'à {n} Araignées Géantes" },
  "Démons": { def: "le Démon", bare: "Démon", de: "du Démon", one: "un Démon", all: "tous les Démons", upto: "jusqu'à {n} Démons" },
  "Orcs": { def: "l'Orc", bare: "Orc", de: "de l'Orc", one: "un Orc", all: "tous les Orcs", upto: "jusqu'à {n} Orcs" },
  "Gobelins": { def: "le Gobelin", bare: "Gobelin", de: "du Gobelin", one: "un Gobelin", all: "tous les Gobelins", upto: "jusqu'à {n} Gobelins" },
  "Trolls": { def: "le Troll", bare: "Troll", de: "du Troll", one: "un Troll", all: "tous les Trolls", upto: "jusqu'à {n} Trolls" },
  "Wargs": { def: "le Warg", bare: "Warg", de: "du Warg", one: "un Warg", all: "tous les Wargs", upto: "jusqu'à {n} Wargs" },
  "Guerriers du Chaos": { def: "le Guerrier du Chaos", bare: "Guerrier du Chaos", de: "du Guerrier du Chaos", one: "un Guerrier du Chaos", all: "tous les Guerriers du Chaos", upto: "jusqu'à {n} Guerriers du Chaos" },
};

// Clans : l'id embarque DÉJÀ l'article (« Les Sylvains », « L'Empire de Jade »),
// donc `def` serait une redite de getClanName — seul le complément manque.
export const CLAN_FORMS_FR: Record<string, string> = {
  "Les Sylvains": "des Sylvains",
  "Les Hauts-Elfes": "des Hauts-Elfes",
  "La Forêt d'Émeraude": "de la Forêt d'Émeraude",
  "La Combe Verte": "de la Combe Verte",
  "Les Gardiens de la Montagne": "des Gardiens de la Montagne",
  "La Forge Ardente": "de la Forge Ardente",
  "Les Sentinelles d'Airain": "des Sentinelles d'Airain",
  "La Guilde des Ingénieurs": "de la Guilde des Ingénieurs",
  "Les Hordes des Steppes": "des Hordes des Steppes",
  "L'Empire de Jade": "de l'Empire de Jade",
  "Les Lames de l'Ombre": "des Lames de l'Ombre",
  "Les Défenseurs d'Ivoire": "des Défenseurs d'Ivoire",
  "Les Enfants du Soleil": "des Enfants du Soleil",
  "Les Seigneurs des Dunes": "des Seigneurs des Dunes",
  "Le Royaume des Masques": "du Royaume des Masques",
  "Les Fils du Volcan": "des Fils du Volcan",
  "Le Royaume du Nord": "du Royaume du Nord",
  "L'Ordre de l'Aube": "de l'Ordre de l'Aube",
  "Les Guerrières du Vent": "des Guerrières du Vent",
  "La Sublime Porte": "de la Sublime Porte",
  "Les Seigneurs Fauves": "des Seigneurs Fauves",
  "Les Enfants de la Lune": "des Enfants de la Lune",
  "Le Pacte des Griffes": "du Pacte des Griffes",
  "La Harde Sauvage": "de la Harde Sauvage",
  "La Forêt Enchantée": "de la Forêt Enchantée",
  "La Colère des Flammes": "de la Colère des Flammes",
  "Le Socle du Monde": "du Socle du Monde",
  "La Vague Sans Fin": "de la Vague Sans Fin",
  "Le Souffle des Cimes": "du Souffle des Cimes",
  "Les Rangs Silencieux": "des Rangs Silencieux",
  "Le Voile Hurlant": "du Voile Hurlant",
  "La Cour Écarlate": "de la Cour Écarlate",
  "Le Cénacle Nécromant": "du Cénacle Nécromant",
  "Les Cohortes Sanglantes": "des Cohortes Sanglantes",
  "Les Princes des Abîmes": "des Princes des Abîmes",
  "La Forêt Maudite": "de la Forêt Maudite",
  "La Garde Noire": "de la Garde Noire",
};

// Factions : clé = id stable (« Elfes »), valeur = complément du nom
// d'affichage (« L'Alliance Céleste » → « de L'Alliance Céleste »).
export const FACTION_FORMS_FR: Record<string, string> = {
  "Elfes": "de l'Alliance Céleste",
  "Nains": "des Armées des Montagnes",
  "EmpireDuMilieu": "de l'Empire du Milieu",
  "RoyaumesDuSoleil": "des Royaumes du Soleil",
  "Humains": "des Royaumes Libres",
  "Hommes-Bêtes": "de la Meute",
  "Élémentaires": "des Primordiaux",
  "Mercenaires": "des Mercenaires",
  "Morts-Vivants": "de la Nécropole",
  "Elfes Noirs": "des Légions du Chaos",
};

export type RaceForm = keyof Inflected | "pl";

/**
 * Forme fléchie d'une race. Cascade : forme localisée → forme FR → PLURIEL
 * localisé. Ce dernier repli est ce qui rend le lexique optionnel par langue :
 * une locale non renseignée affiche « Démons » au lieu de casser.
 * Renvoie null si aucune race n'est fournie (→ repli générique côté appelant).
 */
export function getRaceForm(
  race: string | null | undefined,
  form: RaceForm,
  t?: SafeT,
): string | null {
  if (!race) return null;
  if (form === "pl") {
    return (
      t?.(`vocab.races_forms.${race}.pl`) ??
      RACE_FORMS_FR[race]?.pl ??
      getRaceName(race, t)
    );
  }
  return (
    t?.(`vocab.races_forms.${race}.${form}`) ??
    RACE_FORMS_FR[race]?.[form] ??
    getRaceName(race, t)
  );
}

/** Groupe nominal COMPTÉ d'une race (« une Machine », « toutes les
 *  Machines », « jusqu'à {n} Machines » — `{n}` laissé tel quel). `null` si la
 *  forme manque dans la langue : l'appelant garde alors sa tournure générique,
 *  plutôt qu'un repli français au milieu d'une phrase traduite. */
export function getRaceCountForm(
  race: string | null | undefined,
  form: "one" | "all" | "upto",
  t?: SafeT,
): string | null {
  if (!race) return null;
  if (t) return t(`vocab.races_forms.${race}.${form}`) ?? null;
  return RACE_FORMS_FR[race]?.[form] ?? null;
}

/** Complément du nom d'un clan (« des Sylvains »). Repli : le nom canonique. */
export function getClanForm(clan: string | null | undefined, t?: SafeT): string | null {
  if (!clan) return null;
  return t?.(`vocab.clans_forms.${clan}`) ?? CLAN_FORMS_FR[clan] ?? getClanName(clan, t);
}

/** Complément du nom d'une faction. Repli : le nom d'affichage. */
export function getFactionForm(
  faction: string | null | undefined,
  t?: SafeT,
): string | null {
  if (!faction) return null;
  return (
    t?.(`vocab.factions_forms.${faction}`) ??
    FACTION_FORMS_FR[faction] ??
    getFactionDisplayName(faction, t)
  );
}
