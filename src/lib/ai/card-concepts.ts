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

export interface CardConcept {
  subjectKind: SubjectKind;
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
  ideeNom: string;
  formeNom: string;
  formeAmbiance: string;
  ton: string;
}

export interface ConceptsDuLot {
  /** Lieux, dynasties, divinités… inventés pour le lot, réutilisables avec modération. */
  lexique: string[];
  concepts: CardConcept[];
}

const CHAMPS_TEXTE = ["sujet", "role", "scene", "cadrage", "elementsCharte", "ideeNom", "formeNom", "formeAmbiance", "ton"] as const;

const texte = (v: unknown, max = 240) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Un concept lisible, ou null s'il manque l'essentiel (le sujet). Une Unité
 *  qui recevrait un lieu ou un objet est ramenée à « membre ». */
export function sanitizeConcept(raw: unknown, type: string): CardConcept | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let kind = (SUBJECT_KINDS as readonly string[]).includes(r.subjectKind as string) ? r.subjectKind as SubjectKind : null;
  if (type === "Unité" && (!kind || !SUBJECT_KINDS_UNITE.includes(kind))) kind = "membre";
  if (!kind) kind = "evenement";
  const c = { subjectKind: kind } as CardConcept;
  for (const k of CHAMPS_TEXTE) c[k] = texte(r[k]);
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

/** Bloc « concept » injecté dans generate-text. */
export function conceptPourPrompt(c: CardConcept, lexique: string[] = []): string {
  const l = [
    `- CONCEPT DE LA CARTE (décidé pour le lot, à suivre) :`,
    `  • Sujet (${SUBJECT_KIND_LABELS[c.subjectKind]}) : ${c.sujet}`,
    c.role && `  • Rôle, lu dans sa mécanique : ${c.role}`,
    c.scene && `  • Scène : ${c.scene}`,
    c.cadrage && `  • Cadrage : ${c.cadrage}`,
    c.elementsCharte && `  • Éléments de la charte retenus : ${c.elementsCharte}`,
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
export function ancrageRace(physique: string, kind: SubjectKind): { prefixe: string | null; suffixe: string | null } {
  switch (kind) {
    case "membre": return { prefixe: physique, suffixe: null };
    case "groupe": return { prefixe: `A group of ${physique.replace(/^an?\s+/i, "")}`, suffixe: null };
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
