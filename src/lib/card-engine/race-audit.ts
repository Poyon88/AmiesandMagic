// AUDIT DE COHÉRENCE race ↔ capacités d'une Unité DÉJÀ en base (Édition).
//
// Le générateur respecte désormais les règles de race (race-abilities.ts) et
// les profils (likelyKeywords) ; le catalogue d'avant, non. Cet audit signale
// les cartes à reprendre à la main, sans rien écrire :
//   - interdites : capacités que la race ou le clan exclut (une Fée qui piétine) ;
//   - manquantes : obligatoires absentes (une Gargouille sans Vol) ;
//   - hors profil : ni dans le profil de clan, de race, ni de faction ; signalé
//     seulement quand AUCUNE capacité de la carte n'est typique (≥ 3).
import type { Card } from "@/lib/game/types";
import { composedAbilityIds } from "@/lib/game/ability-filter";
import { GAME_TO_FORGE_KEYWORD } from "@/lib/card-forge/keyword-instances";
import { FACTIONS } from "./constants";
import { getAvailableKeywords } from "./generator";
import { regleRace } from "./race-abilities";

export type NiveauCoherence = "ok" | "orange" | "rouge";

export interface AuditCoherence {
  niveau: NiveauCoherence;
  /** 0-100, pour trier (100 = tout colle ; le hors-profil pèse peu). */
  note: number;
  interdits: string[];
  manquants: string[];
  horsProfil: string[];
  /** Nombre de capacités (libellés de forge) prises en compte. */
  total: number;
}

export interface CarteAuditable {
  card_type: string;
  faction: string | null;
  race: string | null;
  clan: string | null;
  rarity: string | null;
  keywords: string[] | null;
  capabilities?: Card["capabilities"] | null;
}

/** Libellés de forge de la carte (mots-clés + capacités d'effets composés). */
export function labelsDeCarte(c: Pick<CarteAuditable, "keywords" | "capabilities">): string[] {
  const ids = [...(c.keywords ?? []), ...composedAbilityIds(c.capabilities)];
  return [...new Set(ids.map((id) => GAME_TO_FORGE_KEYWORD[id]).filter((l): l is string => !!l))];
}

/** Audit d'une Unité ; null pour une Action, un Objet ou une faction inconnue. */
export function auditCoherence(c: CarteAuditable): AuditCoherence | null {
  if (c.card_type !== "creature" || !c.faction || !FACTIONS[c.faction]) return null;
  const labels = labelsDeCarte(c);
  const regle = regleRace(c.race, c.clan);
  const profil = new Set(
    getAvailableKeywords(c.faction, c.rarity ?? "Commune", c.race ?? undefined, c.clan ?? undefined)
      .filter((k) => k.profiled).map((k) => k.id),
  );
  const interdits = labels.filter((l) => regle.interdits.includes(l));
  const manquants = regle.obligatoires.filter((l) => !labels.includes(l));
  const horsProfil = labels.filter((l) => !profil.has(l) && !interdits.includes(l));
  const total = labels.length;
  const part = total ? horsProfil.length / total : 0;
  // Orange = AUCUNE capacité typique sur au moins 3 : le générateur laisse
  // volontiers la moitié du tirage hors profil (variété voulue), un mélange
  // n'est donc pas une anomalie.
  const niveau: NiveauCoherence = interdits.length || manquants.length
    ? "rouge"
    : total >= 3 && part === 1 ? "orange" : "ok";
  const note = Math.max(0, Math.round(100 - 40 * interdits.length - 40 * manquants.length - 20 * part));
  return { niveau, note, interdits, manquants, horsProfil, total };
}

/** Les capacités les plus typiques du profil, pour guider la correction. */
export function capacitesTypiques(c: CarteAuditable, n = 5): string[] {
  if (!c.faction || !FACTIONS[c.faction]) return [];
  const interdits = regleRace(c.race, c.clan).interdits;
  return getAvailableKeywords(c.faction, c.rarity ?? "Commune", c.race ?? undefined, c.clan ?? undefined)
    .filter((k) => k.profiled && !interdits.includes(k.id))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((k) => k.id);
}

/** Infobulle d'une carte signalée. */
export function resumeAudit(a: AuditCoherence): string {
  return [
    a.interdits.length ? `Interdites : ${a.interdits.join(", ")}` : "",
    a.manquants.length ? `Manque : ${a.manquants.join(", ")}` : "",
    a.horsProfil.length ? `Hors profil : ${a.horsProfil.join(", ")}` : "",
  ].filter(Boolean).join(" · ");
}
