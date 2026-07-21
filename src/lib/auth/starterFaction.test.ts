// Liste des factions offertes au choix de départ. Deux propriétés à verrouiller :
// la faction neutre n'y figure pas, et la liste reste alignée sur le registre.
import { describe, expect, it } from "vitest";
import { STARTER_FACTION_IDS, isValidStarterFaction } from "./starterFaction";
import { FACTIONS } from "@/lib/card-engine/constants";
import { NEUTRAL_FACTION } from "@/lib/game/collection";

describe("STARTER_FACTION_IDS", () => {
  it("exclut la faction neutre : elle est déjà offerte à tout le monde", () => {
    expect(STARTER_FACTION_IDS).not.toContain(NEUTRAL_FACTION);
  });

  it("propose toutes les AUTRES factions du registre", () => {
    const attendu = Object.keys(FACTIONS).filter((id) => id !== NEUTRAL_FACTION);
    expect([...STARTER_FACTION_IDS].sort()).toEqual(attendu.sort());
  });

  it("n'est pas vide — sinon l'écran de choix serait un cul-de-sac", () => {
    expect(STARTER_FACTION_IDS.length).toBeGreaterThan(1);
  });
});

describe("isValidStarterFaction", () => {
  it("accepte une faction proposée", () => {
    expect(isValidStarterFaction(STARTER_FACTION_IDS[0])).toBe(true);
  });

  it("refuse la faction neutre, l'inconnu et le non-texte", () => {
    for (const ko of [NEUTRAL_FACTION, "Atlantes", "", null, undefined, 42, {}]) {
      expect(isValidStarterFaction(ko)).toBe(false);
    }
  });
});
