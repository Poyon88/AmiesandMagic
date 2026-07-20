import { describe, it, expect } from "vitest";
import { describeComposedCap } from "./composed-display";
import type { Capability } from "./types";

// Le texte composé est assemblé « contenu + cible ». Deux pièges de grammaire
// française en découlent, tous deux vus en jeu sur des cartes réelles.

const cap = (content: string, target: unknown, x = 1, y = 0) =>
  ({
    uid: "u",
    trigger: "on_play",
    effectKind: "immediate",
    abilityId: "x",
    composed: { content, magnitude: { x, y }, target },
  }) as unknown as Capability;

const SELF = { entity: "self" };
const ENEMY_UNIT = { entity: "unit", side: "enemy", count: 1 };
const ENEMY_HERO = { entity: "hero", side: "enemy" };

describe("cible soi-même → tournure réfléchie", () => {
  // « Renvoie en main à elle-même » était le texte affiché sur Lame Revenante.
  it.each([
    ["bounce", "Se renvoie en main."],
    ["destroy", "Se détruit."],
    ["paralyze", "Se paralyse."],
    ["deal_damage", "S'inflige 1 dégât."],
    ["heal", "Se soigne de 1 PV."],
  ])("%s → %s", (content, expected) => {
    expect(describeComposedCap(cap(content, SELF))).toBe(expected);
  });

  it("debuff se met au réfléchi avec ses deux magnitudes", () => {
    expect(describeComposedCap(cap("debuff", SELF, 1, 0))).toBe("S'inflige -1/-0.");
  });

  it("un contenu sans forme réfléchie garde le complément générique", () => {
    // Repli assumé : mieux vaut « … à elle-même » qu'une phrase amputée.
    const out = describeComposedCap(cap("gain_mana", SELF, 2));
    expect(out).toContain("à elle-même");
  });
});

describe("verbes transitifs directs → pas de préposition", () => {
  // « Détruit à une unité ennemie » : tous les fragments de cible portaient
  // « à/au », y compris pour des verbes qui prennent un objet direct.
  it.each([
    ["destroy", "Détruit une unité ennemie au choix."],
    ["bounce", "Renvoie en main une unité ennemie au choix."],
    ["paralyze", "Paralyse une unité ennemie au choix."],
  ])("%s sur une unité → %s", (content, expected) => {
    expect(describeComposedCap(cap(content, ENEMY_UNIT))).toBe(expected);
  });

  it.each([
    ["destroy", "Détruit le héros adverse."],
    ["bounce", "Renvoie en main le héros adverse."],
  ])("%s sur le héros → %s", (content, expected) => {
    expect(describeComposedCap(cap(content, ENEMY_HERO))).toBe(expected);
  });

  it("les verbes indirects gardent « à »", () => {
    expect(describeComposedCap(cap("deal_damage", ENEMY_UNIT)))
      .toBe("Inflige 1 dégât à une unité ennemie au choix.");
    expect(describeComposedCap(cap("buff", ENEMY_UNIT, 1, 1)))
      .toBe("Octroie +1/+1 à une unité ennemie au choix.");
  });

  it("aucune description ne juxtapose « à » et un article défini", () => {
    const contents = ["destroy", "bounce", "paralyze", "deal_damage", "heal", "buff", "debuff"];
    const targets = [SELF, ENEMY_UNIT, ENEMY_HERO, { entity: "unit", side: "ally", count: "all" }];
    for (const c of contents) {
      for (const tg of targets) {
        const out = describeComposedCap(cap(c, tg, 2, 1));
        expect(out, `${c}/${JSON.stringify(tg)}`).not.toMatch(/\bà (le|les|une unité ennemie au choix\.$)/);
        expect(out, `${c}/${JSON.stringify(tg)}`).not.toMatch(/\bà elle-même\b.*\bà\b/);
      }
    }
  });
});
