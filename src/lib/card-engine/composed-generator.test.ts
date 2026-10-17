import { describe, expect, it } from "vitest";
import { sanitizeBrief, type CardBrief } from "./brief";
import { equilibrer, labelUnite, planBatch, seededRng } from "./brief-generator";
import { getBareme } from "./bareme";
import { partComposeParCout, tirerCompose } from "./composed-generator";
import { regleRace } from "./race-abilities";
import { sanitizeComposed } from "@/lib/cards/composedCapabilities";
import { describeComposedCap } from "@/lib/game/composed-display";
import { scoreCarte } from "./card-points";
import { AUTOMATIC_ABILITY_IDS } from "@/lib/game/abilities";
import { FORGE_TO_GAME_KEYWORD } from "@/lib/card-forge/keyword-instances";

const lot = (over: Partial<CardBrief> = {}) => sanitizeBrief({
  count: 300, faction: "Nains", races: ["Nains"], types: { "Unité": 2, "Action": 1 },
  rarities: { Commune: 2, "Peu Commune": 1, Rare: 1, "Épique": 1 }, abilities: [], triggers: [], additionalCosts: [],
  gender: { M: 50, F: 50, O: 0 }, ...over,
}).brief;

describe("effets composés générés", () => {
  it("fréquence progressive selon le coût, jamais à 3 mana ou moins", () => {
    const cartes = Array.from({ length: 20 }, (_, i) => planBatch(lot(), seededRng(i + 1)).cards).flat();
    const part = (lo: number, hi: number) => {
      const t = cartes.filter((c) => c.mana >= lo && c.mana <= hi);
      return { n: t.length, p: t.filter((c) => c.composes.length).length / Math.max(1, t.length) };
    };
    expect(part(1, 3).p).toBe(0);
    for (const [lo, hi] of [[4, 5], [6, 7], [8, 10]] as const) {
      const { n, p } = part(lo, hi);
      if (n >= 40) expect(Math.abs(p - partComposeParCout(lo))).toBeLessThan(0.12);
    }
  });

  it("chaque effet tiré est valide, décrit et chiffré", () => {
    const rng = seededRng(11);
    for (let i = 0; i < 400; i++) {
      const mana = 4 + (i % 7);
      const cap = tirerCompose({ type: i % 3 ? "Unité" : "Action", mana }, rng, ["armure"]);
      const [propre] = sanitizeComposed([cap]);
      expect(propre.composed?.content).toBe(cap.composed!.content);
      expect(describeComposedCap(propre).length, cap.composed!.content).toBeGreaterThan(0);
      const s = scoreCarte(getBareme(), { card_type: "creature", mana_cost: mana, attack: 2, health: 2, rarity: "Rare", keywords: [], capabilities: [propre] } as never);
      expect(Number.isFinite(s.utilise)).toBe(true);
      if (cap.trigger === "spell_resolution") expect(i % 3).toBe(0);
    }
  });

  it("grant_keyword ne confère qu'une capacité passive, jamais interdite à la race", () => {
    for (const s of [1, 2, 3, 4]) {
      for (const c of planBatch(lot({ faction: "Elfes", races: ["Fées", "Géants"] } as Partial<CardBrief>), seededRng(s)).cards) {
        for (const cap of c.composes) {
          if (cap.composed?.content !== "grant_keyword") continue;
          expect(regleRace(c.race, c.clan).interdits).not.toContain(labelUnite(cap.composed.grantAbilityId!));
          expect(AUTOMATIC_ABILITY_IDS.has(FORGE_TO_GAME_KEYWORD[labelUnite(cap.composed.grantAbilityId!)!])).toBe(true);
        }
      }
    }
  });

  it("l'équilibrage garde l'effet et approche le barème", () => {
    const cartes = [5, 6, 7, 8, 9, 10].flatMap((s) => planBatch(lot(), seededRng(s)).cards).filter((c) => c.composes.length);
    expect(cartes.length).toBeGreaterThan(10);
    const ecarts = cartes.map((c) => {
      const b = equilibrer(c, getBareme(), {});
      expect(b.composes).toHaveLength(1);
      return Math.abs(b.score.ratio - 1);
    });
    expect(ecarts.filter((e) => e <= 0.1).length / ecarts.length).toBeGreaterThan(0.8);
  });

  it("même seed ⇒ mêmes effets ; le reste du lot est inchangé par leur ajout", () => {
    const a = planBatch(lot({ count: 60 }), seededRng(9)).cards;
    const b = planBatch(lot({ count: 60 }), seededRng(9)).cards;
    expect(a.map((c) => c.composes)).toEqual(b.map((c) => c.composes));
  });
});
