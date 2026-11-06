import { describe, expect, it } from "vitest";
import { vainqueurTransition } from "./match-result";

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
