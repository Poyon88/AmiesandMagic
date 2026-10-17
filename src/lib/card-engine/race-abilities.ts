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
/** Peuples à terre qui peuvent CHEVAUCHER une monture volante : Vol permis
 *  (l'illustration les montre alors montés, cf. `volParMonture`). */
const CAVALIER = {} satisfies RaceAbilityRule;
/** Masses lentes : ni Vol, ni vivacité. */
const LOURDS = { interdits: ["Vol", "Célérité", "Esquive", "Traque"] } satisfies RaceAbilityRule;
/** Constructions sans chair : ni Vol, ni Poison, ni Drain de vie. */
const INERTES = { interdits: ["Vol", "Poison", "Drain de vie", "Régénération X"] } satisfies RaceAbilityRule;
/** Morts-vivants de chair : ni Vol ni Régénération. */
const CADAVRES = { interdits: ["Vol", "Régénération X", "Célérité"] } satisfies RaceAbilityRule;

/** Races dont seuls CERTAINS membres ont des ailes : Vol ni obligatoire ni
 *  interdit (il reste dans leur profil). Exemptées du test « races ailées ». */
export const AILES_FACULTATIVES: ReadonlySet<string> = new Set(["Démons"]);

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
  // Ajoutées le 2026-10-17 : toute race dont l'apparence (race-visuals) porte
  // des ailes vole — sinon l'illustration montre des ailes sur une carte sans
  // Vol. Le test « races ailées » vérifie cette correspondance.
  "Gargouilles": AILES,
  "Sphinx": AILES,
  "Sluaghs": AILES,

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
  // Une machine peut voler (luciole mécanique, ornithoptère) : Vol permis,
  // simplement absent de son profil — rare au tirage, « hors profil » à l'audit.
  "Machines": { interdits: INERTES.interdits.filter((l) => l !== "Vol") },
  "Cristallins": INERTES,
  "Bâtiments": { interdits: ["Vol", "Traque", "Raid", "Célérité", "Esquive", "Double Attaque", "Poison", "Drain de vie"] },

  // ─── Morts-vivants ────────────────────────────────────────────────────
  "Squelettes": { interdits: ["Vol", "Régénération X", "Poison", "Drain de vie"] },
  "Zombies": CADAVRES,
  "Momies": CADAVRES,
  "Ghoules": { interdits: ["Vol", "Régénération X"] },
  // Chairs cousues qui se réparent : Régénération permise (arbitrage 2026-10-17).
  "Chimères nécrotiques": AU_SOL,
  "Dullahans": AU_SOL,

  // ─── Peuples et bêtes à terre ─────────────────────────────────────────
  "Elfes": CAVALIER,
  "Elfes Corrompus": CAVALIER,
  "Hobbits": CAVALIER,
  "Farfadets": AU_SOL,
  "Korrigans": AU_SOL,
  "Faunes": AU_SOL,
  "Dryades": AU_SOL,
  "Nains": CAVALIER,
  "Gnomes": CAVALIER,
  "Kobolds": CAVALIER,
  "Humains": CAVALIER,
  "Nagas": AU_SOL,
  "Oni": CAVALIER,
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
  "Orcs": CAVALIER,
  "Gobelins": CAVALIER,
  "Guerriers du Chaos": AU_SOL,
  "Araignées Géantes": AU_SOL,
  "Dhampirs": CAVALIER,
  "Homuncules de Sang": AU_SOL,
  "Vermines mortuaires": AU_SOL,
};

// ─── Interdits THÉMATIQUES (2026-10-17) ───────────────────────────────────
// Cumulés aux règles ci-dessus : chaque groupe écarte les capacités dont
// l'IMAGE contredit la nature physique de la race. On ne vise que les
// contresens évidents (une fée qui piétine, un géant qui se cache) ; les
// capacités magiques ou abstraites restent permises à tous.

/** Trop petits ou trop légers pour écraser l'adversaire. */
const PETITS = { interdits: ["Piétinement"] } satisfies RaceAbilityRule;
/** Incorporels : rien à piétiner avec, rien à cuirasser. */
const ESPRITS = { interdits: ["Piétinement", "Armure"] } satisfies RaceAbilityRule;
/** Colosses : impossible de passer inaperçus. */
const COLOSSES = { interdits: ["Ombre"] } satisfies RaceAbilityRule;
/** Sans chair ni sang : ni dévorer les morts, ni boire la vie. */
const SANS_CHAIR = { interdits: ["Nécrophagie", "Vampirisme X"] } satisfies RaceAbilityRule;

export const THEME_ABILITY_RULES: Readonly<Record<string, RaceAbilityRule[]>> = {
  "Fées": [PETITS, { interdits: ["Armure"] }],
  "Farfadets": [PETITS],
  "Korrigans": [PETITS],
  "Hobbits": [PETITS],
  "Gnomes": [PETITS],
  "Kobolds": [PETITS],
  "Mimis": [PETITS],
  "Faucons": [PETITS],
  "Chiroptères": [PETITS],
  "Homuncules de Sang": [PETITS],
  "Vermines mortuaires": [PETITS],
  "Insectes": [PETITS],
  "Esprits": [ESPRITS],
  "Spectres": [ESPRITS],
  "Banshees": [ESPRITS],
  "Poltergeists": [ESPRITS],
  "Sluaghs": [ESPRITS],
  "Néphélides": [ESPRITS],
  "Géants": [COLOSSES],
  "Mammouths": [COLOSSES],
  "Éléphants": [COLOSSES],
  "Hommes-Arbres": [COLOSSES],
  "Léviathans": [COLOSSES],
  "Bêtes Chtoniennes": [COLOSSES],
  "Golems": [COLOSSES, SANS_CHAIR],
  "Trolls": [COLOSSES],
  "Ogres": [COLOSSES],
  "Dragons": [COLOSSES],
  "Machines": [SANS_CHAIR],
  "Cristallins": [SANS_CHAIR],
  "Gargouilles": [SANS_CHAIR, { interdits: ["Poison"] }],
  "Bâtiments": [SANS_CHAIR],
  "Squelettes": [{ interdits: ["Vampirisme X"] }],
  "Anges": [{ interdits: ["Nécrophagie", "Poison"] }],
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
  const t = race ? THEME_ABILITY_RULES[race] ?? [] : [];
  const c = clan ? CLAN_ABILITY_RULES[clan] : undefined;
  const obligatoires = [...new Set([...(r?.obligatoires ?? []), ...(c?.obligatoires ?? [])])];
  const interdits = [...new Set([...(r?.interdits ?? []), ...t.flatMap((x) => x.interdits ?? []), ...(c?.interdits ?? [])])]
    .filter((l) => !obligatoires.includes(l));
  return { interdits, obligatoires };
}

export function estInterditPourRace(label: string, race: string | null | undefined, clan?: string | null): boolean {
  return regleRace(race, clan).interdits.includes(label);
}

/** Races sans ailes dont le Vol vient d'une MONTURE volante (griffon, pégase,
 *  aigle géant, wyverne…) : Elfes, Humains, Nains, etc. (arbitrage 2026-10-17). */
export const CAVALIERS_VOLANTS: ReadonlySet<string> = new Set(
  Object.entries(RACE_ABILITY_RULES).filter(([, r]) => r === CAVALIER).map(([race]) => race),
);

/** L'Unité vole-t-elle parce qu'elle est montée ? (libellés de forge) */
export function volParMonture(race: string | null | undefined, labels: readonly string[]): boolean {
  return !!race && CAVALIERS_VOLANTS.has(race) && labels.includes("Vol");
}
