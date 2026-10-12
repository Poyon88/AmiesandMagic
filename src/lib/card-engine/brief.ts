// BRIEF DE CRÉATION ASSISTÉE — ce que l'auteur décrit dans le chat de la forge,
// sous forme structurée. Produit par Claude (route /api/forge/brief-chat),
// TOUJOURS repassé par `sanitizeBrief` : rien de ce que renvoie le modèle n'est
// cru sur parole (ids inconnus écartés et signalés, bornes appliquées).
//
// Les capacités sont désignées par leur id de REGISTRE (`ABILITIES`, ex.
// « vol », « impact ») : le même id vaut pour une Unité (libellé de forge) et
// pour une Action (capacité de sort).
import { ABILITIES } from "@/lib/game/abilities";
import { FACTIONS, getAllClanNames, getAllRaces, RARITIES } from "./constants";

export const BRIEF_MAX_CARDS = 100;

export type BriefFreq = "leger" | "moyen" | "fort";
export type BriefType = "Unité" | "Action";
/** Déclencheurs proposés à l'auteur (= modes de la forge ; « entry » = à l'entrée en jeu). */
export const BRIEF_TRIGGERS = ["entry", "death", "tap", "return", "attack", "end_of_turn", "start_of_turn", "draw", "low_hp", "wound"] as const;
export type BriefTrigger = (typeof BRIEF_TRIGGERS)[number];
export const BRIEF_TRIGGER_LABELS: Record<BriefTrigger, string> = {
  entry: "à l'entrée en jeu", death: "à la mort", tap: "à l'activation", return: "au retour en main",
  attack: "à l'attaque", end_of_turn: "en fin de tour", start_of_turn: "en début de tour", draw: "à la pioche",
  low_hp: "sous 15 PV", wound: "à la blessure",
};
/** Coûts additionnels générables (l'Éveil et l'équipement en sont exclus). */
export const BRIEF_COSTS = ["life", "discard", "sacrifice", "exile", "topdeck"] as const;
export type BriefCost = (typeof BRIEF_COSTS)[number];
export const BRIEF_COST_LABELS: Record<BriefCost, string> = {
  life: "payer des PV", discard: "défausser des cartes", sacrifice: "sacrifier une créature alliée",
  exile: "exiler des cartes du cimetière", topdeck: "replacer des cartes de la main sur le deck",
};
/** Part des cartes du lot qui portent un coût additionnel, par fréquence (arbitrage 2026-10-12). */
export const COST_FREQ_SHARE: Record<BriefFreq, number> = { leger: 0.05, moyen: 0.15, fort: 0.30 };
/** Poids d'un déclencheur au tirage, par fréquence ; non cité = NON_CITE. */
export const TRIGGER_FREQ_WEIGHT: Record<BriefFreq, number> = { leger: 1, moyen: 3, fort: 6 };
export const TRIGGER_NON_CITE = 0.3;

export type BriefEdition =
  | { kind: "limited"; year: number; month?: number | null }
  | { kind: "set"; setId: number }
  | { kind: "none" };

export interface CardBrief {
  title: string;
  count: number;
  faction: string;
  /** Races retenues ; vide = celles de la faction. */
  races: string[];
  /** Clans retenus ; vide = au hasard parmi ceux de la race. */
  clans: string[];
  /** Parts relatives par type, rareté et coût en mana (vide = défaut). */
  types: Partial<Record<BriefType, number>>;
  rarities: Partial<Record<string, number>>;
  manaCurve: Partial<Record<string, number>>;
  edition: BriefEdition;
  abilities: { id: string; pct: number }[];
  triggers: { trigger: BriefTrigger; freq: BriefFreq }[];
  additionalCosts: { cost: BriefCost; freq: BriefFreq }[];
  gender: { M: number; F: number; O: number };
  constraints: { minMana?: number; maxMana?: number; excludedAbilities?: string[]; maxAbilitiesPerCard?: number };
  notes: string;
}

export interface SanitizeResult { brief: CardBrief; warnings: string[] }

const FREQS: BriefFreq[] = ["leger", "moyen", "fort"];
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Résout un id de capacité (ou, par tolérance, son libellé FR) vers l'id du registre. */
export function resolveAbilityId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (ABILITIES[s]) return s;
  const low = s.toLowerCase();
  for (const a of Object.values(ABILITIES)) {
    const libelles = [a.label, a.creature?.label, a.spell?.label].filter(Boolean).map((l) => l!.toLowerCase());
    if (libelles.includes(low) || libelles.some((l) => l.replace(/ x$| \+x\/\+y$| x\/y$/, "") === low)) return a.id;
  }
  return null;
}

function parts(v: unknown, valides: readonly string[], quoi: string, warnings: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, p] of Object.entries(obj(v))) {
    if (!valides.includes(k)) { warnings.push(`${quoi} inconnu(e) ignoré(e) : ${k}`); continue; }
    const n = num(p);
    if (n > 0) out[k] = n;
  }
  return out;
}

export function emptyBrief(): CardBrief {
  return {
    title: "", count: 10, faction: "", races: [], clans: [], types: {}, rarities: {}, manaCurve: {},
    edition: { kind: "none" }, abilities: [], triggers: [], additionalCosts: [], gender: { M: 50, F: 50, O: 0 },
    constraints: {}, notes: "",
  };
}

export function sanitizeBrief(brut: unknown): SanitizeResult {
  const w: string[] = [];
  const b = obj(brut);
  const out = emptyBrief();
  out.title = typeof b.title === "string" ? b.title.slice(0, 120) : "";
  out.count = clamp(Math.round(num(b.count, 10)), 1, BRIEF_MAX_CARDS);
  if (num(b.count, 0) > BRIEF_MAX_CARDS) w.push(`Lot plafonné à ${BRIEF_MAX_CARDS} cartes.`);

  if (typeof b.faction === "string" && FACTIONS[b.faction]) out.faction = b.faction;
  else if (b.faction) w.push(`Faction inconnue : ${String(b.faction)}`);

  const races = new Set(getAllRaces());
  out.races = arr(b.races).filter((r): r is string => typeof r === "string").filter((r) => races.has(r) || (w.push(`Race inconnue ignorée : ${r}`), false));
  const clans = new Set(Object.keys(FACTIONS).flatMap((f) => getAllClanNames(f)));
  out.clans = arr(b.clans).filter((c): c is string => typeof c === "string").filter((c) => clans.has(c) || (w.push(`Clan inconnu ignoré : ${c}`), false));

  out.types = parts(b.types, ["Unité", "Action"], "Type", w);
  out.rarities = parts(b.rarities, RARITIES.map((r) => r.id), "Rareté", w);
  out.manaCurve = parts(b.manaCurve, Array.from({ length: 10 }, (_, i) => String(i + 1)), "Coût en mana", w);

  const ed = obj(b.edition);
  if (ed.kind === "set" && num(ed.setId, 0) > 0) out.edition = { kind: "set", setId: Math.round(num(ed.setId)) };
  else if (ed.kind === "limited") {
    const y = Math.round(num(ed.year, new Date().getFullYear()));
    const m = ed.month == null ? null : clamp(Math.round(num(ed.month, 1)), 1, 12);
    out.edition = { kind: "limited", year: clamp(y, 2000, 2100), month: m };
  }
  // Un set ne contient que des Communes (arbitrage 2026-10-12).
  if (out.edition.kind === "set") {
    const autres = Object.keys(out.rarities).filter((r) => r !== "Commune");
    if (autres.length) w.push(`Un set ne contient que des Communes : raretés ${autres.join(", ")} retirées.`);
    out.rarities = { Commune: 1 };
  }

  const vus = new Set<string>();
  for (const a of arr(b.abilities)) {
    const o = obj(a);
    const id = resolveAbilityId(o.id ?? o.label);
    if (!id) { w.push(`Capacité inconnue ignorée : ${String(o.id ?? o.label)}`); continue; }
    if (vus.has(id)) continue;
    const pct = clamp(num(o.pct), 0, 100);
    if (pct > 0) { out.abilities.push({ id, pct }); vus.add(id); }
  }
  const total = out.abilities.reduce((s, a) => s + a.pct, 0);
  if (total > 100) {
    w.push(`Pourcentages des capacités ramenés à 100 % (total demandé : ${Math.round(total)} %).`);
    for (const a of out.abilities) a.pct = (a.pct * 100) / total;
  }

  for (const t of arr(b.triggers)) {
    const o = obj(t);
    const trig = BRIEF_TRIGGERS.find((x) => x === o.trigger);
    const freq = FREQS.find((x) => x === o.freq);
    if (!trig || !freq) { w.push(`Déclencheur ignoré : ${JSON.stringify(t)}`); continue; }
    if (!out.triggers.some((x) => x.trigger === trig)) out.triggers.push({ trigger: trig, freq });
  }
  for (const c of arr(b.additionalCosts)) {
    const o = obj(c);
    const cost = BRIEF_COSTS.find((x) => x === o.cost);
    const freq = FREQS.find((x) => x === o.freq);
    if (!cost || !freq) { w.push(`Coût additionnel ignoré : ${JSON.stringify(c)}`); continue; }
    if (!out.additionalCosts.some((x) => x.cost === cost)) out.additionalCosts.push({ cost, freq });
  }

  const g = obj(b.gender);
  const M = Math.max(0, num(g.M)), F = Math.max(0, num(g.F)), O = Math.max(0, num(g.O));
  out.gender = M + F + O > 0 ? { M, F, O } : { M: 50, F: 50, O: 0 };

  const c = obj(b.constraints);
  const minMana = c.minMana == null ? undefined : clamp(Math.round(num(c.minMana, 1)), 1, 10);
  const maxMana = c.maxMana == null ? undefined : clamp(Math.round(num(c.maxMana, 10)), 1, 10);
  const excluded = arr(c.excludedAbilities).map(resolveAbilityId).filter((x): x is string => !!x);
  const maxAb = c.maxAbilitiesPerCard == null ? undefined : clamp(Math.round(num(c.maxAbilitiesPerCard, 3)), 1, 4);
  out.constraints = {
    ...(minMana ? { minMana } : {}), ...(maxMana ? { maxMana } : {}),
    ...(excluded.length ? { excludedAbilities: excluded } : {}), ...(maxAb ? { maxAbilitiesPerCard: maxAb } : {}),
  };
  if (minMana && maxMana && minMana > maxMana) { out.constraints.minMana = maxMana; w.push("Mana minimum ramené au maximum."); }
  out.notes = typeof b.notes === "string" ? b.notes.slice(0, 2000) : "";
  return { brief: out, warnings: w };
}

/** Ce qui manque encore pour lancer le lot. */
export function briefManquants(b: CardBrief): string[] {
  const m: string[] = [];
  if (!b.faction) m.push("faction");
  return m;
}
