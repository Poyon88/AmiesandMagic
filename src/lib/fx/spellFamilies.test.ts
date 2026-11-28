import { describe, it, expect } from "vitest";
import { familleDuSort } from "./spellFamilies";
import type { Card } from "@/lib/game/types";

function sort(partiel: Partial<Card>): Card {
  return {
    id: 1, name: "Sort", mana_cost: 1, card_type: "spell", attack: null, health: null,
    effect_text: "", keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
    ...partiel,
  } as Card;
}

describe("familleDuSort", () => {
  it("lit d'abord le nom du sort", () => {
    expect(familleDuSort(sort({ name: "Projection de Lave", faction: "Nains" }))).toBe("feu");
    expect(familleDuSort(sort({ name: "Morsure du Givre", faction: "Elfes" }))).toBe("givre");
    expect(familleDuSort(sort({ name: "Tempête de Serres et de Crocs" }))).toBe("foudre");
    expect(familleDuSort(sort({ name: "Lame Empoisonnée", faction: "Elfes Noirs" }))).toBe("poison");
    expect(familleDuSort(sort({ name: "Déluge de Flèches", faction: "EmpireDuMilieu" }))).toBe("acier");
    expect(familleDuSort(sort({ name: "Racines soudaines" }))).toBe("nature");
  });

  it("ignore les accents et n'accroche qu'en début de mot", () => {
    expect(familleDuSort(sort({ name: "Bénédiction de l'Aube" }))).toBe("sacre");
    // « gel » ne doit pas accrocher « Angelot », ni « arc » « Archives ».
    expect(familleDuSort(sort({ name: "Angelot des Archives" }))).toBe("arcane");
  });

  it("retombe sur la mécanique quand le nom ne dit rien", () => {
    expect(familleDuSort(sort({ name: "Dernier Recours", spell_keywords: [{ id: "guerison" }] as Card["spell_keywords"], faction: "Nains" }))).toBe("soin");
    expect(familleDuSort(sort({ name: "Dernier Recours", keywords: ["poison"] as Card["keywords"], faction: "Humains" }))).toBe("poison");
  });

  it("donne aux Élémentaires la signature de leur clan", () => {
    expect(familleDuSort(sort({ name: "Modelage primordial", faction: "Élémentaires", clan: "Le Socle du Monde" }))).toBe("terre");
    expect(familleDuSort(sort({ name: "Souffle contraire", faction: "Élémentaires", clan: "Le Souffle des Cimes" }))).toBe("foudre");
  });

  it("finit par la faction, puis l'arcane", () => {
    expect(familleDuSort(sort({ name: "Mémoire arrachée", faction: "Morts-Vivants" }))).toBe("ombre");
    expect(familleDuSort(sort({ name: "Entrelacement", faction: "Elfes" }))).toBe("nature");
    expect(familleDuSort(sort({ name: "Sans attache" }))).toBe("arcane");
    expect(familleDuSort(null)).toBe("arcane");
  });
});
