// Association AUTOMATIQUE d'une voix d'entrée en jeu à une carte (arbitrage
// auteur 2026-10-14). Pur : les candidates se décident ici ; le choix de la
// RÉPLIQUE la plus proche de la carte est fait par Claude dans
// /api/voice-sfx/assign, puis la prise la moins utilisée de cette réplique.
//
// Candidates, du plus précis au plus large :
//   · même race ; voix du CLAN de la carte, à défaut voix communes à la race ;
//   · même genre, à défaut voix neutres. Une carte sans genre connu (anciennes
//     cartes) garde toutes les voix : Claude le déduit de la carte.
import type { VoiceGender, VoiceSfx } from "./voice-sfx";
import { baseFichier } from "./voice-sfx";

export type VoixCandidate = Pick<VoiceSfx, "id" | "race" | "clan" | "gender" | "source_filename" | "file_path" | "file_url">;

export interface CarteVoix {
  race: string | null;
  clan: string | null;
  gender: string | null;   // "homme" | "femme" | "neutre" | null (cards.gender)
}

const GENRE_CARTE: Record<string, VoiceGender> = { homme: "M", femme: "F", neutre: "N" };

export function genreVoix(g: string | null): VoiceGender | null {
  return g ? GENRE_CARTE[g] ?? null : null;
}

export function candidatesVoix<V extends VoixCandidate>(carte: CarteVoix, voix: V[]): V[] {
  if (!carte.race) return [];
  const race = voix.filter((v) => v.race === carte.race);
  const duClan = carte.clan ? race.filter((v) => v.clan === carte.clan) : [];
  const niveau = duClan.length ? duClan : race.filter((v) => v.clan === null);
  const g = genreVoix(carte.gender);
  if (!g) return niveau;
  const meme = niveau.filter((v) => v.gender === g);
  if (meme.length) return meme;
  return g === "N" ? niveau : niveau.filter((v) => v.gender === "N");
}

/** Texte prononcé, lu dans le nom du fichier importé : « Let_them_come_3.mp3 » → « Let them come ».
 *  Le numéro final distingue les PRISES d'une même réplique. */
export function repliqueVoix(v: Pick<VoixCandidate, "source_filename" | "file_path">): string {
  const base = baseFichier(v.source_filename ?? v.file_path);
  return base.replace(/[_-]+/g, " ").replace(/\s+\d+\s*$/u, "").replace(/\s+[MFN]$/u, "").replace(/\s+/g, " ").trim();
}

/** Candidates regroupées par réplique ET genre de voix (ordre stable : première apparition). */
export function repliquesVoix<V extends VoixCandidate>(voix: V[]): { texte: string; gender: VoiceGender; prises: V[] }[] {
  const groupes = new Map<string, { texte: string; gender: VoiceGender; prises: V[] }>();
  for (const v of voix) {
    const texte = repliqueVoix(v);
    const k = `${v.gender}|${texte}`;
    const g = groupes.get(k) ?? { texte, gender: v.gender, prises: [] };
    g.prises.push(v);
    groupes.set(k, g);
  }
  return [...groupes.values()];
}

/** Prise la moins utilisée (à égalité, la plus ancienne id) : varie les sons
 *  quand plusieurs cartes reçoivent la même réplique. */
export function priseMoinsUtilisee<V extends VoixCandidate>(prises: V[], usage: Map<string, number>): V {
  return [...prises].sort((a, b) => (usage.get(a.file_url) ?? 0) - (usage.get(b.file_url) ?? 0) || a.id - b.id)[0];
}
