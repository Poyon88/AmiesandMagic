import { describe, it, expect } from "vitest";
import { composedIcon, composedKeywordName } from "./composed-display";
import { KEYWORD_SYMBOLS } from "./keyword-labels";
import type { Capability, ComposedEffect } from "./types";

/** Capacité composée minimale portant un seul effet. */
function grantCap(grantAbilityId?: string): Capability {
  const composed = {
    trigger: "on_play",
    content: "grant_keyword",
    ...(grantAbilityId ? { grantAbilityId } : {}),
    target: { entity: "unit", count: 1, side: "ally", location: "board", designation: "choice" },
  } as unknown as ComposedEffect;
  return { composed } as unknown as Capability;
}

describe("composedIcon — capacité conférée", () => {
  it("affiche l'icône de la capacité conférée, pas l'icône générique « Conférer »", () => {
    const { symbol, keyword } = composedIcon(grantCap("armure"));
    expect(keyword).toBe("armure");
    expect(symbol).toBe(KEYWORD_SYMBOLS.armure);
    expect(keyword).not.toBe("conferer");
  });

  it("fonctionne aussi pour une capacité à symbole emoji", () => {
    const { symbol, keyword } = composedIcon(grantCap("berserk"));
    expect(keyword).toBe("berserk");
    expect(symbol).toBe(KEYWORD_SYMBOLS.berserk);
  });

  it("le nom affiché suit l'icône (dérivé de la même source)", () => {
    // composedKeywordName lit composedIcon().keyword : le libellé doit donc
    // nommer la capacité conférée, et non « Conférer ».
    expect(composedKeywordName(grantCap("armure"))).toBe("Armure");
  });

  it("retombe sur l'icône générique quand la capacité conférée est absente", () => {
    expect(composedIcon(grantCap()).keyword).toBe("conferer");
  });

  it("retombe sur l'icône générique pour un id inconnu", () => {
    expect(composedIcon(grantCap("capacite_inexistante")).keyword).toBe("conferer");
  });
});
