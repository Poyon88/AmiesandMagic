// COHÉRENCE DES CAPACITÉS PAR RACE — garde-fou du GÉNÉRATEUR (mode Auto et
// Création assistée), jamais de la saisie manuelle : un auteur qui pose
// délibérément une capacité n'a pas à être contredit.
//
//   - `interdits`   : jamais tirés pour cette race (un Géant ne vole pas) ;
//   - `obligatoires`: toujours posés sur une Unité de cette race (une Fée vole),
//                     et comptés dans le nombre de capacités de la carte.
//
// Les libellés sont ceux de la FORGE (clés de `KEYWORDS`, ex. « Vol »), comme
// partout dans le générateur. Une race absente de la table n'a aucune règle.
//
// Rédigée le 2026-10-12 à partir des descriptions visuelles des races
// (generate-text) et des profils `likelyKeywords`. Remplace le Vol garanti
// codé en dur dans generator.ts (Dragons, Aigles Géants, Griffons, Faucons,
// Chiroptères, Tengu, Pégases).

export interface RaceAbilityRule {
  interdits?: string[];
  obligatoires?: string[];
}

const AILES = { obligatoires: ["Vol"] } satisfies RaceAbilityRule;
const AU_SOL = { interdits: ["Vol"] } satisfies RaceAbilityRule;
/** Masses lentes : ni Vol, ni vivacité. */
const LOURDS = { interdits: ["Vol", "Célérité", "Esquive", "Traque"] } satisfies RaceAbilityRule;
/** Constructions sans chair : ni Vol, ni Poison, ni Drain de vie. */
const INERTES = { interdits: ["Vol", "Poison", "Drain de vie", "Régénération X"] } satisfies RaceAbilityRule;
/** Morts-vivants de chair : ni Vol ni Régénération. */
const CADAVRES = { interdits: ["Vol", "Régénération X", "Célérité"] } satisfies RaceAbilityRule;

export const RACE_ABILITY_RULES: Readonly<Record<string, RaceAbilityRule>> = {
  // ─── Volants par nature ────────────────────────────────────────────────
  "Fées": AILES,
  "Aigles Géants": AILES,
  "Griffons": AILES,
  "Faucons": AILES,
  "Pégases": AILES,
  "Dragons": AILES,
  "Phoenix": AILES,
  "Chiroptères": AILES,
  "Tengu": AILES,
  "Sylphes": AILES,
  "Néphélides": AILES,
  "Anges": AILES,
  "Hommes-Oiseaux": AILES,

  // ─── Lourds ───────────────────────────────────────────────────────────
  "Géants": LOURDS,
  "Mammouths": LOURDS,
  "Éléphants": LOURDS,
  "Hommes-Arbres": LOURDS,
  "Trolls": { interdits: ["Vol", "Célérité", "Esquive"] },
  "Ogres": { interdits: ["Vol", "Esquive"] },
  "Léviathans": LOURDS,
  "Bêtes Chtoniennes": { interdits: ["Vol", "Esquive"] },

  // ─── Constructions ────────────────────────────────────────────────────
  "Golems": { interdits: [...INERTES.interdits, "Célérité", "Esquive"] },
  "Machines": INERTES,
  "Cristallins": INERTES,
  "Bâtiments": { interdits: ["Vol", "Traque", "Raid", "Célérité", "Esquive", "Double Attaque", "Poison", "Drain de vie"] },

  // ─── Morts-vivants ────────────────────────────────────────────────────
  "Squelettes": { interdits: ["Vol", "Régénération X", "Poison", "Drain de vie"] },
  "Zombies": CADAVRES,
  "Momies": CADAVRES,
  "Ghoules": { interdits: ["Vol", "Régénération X"] },
  "Chimères nécrotiques": { interdits: ["Vol", "Régénération X"] },
  "Dullahans": AU_SOL,

  // ─── Peuples et bêtes à terre ─────────────────────────────────────────
  "Elfes": AU_SOL,
  "Elfes Corrompus": AU_SOL,
  "Hobbits": AU_SOL,
  "Farfadets": AU_SOL,
  "Korrigans": AU_SOL,
  "Faunes": AU_SOL,
  "Dryades": AU_SOL,
  "Nains": AU_SOL,
  "Gnomes": AU_SOL,
  "Kobolds": AU_SOL,
  "Humains": AU_SOL,
  "Nagas": AU_SOL,
  "Oni": AU_SOL,
  "Hommes-Loups": AU_SOL,
  "Hommes-Ours": AU_SOL,
  "Hommes-Félins": AU_SOL,
  "Hommes-Chiens": AU_SOL,
  "Hommes-Renards": AU_SOL,
  "Hommes-Cerfs": AU_SOL,
  "Hommes-Singes": AU_SOL,
  "Hommes-Poissons": AU_SOL,
  "Centaures": AU_SOL,
  "Mimis": AU_SOL,
  "Ondins": AU_SOL,
  "Sirènes": AU_SOL,
  "Troglodytes": AU_SOL,
  "Salamandres": AU_SOL,
  "Chiens": AU_SOL,
  "Ours": AU_SOL,
  "Loups": AU_SOL,
  "Fauves": AU_SOL,
  "Wargs": AU_SOL,
  "Orcs": AU_SOL,
  "Gobelins": AU_SOL,
  "Guerriers du Chaos": AU_SOL,
  "Araignées Géantes": AU_SOL,
  "Dhampirs": AU_SOL,
  "Homuncules de Sang": AU_SOL,
  "Vermines mortuaires": AU_SOL,
};

/** Règles de CLAN, cumulées à celles de la race (la race « Élémentaire » est
 *  partagée par les quatre éléments : seul le clan de l'Air vole). */
export const CLAN_ABILITY_RULES: Readonly<Record<string, RaceAbilityRule>> = {
  "Le Souffle des Cimes": AILES,
  "Le Socle du Monde": LOURDS,
  "La Vague Sans Fin": AU_SOL,
  "La Colère des Flammes": AU_SOL,
};

/** Règles cumulées race + clan ; un obligatoire l'emporte sur un interdit. */
export function regleRace(race: string | null | undefined, clan?: string | null): Required<RaceAbilityRule> {
  const r = race ? RACE_ABILITY_RULES[race] : undefined;
  const c = clan ? CLAN_ABILITY_RULES[clan] : undefined;
  const obligatoires = [...new Set([...(r?.obligatoires ?? []), ...(c?.obligatoires ?? [])])];
  const interdits = [...new Set([...(r?.interdits ?? []), ...(c?.interdits ?? [])])].filter((l) => !obligatoires.includes(l));
  return { interdits, obligatoires };
}

export function estInterditPourRace(label: string, race: string | null | undefined, clan?: string | null): boolean {
  return regleRace(race, clan).interdits.includes(label);
}
