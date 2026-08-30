// Le nom de FACTION dans les textes de carte.
//
// Une faction a un id STABLE en code et en base (« Elfes ») et un nom
// d'affichage distinct (« L'Alliance Céleste ») — c'est tout l'objet du champ
// `displayName`. Les descriptions imprimaient l'id : une carte annonçait
// « Invoque une créature de la faction Elfes » juste au-dessus de son propre
// bandeau « L'Alliance Céleste ».
import { describe, expect, it } from "vitest";
import { describeComposedCap } from "./composed-display";
import { getFactionDisplayName } from "@/lib/card-engine/constants";
import type { Capability } from "./types";

const cap = (composed: Record<string, unknown>): Capability => ({
  uid: "u", trigger: "on_play", effectKind: "immediate", abilityId: "_composed", composed,
} as unknown as Capability);

describe("filtre de pool", () => {
  it("affiche le NOM de la faction, pas son id", () => {
    const txt = describeComposedCap(cap({
      content: "invocation", magnitude: { x: 2 },
      pool: { race: "Elfes", faction: "Elfes", clan: "Les Sylvains" },
    }));
    expect(txt).toContain("de la faction L'Alliance Céleste");
    expect(txt).not.toContain("de la faction Elfes");
  });

  it("laisse race et clan intacts en français", () => {
    // Leur id EST leur libellé FR : le passage par les helpers ne change rien
    // ici, il ouvre seulement la localisation des autres langues.
    const txt = describeComposedCap(cap({
      content: "invocation", magnitude: { x: 2 },
      pool: { race: "Elfes", clan: "Les Sylvains" },
    }));
    expect(txt).toContain("de race Elfes");
    expect(txt).toContain("du clan Les Sylvains");
  });
});

describe("appartenance d'une cible", () => {
  it("affiche le NOM de la faction là aussi", () => {
    const txt = describeComposedCap(cap({
      content: "deal_damage", magnitude: { x: 2 },
      target: {
        entity: "unit", count: "all", side: "enemy", location: "board",
        designation: "automatic", membership: { faction: ["Elfes"] },
      },
    }));
    expect(txt).toContain("L'Alliance Céleste");
  });
});

describe("le helper lui-même", () => {
  it("mappe l'id vers son nom d'affichage", () => {
    expect(getFactionDisplayName("Elfes")).toBe("L'Alliance Céleste");
  });

  it("retombe sur la valeur brute pour un id inconnu", () => {
    // Une faction retirée du registre ne doit pas faire disparaître le texte.
    expect(getFactionDisplayName("Inconnue")).toBe("Inconnue");
    expect(getFactionDisplayName(null)).toBe("");
  });
});
