// CONCEPTS DE CARTE — ce qui rend une carte DIFFÉRENTE de ses voisines : qui
// elle représente, dans quelle scène, sous quel nom et avec quelle voix.
//
// Avant (2026-10-12), chaque carte d'un lot recevait presque le même prompt et
// ignorait les autres : dix Nains en armure, marteau et bouclier hexagonal,
// tous « Garde… de Burin ». Désormais la Création assistée fait inventer le lot
// ENTIER d'un coup à Claude (route /api/forge/concepts), puis chaque carte est
// rédigée à partir de son concept (generate-text). Ce module en porte les
// types, la validation et les morceaux de prompt partagés par les deux routes.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Nature du sujet de l'illustration. Une Unité est toujours un être (ou un
 *  groupe, une monture montée, une machine servie) ; une Action peut montrer
 *  un lieu, un objet ou un événement sans personnage. */
export const SUBJECT_KINDS = ["membre", "groupe", "monture", "machine", "lieu", "objet", "evenement"] as const;
export type SubjectKind = typeof SUBJECT_KINDS[number];
export const SUBJECT_KINDS_UNITE: readonly SubjectKind[] = ["membre", "groupe", "monture", "machine"];
export const SUBJECT_KIND_LABELS: Record<SubjectKind, string> = {
  membre: "un membre de la race", groupe: "un groupe", monture: "une monture et son cavalier",
  machine: "une machine ou une construction servie", lieu: "un lieu", objet: "un objet", evenement: "un événement",
};

/** ÉCHELLE de la scène, tirée au sort par carte (2026-10-16) : laissée au
 *  choix de Claude, presque toutes les illustrations étaient un personnage en
 *  gros plan. Une Unité montre une figure seule, entourée, un groupe ou une
 *  armée ; une Action un sort, une manœuvre ou un lieu/événement. */
export const ECHELLES_UNITE = ["seule", "entourage", "groupe", "armee"] as const;
export const ECHELLES_ACTION = ["sort", "manoeuvre", "lieu"] as const;
export const ECHELLES = [...ECHELLES_UNITE, ...ECHELLES_ACTION] as const;
export type Echelle = typeof ECHELLES[number];

export const ECHELLE_LABELS: Record<Echelle, string> = {
  seule: "figure seule", entourage: "figure et son entourage", groupe: "groupe, unité",
  armee: "armée, foule dans un vaste décor", sort: "sort en train d'opérer",
  manoeuvre: "manœuvre de troupes", lieu: "lieu ou événement",
};

/** Consigne d'image (anglais, reprise dans l'illustrationPrompt). */
export const ECHELLE_CONSIGNES: Record<Echelle, string> = {
  seule: "a single figure alone in the scene, shown whole within its setting (not a face close-up)",
  entourage: "one central figure surrounded by attendants, guards, servants or supplicants who give it rank and scale",
  groupe: "a band of three to ten members acting together, no single hero, each figure readable",
  armee: "a host of dozens of figures spread across a vast setting, individuals small, the mass and the landscape tell the story",
  sort: "magic visibly at work: the spell's effect fills the scene, with or without its caster",
  manoeuvre: "troops in action: a charge, an ambush, a shield wall, a formation, a rampart held — several figures, movement",
  lieu: "the place or the event itself dominates the image (a building, a landscape, a rite, a feast), figures tiny or absent",
};

/** Contrainte de nom : une Unité en groupe ou en armée porte un nom collectif. */
export const ECHELLE_NOMS: Partial<Record<Echelle, string>> = {
  seule: "nom d'UN individu ou d'UNE créature (singulier)",
  entourage: "nom de la figure centrale (singulier), pas de son entourage",
  groupe: "nom COLLECTIF d'une troupe (« Les Veilleurs de Sang », « La Garde des Mille Serments », « Escouade… »)",
  armee: "nom COLLECTIF d'une armée ou d'une foule (« Légion… », « L'Ost de… », « La Horde… », « Le Cortège… »)",
};

/** Créatures par essence grandes et puissantes : plus souvent seules, jamais
 *  en armée sous 9 de mana. Clés de race, ou de clan pour les Élémentaires. */
export const RACES_COLOSSALES: ReadonlySet<string> = new Set([
  "Géants", "Dragons", "Griffons", "Hommes-Arbres", "Trolls", "Ogres", "Golems", "Aigles Géants", "Phoenix",
  "Sphinx", "Léviathans", "Araignées Géantes", "Bêtes Chtoniennes", "Chimères nécrotiques", "Qilins", "Oni", "Démons",
  "La Colère des Flammes", "Le Socle du Monde", "La Vague Sans Fin", "Le Souffle des Cimes",
]);

export interface CarteEchelle { type: string; rarity: string; mana: number; race?: string | null; clan?: string | null; heros?: boolean }

type Poids = Partial<Record<Echelle, number>>;
// Unités, par coût : seule / entourage / groupe / armée.
const POIDS_COUT: [number, Poids][] = [
  [2, { seule: 80, entourage: 10, groupe: 10, armee: 0 }],
  [4, { seule: 50, entourage: 15, groupe: 30, armee: 5 }],
  [6, { seule: 30, entourage: 20, groupe: 35, armee: 15 }],
  [8, { seule: 20, entourage: 20, groupe: 30, armee: 30 }],
  [Infinity, { seule: 15, entourage: 20, groupe: 25, armee: 40 }],
];
const POIDS_HEROS: Poids = { seule: 60, entourage: 40 };
const POIDS_COLOSSE: Poids = { seule: 70, entourage: 20, groupe: 10, armee: 0 };
const POIDS_COLOSSE_9: Poids = { seule: 60, entourage: 15, groupe: 15, armee: 10 };
const POIDS_ACTION: Poids = { sort: 45, manoeuvre: 35, lieu: 20 };

export const estColossale = (c: Pick<CarteEchelle, "race" | "clan">) =>
  !!((c.race && RACES_COLOSSALES.has(c.race)) || (c.clan && RACES_COLOSSALES.has(c.clan)));

/** Poids des échelles pour une carte. Priorité : héros > colossale > coût. */
export function poidsEchelle(c: CarteEchelle): Poids {
  if (c.type === "Action") return POIDS_ACTION;
  if (c.heros) return POIDS_HEROS;
  if (estColossale(c)) return c.mana >= 9 ? POIDS_COLOSSE_9 : POIDS_COLOSSE;
  return POIDS_COUT.find(([max]) => c.mana <= max)![1];
}

function tirerPondere(p: Poids, tirage: () => number): Echelle {
  const entrees = Object.entries(p).filter(([, w]) => (w ?? 0) > 0) as [Echelle, number][];
  const total = entrees.reduce((s, [, w]) => s + w, 0);
  let x = tirage() * total;
  for (const [e, w] of entrees) if ((x -= w) < 0) return e;
  return entrees[entrees.length - 1][0];
}

/** Un seul tirage pondéré (forge à l'unité). Sans plan de lot, une Légendaire
 *  est traitée en héros. */
export const echellePourCarte = (c: CarteEchelle, tirage: () => number = Math.random): Echelle =>
  tirerPondere(poidsEchelle({ ...c, heros: c.heros ?? c.rarity === "Légendaire" }), tirage);

/** Échelles d'un lot, tirage STRATIFIÉ : les cartes de même barème sont
 *  réparties au plus fort reste (10 cartes à 1-2 mana → 8 seules, 1 entourée,
 *  1 groupe), le reliquat tiré au sort, puis l'ordre mélangé. Héros : toutes
 *  les Légendaires et une Épique sur deux (alternance tirée au sort). */
export function repartirEchelles(cartes: CarteEchelle[], tirage: () => number = Math.random): Echelle[] {
  let epique = tirage() < 0.5;
  const avecHeros = cartes.map((c) => {
    if (c.type === "Action") return { ...c, heros: false };
    if (c.heros != null) return c;
    if (c.rarity === "Légendaire") return { ...c, heros: true };
    if (c.rarity === "Épique") { epique = !epique; return { ...c, heros: epique }; }
    return { ...c, heros: false };
  });
  const groupes = new Map<Poids, number[]>();
  avecHeros.forEach((c, i) => {
    const p = poidsEchelle(c);
    groupes.set(p, [...(groupes.get(p) ?? []), i]);
  });
  const out: Echelle[] = new Array(cartes.length);
  for (const [p, indices] of groupes) {
    const n = indices.length;
    const entrees = Object.entries(p).filter(([, w]) => (w ?? 0) > 0) as [Echelle, number][];
    const total = entrees.reduce((s, [, w]) => s + w, 0);
    const parts = entrees.map(([e, w]) => ({ e, exact: (n * w) / total }));
    const liste: Echelle[] = parts.flatMap(({ e, exact }) => Array(Math.floor(exact)).fill(e));
    // Reliquat : tiré au prorata des restes, sans remise.
    const restes = Object.fromEntries(parts.map(({ e, exact }) => [e, exact - Math.floor(exact)])) as Poids;
    while (liste.length < n) {
      const e = tirerPondere(restes, tirage);
      liste.push(e);
      restes[e] = 0;
      if (!Object.values(restes).some((w) => (w ?? 0) > 0)) Object.assign(restes, Object.fromEntries(entrees));
    }
    repartir(liste, n, tirage).forEach((e, k) => { out[indices[k]] = e; });
  }
  return out;
}

/** Nature du sujet cohérente avec l'échelle (celle de Claude si elle l'est déjà). */
export function kindPourEchelle(e: Echelle, kind: SubjectKind | null): SubjectKind {
  switch (e) {
    case "seule": case "entourage": return kind && ["membre", "monture", "machine"].includes(kind) ? kind : "membre";
    case "groupe": case "armee": case "manoeuvre": return "groupe";
    case "lieu": return kind && ["lieu", "evenement", "objet"].includes(kind) ? kind : "lieu";
    case "sort": return kind && kind !== "groupe" ? kind : "evenement";
  }
}

export interface CardConcept {
  subjectKind: SubjectKind;
  /** Échelle tirée (absente dans les plans enregistrés avant 2026-10-16). */
  echelle?: Echelle;
  /** Qui ou quoi (« vieille forgeronne aveugle », « wagonnet piégé »). */
  sujet: string;
  /** Ce que la carte FAIT, lu dans sa mécanique (« tient la brèche », « se sacrifie »). */
  role: string;
  /** Où et quel instant. */
  scene: string;
  /** Portrait serré, plan moyen, plan large, contre-plongée… */
  cadrage: string;
  /** Les un ou deux éléments du répertoire de la charte retenus pour cette carte. */
  elementsCharte: string;
  /** Heure, lumière et météo (MOMENTS) : la lumière et les couleurs dominantes en découlent. */
  moment: string;
  /** Tenue du sujet (TENUES) : sans elle, tout le clan portait le même costume. */
  tenue: string;
  ideeNom: string;
  formeNom: string;
  formeAmbiance: string;
  ton: string;
  /** Échange de capacité décidé au concept (ids du registre) : appliqué au
   *  plan avant l'équilibrage, annulable dans l'interface. */
  echange?: { de: string; vers: string; raison: string };
}

export interface ConceptsDuLot {
  /** Lieux, dynasties, divinités… inventés pour le lot, réutilisables avec modération. */
  lexique: string[];
  concepts: CardConcept[];
}

const CHAMPS_TEXTE = ["sujet", "role", "scene", "cadrage", "elementsCharte", "moment", "tenue", "ideeNom", "formeNom", "formeAmbiance", "ton"] as const;

const texte = (v: unknown, max = 240) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Un concept lisible, ou null s'il manque l'essentiel (le sujet). Une Unité
 *  qui recevrait un lieu ou un objet est ramenée à « membre ». */
export function sanitizeConcept(raw: unknown, type: string): CardConcept | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let kind = (SUBJECT_KINDS as readonly string[]).includes(r.subjectKind as string) ? r.subjectKind as SubjectKind : null;
  if (type === "Unité" && (!kind || !SUBJECT_KINDS_UNITE.includes(kind))) kind = "membre";
  if (!kind) kind = "evenement";
  const permises: readonly string[] = type === "Unité" ? ECHELLES_UNITE : type === "Action" ? ECHELLES_ACTION : ECHELLES;
  const echelle = permises.includes(r.echelle as string) ? r.echelle as Echelle : undefined;
  const c = { subjectKind: echelle ? kindPourEchelle(echelle, kind) : kind, ...(echelle ? { echelle } : {}) } as CardConcept;
  for (const k of CHAMPS_TEXTE) c[k] = texte(r[k]);
  // Forme seulement : la validité (échangeable, candidate) se juge sur la carte.
  const e = r.echange as Record<string, unknown> | null | undefined;
  if (type !== "Action" && e && typeof e === "object") {
    const de = texte(e.de, 60), vers = texte(e.vers, 60);
    if (de && vers && de !== vers) c.echange = { de, vers, raison: texte(e.raison, 120) };
  }
  return c.sujet ? c : null;
}

/** Valide la réponse du planificateur : un concept par carte, dans l'ordre. */
export function sanitizeConcepts(raw: unknown, types: string[]): { value: ConceptsDuLot; errors: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lexique = (Array.isArray(r.lexique) ? r.lexique : []).map((x) => texte(x, 80)).filter(Boolean).slice(0, 30);
  const liste = Array.isArray(r.concepts) ? r.concepts : [];
  const errors: string[] = [];
  if (liste.length !== types.length) errors.push(`${liste.length} concepts reçus pour ${types.length} cartes`);
  const concepts: CardConcept[] = [];
  types.forEach((t, i) => {
    const c = sanitizeConcept(liste[i], t);
    if (c) concepts.push(c);
    else errors.push(`concept ${i + 1} illisible`);
  });
  return { value: { lexique, concepts }, errors };
}

/** Premier mot significatif d'un nom (« Brogar l'Ancien » → « brogar »), pour
 *  interdire deux noms du lot qui commencent pareil. */
export function premierMot(nom: string): string {
  const mots = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[\s'’-]+/).filter((m) => m && !["le", "la", "les", "l", "un", "une", "des", "du", "de", "d"].includes(m));
  return mots[0] ?? "";
}

// ─── Morceaux de prompt partagés ────────────────────────────────────────────

/** Formes de nom. Les exemples sont volontairement disparates : un exemple
 *  unique devient un gabarit (« Gardes royales de Burin » a donné dix
 *  « … de Burin »). */
export const NAME_FORMS = {
  propre: {
    unite: [
      "nom propre seul (« Hilda »)",
      "nom + épithète (« Brogar l'Ancien », « Sven Main-de-Suie »)",
      "titre ou fonction rattaché à un personnage (« La Veuve du Puits Sept »)",
      "unité nommée (« Les Sept de la Faille »)",
      "surnom (« Vieille-Cendre »)",
    ],
    action: [
      "événement daté ou situé (« La Nuit des Soufflets »)",
      "serment, rite ou décret (« Serment du Dernier Filon »)",
      "objet nommé (« La Cloche d'Ormund »)",
      "fait d'armes (« La Chute de Haut-Gouffre »)",
    ],
  },
  generique: {
    unite: [
      "métier (« Souffleuse de forge »)",
      "rang ou fonction (« Vétéran des galeries »)",
      "créature ou machine (« Bélier à vapeur »)",
      "groupe (« Escouade de mineurs »)",
    ],
    action: [
      "geste (« Coup de grisou »)",
      "rite (« Bénédiction de l'enclume »)",
      "manœuvre (« Repli en tortue »)",
      "phénomène (« Pluie d'escarbilles »)",
    ],
  },
} as const;

export const FLAVOR_FORMS = [
  "réplique du personnage", "parole d'un témoin", "parole d'un ennemi", "proverbe du clan",
  "extrait de chronique", "inscription gravée", "vers d'un chant", "ordre crié", "dernières paroles",
] as const;

export const FLAVOR_TONES = ["grave", "ironique", "menaçant", "humour sec", "mélancolique", "fier", "inquiétant"] as const;

/** Heure, lumière et météo, imposées carte par carte (2026-10-15) : la charte
 *  fixait une seule lumière pour tout le clan, d'où huit Fils du Volcan de nuit
 *  devant le même volcan. Sous terre ou en intérieur, le moment se transpose. */
export const MOMENTS = [
  "aube froide", "matin clair", "plein midi écrasant", "après-midi doré", "crépuscule",
  "nuit étoilée", "nuit à la seule lueur des torches", "pluie battante", "brume épaisse",
  "ciel d'orage", "vent violent et poussière", "éclaircie après l'averse",
  "intérieur éclairé au feu", "intérieur baigné de jour", "pénombre d'un abri ou d'un souterrain",
] as const;

/** Tenue du sujet. Pour une bête, une machine ou un esprit : harnais, parures, ornements ou rien. */
export const TENUES = [
  "tenue de tous les jours", "tenue de travail ou de métier", "tenue de voyage", "tenue de cérémonie ou d'apparat",
  "tenue de guerre légère", "tenue de guerre lourde", "presque rien : peau, peintures ou parures",
  "tenue de deuil ou de pénitence", "tenue de chasse", "tenue usée, rapiécée, de fortune",
  "habit de rang ou de fonction (prêtre, chef, messager, juge)",
] as const;

/** Un tirage par carte dans une liste, en cycles mélangés : sur un lot, chaque
 *  valeur sort avant qu'une autre ne revienne. */
export function repartir<T>(liste: readonly T[], n: number, tirage: () => number = Math.random): T[] {
  const out: T[] = [];
  while (out.length < n) {
    const cycle = [...liste];
    for (let i = cycle.length - 1; i > 0; i--) {
      const j = Math.floor(tirage() * (i + 1));
      [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
    }
    out.push(...cycle);
  }
  return out.slice(0, n);
}

export const auHasard = <T>(liste: readonly T[], tirage: () => number = Math.random): T =>
  liste[Math.floor(tirage() * liste.length)];

export function nameRuleText(rule: "propre" | "generique", type: string): string {
  const unite = type === "Unité";
  const formes = NAME_FORMS[rule][unite ? "unite" : "action"].join(" ; ");
  if (rule === "propre") {
    return unite
      ? `carte en ÉDITION LIMITÉE : nom propre ou unité spécifique, JAMAIS un nom générique. Formes possibles : ${formes}.`
      : `action en ÉDITION LIMITÉE : elle nomme un événement, un rite, un objet ou un fait d'armes rattaché à un nom propre ; ce n'est PAS un personnage. Formes possibles : ${formes}.`;
  }
  return unite
    ? `carte COMMUNE : nom générique d'unité ou de créature, JAMAIS de nom propre ni de personnage nommé. Formes possibles : ${formes}.`
    : `action COMMUNE : nom générique d'action, JAMAIS de nom propre. Formes possibles : ${formes}.`;
}

/** Échelle imposée, sa consigne d'image et, pour une Unité, sa forme de nom. */
export function consigneEchelle(e: Echelle): string {
  const nom = ECHELLE_NOMS[e];
  return `ÉCHELLE IMPOSÉE : ${ECHELLE_LABELS[e]} — l'illustration le montre (« ${ECHELLE_CONSIGNES[e]} »)${nom ? ` ; le nom est un ${nom}` : ""}.`;
}

/** Bloc « concept » injecté dans generate-text. */
export function conceptPourPrompt(c: CardConcept, lexique: string[] = []): string {
  const l = [
    `- CONCEPT DE LA CARTE (décidé pour le lot, à suivre) :`,
    `  • Sujet (${SUBJECT_KIND_LABELS[c.subjectKind]}) : ${c.sujet}`,
    c.echelle && `  • ${consigneEchelle(c.echelle)}`,
    c.role && `  • Rôle, lu dans sa mécanique : ${c.role}`,
    c.scene && `  • Scène : ${c.scene}`,
    c.cadrage && `  • Cadrage : ${c.cadrage}`,
    c.elementsCharte && `  • Éléments de la charte retenus : ${c.elementsCharte}`,
    c.moment && `  • Moment, lumière et météo : ${c.moment}`,
    c.tenue && `  • Tenue : ${c.tenue}`,
    c.ideeNom && `  • Idée de nom (${c.formeNom || "forme libre"}) : ${c.ideeNom} — tu peux l'améliorer, garde la forme`,
    c.formeAmbiance && `  • Texte d'ambiance : ${c.formeAmbiance}${c.ton ? `, ton ${c.ton}` : ""}`,
    lexique.length ? `  • Lexique du lot (lieux, lignées… réutilisables avec modération) : ${lexique.join(" ; ")}` : "",
  ];
  return l.filter(Boolean).join("\n");
}

/** Préfixe d'apparence placé en tête de l'illustrationPrompt (garde-fou
 *  anti-dérive de race). Pour un sujet qui n'est pas un être de la race (lieu,
 *  objet, machine, événement), l'apparence ne s'applique qu'aux silhouettes
 *  éventuelles et passe en fin de prompt. */
export function ancrageRace(physique: string, kind: SubjectKind, echelle?: Echelle): { prefixe: string | null; suffixe: string | null } {
  switch (kind) {
    case "membre": return { prefixe: physique, suffixe: null };
    case "groupe": return { prefixe: `${echelle === "armee" ? "A vast host of" : "A group of"} ${physique.replace(/^an?\s+/i, "")}`, suffixe: null };
    case "monture": return { prefixe: null, suffixe: `The rider is a ${physique.replace(/^an?\s+/i, "")}.` };
    default: return { prefixe: null, suffixe: `Any figures shown are ${physique.replace(/^an?\s+/i, "")}.` };
  }
}

// ─── Catalogue existant ─────────────────────────────────────────────────────

export interface CarteCatalogue {
  name: string;
  card_type: string | null;
  race: string | null;
  clan: string | null;
  keywords: unknown;
  illustration_prompt: string | null;
}

/** Une ligne par carte existante : ce que le lot doit compléter, pas doubler. */
export function resumeCatalogue(rows: CarteCatalogue[], { max = 150, prompt = 120 } = {}): string[] {
  return rows.slice(0, max).map((r) => {
    const kws = Array.isArray(r.keywords) ? (r.keywords as unknown[]).filter((k) => typeof k === "string").slice(0, 4).join(", ") : "";
    const ill = (r.illustration_prompt ?? "").replace(/\s+/g, " ").trim().slice(0, prompt);
    return `${r.name}${r.card_type === "spell" ? " (action)" : ""}${kws ? ` [${kws}]` : ""}${ill ? ` — ${ill}` : ""}`;
  });
}

/** Cartes existantes des races (et du clan, en tête) du lot, hors retirées. */
export async function chargerCatalogue(admin: SupabaseClient, races: string[], clans: string[], limit = 300): Promise<CarteCatalogue[]> {
  if (!races.length && !clans.length) return [];
  let q = admin.from("cards").select("name, card_type, race, clan, keywords, illustration_prompt").neq("status", "retired").limit(limit);
  q = races.length ? q.in("race", races) : q.in("clan", clans);
  const { data } = await q;
  const rows = (data ?? []) as CarteCatalogue[];
  const duClan = (r: CarteCatalogue) => (r.clan && clans.includes(r.clan) ? 0 : 1);
  return rows.sort((a, b) => duClan(a) - duClan(b));
}

// ─── Plan enregistré avec le brief ──────────────────────────────────────────

/** Concepts validés à l'étape Concepts, gardés dans `card_briefs.brief.plan`.
 *  `seed` fige le tirage de `planBatch` : sans lui, les cartes recalculées au
 *  lancement ne seraient plus celles pour lesquelles les concepts ont été écrits. */
export interface ConceptPlan { seed: number; lexique: string[]; concepts: CardConcept[] }

export function sanitizePlan(raw: unknown): ConceptPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const seed = Number(r.seed);
  if (!Number.isInteger(seed) || seed <= 0) return null;
  const concepts = (Array.isArray(r.concepts) ? r.concepts : []).slice(0, 100)
    .map((c) => sanitizeConcept(c, "")).filter((c): c is CardConcept => c !== null);
  if (!concepts.length) return null;
  const lexique = (Array.isArray(r.lexique) ? r.lexique : []).map((x) => texte(x, 80)).filter(Boolean).slice(0, 30);
  return { seed, lexique, concepts };
}
