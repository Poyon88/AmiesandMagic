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
}

// Clé = id de race FR au PLURIEL, tel que stocké en base. Le pluriel n'est pas
// répété ici : il vit déjà dans `vocab.races.{id}` (cf. getRaceName).
export const RACE_FORMS_FR: Record<string, Inflected> = {
  "Elfes": { def: "l'Elfe", bare: "Elfe", de: "de l'Elfe" },
  "Fées": { def: "la Fée", bare: "Fée", de: "de la Fée" },
  "Aigles Géants": { def: "l'Aigle Géant", bare: "Aigle Géant", de: "de l'Aigle Géant" },
  "Hobbits": { def: "le Hobbit", bare: "Hobbit", de: "du Hobbit" },
  "Hommes-Arbres": { def: "l'Homme-Arbre", bare: "Homme-Arbre", de: "de l'Homme-Arbre" },
  "Nains": { def: "le Nain", bare: "Nain", de: "du Nain" },
  "Golems": { def: "le Golem", bare: "Golem", de: "du Golem" },
  "Gnomes": { def: "le Gnome", bare: "Gnome", de: "du Gnome" },
  "Humains": { def: "l'Humain", bare: "Humain", de: "de l'Humain" },
  "Hommes-Loups": { def: "l'Homme-Loup", bare: "Homme-Loup", de: "de l'Homme-Loup" },
  "Hommes-Ours": { def: "l'Homme-Ours", bare: "Homme-Ours", de: "de l'Homme-Ours" },
  "Hommes-Félins": { def: "l'Homme-Félin", bare: "Homme-Félin", de: "de l'Homme-Félin" },
  "Centaures": { def: "le Centaure", bare: "Centaure", de: "du Centaure" },
  "Mimis": { def: "le Mimi", bare: "Mimi", de: "du Mimi" },
  "Hommes-Chiens": { def: "l'Homme-Chien", bare: "Homme-Chien", de: "de l'Homme-Chien" },
  "Hommes-Renards": { def: "l'Homme-Renard", bare: "Homme-Renard", de: "de l'Homme-Renard" },
  "Hommes-Cerfs": { def: "l'Homme-Cerf", bare: "Homme-Cerf", de: "de l'Homme-Cerf" },
  // Déjà au singulier en base — d'où le pluriel explicite, sans quoi on
  // afficherait « vos Élémentaire ».
  "Élémentaire": { def: "l'Élémentaire", bare: "Élémentaire", de: "de l'Élémentaire", pl: "Élémentaires" },
  "Géants": { def: "le Géant", bare: "Géant", de: "du Géant" },
  "Ogres": { def: "l'Ogre", bare: "Ogre", de: "de l'Ogre" },
  "Dragons": { def: "le Dragon", bare: "Dragon", de: "du Dragon" },
  "Chiens": { def: "le Chien", bare: "Chien", de: "du Chien" },
  // Invariable.
  "Phoenix": { def: "le Phoenix", bare: "Phoenix", de: "du Phoenix" },
  "Anges": { def: "l'Ange", bare: "Ange", de: "de l'Ange" },
  "Ours": { def: "l'Ours", bare: "Ours", de: "de l'Ours" },
  "Loups": { def: "le Loup", bare: "Loup", de: "du Loup" },
  "Fauves": { def: "le Fauve", bare: "Fauve", de: "du Fauve" },
  "Squelettes": { def: "le Squelette", bare: "Squelette", de: "du Squelette" },
  "Zombies": { def: "le Zombie", bare: "Zombie", de: "du Zombie" },
  "Spectres": { def: "le Spectre", bare: "Spectre", de: "du Spectre" },
  "Vampires": { def: "le Vampire", bare: "Vampire", de: "du Vampire" },
  "Lich": { def: "la Liche", bare: "Liche", de: "de la Liche" },
  "Banshees": { def: "la Banshee", bare: "Banshee", de: "de la Banshee" },
  "Elfes Corrompus": { def: "l'Elfe Corrompu", bare: "Elfe Corrompu", de: "de l'Elfe Corrompu" },
  "Araignées Géantes": { def: "l'Araignée Géante", bare: "Araignée Géante", de: "de l'Araignée Géante" },
  "Démons": { def: "le Démon", bare: "Démon", de: "du Démon" },
  "Orcs": { def: "l'Orc", bare: "Orc", de: "de l'Orc" },
  "Gobelins": { def: "le Gobelin", bare: "Gobelin", de: "du Gobelin" },
  "Trolls": { def: "le Troll", bare: "Troll", de: "du Troll" },
  "Wargs": { def: "le Warg", bare: "Warg", de: "du Warg" },
  "Guerriers du Chaos": { def: "le Guerrier du Chaos", bare: "Guerrier du Chaos", de: "du Guerrier du Chaos" },
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
  "Nains": "de la Confrérie de la Forge",
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
