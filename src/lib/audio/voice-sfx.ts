// Bibliothèque des voix d'entrée en jeu (table `voice_sfx`, bucket `sfx-tracks`).
//
// Une voix est rangée par RACE, CLAN (facultatif : NULL = commune à la race) et
// GENRE (M, F, N). Son nom est dérivé du fichier importé :
// « <clan>_<fichier sans extension>_<genre> », ex. « Forge_Ardente_Let_them_come_3_M »,
// ou « <fichier>_<genre> » sans clan. Pas de race dans le nom (2026-10-13) :
// elle est déjà dans la colonne, le chemin et souvent le fichier ; le nom n'est
// donc unique QU'AU SEIN D'UNE RACE. C'est une simple réserve : rien en jeu ne
// la lit, le son d'une carte reste `cards.sfx_play_url`.
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { FACTIONS, getClanNamesForRace } from "@/lib/card-engine/constants";

export const VOICE_GENDERS = ["M", "F", "N"] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export const VOICE_GENDER_LABELS: Record<VoiceGender, string> = { M: "Masculin", F: "Féminin", N: "Neutre" };

export const VOICE_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "webm"] as const;

export interface VoiceSfx {
  id: number;
  name: string;
  race: string;
  clan: string | null;
  gender: VoiceGender;
  source_filename: string | null;
  file_path: string;
  file_url: string;
  created_at: string;
  used_by?: { id: number; name: string }[];
}

export function isVoiceGender(g: unknown): g is VoiceGender {
  return typeof g === "string" && (VOICE_GENDERS as readonly string[]).includes(g);
}

/** Singulier de la race (« Nains » → « Nain ») ; à défaut l'id sans son « s » final. */
export function raceSingulier(race: string): string {
  const bare = RACE_FORMS_FR[race]?.bare;
  if (bare) return bare;
  return race.replace(/s$/u, "");
}

const souligner = (s: string) => s.trim().replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

/** Nom du fichier sans son extension audio. */
export function baseFichier(filename: string): string {
  return filename.replace(/^.*[\\/]/, "").replace(/\.[A-Za-z0-9]{2,5}$/, "");
}

export function extensionFichier(filename: string): string | null {
  const m = filename.match(/\.([A-Za-z0-9]{2,5})$/);
  const ext = m?.[1]?.toLowerCase() ?? null;
  return ext && (VOICE_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}

const ARTICLE = /^(l['’]\s*|les\s+|le\s+|la\s+)/iu;

/** Clan tel qu'il entre dans un nom : sans article de tête ni apostrophe.
 *  « L'Ordre de l'Aube » → « Ordre_de_lAube », « La Forge Ardente » → « Forge_Ardente ». */
export function clanPourNom(clan: string): string {
  return souligner(clan.trim().replace(ARTICLE, "").replace(/['’]/g, ""));
}

/** Clé de comparaison : minuscules, sans accents, sans séparateurs. */
function cle(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Le fichier porte-t-il déjà le clan en tête (seul, ou après la race) ? */
function porteDejaLeClan(race: string, clan: string, fichier: string): boolean {
  const f = cle(fichier);
  const clans = [cle(clan), cle(clan.trim().replace(ARTICLE, ""))];
  const races = [cle(race), cle(raceSingulier(race))];
  return clans.some((c) => c && (f.startsWith(c) || races.some((r) => f.startsWith(r + c))));
}

/** « Nains », « La Forge Ardente », « M », « Let them come 3.mp3 » → « Forge_Ardente_Let_them_come_3_M ».
 *  Le clan n'est pas ajouté si le fichier le porte déjà en tête
 *  (« Humains_Ordre_de_laube_… » avec L'Ordre de l'Aube). */
export function nomVoix(race: string, clan: string | null, gender: VoiceGender, filename: string): string {
  const base = souligner(baseFichier(filename));
  const prefixe = clan && !porteDejaLeClan(race, clan, base) ? `${clanPourNom(clan)}_` : "";
  return `${prefixe}${base}_${gender}`;
}

/** Clans DÉCLARÉS pour la race, toutes factions confondues (tri alphabétique).
 *  Des cartes existent hors de ces clans (Humains de la Cour Écarlate, du
 *  Cénacle Nécromant…) : l'import propose aussi `tousLesClans()`. */
export function clansPourRace(race: string): string[] {
  if (!race) return [];
  const tous = new Set<string>();
  for (const f of Object.keys(FACTIONS)) {
    if (!FACTIONS[f].races?.includes(race)) continue;
    for (const c of getClanNamesForRace(f, race)) tous.add(c);
  }
  return [...tous].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Tous les clans du jeu (tri alphabétique) : ce qu'accepte l'API. */
export function tousLesClans(): string[] {
  const tous = new Set<string>();
  for (const f of Object.keys(FACTIONS)) for (const g of FACTIONS[f].clans ?? []) for (const n of g.names) tous.add(n);
  return [...tous].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Segment de chemin ASCII sûr pour le stockage (accents retirés). */
export function slugStockage(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/** Chemin dans le bucket : voices/<race>/[<clan>/]<genre>/<nom>.<ext>. */
export function cheminVoix(race: string, clan: string | null, gender: VoiceGender, name: string, ext: string): string {
  const dossierClan = clan ? `${slugStockage(clanPourNom(clan))}/` : "";
  return `voices/${slugStockage(race)}/${dossierClan}${gender}/${slugStockage(name)}.${ext}`;
}

export const VOICE_MIME: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", webm: "audio/webm",
};
