// Formatage des valeurs de mots-clés côté CRÉATURE.
//
// Quatre mots-clés portent une PAIRE de stats (+X/+Y ou -X/-Y) au lieu d'un
// simple X. Le côté SORT savait déjà les rendre « +2/+2 » ; le côté créature
// n'affichait que le X, si bien qu'une Gloire +2/+1 se peignait « 2 » — le
// bonus de PV était invisible sur la carte. Ces helpers sont la source unique
// du formatage : on verrouille les deux familles et le cas des signes négatifs.
import { describe, expect, it } from "vitest";
import { applyKeywordValueToLabel, isStatPairKeyword, keywordBadgeValue } from "./keyword-labels";

describe("isStatPairKeyword", () => {
  it("reconnaît les quatre mots-clés en paire de stats", () => {
    expect(isStatPairKeyword("gloire")).toBe(true);
    expect(isStatPairKeyword("renforcement")).toBe(true);
    expect(isStatPairKeyword("renforcement_multiple")).toBe(true);
    expect(isStatPairKeyword("affaiblissement")).toBe(true);
  });

  it("laisse les mots-clés à X simple en dehors", () => {
    expect(isStatPairKeyword("carnage")).toBe(false);
    expect(isStatPairKeyword("resistance")).toBe(false);
    expect(isStatPairKeyword("taunt")).toBe(false);
  });
});

describe("keywordBadgeValue", () => {
  it("Gloire : peint la paire complète, pas le seul X", () => {
    expect(keywordBadgeValue("gloire", 2, { id: "gloire", x: 2, y: 1 })).toBe("+2/+1");
  });

  it("Affaiblissement : garde le signe négatif sur les deux membres", () => {
    expect(keywordBadgeValue("affaiblissement", 3, { id: "affaiblissement", x: 3, y: 2 })).toBe("-3/-2");
  });

  it("paire sans Y explicite → 0, jamais « undefined »", () => {
    expect(keywordBadgeValue("gloire", 2, { id: "gloire", x: 2 })).toBe("+2/+0");
  });

  it("paire sans instance du tout → repli sur le X connu", () => {
    expect(keywordBadgeValue("renforcement", 4, undefined)).toBe("+4/+0");
  });

  it("mot-clé à X simple : numéral inchangé", () => {
    expect(keywordBadgeValue("carnage", 3, { id: "carnage", x: 3 })).toBe("3");
  });

  it("mot-clé non scalable et sans X : rien à peindre", () => {
    expect(keywordBadgeValue("taunt", undefined, undefined)).toBeNull();
  });
});

describe("applyKeywordValueToLabel", () => {
  it("substitue le marqueur +X/+Y dans le libellé", () => {
    expect(applyKeywordValueToLabel("gloire", "Gloire +X/+Y", 2, { id: "gloire", x: 2, y: 1 }))
      .toBe("Gloire +2/+1");
  });

  it("fonctionne sur un libellé LOCALISÉ tant qu'il garde le marqueur", () => {
    expect(applyKeywordValueToLabel("gloire", "Ruhm +X/+Y", 3, { id: "gloire", x: 3, y: 2 }))
      .toBe("Ruhm +3/+2");
  });

  it("substitue aussi les marqueurs négatifs", () => {
    expect(applyKeywordValueToLabel("affaiblissement", "Affaiblissement -X/-Y", 1, { id: "affaiblissement", x: 1, y: 1 }))
      .toBe("Affaiblissement -1/-1");
  });

  it("libellé sans marqueur (locale divergente) → la valeur est suffixée, jamais avalée", () => {
    expect(applyKeywordValueToLabel("gloire", "栄光", 2, { id: "gloire", x: 2, y: 1 })).toBe("栄光 +2/+1");
  });

  it("Renforcement multiple : libellé sans marqueur en FR aussi → suffixé", () => {
    expect(applyKeywordValueToLabel("renforcement_multiple", "Renforcement multiple", 2, { id: "renforcement_multiple", x: 2, y: 2 }))
      .toBe("Renforcement multiple +2/+2");
  });

  it("mot-clé à X simple : ancien comportement « Carnage 3 » préservé", () => {
    expect(applyKeywordValueToLabel("carnage", "Carnage X", 3, { id: "carnage", x: 3 })).toBe("Carnage 3");
  });

  it("mot-clé sans valeur : libellé nu", () => {
    expect(applyKeywordValueToLabel("taunt", "Provocation", undefined, undefined)).toBe("Provocation");
  });
});
