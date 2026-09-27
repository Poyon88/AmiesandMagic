// Race SANS faction (Bâtiments) : assignable partout, tous clans, jamais tirée.
import { describe, expect, it } from "vitest";
import { FACTIONS, getAllClanNames, getAllRaces, getAssignableRaces, getClanNamesForRace, RACES_SANS_FACTION } from "./constants";
import { validateRace } from "@/lib/validation/faction-clan";

describe("races sans faction", () => {
  it("Bâtiments est assignable dans chaque faction et acceptée à l'enregistrement", () => {
    for (const faction of Object.keys(FACTIONS)) {
      expect(getAssignableRaces(faction)).toContain("Bâtiments");
      expect(validateRace("Bâtiments", faction)).toEqual({ ok: true, race: "Bâtiments" });
    }
    expect(validateRace("Bâtiments", null)).toEqual({ ok: true, race: "Bâtiments" });
    expect(getAllRaces()).toContain("Bâtiments");
  });

  it("accueillie par tous les clans de la faction", () => {
    expect(getClanNamesForRace("Elfes", "Bâtiments").sort()).toEqual(getAllClanNames("Elfes").sort());
  });

  it("jamais dans les listes de races des factions (où pioche le générateur)", () => {
    for (const def of Object.values(FACTIONS)) {
      for (const r of RACES_SANS_FACTION) expect(def.races).not.toContain(r);
    }
  });
});
