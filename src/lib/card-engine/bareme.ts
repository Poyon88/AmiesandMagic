// BARÈME DE POINTS — la norme qui note TOUTES les cartes (unités, actions,
// objets), calibrée sur les cartes Jouables (cf. scripts de calibrage :
// src/lib/card-engine/calibrer-bareme.run.test.ts).
//
// Deux familles de paramètres :
//  • LINÉAIRES — des points : prix de l'ATQ/DEF, coût de base / par X / par Y
//    de chaque capacité nommée et de chaque contenu d'effet composé, points des
//    coûts additionnels, socle par type de carte ;
//  • MULTIPLICATEURS — sans unité : déclencheur, portée, cible, filtre, hasard,
//    Singulier, rareté, type de carte, éveil.
// Le score d'une carte (card-points.ts) est le produit des deux, et c'est cette
// même fonction que le calibrage ajuste : la jauge ne peut pas diverger du
// modèle qui a produit ses chiffres.
//
// Comme l'ancien barème (balance.ts), il ne sert qu'à CRÉER et JUGER des cartes ;
// le moteur de jeu ne le lit jamais : aucune désynchronisation possible.
import type { CapabilityTrigger, ComposedEffectContent } from "@/lib/game/types";
import generated from "./bareme.generated.json";

export interface CoutLineaire {
  /** Points pour X = 1 (ou capacité sans X). */
  base: number;
  /** Points par X au-delà du premier. */
  perX: number;
  /** Points par Y au-delà du premier (couples +X/+Y). */
  perY: number;
  /** Nombre de cartes Jouables qui ont servi à l'estimer (0 = a priori seul). */
  n?: number;
}

export interface Bareme {
  version: number;
  /** Points par mana (échelle d'affichage : 10 à la Commune). */
  pointsParMana: number;
  stat: { atk: number; def: number };
  /** Socle en points par type de carte (« corps » gratuit, peut être négatif). */
  socle: { creature: number; spell: number; item: number };
  /** Multiplicateur du budget par type (unité = 1, référence). */
  type: { creature: number; spell: number; item: number };
  rarete: Record<string, number>;
  /** Mana équivalent d'un point d'éveil : budget sur (mana + k × éveil). */
  eveil: number;
  /** Points rendus par unité de coût additionnel (négatifs). */
  additionnel: { life: number; discard: number; sacrifice: number; exile: number; topdeck: number; equip: number };
  /** Rabais total des coûts additionnels plafonné à cette part du budget. */
  plafondAdditionnel: number;
  declencheur: Partial<Record<CapabilityTrigger, number>>;
  portee: { all_enemies: number; all_allies: number; all: number };
  cible: {
    /** Composé visant un héros seul / héros + unités. */
    hero: number; both: number;
    /** Composé sur la source elle-même. */
    self: number;
    /** Par cible supplémentaire (count = n ⇒ 1 + parCible × (n − 1)). */
    parCible: number;
  };
  /** Filtre race/clan/faction/mot-clé/coût : mult = a + (1 − a) × part du
   *  catalogue visée. `a` = valeur résiduelle d'un groupe minuscule. */
  filtre: { a: number };
  /** Part du catalogue Jouable de chaque groupe (« race:Elfes », « clan:… »,
   *  « faction:… », « kw:vol », « cout<=3 »). Absent ⇒ 1 (aucun rabais). */
  parts: Record<string, number>;
  /** Tirage au hasard (X « ? », désignation au hasard, répartition). */
  hasard: number;
  singulier: number;
  /** Don d'une capacité (Conférer composé) : part de la valeur de la capacité
   *  conférée qui compte, en plus du socle du contenu. */
  don: number;
  capacites: Record<string, CoutLineaire>;
  composes: Partial<Record<ComposedEffectContent, CoutLineaire>>;
  /** Qualité du calibrage, pour l'onglet Budget et le rapport. */
  qualite?: { r2: number; erreurMedianeMana: number; cartes: number; date: string };
}

/** Multiplicateurs de budget par rareté FIXÉS par l'auteur (2026-10-12) : le
 *  calibrage les donnait non croissants (PC 1,23 > R 1,10 > É 1,05), faute de
 *  cartes jouables en nombre dans les hautes raretés. Le calibrage ne les
 *  réestime plus ; ils restent ajustables dans l'onglet Budget. */
export const RARETE_FIXEE: Record<string, number> = {
  "Commune": 1.0, "Peu Commune": 1.1, "Rare": 1.2, "Épique": 1.3, "Légendaire": 1.4,
};

/** Barème produit par le calibrage (fichier versionné). */
export const BAREME_CALIBRE = generated as unknown as Bareme;

let courant: Bareme = BAREME_CALIBRE;

/** Barème appliqué (calibré + surcharges de l'onglet Budget). */
export function getBareme(): Bareme {
  return courant;
}

/** Surcharges PARTIELLES enregistrées dans `balance_overrides.bareme`. */
export type BaremeOverrides = DeepPartial<Bareme>;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function fusion<T>(base: T, ov: unknown): T {
  if (ov == null || typeof ov !== "object" || Array.isArray(ov)) return (ov === undefined ? base : (ov as T)) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(ov as Record<string, unknown>)) {
    if (v === undefined) continue;
    const b = (base as Record<string, unknown>)?.[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) ? fusion(b, v) : v;
  }
  return out as T;
}

/** Repart TOUJOURS du barème calibré, puis applique les écarts. */
export function applyBaremeOverrides(ov: BaremeOverrides | null | undefined): Bareme {
  courant = ov ? fusion(BAREME_CALIBRE, ov) : BAREME_CALIBRE;
  return courant;
}

const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Ne garde d'une surcharge que les clés du barème calibré portant des nombres
 *  finis — même garde-fou que `sanitizeBalanceOverrides` : un JSONB accepte
 *  n'importe quoi, et un `NaN` glissé là ferait afficher une jauge « NaN ». */
export function sanitizeBaremeOverrides(brut: unknown, modele: unknown = BAREME_CALIBRE): BaremeOverrides | undefined {
  if (!brut || typeof brut !== "object" || Array.isArray(brut) || !modele || typeof modele !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(brut as Record<string, unknown>)) {
    if (k === "qualite" || k === "version" || k === "parts") continue;
    const m = (modele as Record<string, unknown>)[k];
    if (m === undefined) continue;
    if (typeof m === "number") { if (estNombre(v)) out[k] = v; continue; }
    const sous = sanitizeBaremeOverrides(v, m);
    if (sous && Object.keys(sous).length) out[k] = sous;
  }
  return Object.keys(out).length ? (out as BaremeOverrides) : undefined;
}
