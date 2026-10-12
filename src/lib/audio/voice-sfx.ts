// Bibliothèque des voix d'entrée en jeu (table `voice_sfx`, bucket `sfx-tracks`).
//
// Une voix est rangée par RACE et par GENRE (M, F, N). Son nom est dérivé du
// fichier importé : « <race au singulier>_<fichier sans extension>_<genre> »,
// ex. « Nain_Let_them_come_3_M ». C'est une simple réserve : rien en jeu ne la
// lit, le son d'une carte reste `cards.sfx_play_url`.
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";

export const VOICE_GENDERS = ["M", "F", "N"] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export const VOICE_GENDER_LABELS: Record<VoiceGender, string> = { M: "Masculin", F: "Féminin", N: "Neutre" };

export const VOICE_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "webm"] as const;

export interface VoiceSfx {
  id: number;
  name: string;
  race: string;
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

/** « Nains », « M », « Let them come 3.mp3 » → « Nain_Let_them_come_3_M ». */
export function nomVoix(race: string, gender: VoiceGender, filename: string): string {
  return `${souligner(raceSingulier(race))}_${souligner(baseFichier(filename))}_${gender}`;
}

/** Segment de chemin ASCII sûr pour le stockage (accents retirés). */
export function slugStockage(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/** Chemin dans le bucket : voices/<race>/<genre>/<nom>.<ext>. */
export function cheminVoix(race: string, gender: VoiceGender, name: string, ext: string): string {
  return `voices/${slugStockage(race)}/${gender}/${slugStockage(name)}.${ext}`;
}

export const VOICE_MIME: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", webm: "audio/webm",
};
