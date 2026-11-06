import { describe, expect, it } from "vitest";
import { DELAI_INACTIVITE_MS, derniereActivite, partieInactive, vainqueurTransition } from "./match-result";

describe("vainqueurTransition", () => {
  it("renvoie le vainqueur quand la partie vient de se terminer", () => {
    expect(vainqueurTransition({ phase: "playing" }, { phase: "finished", winner: "j1" })).toBe("j1");
  });

  it("couvre la reprise d'une partie déjà finie, depuis un store vide", () => {
    expect(vainqueurTransition(null, { phase: "finished", winner: "j1" })).toBe("j1");
  });

  it("ne redéclenche pas tant que la partie reste terminée", () => {
    expect(vainqueurTransition({ phase: "finished" }, { phase: "finished", winner: "j1" })).toBeNull();
  });

  it("ignore une partie en cours ou sans vainqueur", () => {
    expect(vainqueurTransition({ phase: "playing" }, { phase: "playing" })).toBeNull();
    expect(vainqueurTransition({ phase: "playing" }, { phase: "finished", winner: null })).toBeNull();
  });
});

describe("partie inactive", () => {
  it("retient le signe de vie le plus récent, et tolère les absents", () => {
    expect(derniereActivite(["2026-11-06T10:00:00Z", null, "2026-11-06T11:00:00Z", undefined]))
      .toBe(Date.parse("2026-11-06T11:00:00Z"));
  });

  it("n'est inactive qu'au-delà du délai", () => {
    expect(partieInactive(0, DELAI_INACTIVITE_MS)).toBe(false);
    expect(partieInactive(0, DELAI_INACTIVITE_MS + 1)).toBe(true);
  });
});
